import { Database, type SQLQueryBindings } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createLocalHarbourDb } from '@repo/core/testing/localDb'
import { loadMigrationSql } from '../../../../../libs/core/src/testing/metaFixtures.ts'
import type { LocalAddressDbContext } from '../dbCache/localDbCacheTypes.ts'
import { versionStatisticsDefinitions } from '../pipeline/statistics/statisticsRecordIdentity.ts'
import {
  prepareNativeSqlDelivery,
  runNativeSqlDelivery,
} from '../pipeline/local/nativeSqlDelivery.ts'
import {
  readBoundDeliveryStatements,
  readDeliveryPlan,
} from '../pipeline/local/sqlDeliveryFiles.ts'
import { readPendingSqlDelivery } from '../pipeline/local/sqlDeliveryPending.ts'
import type { NetSqlitePlanSummary } from '../pipeline/local/netSqlitePlanTypes.ts'
import { insertProjectionRow } from './rollback/projection.ts'
import {
  prepareReconstructedRollback,
  verifyRollbackTerminal,
} from './reconstructRollback.ts'
import type { RollbackTerminal } from './rollbackDelivery.ts'

const datasetCode = 'ds-statistics'
const period = '2021-Q1'
const timestamp = '2026-01-01T00:00:00.000Z'
const insert = (db: Database, table: string, row: Record<string, unknown>) => {
  db.query(
    `INSERT INTO ${table} (${Object.keys(row)
      .map(key => `"${key}"`)
      .join(',')}) VALUES (${Object.keys(row)
      .map(() => '?')
      .join(',')})`,
  ).run(
    ...(Object.values(row).map(value =>
      value != null && typeof value === 'object'
        ? JSON.stringify(value)
        : typeof value === 'boolean'
          ? Number(value)
          : value,
    ) as SQLQueryBindings[]),
  )
}
const definitions = (name: string) =>
  versionStatisticsDefinitions({
    fields: [
      {
        datasetCode,
        fieldName: 'population',
        measureCode: 'population',
        sourceField: 'population',
        dimensions: { sex: 'all' },
        comparability: null,
        sourceNullOption: null,
        statisticKind: 'count',
        aggregation: 'none',
        aggregationPercentile: null,
        periodicity: null,
        denominatorFieldName: null,
        valueKind: 'numeric',
        unitCode: 'person',
      },
    ],
    fieldsI18n: [
      {
        datasetCode,
        fieldName: 'population',
        locale: 'en',
        name,
        description: null,
        isTranslationVerified: true,
      },
    ],
    measures: [{ datasetCode, measureCode: 'population' }],
    measuresI18n: [
      {
        datasetCode,
        measureCode: 'population',
        locale: 'en',
        name,
        description: null,
        isTranslationVerified: true,
      },
    ],
  })
const dictionaryTables = [
  'statsFields',
  'statsFieldsI18n',
  'statsMeasures',
  'statsMeasuresI18n',
] as const
const historyEnvelope = {
  sourceReleaseId: 'release-old',
  isCurrent: 0,
  createdAt: timestamp,
  updatedAt: timestamp,
}
const record = (
  id: string,
  hash: string,
  value: string,
  definitions: ReturnType<typeof versionStatisticsDefinitions>,
) => ({
  ...historyEnvelope,
  id,
  versionHash: hash,
  datasetCode,
  sourceFeatureRef: `native/${id}`,
  divisionId: null,
  referencePeriodCode: period,
  referencePeriodStart: '2021-01-01',
  referencePeriodEnd: '2021-03-31',
  referencePeriodEndYear: '2021',
  referencePeriodGranularity: 'quarter',
  geography: { kind: 'district', code: id },
  values: { population: value },
  fieldDefinitionHashes: { population: definitions.fields[0]?.versionHash ?? '' },
  fieldSources: {
    population: { sourceReleaseId: 'release-old', sourceFeatureRef: `native/${id}` },
  },
})

