import { requireDefined } from '@repo/core/requireDefined'
import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { resolve } from 'node:path'
import { metaSchema } from '@repo/db'
import {
  insertFixtureRelease,
  loadMigrationSql,
  seedFixtureCatalog,
} from '../../../../../../libs/core/src/testing/metaFixtures'
import { writeAddressHistorySqlChunkStage } from '@repo/core/pipeline/services/addresses/sqlStages'
import { buildAddressCurrentSqlImportFile } from '@repo/core/pipeline/services/addresses/sqlImport'
import {
  readJsonArtefact,
  writeJsonArtefact,
} from '@repo/core/pipeline/services/storage/artefacts'
import type {
  NormalisedAddressChunkArtefact,
  ResolvedAddressChunkArtefact,
} from '@repo/core/pipeline/services/addresses/types'
import { LocalPipelineBucket } from '../local/localBucket'
import { LocalChunkBucket } from '../local/localChunkBucket'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { normaliseAddressRowForPipeline } from '@repo/core/pipeline/services/addresses/normalisation'
import type { AddressPipelineMessage } from '@repo/core/pipeline/services/addresses/types'

test('chunk memory and retained JSON produce identical history and current SQL for aliases and distinct owners', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'address-chunk-parity-'))
  const sqlite = new Database(':memory:')
  try {
    sqlite.exec(
      loadMigrationSql(
        resolve(import.meta.dir, '../../../../../../libs/db/migrations'),
        ['meta'],
      ),
    )
    seedFixtureCatalog(sqlite)
    const timestamp = '2026-09-07T00:00:00.000Z'
    const release = insertFixtureRelease(sqlite, {
      source: 'hkgov-dpo',
      regionCode: 'hk',
      resourceType: 'address',
      sourceVersion: '2024-07-31.0',
      cohortKey: '2024-07-31.0',
      rawObjectKey: 'address.parquet',
      originalFileName: 'address.parquet',
      status: 'staged',
      ingestedAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    const rows = ['ban-tip', 'social-service', 'reviewed-alias'].map(id => ({
      raw: {},
      ...normaliseAddressRowForPipeline({
        id,
        canonicalId: id === 'reviewed-alias' ? 'reviewed-owner' : id,
        divisionSnapshotId: 'division-snapshot',
        districtId: 'tai-po',
        enFormattedAddress: `${id}, 11 CHUNG NGA ROAD`,
        enBuildingName: id,
        enStreetName: 'CHUNG NGA ROAD',
        enStreetNumberFrom: '11',
      }),
    }))
    expect(new Set(rows.map(row => row.matchKey)).size).toBe(1)
    expect(requireDefined(rows[0]).matchKey).not.toBeNull()
    const message = {
      ...release,
      datasetId: 'hkgov-dpo-hk-address',
      source: 'hkgov-dpo',
      regionCode: 'hk',
      resourceType: 'address',
      theme: 'addresses',
      sourceVersion: '2024-07-31.0',
      cohortKey: '2024-07-31.0',
      rawObjectKey: 'address.parquet',
      artefactKey: 'normalised',
      addressCurrentLookupCache: {
        byId: new Map([['reviewed-owner', { id: 'reviewed-owner', churnHash: 'old' }]]),
        byMatchKey: new Map([
          [
            requireDefined(requireDefined(rows[0]).matchKey),
            { id: 'unrelated-owner', churnHash: 'old' },
          ],
        ]),
      },
    } as AddressPipelineMessage
    const artefact = {
      kind: 'address.normalised.v1',
      releaseId: release.releaseId,
      processingRunStartedAt: timestamp,
      rowStart: 0,
      rowEnd: rows.length,
      totalRows: rows.length,
      rows,
    }
    const results = []
    for (const bucket of [
      new LocalPipelineBucket(join(directory, 'disk')),
      new LocalChunkBucket(join(directory, 'memory')),
    ]) {
      await writeJsonArtefact(bucket, 'normalised', artefact)
      const next = await writeAddressHistorySqlChunkStage(
        drizzle({ client: sqlite, schema: metaSchema }) as never,
        {} as never,
        bucket,
        message,
      )
      const resolved = await readJsonArtefact<ResolvedAddressChunkArtefact>(
        bucket,
        next.resolvedArtefactKey!,
      )
      const historySql = await Promise.all(
        next.addressSqlArtefactKeys!.map(async key =>
          new TextDecoder().decode(await (await bucket.get(key))!.arrayBuffer()),
        ),
      )
      results.push({
        resolved,
        historySql,
        currentSql: buildAddressCurrentSqlImportFile(message, resolved).sql,
      })
    }
    expect(results[1]).toEqual(results[0])
    expect(results[0]!.resolved.rows.map(row => row.addressId)).toEqual([
      'ban-tip',
      'social-service',
      'reviewed-owner',
    ])
    expect(results[0]!.resolved.addedRows).toBe(2)
  } finally {
    sqlite.close()
    await rm(directory, { recursive: true, force: true })
  }
})

test('one-window local normalisation preserves the worker result across Parquet row groups', async () => {
  const { parquetWriteFile } = await import('hyparquet-writer')
  const { normaliseAddressChunkStage } = await import(
    '@repo/core/pipeline/services/addresses/normaliseStage'
  )
  const directory = await mkdtemp(join(tmpdir(), 'address-parquet-window-'))
  try {
    const length = 2200
    const path = join(directory, 'addresses.parquet')
    parquetWriteFile({
      filename: path,
      rowGroupSize: 1000,
      columnData: [
        {
          name: 'id',
          type: 'STRING',
          data: Array.from({ length }, (_, i) => `address-${i}`),
        },
        {
          name: 'divisionSnapshotId',
          type: 'STRING',
          data: Array(length).fill('division'),
        },
        {
          name: 'enFormattedAddress',
          type: 'STRING',
          data: Array(length).fill('Sample Road'),
        },
        {
          name: 'zhFormattedAddress',
          type: 'STRING',
          data: Array(length).fill('樣本道路'),
        },
        {
          name: 'publisherSource',
          type: 'STRING',
          nullable: true,
          data: Array(length).fill(null),
        },
      ],
    })
    const bucket = new LocalChunkBucket(directory)
    await bucket.seedRawObject('addresses.parquet', path)
    const message = {
      rawObjectKey: 'addresses.parquet',
      releaseId: 'release',
      datasetId: 'dataset',
      source: 'hkgov-dpo',
      resourceType: 'address',
      rowStart: 0,
      rowEnd: length,
      chunkSize: length,
      totalRows: length,
      processingRunStartedAt: '2026-09-01T00:00:00Z',
      sourceVersion: '2026-09-01.0',
    } as AddressPipelineMessage
    const worker = await normaliseAddressChunkStage({}, {}, bucket, message)
    const expected = await readJsonArtefact<NormalisedAddressChunkArtefact>(
      bucket,
      worker.artefactKey!,
    )
    const local = await normaliseAddressChunkStage({}, {}, bucket, {
      ...message,
      processingMode: 'sql',
    })
    expect(await readJsonArtefact<typeof expected>(bucket, local.artefactKey!)).toEqual(
      expected,
    )
    expect(local.rowEnd).toBe(length)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
