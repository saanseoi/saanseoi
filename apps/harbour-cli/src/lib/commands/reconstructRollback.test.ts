import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createLocalHarbourDb } from '../../../../../libs/core/src/testing/localDb.ts'
import { loadMigrationSql } from '../../../../../libs/core/src/testing/metaFixtures.ts'
import { buildDivisionSearchSyncSql } from '@repo/core/pipeline/services/search/divisions'
import type { LocalAddressDbContext } from '../dbCache/localDbCacheTypes.ts'
import {
  prepareNativeSqlDelivery,
  runNativeSqlDelivery,
} from '../pipeline/local/nativeSqlDelivery.ts'
import {
  readDeliveryPlan,
  readBoundDeliveryStatements,
  readDeliveryProgress,
} from '../pipeline/local/sqlDeliveryFiles.ts'
import { readPendingSqlDelivery } from '../pipeline/local/sqlDeliveryPending.ts'
import {
  prepareReconstructedRollback,
  verifyRollbackTerminal,
} from './reconstructRollback.ts'
import type { RollbackTerminal } from './rollbackDelivery.ts'
import type { NetSqlitePlanSummary } from '../pipeline/local/netSqlitePlanTypes.ts'

const migrations = join(import.meta.dir, '../../../../../libs/db/migrations')
const insert = (db: Database, table: string, row: Record<string, unknown>) => {
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

async function fixture(previous = true) {
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
      status: 'published',
    })
    insert(meta, 'releases', {
      id: `release-${name}`,
      sourceReleaseId: `source-${name}`,
      datasetId: 'dataset',
      code: `release-${name}`,
      resourceType: 'division',
      sourceVersion: name,
      status: 'published',
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
    insert(meta, 'snapshotSources', {
      snapshotId: `snapshot-${name}`,
      datasetId: 'dataset',
      resourceReleaseId: `release-${name}`,
      role: 'primary',
    })
    insert(meta, 'snapshotShardAssignments', {
      snapshotId: `snapshot-${name}`,
      dataShardId: 'history',
    })
    insert(meta, 'apiReleaseSets', {
      id: `set-${name}`,
      apiVersionId: 'api',
      code: `set-${name}`,
      regionCode: 'hk',
      domainCode: name === 'other' ? 'hkgov-pland-pu' : 'geographic',
      cohortKey: '2026',
      revision: name === 'old' ? 0 : 1,
      supersedesApiReleaseSetId: name === 'new' && previous ? 'set-old' : null,
      schemaVersion: '1',
      rulesetVersion: '1',
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
      "UPDATE releases SET supersededByReleaseId='release-new' WHERE id='release-old'",
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
    apiReleaseSetId: 'set-new',
    domainCode: 'geographic',
    cohortKey: '2026',
    isDefault: 1,
  })
  insert(meta, 'apiCatalogRevisionReleaseSets', {
    apiCatalogRevisionId: 'catalogue',
    apiReleaseSetId: 'set-other',
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
      snapshotId: scopeId,
      id: 'district',
      class: 'district',
      hierarchies: [],
      divisionCode: 'CW',
    })
    insert(current, 'divisionsI18n', {
      snapshotId: scopeId,
      divisionId: 'district',
      locale: 'en',
      name: scopeId === 'lineage' ? 'New Name' : 'Unrelated Name',
      isLocaleInferred: 0,
    })
    insert(current, 'divisionsI18n', {
      snapshotId: scopeId,
      divisionId: 'district',
      locale: 'zh-hant',
      name: '中文',
      isLocaleInferred: 0,
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
      sourceReleaseId: 'release-old',
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
      isLocaleInferred: 0,
      versionHash: 'old-en',
    })
    insert(history, 'divisionsI18n', {
      ...envelope,
      divisionId: 'district',
      locale: 'zh-hant',
      name: '中文',
      isLocaleInferred: 0,
      versionHash: 'old-zh',
    })
    for (const [recordType, locale, versionHash] of [
      ['division', '', 'base'],
      ['divisionI18n', 'en', 'old-en'],
      ['divisionI18n', 'zh-hant', 'old-zh'],
    ])
      insert(history, 'snapshotVersionChanges', {
        snapshotId: 'snapshot-old',
        recordType,
        recordId: 'district',
        locale,
        versionHash,
        operation: 'upsert',
        sourceReleaseId: 'release-old',
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
      releaseId: 'release-new',
      phase: 'rollback',
      inputs: { operation: 'rollback' },
      generate: async append => {
        generations++
        return prepareReconstructedRollback({
          context,
          releaseId: 'release-new',
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

test('reconstructed rollback writes only the changed locale and updates FTS while preserving unrelated scopes and rowids', async () => {
  const f = await fixture()
  try {
    const baseRows = f.current
      .query('SELECT rowid,* FROM divisions ORDER BY snapshotId')
      .all()
    const retainedLocales = f.current
      .query(
        "SELECT rowid,* FROM divisionsI18n WHERE snapshotId='other' OR locale='zh-hant' ORDER BY snapshotId,locale",
      )
      .all()
    const retainedFts = f.current
      .query(
        "SELECT rowid,* FROM divisionSearchFts WHERE scopeId='search-other' ORDER BY locale",
      )
      .all()
    const plan = await f.prepare()
    const terminal = plan.outputs?.terminal as RollbackTerminal | undefined
    if (!terminal) throw new Error('Expected rollback completion contract')
    const summary = plan.outputs?.mutationSummary as NetSqlitePlanSummary
    expect(summary.tables.DB_CURRENT?.divisions?.updated).toBe(0)
    expect(summary.tables.DB_CURRENT?.divisionsI18n?.updated).toBe(1)
    expect(
      f.current
        .query(
          "SELECT name FROM divisionsI18n WHERE snapshotId='lineage' AND locale='en'",
        )
        .get(),
    ).toEqual({ name: 'New Name' })
    await runNativeSqlDelivery(f.directory, { files: f.files })
    await verifyRollbackTerminal(f.files, plan.outputs?.terminal as RollbackTerminal)
    expect(
      f.current.query('SELECT rowid,* FROM divisions ORDER BY snapshotId').all(),
    ).toEqual(baseRows)
    expect(
      f.current
        .query(
          "SELECT rowid,* FROM divisionsI18n WHERE snapshotId='other' OR locale='zh-hant' ORDER BY snapshotId,locale",
        )
        .all(),
    ).toEqual(retainedLocales)
    expect(
      f.current
        .query(
          "SELECT rowid,* FROM divisionSearchFts WHERE scopeId='search-other' ORDER BY locale",
        )
        .all(),
    ).toEqual(retainedFts)
    expect(
      f.current
        .query(
          "SELECT nameText FROM divisionSearchFts WHERE scopeId='search-main' AND locale='en'",
        )
        .get(),
    ).toEqual({ nameText: 'Old Name' })
    expect(
      f.meta.query("SELECT status FROM releases WHERE id='release-new'").get(),
    ).toEqual({ status: 'revoked' })
    expect(f.meta.query('SELECT count(*) AS n FROM snapshots').get()).toEqual({ n: 3 })
    expect(
      f.meta
        .query(
          'SELECT apiReleaseSetId FROM apiCatalogRevisionReleaseSets WHERE apiCatalogRevisionId=? ORDER BY apiReleaseSetId',
        )
        .all(terminal.catalogId),
    ).toEqual([{ apiReleaseSetId: 'set-old' }, { apiReleaseSetId: 'set-other' }])
    expect(f.history.query('SELECT isCurrent FROM divisions').get()).toEqual({
      isCurrent: 0,
    })
  } finally {
    await f.close()
  }
})

test('initial publication rollback removes only its own serving projection and search selection', async () => {
  const f = await fixture(false)
  try {
    const unrelated = f.current
      .query("SELECT rowid,* FROM divisions WHERE snapshotId='other'")
      .all()
    const plan = await f.prepare()
    await runNativeSqlDelivery(f.directory, { files: f.files })
    await verifyRollbackTerminal(f.files, plan.outputs?.terminal as RollbackTerminal)
    expect(
      f.current.query("SELECT 1 FROM divisions WHERE snapshotId='lineage'").get(),
    ).toBeNull()
    expect(
      f.current.query("SELECT rowid,* FROM divisions WHERE snapshotId='other'").all(),
    ).toEqual(unrelated)
    expect(
      f.current
        .query("SELECT 1 FROM divisionPublicationState WHERE scopeId='lineage'")
        .get(),
    ).toBeNull()
    expect(f.current.query('SELECT scopeId FROM divisionSearchScopes').all()).toEqual([
      { scopeId: 'search-other' },
    ])
    expect(
      f.current.query('SELECT DISTINCT scopeId FROM divisionSearchFts').all(),
    ).toEqual([{ scopeId: 'search-other' }])
  } finally {
    await f.close()
  }
})

test('missing exact historical content produces no delivery payload or ownership marker', async () => {
  const f = await fixture()
  try {
    f.history.exec("DELETE FROM divisionsI18n WHERE locale='en'")
    await expect(f.prepare()).rejects.toThrow('Missing exact history component')
    expect(await readDeliveryPlan(f.directory)).toBeNull()
    expect(
      (await readdir(f.directory)).filter(name => /^\d+\.(json|sql)$/.test(name)),
    ).toEqual([])
    expect(await readPendingSqlDelivery(f.root)).toBeNull()
    expect(
      f.current
        .query(
          "SELECT name FROM divisionsI18n WHERE snapshotId='lineage' AND locale='en'",
        )
        .get(),
    ).toEqual({ name: 'New Name' })
  } finally {
    await f.close()
  }
})

test('interrupted rollback resumes the identical sealed payload after content delivery without regenerating history', async () => {
  const f = await fixture()
  try {
    const plan = await f.prepare()
    const payloads = await Promise.all(
      plan.batches.map(batch => readFile(join(f.directory, batch.file))),
    )
    const changedBatch = plan.batches.find(batch =>
      readBoundDeliveryStatements(payloads[batch.index] ?? new Uint8Array()).some(
        statement => /(?:UPDATE|INSERT INTO)\s+"divisionsI18n"/.test(statement.sql),
      ),
    )
    expect(changedBatch).toBeDefined()
    if (!changedBatch) throw new Error('Expected changed locale payload')
    await expect(
      runNativeSqlDelivery(f.directory, {
        files: f.files,
        onProgress: completed => {
          if (completed === changedBatch.index + 1)
            throw new Error('simulated interruption')
        },
      }),
    ).rejects.toThrow('simulated interruption')
    expect(
      f.current
        .query("SELECT status FROM divisionPublicationState WHERE scopeId='lineage'")
        .get(),
    ).toEqual({ status: 'publishing' })
    expect(
      f.current
        .query(
          "SELECT name FROM divisionsI18n WHERE snapshotId='lineage' AND locale='en'",
        )
        .get(),
    ).toEqual({ name: 'Old Name' })
    f.history.exec('DELETE FROM divisionsI18n')
    expect((await f.prepare()).id).toBe(plan.id)
    expect(f.generations()).toBe(1)
    await runNativeSqlDelivery(f.directory, { files: f.files })
    await verifyRollbackTerminal(f.files, plan.outputs?.terminal as RollbackTerminal)
    expect(
      f.current
        .query(
          "SELECT nameText FROM divisionSearchFts WHERE scopeId='search-main' AND locale='en'",
        )
        .get(),
    ).toEqual({ nameText: 'Old Name' })
    expect(
      await Promise.all(
        plan.batches.map(batch => readFile(join(f.directory, batch.file))),
      ),
    ).toEqual(payloads)
    expect(
      Object.keys((await readDeliveryProgress(f.directory, plan)).local),
    ).toHaveLength(plan.batches.length)
  } finally {
    await f.close()
  }
})

test('stale publication ownership stops sealed rollback before any canonical or search mutation', async () => {
  const f = await fixture()
  try {
    await f.prepare()
    f.current.exec(
      "UPDATE divisionPublicationState SET publicationToken='intervening-publication' WHERE scopeId='lineage'",
    )
    const before = f.current
      .query('SELECT rowid,* FROM divisionsI18n ORDER BY snapshotId,locale')
      .all()
    const ftsBefore = f.current
      .query('SELECT rowid,* FROM divisionSearchFts ORDER BY rowid')
      .all()
    await expect(
      runNativeSqlDelivery(f.directory, { files: f.files }),
    ).rejects.toThrow()
    expect(
      f.current
        .query('SELECT rowid,* FROM divisionsI18n ORDER BY snapshotId,locale')
        .all(),
    ).toEqual(before)
    expect(
      f.current.query('SELECT rowid,* FROM divisionSearchFts ORDER BY rowid').all(),
    ).toEqual(ftsBefore)
    expect(
      f.current
        .query(
          "SELECT publicationToken FROM divisionPublicationState WHERE scopeId='lineage'",
        )
        .get(),
    ).toEqual({ publicationToken: 'intervening-publication' })
    expect(
      f.meta.query("SELECT status FROM releases WHERE id='release-new'").get(),
    ).toEqual({ status: 'published' })
  } finally {
    await f.close()
  }
})
