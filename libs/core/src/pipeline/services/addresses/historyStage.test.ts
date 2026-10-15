import { defineRelations } from 'drizzle-orm'
import { requireDefined } from '../../../requireDefined'
import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { resolve } from 'node:path'
import { historySchema, metaSchema } from '@repo/db'
import {
  insertFixtureRelease,
  loadMigrationSql,
  seedFixtureCatalog,
} from '../../../testing/metaFixtures'
import { prepareAddressVersionInsertContext } from '../../db/address'
import { buildResolvedAddressChunkArtefact } from './historyStage'
import { normaliseAddressRowForPipeline } from './normalisation'
import type { AddressPipelineMessage } from './types'

test('ALS history preserves distinct source owners at one street address and exact reviewed aliases', async () => {
  const sqlite = new Database(':memory:')
  const history = new Database(':memory:')
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
    const metaDb = drizzle({ client: sqlite, relations: defineRelations(metaSchema) })
    const context = await prepareAddressVersionInsertContext(
      metaDb as never,
      message,
      'preview',
    )
    sqlite
      .query(`INSERT INTO snapshots(id, snapshotLineageId, code, cohortKey, status)
      SELECT 'parent', snapshotLineageId, 'parent', '2024-06-30.0', 'published' FROM snapshots WHERE id = ?`)
      .run(context.snapshotId)
    sqlite.exec(
      "INSERT INTO snapshotResourceReleases(snapshotId,resourceReleaseId,role) SELECT 'parent',resourceReleaseId,'primary' FROM snapshotResourceReleases WHERE snapshotId <> 'parent' AND role='primary' LIMIT 1",
    )
    sqlite
      .query('UPDATE snapshots SET parentSnapshotId = ? WHERE id = ?')
      .run('parent', context.snapshotId)
    history.exec(
      loadMigrationSql(resolve(import.meta.dir, '../../../../../db/migrations'), [
        'history',
      ]),
    )
    const historyDb = drizzle({
      client: history,
      relations: defineRelations(historySchema),
    })
    for (const id of ['reviewed-owner', 'unrelated-owner']) {
      historyDb
        .insert(historySchema.address2d)
        .values({
          ...rows[0]!.base,
          id,
          snapshotId: 'parent',
          versionHash: 'old',
        } as never)
        .run()
      for (const localised of rows[0]!.i18n) {
        historyDb
          .insert(historySchema.address2dI18n)
          .values({
            ...localised,
            addressId: id,
            snapshotId: 'parent',
            versionHash: 'old',
          } as never)
          .run()
      }
    }
    const payload = new TextEncoder().encode(
      JSON.stringify({
        kind: 'address.normalised.v1',
        resourceReleaseId: release.resourceReleaseId,
        processingRunStartedAt: timestamp,
        rowStart: 0,
        rowEnd: rows.length,
        totalRows: rows.length,
        rows,
      }),
    )
    const result = await buildResolvedAddressChunkArtefact(
      metaDb as never,
      historyDb as never,
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
    history.close()
  }
})
