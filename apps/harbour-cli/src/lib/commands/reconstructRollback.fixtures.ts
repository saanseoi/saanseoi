import { Database } from 'bun:sqlite'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildDivisionSearchSyncSql } from '@repo/core/pipeline/services/search/divisions'
import { createLocalHarbourDb } from '../../../../../libs/core/src/testing/localDb.ts'
import { loadMigrationSql } from '../../../../../libs/core/src/testing/metaFixtures.ts'
import { snapshotFixtureFields } from '../../../../../libs/core/src/testing/snapshotFixtures'
import type { LocalAddressDbContext } from '../dbCache/localDbCacheTypes.ts'
import { prepareNativeSqlDelivery } from '../pipeline/local/nativeSqlDelivery.ts'
import { prepareReconstructedRollback } from './reconstructRollback.ts'

const migrations = join(import.meta.dir, '../../../../../libs/db/migrations')
export const insert = (db: Database, table: string, row: Record<string, unknown>) => {
  if (table === 'snapshots') row = snapshotFixtureFields(db, row) as typeof row

  row = { ...row }
  const fixtureColumns = new Set(
    db
      .query<{ name: string }, []>(`PRAGMA table_info(${table})`)
      .all()
      .map(column => column.name),
  )
  if (
    fixtureColumns.has('scopeId') &&
    !fixtureColumns.has('snapshotId') &&
    'snapshotId' in row
  ) {
    row.scopeId ??= row.snapshotId
    delete row.snapshotId
  }
  if (!fixtureColumns.has('updatedAt')) delete row.updatedAt

  db.query(
    `INSERT INTO ${table} (${Object.keys(row).join(',')}) VALUES (${Object.keys(row)
      .map(() => '?')
      .join(',')})`,
  ).run(
    ...(Object.values(row).map(value =>
      value != null && typeof value === 'object' ? JSON.stringify(value) : value,
    ) as never[]),
  )
}

