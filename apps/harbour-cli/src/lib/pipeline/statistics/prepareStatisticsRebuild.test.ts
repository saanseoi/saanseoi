import { afterEach, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { createHash } from 'node:crypto'
import {
  copyFileSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createLocalHarbourDb } from '@repo/core/testing/localDb'
import { requireDefined } from '@repo/core/requireDefined'
import { readStatisticSnapshotRecords } from '@repo/core/pipeline/services/statistics/statisticSnapshotRecords'
import {
  prepareStatisticsRebuild,
  type StatisticsRebuildInputs,
} from './prepareStatisticsRebuild'
import { packRetainedStatistics } from './packRetainedStatistics'

const directories: string[] = []
const root = resolve(import.meta.dir, '../../../../../..')
const now = '2026-09-11T00:00:00.000Z'
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true })
})

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'stats-rebuild-test-'))
  directories.push(directory)
  const inputs: StatisticsRebuildInputs = {
    meta: join(directory, 'meta.sqlite'),
    current: join(directory, 'current.sqlite'),
    history: [
      { bindingName: 'DB_HISTORY_HK_BEFORE', path: join(directory, 'history.sqlite') },
    ],
    source: [],
  }
  const meta = new Database(inputs.meta)
  meta.exec(`
    CREATE TABLE datasets (id TEXT, code TEXT);
    CREATE TABLE releases (id TEXT, code TEXT, sourceVersion TEXT);
    CREATE TABLE snapshots (id TEXT, parentSnapshotId TEXT, cohortKey TEXT, resourceType TEXT, revision INTEGER, status TEXT, createdAt TEXT);
    CREATE TABLE snapshotSources (snapshotId TEXT, resourceReleaseId TEXT, datasetId TEXT, role TEXT);
    CREATE TABLE dataShards (id TEXT, bindingName TEXT);
    CREATE TABLE snapshotShardAssignments (snapshotId TEXT, dataShardId TEXT);
    CREATE TABLE apiVersions (id TEXT, familyType TEXT);
    CREATE TABLE apiReleaseSets (id TEXT, apiVersionId TEXT, regionCode TEXT, domainCode TEXT, cohortKey TEXT, revision INTEGER, status TEXT);
    CREATE TABLE apiReleaseSetSnapshots (apiReleaseSetId TEXT, snapshotId TEXT);
    INSERT INTO datasets VALUES ('dataset', 'dataset');
    INSERT INTO dataShards VALUES ('before', 'DB_HISTORY_HK_BEFORE');
    INSERT INTO apiVersions VALUES ('stats', 'stats');
  `)
  const history = legacyDb(requireDefined(inputs.history[0]).path, 'history')
  const current = legacyDb(inputs.current, 'current')
  function release(
    number: number,
    values: Record<string, string>,
    status = 'published',
  ) {
    const release = `release-${number}`
    const snapshot = `snapshot-${number}`
    meta
      .query('INSERT INTO releases VALUES (?, ?, ?)')
      .run(release, release, String(number))
    meta
      .query('INSERT INTO snapshots VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(
        snapshot,
        number === 1 ? null : `snapshot-${number - 1}`,
        '2021',
        'divisionStatistic',
        number - 1,
        status,
        now,
      )
    meta
      .query('INSERT INTO snapshotSources VALUES (?, ?, ?, ?)')
      .run(snapshot, release, 'dataset', 'primary')
    meta
      .query('INSERT INTO snapshotShardAssignments VALUES (?, ?)')
      .run(snapshot, 'before')
    meta
      .query('INSERT INTO apiReleaseSets VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(
        snapshot,
        'stats',
        'hk',
        'government',
        '2021',
        number - 1,
        status === 'draft' ? 'draft' : 'archived',
      )
    meta
      .query('INSERT INTO apiReleaseSetSnapshots VALUES (?, ?)')
      .run(snapshot, snapshot)
    for (const [field, value] of Object.entries(values)) {
      const record = {
        id: `${release}-${field}`,
        datasetCode: 'dataset',
        sourceReleaseId: release,
        sourceFeatureRef: `source/${number}/A`,
        divisionId: 'division-A',
        referencePeriodCode: '2021',
        referencePeriodStart: '2021-01-01',
        referencePeriodEnd: '2021-12-31',
        referencePeriodEndYear: '2021',
        referencePeriodGranularity: 'year',
        geography: JSON.stringify({ kind: 'district', code: 'A' }),
        dimensions: '{}',
        values: JSON.stringify({ [field]: value }),
        createdAt: now,
        updatedAt: now,
      }
      insert(current, 'statsRecords', record)
      insert(history, 'statsRecords', {
        ...record,
        versionHash: `${release}-${field}`,
        isCurrent: 1,
      })
      insert(history, 'statsFields', {
        datasetCode: 'dataset',
        fieldName: field,
        sourceField: field,
        measureCode: field,
        dimensions: '{}',
        comparability: null,
        sourceNullOption: null,
        statisticKind: 'count',
        aggregation: 'total',
        aggregationPercentile: null,
        periodicity: null,
        denominatorFieldName: null,
        valueKind: 'numeric',
        unitCode: 'person',
        versionHash: `definition-${field}`,
        sourceReleaseId: release,
        isCurrent: 1,
        createdAt: now,
        updatedAt: now,
      })
      insert(history, 'statsMeasures', {
        datasetCode: 'dataset',
        measureCode: field,
        versionHash: `measure-${field}`,
        sourceReleaseId: release,
        isCurrent: 1,
        createdAt: now,
        updatedAt: now,
      })
      insert(history, 'statsFieldsI18n', {
        datasetCode: 'dataset',
        fieldName: field,
        locale: 'en',
        name: field,
        description: null,
        isTranslationVerified: 1,
        versionHash: `label-${field}`,
        sourceReleaseId: release,
        isCurrent: 1,
        createdAt: now,
        updatedAt: now,
      })
      insert(history, 'statsMeasuresI18n', {
        datasetCode: 'dataset',
        measureCode: field,
        locale: 'en',
        name: field,
        description: null,
        isTranslationVerified: 1,
        versionHash: `measure-label-${field}`,
        sourceReleaseId: release,
        isCurrent: 1,
        createdAt: now,
        updatedAt: now,
      })
    }
    insert(history, 'sourceResolutions', {
      scopeId: `release:${release}`,
      snapshotId: null,
      sourceReleaseId: release,
      sourceRecordId: 'native-A',
      sourceVersionHash: release,
      resolutions: JSON.stringify({
        entities: {
          statistic: Object.keys(values).map(field => `${release}-${field}`),
          division: ['division-A'],
        },
      }),
    })
  }
  return {
    directory,
    inputs,
    meta,
    history,
    current,
    release,
    close() {
      meta.close()
      history.close()
      current.close()
    },
  }
}

