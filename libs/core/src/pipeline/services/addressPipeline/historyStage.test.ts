import { requireDefined } from '../../../requireDefined'
import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { resolve } from 'node:path'
import { metaSchema } from '@repo/db'
import {
  insertFixtureRelease,
  loadMigrationSql,
  seedFixtureCatalog,
} from '../../../testing/metaFixtures'
import { buildResolvedAddressChunkArtefact } from './historyStage'
import { normaliseAddressRowForPipeline } from './normalisation'
import type { AddressPipelineMessage } from './types'

test('ALS history preserves distinct source owners at one street address and exact reviewed aliases', async () => {
  const sqlite = new Database(':memory:')
  try {
    sqlite.exec(
      loadMigrationSql(resolve(import.meta.dir, '../../../../../db/migrations'), [
        'meta',
      ]),
    )
    seedFixtureCatalog(sqlite)
    const timestamp = '2026-09-07T00:00:00.000Z'
    const release = insertFixtureRelease(sqlite, {
      source: 'hkgov-dpo',
      regionCode: 'hk',
      type: 'address',
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
      type: 'address',
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
    const payload = new TextEncoder().encode(
      JSON.stringify({
        kind: 'address.normalised.v1',
        releaseId: release.releaseId,
        processingRunStartedAt: timestamp,
        rowStart: 0,
        rowEnd: rows.length,
        totalRows: rows.length,
        rows,
      }),
    )
    const result = await buildResolvedAddressChunkArtefact(
      drizzle({ client: sqlite, schema: metaSchema }) as never,
      {} as never,
      { get: async () => ({ arrayBuffer: async () => payload.buffer }) } as never,
      message,
    )
    expect(result.artefact.rows.map(row => row.addressId)).toEqual([
      'ban-tip',
      'social-service',
      'reviewed-owner',
    ])
    expect(result.artefact.rows.map(row => row.sourceId)).toEqual([
      'ban-tip',
      'social-service',
      'reviewed-alias',
    ])
    expect(result.artefact.addedRows).toBe(2)
    expect([...result.changedExistingIds]).toEqual(['reviewed-owner'])
    for (const row of result.artefact.rows) {
      expect(row.i18n.every(localised => localised.addressId === row.addressId)).toBe(
        true,
      )
    }
  } finally {
    sqlite.close()
  }
})
