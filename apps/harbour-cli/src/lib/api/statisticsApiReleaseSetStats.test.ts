import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { getTableConfig, type SQLiteTable } from 'drizzle-orm/sqlite-core'
import { historySchema, metaSchema } from '@repo/db'
import {
  buildStatisticsStatsRows,
  readStatisticsStatsData,
  type StatisticsStatsData,
} from './statisticsApiReleaseSetStats'
const record = (id: string, values: Record<string, string>, datasetCode = 'a') =>
  ({
    id,
    datasetCode,
    values,
    referencePeriodCode: '2025',
    geography: { kind: 'district', code: id },
    divisionId: null,
  }) as StatisticsStatsData['records'][number]
const field = (fieldName: string, datasetCode = 'a') =>
  ({
    datasetCode,
    fieldName,
    measureCode: fieldName,
    statisticKind: 'count',
    aggregation: 'total',
    unitCode: 'person',
  }) as StatisticsStatsData['fields'][number]
const value = (
  rows: ReturnType<typeof buildStatisticsStatsRows>,
  dimension: string,
  groupBy: string | null = null,
  groupValue: string | null = null,
) =>
  rows.find(
    row =>
      row.dimension === dimension &&
      row.groupBy === groupBy &&
      row.groupValue === groupValue,
  )?.value

test('counts dataset-qualified fields, literal availability and localisation without summing values', () => {
  const data: StatisticsStatsData = {
    records: [
      record('one', {
        population: '999999999999999999999',
        hidden: 'suppressed',
        missing: 'unavailable',
      }),
      record('two', { population: '0' }, 'b'),
    ],
    fields: [
      field('population'),
      field('hidden'),
      field('missing'),
      field('population', 'b'),
    ],
    labels: [
      {
        datasetCode: 'a',
        fieldName: 'population',
        locale: 'zh-Hant',
        name: 'Population',
        isTranslationVerified: false,
      },
    ] as StatisticsStatsData['labels'],
  }
  const rows = buildStatisticsStatsRows(data)
  expect(value(rows, 'records')).toBe(2)
  expect(value(rows, 'observations')).toBe(4)
  expect(value(rows, 'fields')).toBe(4)
  expect(value(rows, 'observations', 'observationStatus', 'published')).toBe(2)
  expect(value(rows, 'observations', 'observationStatus', 'suppressed')).toBe(1)
  expect(value(rows, 'observations', 'observationStatus', 'unavailable')).toBe(1)
  expect(value(rows, 'field_label_coverage', 'locale', 'zh-hant')).toBe(25)
  expect(value(rows, 'unverified_field_labels', 'locale', 'zh-hant')).toBe(1)
  expect(rows.some(row => row.metric === 'churn')).toBe(false)
  expect(() => buildStatisticsStatsRows({ ...data, fields: [] })).toThrow(
    'Missing definition',
  )
})
test('structural churn ignores numerical changes and distinguishes dataset identities', () => {
  const previous: StatisticsStatsData = {
    records: [record('one', { population: '10' })],
    fields: [field('population')],
    labels: [],
  }
  const current: StatisticsStatsData = {
    records: [
      record('one', { population: '20' }),
      record('two', { population: '30' }, 'b'),
    ],
    fields: [field('population'), field('population', 'b')],
    labels: [],
  }
  const rows = buildStatisticsStatsRows(current, previous)
  expect(value(rows, 'unchanged_count', 'structural', 'fields')).toBe(1)
  expect(value(rows, 'added_count', 'structural', 'fields')).toBe(1)
  expect(rows.some(row => row.dimension === 'changed_count')).toBe(false)
})
function createTables(sqlite: Database, tables: SQLiteTable[]) {
  for (const table of tables) {
    const c = getTableConfig(table)
    sqlite.exec(
      `CREATE TABLE "${c.name}" (${c.columns.map(column => `"${column.name}" ${column.getSQLType()}`).join(',')})`,
    )
  }
}
test('history reads honour composition, cohort, current versions and duplicate shard copies', async () => {
  const meta = new Database(':memory:'),
    history = new Database(':memory:')
  try {
    createTables(meta, [
      metaSchema.metaApiReleaseSetSnapshots,
      metaSchema.metaSnapshots,
      metaSchema.metaSnapshotSources,
      metaSchema.metaDatasets,
    ])
    createTables(history, [
      historySchema.statsRecords,
      historySchema.statsFields,
      historySchema.statsFieldsI18n,
    ])
    meta.exec(`INSERT INTO apiReleaseSetSnapshots (apiReleaseSetId,snapshotId,role) VALUES ('api','snapshot','primary');
 INSERT INTO snapshots (id,resourceType) VALUES ('snapshot','divisionStatistic');
 INSERT INTO datasets (id,code) VALUES ('dataset','a');
 INSERT INTO snapshotSources (snapshotId,datasetId,resourceReleaseId,role) VALUES ('snapshot','dataset','source','primary');`)
    history.exec(`INSERT INTO statsRecords (id,datasetCode,sourceReleaseId,referencePeriodCode,"values",geography,isCurrent,versionHash) VALUES
 ('yes','a','source','2025','{"population":"1"}','{"kind":"district","code":"one"}',1,'v1'),
 ('wrong-period','a','source','2024','{}','{}',1,'v2'),
 ('wrong-source','a','elsewhere','2025','{}','{}',1,'v3'),
 ('obsolete','a','source','2025','{}','{}',0,'v4');
 INSERT INTO statsFields (datasetCode,fieldName,sourceReleaseId,isCurrent,versionHash) VALUES ('a','population','source',1,'f1'),('a','unused','source',1,'f2');`)
    const targets = [
      { bindingName: 'history', db: drizzle({ client: history }) },
      { bindingName: 'copy', db: drizzle({ client: history }) },
    ]
    const data = await readStatisticsStatsData(
      drizzle({ client: meta }) as never,
      targets,
      { id: 'api', cohortKey: '2025' },
    )
    expect(data.records.map(row => row.id)).toEqual(['yes'])
    expect(data.fields.map(row => row.fieldName)).toEqual(['population'])
    await expect(
      readStatisticsStatsData(drizzle({ client: meta }) as never, targets, {
        id: 'api',
        cohortKey: '1990',
      }),
    ).rejects.toThrow('No retained')
    history.exec(
      `INSERT INTO statsRecords (id,datasetCode,sourceReleaseId,referencePeriodCode,"values",geography,isCurrent,versionHash) VALUES ('yes','a','source','2025','{}','{}',1,'conflict')`,
    )
    await expect(
      readStatisticsStatsData(drizzle({ client: meta }) as never, targets, {
        id: 'api',
        cohortKey: '2025',
      }),
    ).rejects.toThrow('Conflicting')
  } finally {
    meta.close()
    history.close()
  }
})