export async function fixture(previous = true) {
  const root = await mkdtemp(join(tmpdir(), 'reconstruct-rollback-'))
  const files = {
    DB_CURRENT: join(root, 'current.sqlite'),
    DB_META: join(root, 'meta.sqlite'),
    DB_HISTORY: join(root, 'history.sqlite'),
  }
  const initialise = (
    binding: keyof typeof files,
    family: 'current' | 'meta' | 'history',
  ) => {
    const db = new Database(files[binding])
    db.exec(loadMigrationSql(migrations, [family]))
    db.exec('PRAGMA foreign_keys=ON')
    return db
  }
  const current = initialise('DB_CURRENT', 'current')
  const meta = initialise('DB_META', 'meta')
  const history = initialise('DB_HISTORY', 'history')
  insert(meta, 'publishers', {
    id: 'publisher',
    code: 'publisher',
    versionHash: 'publisher',
  })
  insert(meta, 'datasets', {
    id: 'dataset',
    publisherId: 'publisher',
    code: 'division-data',
    regionCode: 'hk',
    releaseType: 'snapshot',
    releaseFrequency: 'annual',
    theme: 'divisions',
    versionHash: 'dataset',
  })
  insert(meta, 'apiVersions', {
    id: 'api',
    code: 'divisions-v0.1',
    familyType: 'divisions',
    version: '0.1',
    status: 'current',
    versionHash: 'api',
  })
  insert(meta, 'snapshotLineages', {
    id: 'lineage',
    code: 'division-lineage',
    resourceType: 'division',
    regionCode: 'hk',
    identityMode: 'persistent',
    primaryDatasetId: 'dataset',
    versionHash: 'lineage',
  })
  insert(meta, 'snapshotLineages', {
    id: 'other',
    code: 'other-lineage',
    resourceType: 'division',
    regionCode: 'hk',
    identityMode: 'persistent',
    primaryDatasetId: 'dataset',
    variant: 'other',
    versionHash: 'other',
  })
  insert(meta, 'dataShards', {
    id: 'history',
    shardType: 'history',
    regionCode: 'hk',
    year: '2026',
    environment: 'local',
    databaseName: 'history',
    databaseId: 'history',
    bindingName: 'DB_HISTORY',
    status: 'active',
    versionHash: 'history',
  })
  for (const name of previous ? ['old', 'new', 'other'] : ['new', 'other']) {
    insert(meta, 'sourceReleases', {
      id: `source-${name}`,
      datasetId: 'dataset',
      code: `source-${name}`,
      sourceVersion: name,
      status: 'current',
    })
    insert(meta, 'resourceReleases', {
      id: `release-${name}`,
      sourceReleaseId: `source-${name}`,
      code: `release-${name}`,
      resourceType: 'division',
      status: 'current',
    })
    insert(meta, 'snapshots', {
      id: `snapshot-${name}`,
      code: `snapshot-${name}`,
      resourceType: 'division',
      snapshotLineageId: name === 'other' ? 'other' : 'lineage',
      parentSnapshotId: name === 'new' && previous ? 'snapshot-old' : null,
      cohortKey: '2026',
      revision: name === 'old' ? 0 : 1,
      status: 'published',
    })
    insert(meta, 'snapshotResourceReleases', {
      snapshotId: `snapshot-${name}`,
      resourceReleaseId: `release-${name}`,
      role: 'primary',
    })
    insert(meta, 'snapshotShardAssignments', {
      snapshotId: `snapshot-${name}`,
      dataShardId: 'history',
    })
    insert(meta, 'apiReleaseSets', {
      id: `set-${name}`,
      code: `set-${name}`,
      regionCode: 'hk',
      domainCode: name === 'other' ? 'hkgov-pland-pu' : 'geographic',
      cohortKey: '2026',
      revision: name === 'old' ? 0 : 1,
      schemaVersion: '1',
      rulesetVersion: '1',
      versionHash: name,
    })
    insert(meta, 'apiVersionReleaseSets', {
      id: `version-set-${name}`,
      apiVersionId: 'api',
      apiReleaseSetId: `set-${name}`,
      previousRevisionApiReleaseSetId: name === 'new' && previous ? 'set-old' : null,
      status: name === 'old' ? 'archived' : 'current',
      publishedAt: '2026-01-01T00:00:00.000Z',
      versionHash: name,
    })
    insert(meta, 'apiReleaseSetSnapshots', {
      apiReleaseSetId: `set-${name}`,
      snapshotId: `snapshot-${name}`,
      role: 'primary',
      isRequired: 1,
      cohortMatchingMode: 'exact',
    })
  }
  if (previous)
    meta.exec(
      "UPDATE resourceReleases SET supersededByResourceReleaseId='release-new' WHERE id='release-old'",
    )
  insert(meta, 'apiCatalogRevisions', {
    id: 'catalogue',
    apiVersionId: 'api',
    code: 'catalogue',
    regionCode: 'hk',
    publicationDate: '2026-01-01',
    revision: 0,
    defaultDomainCode: 'geographic',
    status: 'current',
    publishedAt: '2026-01-01T00:00:00.000Z',
    versionHash: 'catalogue',
  })
  insert(meta, 'apiCatalogRevisionReleaseSets', {
    apiCatalogRevisionId: 'catalogue',
    apiVersionReleaseSetId: 'version-set-new',
    domainCode: 'geographic',
    cohortKey: '2026',
    isDefault: 1,
  })
  insert(meta, 'apiCatalogRevisionReleaseSets', {
    apiCatalogRevisionId: 'catalogue',
    apiVersionReleaseSetId: 'version-set-other',
    domainCode: 'hkgov-pland-pu',
    cohortKey: '2026',
    isDefault: 1,
  })
  for (const [scopeId, snapshotId] of [
    ['lineage', 'snapshot-new'],
    ['other', 'snapshot-other'],
  ]) {
    insert(current, 'divisionPublicationState', {
      scopeId,
      snapshotId,
      status: 'current',
      publicationToken: `token-${scopeId}`,
      preparedAt: '2026-01-01',
    })
    insert(current, 'divisions', {
      scopeId: scopeId,
      id: 'district',
      class: 'district',
      hierarchies: [],
      divisionCode: 'CW',
    })
    insert(current, 'divisionsI18n', {
      scopeId: scopeId,
      divisionId: 'district',
      locale: 'en',
      name: scopeId === 'lineage' ? 'New Name' : 'Unrelated Name',
      meta: null,
    })
    insert(current, 'divisionsI18n', {
      scopeId: scopeId,
      divisionId: 'district',
      locale: 'zh-hant',
      name: '中文',
      meta: null,
    })
  }
  for (const statement of buildDivisionSearchSyncSql([
    { scopeId: 'search-main', snapshotId: 'snapshot-new' },
    { scopeId: 'search-other', snapshotId: 'snapshot-other' },
  ]))
    current.exec(statement)
  if (previous) {
    const envelope = {
      snapshotId: 'snapshot-old',
      isCurrent: 0,
    }
    insert(history, 'divisions', {
      ...envelope,
      id: 'district',
      class: 'district',
      hierarchies: [],
      divisionCode: 'CW',
      versionHash: 'base',
    })
    insert(history, 'divisionsI18n', {
      ...envelope,
      divisionId: 'district',
      locale: 'en',
      name: 'Old Name',
      versionHash: 'old-en',
      meta: null,
    })
    insert(history, 'divisionsI18n', {
      ...envelope,
      divisionId: 'district',
      locale: 'zh-hant',
      name: '中文',
      versionHash: 'old-zh',
      meta: null,
    })
  }
  const context = {
    state: {
      files,
      bindings: {},
      dbCacheDir: root,
      preparedAt: '2026-01-01',
      target: 'local',
    },
    historyTargets: [
      {
        bindingName: 'DB_HISTORY',
        db: createLocalHarbourDb(history),
        year: '2026',
        databaseName: 'history',
        databaseId: 'history',
      },
    ],
    sourceTargets: [],
    currentDb: createLocalHarbourDb(current),
    metaDb: createLocalHarbourDb(meta),
    historyDb: createLocalHarbourDb(history),
    cleanup() {},
  } as unknown as LocalAddressDbContext
  let generations = 0
  const directory = join(root, 'sealed')
  const prepare = () =>
    prepareNativeSqlDelivery({
      directory,
      ownershipDirectory: root,
      files,
      resourceReleaseId: 'release-new',
      phase: 'rollback',
      inputs: { operation: 'rollback' },
      generate: async append => {
        generations++
        return prepareReconstructedRollback({
          context,
          resourceReleaseId: 'release-new',
          append,
        })
      },
    })
  return {
    root,
    files,
    current,
    meta,
    history,
    context,
    directory,
    prepare,
    generations: () => generations,
    close: async () => {
      for (const db of [current, meta, history]) db.close()
      await rm(root, { recursive: true, force: true })
    },
  }
}