test('offline conversion retains published revisions, deduplicates definitions, and excludes draft values from current', async () => {
  const f = fixture()
  f.release(1, { population: '10', age: '40' })
  f.release(2, { population: '10', age: '40' })
  f.release(3, { population: '11' })
  f.release(4, { population: '99' }, 'draft')
  f.history.exec(
    "CREATE TABLE unrelatedRetainedData (value TEXT); INSERT INTO unrelatedRetainedData VALUES ('preserved')",
  )
  f.close()
  const paths = [
    f.inputs.meta,
    f.inputs.current,
    requireDefined(f.inputs.history[0]).path,
  ]
  const hashes = paths.map(fileHash)
  const output = join(f.directory, 'prepared')
  const report = await prepareStatisticsRebuild(f.inputs, output)
  expect(report).toMatchObject({
    inputHistoryRows: 6,
    historyRows: 3,
    currentRows: 1,
    journalRows: 3,
    sourceResolutions: 4,
  })
  expect(report.snapshots.map(row => row.changedRows)).toEqual([1, 0, 1, 1])
  expect(paths.map(fileHash)).toEqual(hashes)
  expect(existsSync(join(output, 'READY'))).toBe(true)
  const current = new Database(join(output, 'current.stats.sqlite'), { readonly: true })
  const history = new Database(join(output, 'DB_HISTORY_HK_BEFORE.stats.sqlite'), {
    readonly: true,
  })
  const meta = new Database(f.inputs.meta, { readonly: true })
  expect(current.query('SELECT "values" FROM statsRecords').get()).toEqual({
    values: '{"age":"40","population":"11"}',
  })
  expect(
    current.query('SELECT snapshotId, status FROM statsPublicationState').get(),
  ).toEqual({ snapshotId: 'snapshot-3', status: 'current' })
  expect(history.query('SELECT COUNT(*) AS count FROM statsFields').get()).toEqual({
    count: 2,
  })
  const original = await readStatisticSnapshotRecords(
    createLocalHarbourDb(meta),
    [createLocalHarbourDb(history)],
    'snapshot-1',
  )
  const reissue = await readStatisticSnapshotRecords(
    createLocalHarbourDb(meta),
    [createLocalHarbourDb(history)],
    'snapshot-2',
  )
  expect(original[0]?.values).toEqual({ population: '10', age: '40' })
  expect(reissue).toEqual(original)
  const correction = await readStatisticSnapshotRecords(
    createLocalHarbourDb(meta),
    [createLocalHarbourDb(history)],
    'snapshot-3',
  )
  expect(correction[0]?.fieldSources.age?.sourceReleaseId).toBe('release-1')
  expect(correction[0]?.fieldSources.population?.sourceReleaseId).toBe('release-3')
  const resolutions = history
    .query('SELECT resolutions FROM sourceResolutions')
    .all() as Array<{ resolutions: string }>
  for (const row of resolutions)
    expect(JSON.parse(row.resolutions).entities.statistic).toEqual([original[0]?.id])
  current.close()
  history.close()
  meta.close()
  // The supplied files can be applied to copied shared databases, preserving
  // unrelated data and avoiding the tighter dictionary key's duplicate error.
  const restoredPath = join(f.directory, 'restored-history.sqlite')
  copyFileSync(requireDefined(f.inputs.history[0]).path, restoredPath)
  const restored = new Database(restoredPath)
  restored.exec(
    readFileSync(
      join(output, 'DB_HISTORY_HK_BEFORE.clear-before-migration.sql'),
      'utf8',
    ),
  )
  // The clean-start migration baseline is already packed. Retained input schemas
  // are fixture evidence, not part of the generated migration chain.
  const packed = new Database(join(output, 'DB_HISTORY_HK_BEFORE.stats.sqlite'), {
    readonly: true,
  })
  for (const table of retainedTables) {
    restored.exec(`DROP TABLE ${table}`)
    const definition = packed
      .query("SELECT sql FROM sqlite_master WHERE type='table' AND name=?")
      .get(table) as { sql: string }
    restored.exec(definition.sql)
  }
  packed.close()
  restored.exec(readFileSync(join(output, 'DB_HISTORY_HK_BEFORE.stats.sql'), 'utf8'))
  expect(restored.query('SELECT value FROM unrelatedRetainedData').get()).toEqual({
    value: 'preserved',
  })
  expect(restored.query('SELECT COUNT(*) AS count FROM statsRecords').get()).toEqual({
    count: 3,
  })
  expect(
    restored.query('SELECT COUNT(*) AS count FROM sourceResolutions').get(),
  ).toEqual({ count: 4 })
  restored.close()
  await expect(prepareStatisticsRebuild(f.inputs, output)).rejects.toThrow(
    'already exists',
  )
})