async function fixture(previous = true) {
  const root = await mkdtemp(join(tmpdir(), 'reconstruct-statistics-'))
  const files = {
    DB_CURRENT: join(root, 'current.sqlite'),
    DB_META: join(root, 'meta.sqlite'),
    DB_HISTORY: join(root, 'history.sqlite'),
    DB_SOURCE: join(root, 'source.sqlite'),
  }
  const open = (
    binding: keyof typeof files,
    kind: 'current' | 'meta' | 'history' | 'source',
  ) => {
    const db = new Database(files[binding])
    db.exec(
      loadMigrationSql(join(import.meta.dir, '../../../../../libs/db/migrations'), [
        kind,
      ]),
    )
    db.exec('PRAGMA foreign_keys=ON')
    return db
  }
  const current = open('DB_CURRENT', 'current')
  const meta = open('DB_META', 'meta')
  const history = open('DB_HISTORY', 'history')
  const source = open('DB_SOURCE', 'source')
  insert(meta, 'publishers', {
    id: 'publisher',
    code: 'publisher',
    versionHash: 'publisher',
  })
  for (const id of ['dataset', 'other-dataset'])
    insert(meta, 'datasets', {
      id,
      publisherId: 'publisher',
      code: id === 'dataset' ? datasetCode : 'ds-other',
      regionCode: 'hk',
      releaseType: 'snapshot',
      releaseFrequency: 'annual',
      theme: 'statistics',
      versionHash: id,
    })
  insert(meta, 'apiVersions', {
    id: 'api',
    code: 'stats-v0.1',
    familyType: 'stats',
    version: '0.1',
    status: 'current',
    versionHash: 'api',
  })
  for (const id of ['main', 'older', 'other'])
    insert(meta, 'snapshotLineages', {
      id,
      code: `statistics-${id}`,
      resourceType: 'divisionStatistic',
      regionCode: 'hk',
      identityMode: 'persistent',
      primaryDatasetId: id === 'other' ? 'other-dataset' : 'dataset',
      variant: id,
      versionHash: id,
    })
  insert(meta, 'dataShards', {
    id: 'history',
    shardType: 'history',
    regionCode: 'hk',
    year: '2021',
    environment: 'local',
    databaseName: 'history',
    databaseId: 'history',
    bindingName: 'DB_HISTORY',
    status: 'active',
    versionHash: 'history',
  })
  const names = previous ? ['old', 'new', 'older', 'other'] : ['new', 'older', 'other']
  for (const name of names) {
    const datasetId = name === 'other' ? 'other-dataset' : 'dataset'
    const cohortKey = name === 'older' ? '2020-Q4' : period
    const domainCode = name === 'other' ? 'other-statistics' : 'official-statistics'
    insert(meta, 'sourceReleases', {
      id: `source-${name}`,
      datasetId,
      code: `source-${name}`,
      sourceVersion: name,
      status: 'published',
    })
    insert(meta, 'releases', {
      id: `release-${name}`,
      sourceReleaseId: `source-${name}`,
      datasetId,
      code: `release-${name}`,
      resourceType: 'divisionStatistic',
      sourceVersion: name,
      status: 'published',
    })
    insert(meta, 'snapshots', {
      id: `snapshot-${name}`,
      code: `snapshot-${name}`,
      resourceType: 'divisionStatistic',
      snapshotLineageId: ['old', 'new'].includes(name) ? 'main' : name,
      parentSnapshotId: name === 'new' && previous ? 'snapshot-old' : null,
      cohortKey,
      revision: name === 'new' ? 1 : 0,
      status: 'published',
    })
    insert(meta, 'snapshotSources', {
      snapshotId: `snapshot-${name}`,
      datasetId,
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
      domainCode,
      cohortKey,
      revision: name === 'new' ? 1 : 0,
      supersedesApiReleaseSetId: name === 'new' && previous ? 'set-old' : null,
      schemaVersion: '1',
      rulesetVersion: '1',
      status: name === 'old' ? 'archived' : 'current',
      publishedAt: timestamp,
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
    defaultDomainCode: 'official-statistics',
    status: 'current',
    publishedAt: timestamp,
    versionHash: 'catalogue',
  })
  for (const name of ['new', 'older', 'other']) {
    insert(meta, 'apiCatalogRevisionReleaseSets', {
      apiCatalogRevisionId: 'catalogue',
      apiReleaseSetId: `set-${name}`,
      domainCode: name === 'other' ? 'other-statistics' : 'official-statistics',
      cohortKey: name === 'older' ? '2020-Q4' : period,
      isDefault: name === 'older' ? 0 : 1,
    })
    insert(current, 'statsPublicationState', {
      datasetCode: name === 'other' ? 'ds-other' : datasetCode,
      referencePeriodCode: name === 'older' ? '2020-Q4' : period,
      snapshotId: `snapshot-${name}`,
      status: 'current',
      createdAt: timestamp,
      updatedAt: timestamp,
    })
  }
  const oldDefinitions = definitions('Original population')
  const newDefinitions = definitions('Current population')
  for (const definition of [oldDefinitions, newDefinitions])
    for (const [index, rows] of [
      definition.fields,
      definition.fieldsI18n,
      definition.measures,
      definition.measuresI18n,
    ].entries())
      for (const row of rows)
        insert(history, dictionaryTables[index] ?? '', { ...historyEnvelope, ...row })
  for (const [index, rows] of [
    newDefinitions.fields,
    newDefinitions.fieldsI18n,
    newDefinitions.measures,
    newDefinitions.measuresI18n,
  ].entries())
    for (const row of rows)
      insertProjectionRow(current, dictionaryTables[index] ?? '', {
        ...historyEnvelope,
        ...row,
      })
  const oldRows = [
    record('revised', 'revised-old', '10', oldDefinitions),
    record('restored', 'restored-old', '20', oldDefinitions),
    record('unchanged', 'unchanged', '30', newDefinitions),
  ]
  if (previous)
    for (const row of oldRows) {
      insert(history, 'statsRecords', row)
      insert(history, 'snapshotVersionChanges', {
        snapshotId: 'snapshot-old',
        recordType: 'statsRecord',
        recordId: row.id,
        locale: '',
        versionHash: row.versionHash,
        operation: 'upsert',
        sourceReleaseId: 'release-old',
      })
    }
  for (const row of [
    record('revised', 'revised-new', '11', newDefinitions),
    record('removed', 'removed-new', '40', newDefinitions),
    record('unchanged', 'unchanged', '30', newDefinitions),
    {
      ...record('older-period', 'older', '50', newDefinitions),
      referencePeriodCode: '2020-Q4',
    },
    {
      ...record('unrelated-dataset', 'other', '60', newDefinitions),
      datasetCode: 'ds-other',
    },
  ])
    insertProjectionRow(current, 'statsRecords', row)
  insert(source, 'hkgovCenstatdStatistics', {
    sourceRecordId: 'native/revised',
    versionHash: 'raw',
    releaseId: 'release-old',
    validFromRelease: '2021',
    validToRelease: null,
    isCurrent: 1,
    sourceLocator: { native: 'revised' },
    properties: { population: '10' },
  })
  const context = {
    state: {
      files,
      bindings: {},
      dbCacheDir: root,
      preparedAt: timestamp,
      target: 'local',
    },
    historyTargets: [
      {
        bindingName: 'DB_HISTORY',
        db: createLocalHarbourDb(history),
        year: '2021',
        databaseName: 'history',
        databaseId: 'history',
      },
    ],
    sourceTargets: [
      {
        bindingName: 'DB_SOURCE',
        db: createLocalHarbourDb(source),
        year: '2021',
        databaseName: 'source',
        databaseId: 'source',
      },
    ],
    currentDb: createLocalHarbourDb(current),
    metaDb: createLocalHarbourDb(meta),
    historyDb: createLocalHarbourDb(history),
    cleanup() {},
  } as unknown as LocalAddressDbContext
  const directory = join(root, 'sealed')
  let generations = 0
  const prepare = () =>
    prepareNativeSqlDelivery({
      directory,
      ownershipDirectory: root,
      files,
      releaseId: 'release-new',
      phase: 'rollback-reconstruction',
      inputs: { operation: 'rollback' },
      generate: append => {
        generations++
        return prepareReconstructedRollback({
          context,
          releaseId: 'release-new',
          append,
        })
      },
    })
  const retainedRows = () =>
    current
      .query(
        "SELECT rowid,* FROM statsRecords WHERE id IN ('unchanged','older-period','unrelated-dataset') ORDER BY id",
      )
      .all()
  const retainedReceipts = () =>
    current
      .query(
        'SELECT rowid,* FROM statsPublicationState WHERE datasetCode<>? OR referencePeriodCode<>? ORDER BY datasetCode,referencePeriodCode',
      )
      .all(datasetCode, period)
  return {
    root,
    files,
    directory,
    context,
    current,
    meta,
    history,
    source,
    oldDefinitions,
    newDefinitions,
    prepare,
    retainedRows,
    retainedReceipts,
    generations: () => generations,
    close: async () => {
      for (const db of [current, meta, history, source]) db.close()
      await rm(root, { recursive: true, force: true })
    },
  }
}

test('sealed Statistics rollback restores exact-period packs and missing dictionaries while retaining older periods, unrelated rows and evidence', async () => {
  const f = await fixture()
  try {
    const retained = f.retainedRows()
    const receipts = f.retainedReceipts()
    const dictionaryRows = f.current.query('SELECT rowid,* FROM statsFields').all()
    const sourceRows = f.source
      .query('SELECT rowid,* FROM hkgovCenstatdStatistics')
      .all()
    const historyRows = f.history
      .query('SELECT rowid,* FROM statsRecords ORDER BY id')
      .all()
    const plan = await f.prepare()
    const terminal = plan.outputs?.terminal as RollbackTerminal
    const summary = plan.outputs?.mutationSummary as NetSqlitePlanSummary
    expect(summary.tables.DB_CURRENT?.statsRecords).toMatchObject({
      inserted: 1,
      updated: 1,
      deleted: 1,
      unchanged: 3,
    })
    expect(summary.tables.DB_CURRENT?.statsFields?.inserted).toBe(1)
    expect(summary.tables.DB_CURRENT?.statsFieldsI18n?.inserted).toBe(1)
    expect(terminal.claims).toHaveLength(1)
    expect(terminal.claims[0]).toMatchObject({
      table: 'statsPublicationState',
      snapshotId: 'snapshot-old',
      statistics: { datasetCode, referencePeriodCode: period },
    })
    expect(new Set(plan.batches.map(batch => batch.target.bindingName))).toEqual(
      new Set(['DB_CURRENT', 'DB_META']),
    )
    expect(
      f.current.query('SELECT versionHash FROM statsRecords WHERE id=?').get('revised'),
    ).toEqual({ versionHash: 'revised-new' })
    await runNativeSqlDelivery(f.directory, { files: f.files })
    await verifyRollbackTerminal(f.files, terminal)
    expect(
      f.current
        .query(
          'SELECT id,versionHash,"values" FROM statsRecords WHERE datasetCode=? AND referencePeriodCode=? ORDER BY id',
        )
        .all(datasetCode, period),
    ).toEqual([
      { id: 'restored', versionHash: 'restored-old', values: '{"population":"20"}' },
      { id: 'revised', versionHash: 'revised-old', values: '{"population":"10"}' },
      { id: 'unchanged', versionHash: 'unchanged', values: '{"population":"30"}' },
    ])
    expect(f.retainedRows()).toEqual(retained)
    expect(f.retainedReceipts()).toEqual(receipts)
    expect(
      f.current
        .query('SELECT rowid,* FROM statsFields WHERE versionHash=?')
        .all(f.newDefinitions.fields[0]?.versionHash ?? ''),
    ).toEqual(dictionaryRows)
    expect(
      f.current
        .query(
          'SELECT snapshotId,status FROM statsPublicationState WHERE datasetCode=? AND referencePeriodCode=?',
        )
        .get(datasetCode, period),
    ).toEqual({ snapshotId: 'snapshot-old', status: 'current' })
    expect(
      f.meta
        .query(
          'SELECT apiReleaseSetId FROM apiCatalogRevisionReleaseSets WHERE apiCatalogRevisionId=? ORDER BY apiReleaseSetId',
        )
        .all(terminal.catalogId),
    ).toEqual([
      { apiReleaseSetId: 'set-old' },
      { apiReleaseSetId: 'set-older' },
      { apiReleaseSetId: 'set-other' },
    ])
    expect(
      f.meta.query('SELECT status FROM releases WHERE id=?').get('release-new'),
    ).toEqual({ status: 'revoked' })
    expect(
      f.history.query('SELECT rowid,* FROM statsRecords ORDER BY id').all(),
    ).toEqual(historyRows)
    expect(f.source.query('SELECT rowid,* FROM hkgovCenstatdStatistics').all()).toEqual(
      sourceRows,
    )
    f.current
      .query(
        'UPDATE statsPublicationState SET updatedAt=? WHERE datasetCode=? AND referencePeriodCode=?',
      )
      .run('2099-01-01T00:00:00.000Z', datasetCode, period)
    await expect(verifyRollbackTerminal(f.files, terminal)).rejects.toThrow(
      'sealed publication token',
    )
  } finally {
    await f.close()
  }
})

test('Statistics first-publication rollback removes only its exact period and keeps the earlier reference period current', async () => {
  const f = await fixture(false)
  try {
    const receipts = f.retainedReceipts()
    const retained = f.current
      .query(
        'SELECT rowid,* FROM statsRecords WHERE referencePeriodCode<>? OR datasetCode<>? ORDER BY id',
      )
      .all(period, datasetCode)
    const dictionaries = f.current.query('SELECT rowid,* FROM statsFields').all()
    const plan = await f.prepare()
    await runNativeSqlDelivery(f.directory, { files: f.files })
    await verifyRollbackTerminal(f.files, plan.outputs?.terminal as RollbackTerminal)
    expect(
      f.current
        .query(
          'SELECT count(*) AS n FROM statsRecords WHERE datasetCode=? AND referencePeriodCode=?',
        )
        .get(datasetCode, period),
    ).toEqual({ n: 0 })
    expect(
      f.current
        .query(
          'SELECT rowid,* FROM statsRecords WHERE referencePeriodCode<>? OR datasetCode<>? ORDER BY id',
        )
        .all(period, datasetCode),
    ).toEqual(retained)
    expect(f.current.query('SELECT rowid,* FROM statsFields').all()).toEqual(
      dictionaries,
    )
    expect(f.retainedReceipts()).toEqual(receipts)
    expect(
      f.current
        .query(
          'SELECT 1 FROM statsPublicationState WHERE datasetCode=? AND referencePeriodCode=?',
        )
        .get(datasetCode, period),
    ).toBeNull()
  } finally {
    await f.close()
  }
})

test('sealed Statistics rollback resumes while restoring without replaying changed history', async () => {
  const f = await fixture()
  try {
    const plan = await f.prepare()
    const payloads = await Promise.all(
      plan.batches.map(batch => readFile(join(f.directory, batch.file))),
    )
    const contentBatch = plan.batches.find(batch =>
      readBoundDeliveryStatements(payloads[batch.index] ?? new Uint8Array()).some(
        statement =>
          /(?:UPDATE|INSERT INTO|DELETE FROM)\s+"statsRecords"/.test(statement.sql),
      ),
    )
    if (!contentBatch) throw new Error('Missing Statistics content batch')
    await expect(
      runNativeSqlDelivery(f.directory, {
        files: f.files,
        onProgress: completed => {
          if (completed === contentBatch.index + 1)
            throw new Error('interrupted statistics rollback')
        },
      }),
    ).rejects.toThrow('interrupted statistics rollback')
    expect(
      f.current
        .query(
          'SELECT snapshotId,status FROM statsPublicationState WHERE datasetCode=? AND referencePeriodCode=?',
        )
        .get(datasetCode, period),
    ).toEqual({ snapshotId: 'snapshot-old', status: 'restoring' })
    f.history.exec('DELETE FROM statsFieldsI18n')
    expect((await f.prepare()).id).toBe(plan.id)
    expect(f.generations()).toBe(1)
    await runNativeSqlDelivery(f.directory, { files: f.files })
    await verifyRollbackTerminal(f.files, plan.outputs?.terminal as RollbackTerminal)
    expect(
      await Promise.all(
        plan.batches.map(batch => readFile(join(f.directory, batch.file))),
      ),
    ).toEqual(payloads)
  } finally {
    await f.close()
  }
})

test('missing retained Statistics dictionaries cannot seal a partial rollback or acquire publication ownership', async () => {
  const f = await fixture()
  try {
    f.history.exec('DELETE FROM statsFieldsI18n')
    const before = f.current.query('SELECT rowid,* FROM statsRecords ORDER BY id').all()
    const receipts = f.current
      .query(
        'SELECT rowid,* FROM statsPublicationState ORDER BY datasetCode,referencePeriodCode',
      )
      .all()
    await expect(f.prepare()).rejects.toThrow('do not match retained versions')
    expect(await readDeliveryPlan(f.directory)).toBeNull()
    expect(await readPendingSqlDelivery(f.root)).toBeNull()
    expect(
      f.current.query('SELECT rowid,* FROM statsRecords ORDER BY id').all(),
    ).toEqual(before)
    expect(
      f.current
        .query(
          'SELECT rowid,* FROM statsPublicationState ORDER BY datasetCode,referencePeriodCode',
        )
        .all(),
    ).toEqual(receipts)
  } finally {
    await f.close()
  }
})

test('an intervening exact-period Statistics publication blocks sealed rollback before any pack or dictionary mutation', async () => {
  const f = await fixture()
  try {
    await f.prepare()
    f.current
      .query(
        'UPDATE statsPublicationState SET updatedAt=? WHERE datasetCode=? AND referencePeriodCode=?',
      )
      .run('2026-02-01T00:00:00.000Z', datasetCode, period)
    const records = f.current
      .query('SELECT rowid,* FROM statsRecords ORDER BY id')
      .all()
    const dictionaries = dictionaryTables.map(table =>
      f.current.query(`SELECT rowid,* FROM ${table} ORDER BY 1`).all(),
    )
    await expect(
      runNativeSqlDelivery(f.directory, { files: f.files }),
    ).rejects.toThrow()
    expect(
      f.current.query('SELECT rowid,* FROM statsRecords ORDER BY id').all(),
    ).toEqual(records)
    expect(
      dictionaryTables.map(table =>
        f.current.query(`SELECT rowid,* FROM ${table} ORDER BY 1`).all(),
      ),
    ).toEqual(dictionaries)
    expect(
      f.current
        .query(
          'SELECT snapshotId,status,updatedAt FROM statsPublicationState WHERE datasetCode=? AND referencePeriodCode=?',
        )
        .get(datasetCode, period),
    ).toEqual({
      snapshotId: 'snapshot-new',
      status: 'current',
      updatedAt: '2026-02-01T00:00:00.000Z',
    })
    expect(
      f.meta.query('SELECT status FROM releases WHERE id=?').get('release-new'),
    ).toEqual({ status: 'published' })
  } finally {
    await f.close()
  }
})
