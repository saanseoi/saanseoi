import { defineRelations } from 'drizzle-orm'
import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { normaliseDivisionAreaGeometryRow } from '@repo/core/pipeline/services/divisions/divisionGeometry'
import { currentSchema, historySchema, sourceSchema } from '@repo/db'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { loadMigrationSql } from '../../../../../../libs/core/src/testing/metaFixtures.ts'
import { createLocalExecBinding } from '../../dbCache/localDbCache.ts'
import type { LocalAddressDbContext } from '../../dbCache/localDbCacheTypes.ts'
import { completeSqlDeliveryRelease } from '../local/sqlDeliveryPending.ts'
import { writeGeometryRowsDurably } from './nativeGeometryDelivery.ts'

test('year rollover closes changed and removed source periods and retains unchanged periods in their owner shard', async () => {
  const root = await mkdtemp(join(tmpdir(), 'geometry-period-shards-'))
  const releasePrefix = `geometry-period-test-${crypto.randomUUID()}`
  const files = Object.fromEntries(
    ['DB_CURRENT', 'DB_HISTORY', 'DB_SOURCE_2025', 'DB_SOURCE_2026', 'DB_META'].map(
      name => [name, join(root, `${name}.sqlite`)],
    ),
  )
  const dbs = Object.fromEntries(
    Object.entries(files).map(([name, file]) => [name, new Database(file)]),
  )
  try {
    for (const [name, db] of Object.entries(dbs)) {
      db.exec(
        loadMigrationSql(
          join(import.meta.dir, '../../../../../../libs/db/migrations'),
          [
            name === 'DB_META'
              ? 'meta'
              : name === 'DB_CURRENT'
                ? 'current'
                : name === 'DB_HISTORY'
                  ? 'history'
                  : 'source',
          ],
        ),
      )
    }
    const historyDb = drizzle({
      client: dbs.DB_HISTORY!,
      relations: defineRelations(historySchema),
    })
    const sources = [2025, 2026].map(year => ({
      bindingName: `DB_SOURCE_${year}`,
      year: String(year),
      db: drizzle({ client: dbs[`DB_SOURCE_${year}`]!, schema: sourceSchema }),
    }))
    const context = (index: number) =>
      ({
        currentDb: drizzle({
          client: dbs.DB_CURRENT!,
          relations: defineRelations(currentSchema),
        }),
        historyDb,
        historyTargets: [{ bindingName: 'DB_HISTORY', db: historyDb }],
        metaDb: drizzle({ client: dbs.DB_META! }),
        sourceDb: sources[index]!.db,
        sourceTargets: sources,
        currentBinding: createLocalExecBinding(dbs.DB_CURRENT!, 'DB_CURRENT'),
        historyBinding: createLocalExecBinding(dbs.DB_HISTORY!, 'DB_HISTORY'),
        sourceBinding: createLocalExecBinding(
          dbs[sources[index]!.bindingName]!,
          sources[index]!.bindingName,
        ),
        state: { target: 'local', files, dbCacheDir: root },
      }) as unknown as LocalAddressDbContext
    const row = (id: string, edge = 115) =>
      normaliseDivisionAreaGeometryRow(
        {
          id,
          division_id: 'division',
          class: 'land',
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [114, 22],
                [edge, 22],
                [edge, 23],
                [114, 22],
              ],
            ],
          },
        },
        'overture',
      )!
    const version = (date: string) => ({
      source: 'overture' as const,
      variant: 'overture',
      resourceReleaseId: `${releasePrefix}-${date}`,
      releaseCode: `${releasePrefix}-${date}`,
      sourceVersion: date,
      snapshotId: `snapshot-${date}`,
      snapshotLineageId: 'lineage',
      parentSnapshotId: null,
      cohortKey: date,
    })
    await writeGeometryRowsDurably(
      context(0),
      'divisionArea',
      [row('same'), row('changed'), row('removed')],
      version('2025-12'),
    )
    await completeSqlDeliveryRelease(root, `${releasePrefix}-2025-12`)
    const next = [row('same'), row('changed', 116), row('added')]
    await writeGeometryRowsDurably(context(1), 'divisionArea', next, version('2026-01'))
    const periods = () =>
      [2025, 2026].flatMap(year =>
        dbs[`DB_SOURCE_${year}`]!.query(
          'SELECT sourceRecordId,validFromRelease,validToRelease,isCurrent FROM overtureDivisionAreas ORDER BY sourceRecordId',
        )
          .all()
          .map(row => ({
            year,
            ...(row as {
              sourceRecordId: string
              validFromRelease: string
              validToRelease: string | null
              isCurrent: number
            }),
          })),
      )
    expect(periods()).toEqual([
      {
        year: 2025,
        sourceRecordId: 'changed',
        validFromRelease: '2025-12',
        validToRelease: '2026-01',
        isCurrent: 0,
      },
      {
        year: 2025,
        sourceRecordId: 'removed',
        validFromRelease: '2025-12',
        validToRelease: '2026-01',
        isCurrent: 0,
      },
      {
        year: 2025,
        sourceRecordId: 'same',
        validFromRelease: '2025-12',
        validToRelease: null,
        isCurrent: 1,
      },
      {
        year: 2026,
        sourceRecordId: 'added',
        validFromRelease: '2026-01',
        validToRelease: null,
        isCurrent: 1,
      },
      {
        year: 2026,
        sourceRecordId: 'changed',
        validFromRelease: '2026-01',
        validToRelease: null,
        isCurrent: 1,
      },
    ])
    const before = periods()
    await writeGeometryRowsDurably(context(1), 'divisionArea', next, version('2026-01'))
    expect(periods()).toEqual(before)
  } finally {
    for (const db of Object.values(dbs)) db.close()
    await rm(root, { recursive: true, force: true })
  }
})