test('preparation rejects current records absent from retained history without writing an output directory', async () => {
  const f = fixture()
  f.release(1, { population: '10' })
  f.current.exec('UPDATE statsRecords SET "values" = \'{"population":"unretained"}\'')
  f.close()
  const output = join(f.directory, 'unready')
  await expect(prepareStatisticsRebuild(f.inputs, output)).rejects.toThrow(
    'no matching retained history',
  )
  expect(existsSync(output)).toBe(false)
})

test('Building Group preparation reads source validity using the complete publisher version', async () => {
  const f = fixture()
  f.release(1, { population: '10' })
  const datasetCode =
    'ds-hk-hkgov-censtatd-division-statistic-housing-market-areas-building-groups'
  const sourceVersion = '2023-H2'
  f.meta.query('UPDATE datasets SET code = ?').run(datasetCode)
  f.meta
    .query('UPDATE releases SET code = ?, sourceVersion = ?')
    .run(
      `dr-hk-hkgov-censtatd-division-statistic-housing-market-areas-building-groups-${sourceVersion}::divisionStatistic`,
      sourceVersion,
    )
  for (const db of [f.current, f.history]) {
    for (const table of [
      'statsRecords',
      'statsFields',
      'statsFieldsI18n',
      'statsMeasures',
      'statsMeasuresI18n',
    ])
      db.query(`UPDATE ${table} SET datasetCode = ?`).run(datasetCode)
    db.query(
      'UPDATE statsRecords SET sourceFeatureRef = ?, divisionId = NULL, geography = ?',
    ).run(
      `hkgov-censtatd/${datasetCode}/${sourceVersion}/BuildingGroup:A`,
      JSON.stringify({ kind: 'building-group', code: 'A', class: 'B' }),
    )
  }
  const sourcePath = join(f.directory, 'source.sqlite')
  const source = new Database(sourcePath)
  source.exec(`CREATE TABLE hkgovCenstatdStatistics (
    sourceRecordId TEXT, releaseId TEXT, properties TEXT,
    validFromRelease TEXT, validToRelease TEXT
  )`)
  const insert = source.query(
    'INSERT INTO hkgovCenstatdStatistics VALUES (?, ?, ?, ?, ?)',
  )
  insert.run(
    'CENSTATD:BuildingGroup:A',
    'earlier-release',
    JSON.stringify({ bg: 'A', bg_ind: 'B', hma: 'HMA1' }),
    '2023-H1',
    '2024-H1',
  )
  insert.run(
    'CENSTATD:BuildingGroup:A',
    'later-release',
    JSON.stringify({ bg: 'A', bg_ind: 'B', hma: 'HMA2' }),
    '2024-H1',
    null,
  )
  source.close()
  f.inputs.source.push(sourcePath)
  f.close()

  const output = join(f.directory, 'version-validity')
  await prepareStatisticsRebuild(f.inputs, output)
  const packed = new Database(join(output, 'DB_HISTORY_HK_BEFORE.stats.sqlite'))
  try {
    const row = packed.query('SELECT geography FROM statsRecords').get() as {
      geography: string
    }
    expect(JSON.parse(row.geography).namespace).toBe('housing-market-area:HMA1')
  } finally {
    packed.close()
  }
})

