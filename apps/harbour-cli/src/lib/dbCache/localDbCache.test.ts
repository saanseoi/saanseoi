import { afterEach, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'

import { Database } from 'bun:sqlite'

import type { PublishDatasetResult } from '@repo/core/pipeline/harbourClient'
import { loadMigrationSql } from '../../../../../libs/core/src/testing/metaFixtures'
import {
  applyPublishMetadataDeltaToRemoteCache,
  resolveCachePruneOperation,
  resolveCacheTablesForBinding,
  resolvePrimaryShardBindingNames,
  resolveShardBindingName,
} from './localDbCache.ts'
import {
  countRemoteCacheWorkUnits,
  groupCacheExportTables,
} from './localDbCacheMirror.ts'
import { withDeliveryLock } from '../pipeline/local/sqlDeliveryFiles.ts'
import { registerPendingSqlDelivery } from '../pipeline/local/sqlDeliveryPending.ts'
import { invalidateRemoteDbCache } from './localDbCacheReplay.ts'

test('groups regular exports while keeping binary geometry schema-only', () => {
  expect(
    groupCacheExportTables('DB_HISTORY_HK_2025', [
      'divisions',
      'divisionAreas',
      'snapshotVersionChanges',
      'divisionBoundaries',
    ]),
  ).toEqual([
    { schemaOnly: false, tables: ['snapshotVersionChanges'] },
    { schemaOnly: true, tables: ['divisions', 'divisionAreas', 'divisionBoundaries'] },
  ])
  expect(groupCacheExportTables('DB_HISTORY_HK_2025', [])).toEqual([])
})

const cacheRoot = resolve(
  import.meta.dir,
  '../../../../../.local/harbour-sql/db-cache/preview',
)
const migrationSql = loadMigrationSql(
  resolve(import.meta.dir, '../../../../../libs/db/migrations'),
  ['meta'],
)
const tempCacheDirs: string[] = []

test('uses the annual D1 shard for a dated release version', () => {
  expect(resolveShardBindingName('history', 'HK', '2026-08-14.0')).toBe(
    'DB_HISTORY_HK_2026',
  )
  expect(resolveShardBindingName('source', 'HK', '2024-12-31.0')).toBe(
    'DB_SOURCE_HK_BEFORE',
  )
})

test('selects independent primary history and source shards', () => {
  expect(resolvePrimaryShardBindingNames('HK', '2016', '2026-Q2')).toEqual({
    historyBindingName: 'DB_HISTORY_HK_BEFORE',
    sourceBindingName: 'DB_SOURCE_HK_2026',
  })
})

test('mirrors only rows retained by annual shard cache pruning', () => {
  expect(resolveCachePruneOperation('DB_HISTORY_HK_2025', 'divisions')).toBeNull()
  expect(resolveCachePruneOperation('DB_HISTORY_HK_2025', 'divisionsI18n')).toBeNull()
  expect(resolveCachePruneOperation('DB_HISTORY_HK_BEFORE', 'divisions')).toBeNull()
  expect(resolveCachePruneOperation('DB_HISTORY_HK_2025', 'divisionAreas')).toBeNull()
  expect(resolveCachePruneOperation('DB_HISTORY_HK_BEFORE', 'address2d')).toBeNull()
  expect(resolveCachePruneOperation('DB_HISTORY_HK_BEFORE', 'address2dI18n')).toBeNull()
  for (const [tableName, id] of [
    ['address2d', 'id'],
    ['address2dI18n', 'addressId'],
  ] as const)
    expect(resolveCachePruneOperation('DB_HISTORY_HK_2025', tableName)).toEqual({
      retainedRowsWhereSql: `"isCurrent" = 1 OR "${id}" LIKE 'ss-opa-%'`,
      tableName,
      whereSql: `"isCurrent" <> 1 AND "${id}" NOT LIKE 'ss-opa-%'`,
    })
})

test('omits the derived Places full-text index from the current cache profile', () => {
  const tables = resolveCacheTablesForBinding('DB_CURRENT', 'places')
  expect(tables).not.toContain('placesFts')
  expect(tables).toContain('placesDivision')
  expect(tables).toContain('placesCells')
  expect(tables).toContain('address2dBuildingNumberLookup')
  expect(tables).not.toContain('address2dEvidence')
  const historyTables = resolveCacheTablesForBinding('DB_HISTORY_HK_2026', 'places')
  expect(historyTables).not.toContain('placesDivision')
  expect(historyTables).not.toContain('placesCells')
  expect(historyTables).toContain('address2dBuildingNumberLookup')
  expect(historyTables).not.toContain('address2dEvidence')
})

test('the full mirror includes every Address table in current and history storage', () => {
  for (const binding of ['DB_CURRENT', 'DB_HISTORY_HK_BEFORE', 'DB_HISTORY_HK_2026']) {
    const full = resolveCacheTablesForBinding(binding)
    for (const table of [
      'address2d',
      'address2dI18n',
      'address2dBuildingNumberLookup',
      'address3d',
      'address3dI18n',
    ])
      expect(full).toContain(table)
    expect(full).not.toContain('address2dEvidence')
  }
})

test('the full mirror covers the Places planning profile across all storage families', () => {
  for (const binding of [
    'DB_CURRENT',
    'DB_HISTORY_HK_BEFORE',
    'DB_HISTORY_HK_2025',
    'DB_HISTORY_HK_2026',
    'DB_SOURCE_HK_BEFORE',
    'DB_SOURCE_HK_2025',
    'DB_SOURCE_HK_2026',
  ]) {
    const full = resolveCacheTablesForBinding(binding)
    for (const table of resolveCacheTablesForBinding(binding, 'places'))
      expect(full).toContain(table)
  }
})

test('omits the rebuilt Address full-text index from the mirror profile', () => {
  const tables = resolveCacheTablesForBinding('DB_CURRENT', 'address')
  expect(tables).not.toContain('addressesFts')
  expect(tables).toContain('address2dBuildingNumberLookup')
  expect(resolveCacheTablesForBinding('DB_HISTORY_HK_2026', 'address')).toEqual([
    'divisionAreas',
    'divisions',
    'divisionsI18n',
    'address2d',
    'address2dI18n',
    'address2dBuildingNumberLookup',
    'address3d',
    'address3dI18n',
    'sourceResolutions',
    'snapshotVersionChanges',
  ])
})

test('uses the bounded family profiles for remote mirrors', () => {
  const targets = [
    'DB_META',
    'DB_CURRENT',
    'DB_HISTORY_HK_BEFORE',
    'DB_HISTORY_HK_2025',
    'DB_HISTORY_HK_2026',
    'DB_SOURCE_HK_BEFORE',
    'DB_SOURCE_HK_2025',
    'DB_SOURCE_HK_2026',
  ].map(bindingName => ({
    bindingName,
    databaseId: 'acceptance-database-id',
    databaseName: 'acceptance-database',
    localDatabaseId: 'acceptance-local-database',
  }))

  expect(countRemoteCacheWorkUnits(targets)).toBe(170)
  expect(countRemoteCacheWorkUnits(targets, 'division')).toBe(44)
  expect(countRemoteCacheWorkUnits(targets, 'address')).toBe(121)
  expect(countRemoteCacheWorkUnits(targets, 'places')).toBe(76)
  expect(countRemoteCacheWorkUnits(targets, 'statistics')).toBe(58)
  expect(resolveCacheTablesForBinding('DB_HISTORY_HK_2026', 'street')).not.toContain(
    'sourceResolutions',
  )
  expect(resolveCacheTablesForBinding('DB_CURRENT', 'divisionGeometry')).toEqual([
    'divisions',
    'divisionPublicationState',
    'divisionsI18n',
    'divisionAreas',
    'divisionAreaPublicationState',
    'divisionBoundaries',
    'divisionBoundaryPublicationState',
  ])
  expect(countRemoteCacheWorkUnits(targets, 'divisionGeometry')).toBe(63)
})

test('prunes superseded Places history and source rows from annual shards', () => {
  expect(resolveCachePruneOperation('DB_HISTORY_HK_2025', 'places')).toEqual({
    retainedRowsWhereSql: '"isCurrent" = 1',
    tableName: 'places',
    whereSql: '"isCurrent" <> 1',
  })
  expect(resolveCachePruneOperation('DB_SOURCE_HK_2025', 'overturePlaces')).toEqual({
    retainedRowsWhereSql: '"isCurrent" = 1',
    tableName: 'overturePlaces',
    whereSql: '"isCurrent" <> 1',
  })
})

afterEach(() => {
  for (const cacheDir of tempCacheDirs.splice(0)) {
    rmSync(cacheDir, { force: true, recursive: true })
  }
})

test('publication metadata respects pending ownership and the shared writer lock', async () => {
  mkdirSync(cacheRoot, { recursive: true })
  const cacheDir = mkdtempSync(resolve(cacheRoot, 'metadata-ownership-test-'))
  tempCacheDirs.push(cacheDir)
  const sqlite = new Database(resolve(cacheDir, 'DB_META.sqlite'))
  sqlite.exec(migrationSql.replaceAll('--> statement-breakpoint', ''))
  sqlite.exec(
    `INSERT OR IGNORE INTO snapshotLineages (id,code,resourceType,regionCode,variant,identityMode,versionHash,createdAt,updatedAt) VALUES ('fixture-lineage-' || 'snapshot','fixture-lineage-' || 'snapshot','place','hk','default','persistent','fixture','2026-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z');
UPDATE snapshotLineages SET resourceType='place' WHERE id='fixture-lineage-' || 'snapshot' AND resourceType IS NULL;
INSERT INTO snapshots(id, snapshotLineageId, code, cohortKey, status) VALUES
('snapshot', 'fixture-lineage-' || 'snapshot', 'snapshot', '2025', 'draft')`,
  )
  sqlite.close()
  const publishResult: PublishDatasetResult = {
    metadataDelta: {
      releases: [],
      snapshots: [
        {
          id: 'snapshot',
          status: 'published',
          publishedAt: 'now',
          validFrom: 'now',
          validTo: null,
        },
      ],
    },
    phase: null,
    releaseCode: 'release',
    resourceReleaseId: 'owner',
    status: 'current',
  }
  const lock = resolve(cacheDir, 'sql-delivery-lock')
  await withDeliveryLock(lock, async () => {
    await registerPendingSqlDelivery(cacheDir, 'owner', resolve(cacheDir, 'plan'))
    await expect(
      applyPublishMetadataDeltaToRemoteCache('preview', cacheDir, publishResult),
    ).rejects.toThrow()
  })
  await expect(
    applyPublishMetadataDeltaToRemoteCache('preview', cacheDir, {
      ...publishResult,
      resourceReleaseId: 'other',
    }),
  ).rejects.toThrow('unfinished SQL delivery')
  const before = new Database(resolve(cacheDir, 'DB_META.sqlite'), { readonly: true })
  expect(before.query('SELECT status FROM snapshots').get()).toEqual({
    status: 'draft',
  })
  before.close()
  await applyPublishMetadataDeltaToRemoteCache('preview', cacheDir, publishResult)
  const after = new Database(resolve(cacheDir, 'DB_META.sqlite'), { readonly: true })
  expect(after.query('SELECT status FROM snapshots').get()).toEqual({
    status: 'published',
  })
  after.close()
  await Bun.write(resolve(cacheDir, 'manifest.json'), 'retained')
  await expect(invalidateRemoteDbCache('preview', cacheDir)).rejects.toThrow(
    'unfinished SQL delivery',
  )
  expect(await Bun.file(resolve(cacheDir, 'manifest.json')).text()).toBe('retained')
})

test('inserts an API release set that was created during deferred publication', async () => {
  mkdirSync(cacheRoot, { recursive: true })
  const cacheDir = mkdtempSync(resolve(cacheRoot, 'metadata-delta-test-'))
  tempCacheDirs.push(cacheDir)
  const sqlite = new Database(resolve(cacheDir, 'DB_META.sqlite'))
  sqlite.exec(migrationSql.replaceAll('--> statement-breakpoint', ''))
  sqlite.close()

  const releaseSet = {
    id: 'api-release-set-new-draft',
    apiReleaseSetId: 'content-new-draft',
    contentVersionHash: 'content-hash',
    contentCreatedAt: '2026-08-01T00:00:00.000Z',
    contentUpdatedAt: '2026-08-02T00:00:00.000Z',
    apiVersionId: 'api-version-api-divisions-v0.1',
    apiCompositionId: null,
    code: 'data-hk-divisions-2026-08-31.0',
    regionCode: 'hk',
    domainCode: 'geographic',
    cohortKey: '2026-08-31',
    revision: 0,
    effectiveFrom: '2026-08-31T00:00:00.000Z',
    previousRevisionApiReleaseSetId: null,
    schemaVersion: 'sv-division-v1',
    rulesetVersion: 'rs-division-merge-v1',
    status: 'draft' as const,
    publishedAt: null,
    validFrom: null,
    validTo: null,
    notes: null,
    guide: null,
    versionHash: 'version-hash',
    createdAt: '2026-08-31T00:00:00.000Z',
    updatedAt: '2026-08-31T00:00:00.000Z',
  }

  const publishResult: PublishDatasetResult = {
    metadataDelta: { apiReleaseSets: [releaseSet], releases: [] },
    phase: null,
    releaseCode: 'dr-hk-example-2026-08-31.0',
    resourceReleaseId: 'release-example',
    status: 'current',
  }

  await applyPublishMetadataDeltaToRemoteCache('preview', cacheDir, publishResult)

  const verify = new Database(resolve(cacheDir, 'DB_META.sqlite'), { readonly: true })
  expect(
    verify
      .query(
        'SELECT v.id, r.code, v.status, v.apiVersionId, v.versionHash FROM apiVersionReleaseSets v JOIN apiReleaseSets r ON r.id=v.apiReleaseSetId WHERE v.id = ?',
      )
      .get(releaseSet.id),
  ).toEqual({
    id: releaseSet.id,
    code: releaseSet.code,
    status: releaseSet.status,
    apiVersionId: releaseSet.apiVersionId,
    versionHash: releaseSet.versionHash,
  })
  expect(
    verify
      .query('SELECT versionHash,createdAt,updatedAt FROM apiReleaseSets WHERE id=?')
      .get(releaseSet.apiReleaseSetId),
  ).toEqual({
    versionHash: releaseSet.contentVersionHash,
    createdAt: releaseSet.contentCreatedAt,
    updatedAt: releaseSet.contentUpdatedAt,
  })
  verify.close()
})

test('updates an existing API release set from the complete publication delta', async () => {
  mkdirSync(cacheRoot, { recursive: true })
  const cacheDir = mkdtempSync(resolve(cacheRoot, 'metadata-delta-update-test-'))
  tempCacheDirs.push(cacheDir)
  const sqlite = new Database(resolve(cacheDir, 'DB_META.sqlite'))
  sqlite.exec(migrationSql.replaceAll('--> statement-breakpoint', ''))
  sqlite.exec(`
    INSERT INTO apiReleaseSets (id,code,domainCode,revision,schemaVersion,rulesetVersion,versionHash,createdAt,updatedAt)
    VALUES ('content-existing','old-code','old-domain',0,'old-schema','old-rules','old-hash','2026-08-01T00:00:00.000Z','2026-08-01T00:00:00.000Z');
    INSERT INTO apiVersionReleaseSets (id,apiVersionId,apiReleaseSetId,status,versionHash)
    VALUES ('api-release-set-existing','old-version','content-existing','draft','old-hash');
  `)
  sqlite.close()

  const releaseSet = {
    id: 'api-release-set-existing',
    apiReleaseSetId: 'content-existing',
    contentVersionHash: 'updated-content-hash',
    contentCreatedAt: '2026-08-01T00:00:00.000Z',
    contentUpdatedAt: '2026-08-02T00:00:00.000Z',
    apiVersionId: 'api-version-api-divisions-v0.1',
    apiCompositionId: 'api-composition-current',
    code: 'data-hk-divisions-2026-08-31.0',
    regionCode: 'hk',
    domainCode: 'geographic',
    cohortKey: '2026-08-31',
    revision: 2,
    effectiveFrom: '2026-08-31T00:00:00.000Z',
    previousRevisionApiReleaseSetId: 'api-release-set-prior',
    schemaVersion: 'sv-division-v1',
    rulesetVersion: 'rs-division-merge-v1',
    status: 'current' as const,
    publishedAt: '2026-08-31T12:00:00.000Z',
    validFrom: '2026-08-31T12:00:00.000Z',
    validTo: null,
    notes: 'Published release notes',
    guide: 'Published guide',
    versionHash: 'current-version-hash',
    createdAt: '2026-08-30T00:00:00.000Z',
    updatedAt: '2026-08-31T12:00:00.000Z',
  }

  await applyPublishMetadataDeltaToRemoteCache('preview', cacheDir, {
    metadataDelta: { apiReleaseSets: [releaseSet], releases: [] },
    phase: null,
    releaseCode: 'dr-hk-example-2026-08-31.0',
    resourceReleaseId: 'release-example',
    status: 'current',
  })

  const verify = new Database(resolve(cacheDir, 'DB_META.sqlite'), { readonly: true })
  expect(
    verify
      .query(
        `SELECT v.apiVersionId, v.apiCompositionId, r.code, r.domainCode, r.revision, v.status,
          v.publishedAt, v.validFrom, v.validTo, v.notes, v.guide, v.versionHash, v.createdAt, v.updatedAt
         FROM apiVersionReleaseSets v JOIN apiReleaseSets r ON r.id=v.apiReleaseSetId WHERE v.id = ?`,
      )
      .get(releaseSet.id),
  ).toEqual({
    apiVersionId: releaseSet.apiVersionId,
    apiCompositionId: releaseSet.apiCompositionId,
    code: releaseSet.code,
    domainCode: releaseSet.domainCode,
    revision: releaseSet.revision,
    status: releaseSet.status,
    publishedAt: releaseSet.publishedAt,
    validFrom: releaseSet.validFrom,
    validTo: releaseSet.validTo,
    notes: releaseSet.notes,
    guide: releaseSet.guide,
    versionHash: releaseSet.versionHash,
    createdAt: releaseSet.createdAt,
    updatedAt: releaseSet.updatedAt,
  })
  expect(
    verify
      .query('SELECT versionHash,createdAt,updatedAt FROM apiReleaseSets WHERE id=?')
      .get(releaseSet.apiReleaseSetId),
  ).toEqual({
    versionHash: releaseSet.contentVersionHash,
    createdAt: releaseSet.contentCreatedAt,
    updatedAt: releaseSet.contentUpdatedAt,
  })
  verify.close()
})

test('marks a deferred source snapshot published in the local metadata cache', async () => {
  mkdirSync(cacheRoot, { recursive: true })
  const cacheDir = mkdtempSync(resolve(cacheRoot, 'snapshot-metadata-delta-test-'))
  tempCacheDirs.push(cacheDir)
  const sqlite = new Database(resolve(cacheDir, 'DB_META.sqlite'))
  sqlite.exec(migrationSql.replaceAll('--> statement-breakpoint', ''))
  sqlite.exec(`
    INSERT OR IGNORE INTO snapshotLineages (id,code,resourceType,regionCode,variant,identityMode,versionHash,createdAt,updatedAt) VALUES ('fixture-lineage-' || 'snapshot-draft','fixture-lineage-' || 'snapshot-draft','division','hk','default','persistent','fixture','2026-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z');
UPDATE snapshotLineages SET resourceType='division' WHERE id='fixture-lineage-' || 'snapshot-draft' AND resourceType IS NULL;
INSERT INTO snapshots (id, snapshotLineageId, code, cohortKey, status, createdAt, updatedAt) VALUES
('snapshot-draft', 'fixture-lineage-' || 'snapshot-draft', 'ss-hk-division-2026-08-31.0', '2026-08-31.0', 'draft', '2026-08-31T00:00:00.000Z', '2026-08-31T00:00:00.000Z');
  `)
  sqlite.close()

  await applyPublishMetadataDeltaToRemoteCache('preview', cacheDir, {
    metadataDelta: {
      releases: [],
      snapshots: [
        {
          id: 'snapshot-draft',
          status: 'published',
          publishedAt: '2026-08-31T12:00:00.000Z',
          validFrom: '2026-08-31T12:00:00.000Z',
          validTo: null,
        },
      ],
    },
    phase: null,
    releaseCode: 'dr-hk-example-2026-08-31.0',
    resourceReleaseId: 'release-example',
    status: 'current',
  })

  const verify = new Database(resolve(cacheDir, 'DB_META.sqlite'), { readonly: true })
  expect(
    verify
      .query(
        'SELECT status, publishedAt, validFrom, validTo FROM snapshots WHERE id = ?',
      )
      .get('snapshot-draft'),
  ).toEqual({
    status: 'published',
    publishedAt: '2026-08-31T12:00:00.000Z',
    validFrom: '2026-08-31T12:00:00.000Z',
    validTo: null,
  })
  verify.close()
})
