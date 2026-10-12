import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { sourceSchema } from '@repo/db'
import type { HarbourReadableDb } from '@repo/core/db/types'
import { readObject, verifyAuditResult } from '@repo/core/provenance'
import { censtatdGeometryId } from '@repo/core/pipeline/services/sources/censtatdGeometry'
import { createMemoryProvenanceStore } from '../../../../../../libs/core/src/testing/provenanceStore'
import {
  prepareCenstatdGeometryAudit,
  retainCenstatdGeometryAudit,
} from './censtatdGeometryAudit'

const polygon = (x: number) => ({
  type: 'Polygon',
  coordinates: [
    [
      [x, 0],
      [x + 1, 0],
      [x, 1],
      [x, 0],
    ],
  ],
})

test('ingestion audit seals distinct new/reused geometry counts before writes and preserves them on retry', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'censtatd-geometry-audit-'))
  const sqlite = new Database(':memory:')
  sqlite.exec('CREATE TABLE hkgovCenstatdStatisticsGeometry (id TEXT PRIMARY KEY)')
  const db = drizzle({
    client: sqlite,
    schema: sourceSchema,
  }) as unknown as HarbourReadableDb
  const existing = polygon(1)
  const fresh = polygon(3)
  sqlite
    .query('INSERT INTO hkgovCenstatdStatisticsGeometry VALUES (?)')
    .run(censtatdGeometryId(existing))
  const input = {
    directory,
    db,
    resourceReleaseId: 'release',
    datasetCode: 'dataset',
    sourceVersion: '2026-01-01',
    rows: [existing, existing, fresh].map(sourceGeometry => ({ sourceGeometry })),
  }
  try {
    const counts = await prepareCenstatdGeometryAudit(input)
    expect(counts).toEqual({ created: 1, reused: 1, references: 3 })
    sqlite
      .query('INSERT INTO hkgovCenstatdStatisticsGeometry VALUES (?)')
      .run(censtatdGeometryId(fresh))
    expect(await prepareCenstatdGeometryAudit(input)).toEqual(counts)
    await expect(
      prepareCenstatdGeometryAudit({
        ...input,
        rows: [{ sourceGeometry: polygon(9) }],
      }),
    ).rejects.toThrow('inputs changed')
    const { store } = createMemoryProvenanceStore()
    const result = await retainCenstatdGeometryAudit(store, { ...input, counts })
    expect(result.manifest.scope).toEqual({ stage: 'ingestion', ownerId: 'release' })
    expect(result.manifest.resourceReleaseId).toBe('release')
    expect(result.manifest.bulk[0]?.counts).toEqual({
      inputs: { 'statistic-geometry-references': 3 },
      outputs: {
        'new-geometries': 1,
        'reused-geometries': 1,
        'geometry-references': 3,
      },
      recordsAffected: 3,
      decisions: { created: 1, reused: 1 },
    })
    expect(await readObject(store, result.manifest.bulk[0]!.definition)).toMatchObject({
      parameters: { divisionAreaPublication: 'Not performed by statistics ingestion' },
      implementation: { symbol: 'prepareCenstatdGeometryAudit' },
    })
    await verifyAuditResult(store, result.manifest)
    const next = await prepareCenstatdGeometryAudit({
      ...input,
      directory: join(directory, 'next'),
      resourceReleaseId: 'next',
    })
    expect(next).toEqual({ created: 0, reused: 2, references: 3 })
  } finally {
    sqlite.close()
    await rm(directory, { recursive: true, force: true })
  }
})

test('geometry lookup batches large cohorts and empty input is not applicable', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'censtatd-geometry-audit-'))
  const sqlite = new Database(':memory:')
  sqlite.exec('CREATE TABLE hkgovCenstatdStatisticsGeometry (id TEXT PRIMARY KEY)')
  const db = drizzle({
    client: sqlite,
    schema: sourceSchema,
  }) as unknown as HarbourReadableDb
  const rows = Array.from({ length: 191 }, (_, i) => ({ sourceGeometry: polygon(i) }))
  for (const row of rows)
    sqlite
      .query('INSERT INTO hkgovCenstatdStatisticsGeometry VALUES (?)')
      .run(censtatdGeometryId(row.sourceGeometry))
  try {
    expect(
      await prepareCenstatdGeometryAudit({
        directory,
        db,
        rows,
        resourceReleaseId: 'r',
        datasetCode: 'd',
        sourceVersion: '2026',
      }),
    ).toEqual({ created: 0, reused: 191, references: 191 })
    const { store } = createMemoryProvenanceStore()
    const result = await retainCenstatdGeometryAudit(store, {
      resourceReleaseId: 'empty',
      datasetCode: 'd',
      counts: { created: 0, reused: 0, references: 0 },
    })
    expect(result.manifest.bulk[0]?.outcome).toBe('not-applicable')
    await verifyAuditResult(store, result.manifest)
  } finally {
    sqlite.close()
    await rm(directory, { recursive: true, force: true })
  }
})