test('Building Group namespaces come from retained publisher profiles and unknown parents block conversion', () => {
  const datasetCode =
    'ds-hk-hkgov-censtatd-division-statistic-housing-market-areas-building-groups'
  const definition = {
    datasetCode,
    fieldName: 'population',
    measureCode: 'population',
    dimensions: '{}',
  }
  const row = (sourceFeatureRef: string, id: string) => ({
    id,
    datasetCode,
    sourceReleaseId: 'release',
    sourceFeatureRef,
    divisionId: null,
    geography: { kind: 'building-group', code: 'A', class: 'B' },
    referencePeriodCode: '2021',
    referencePeriodStart: '2021-01-01',
    referencePeriodEnd: '2021-12-31',
    referencePeriodEndYear: '2021',
    referencePeriodGranularity: 'year',
    values: { population: '0010.50' },
  })
  const input = {
    records: [row('first-feature', 'first'), row('second-feature', 'second')],
    fields: [definition],
    fieldsI18n: [],
    measures: [{ datasetCode, measureCode: 'population' }],
    measuresI18n: [],
    sourceVersion: '2021',
    sourceProperties: (ref: string) => ({
      bg: 'A',
      bg_ind: 'B',
      hma: ref === 'first-feature' ? 'HMA1' : 'HMA2',
    }),
  }
  const packed = packRetainedStatistics(input)
  expect(packed.canonical.records).toHaveLength(2)
  expect(packed.canonical.records.map(row => row.geography.namespace)).toEqual([
    'housing-market-area:HMA1',
    'housing-market-area:HMA2',
  ])
  expect(packed.canonical.records[0]?.values.population).toBe('0010.50')
  expect(() =>
    packRetainedStatistics({
      ...input,
      sourceProperties: () => ({ bg: 'A', bg_ind: 'B' }),
    }),
  ).toThrow('no source Housing Market Area')
})

function legacyDb(path: string, family: 'current' | 'history') {
  const db = new Database(path)
  for (const sql of migrationSql(family)) {
    db.exec(sql.replaceAll('--> statement-breakpoint', ''))
  }
  for (const table of retainedTables) db.exec(`DROP TABLE ${table}`)
  const version =
    'versionHash TEXT, sourceReleaseId TEXT, isCurrent INTEGER, createdAt TEXT, updatedAt TEXT'
  db.exec(`
    CREATE TABLE statsRecords(id TEXT, datasetCode TEXT, sourceFeatureRef TEXT, divisionId TEXT,
      referencePeriodCode TEXT, referencePeriodStart TEXT, referencePeriodEnd TEXT, referencePeriodEndYear TEXT,
      referencePeriodGranularity TEXT, geography TEXT, dimensions TEXT, "values" TEXT, ${version});
    CREATE TABLE statsFields(datasetCode TEXT, fieldName TEXT, sourceField TEXT, measureCode TEXT,
      dimensions TEXT, comparability TEXT, sourceNullOption TEXT, statisticKind TEXT, aggregation TEXT,
      aggregationPercentile REAL, periodicity TEXT, denominatorFieldName TEXT, valueKind TEXT, unitCode TEXT, ${version});
    CREATE TABLE statsMeasures(datasetCode TEXT, measureCode TEXT, ${version});
    CREATE TABLE statsFieldsI18n(datasetCode TEXT, fieldName TEXT, locale TEXT, name TEXT, description TEXT,
      isTranslationVerified INTEGER, ${version});
    CREATE TABLE statsMeasuresI18n(datasetCode TEXT, measureCode TEXT, locale TEXT, name TEXT, description TEXT,
      isTranslationVerified INTEGER, ${version});
    CREATE TABLE statsValuesI18n(datasetCode TEXT, dimensionCode TEXT, valueCode TEXT, locale TEXT, name TEXT, ${version});
  `)
  return db
}

const retainedTables = [
  'statsRecords',
  'statsFields',
  'statsFieldsI18n',
  'statsMeasures',
  'statsMeasuresI18n',
  'statsValuesI18n',
]

function migrationSql(family: 'current' | 'history') {
  const directory = join(root, 'libs/db/migrations', family)
  return readdirSync(directory)
    .sort()
    .map(name => readFileSync(join(directory, name, 'migration.sql'), 'utf8'))
}

function insert(db: Database, table: string, row: Record<string, unknown>) {
  const keys = Object.keys(row)
  db.query(
    `INSERT INTO "${table}" (${keys.map(key => `"${key}"`).join(',')}) VALUES (${keys.map(() => '?').join(',')})`,
  ).run(...keys.map(key => row[key] as string | number | null))
}
function fileHash(path: string) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}
