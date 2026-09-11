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
    fieldSources: {},
    fieldDefinitionHashes: Object.fromEntries(
      Object.keys(values).map(field => [field, `definition-${datasetCode}-${field}`]),
    ),
  }) as StatisticsStatsData['records'][number]
const field = (fieldName: string, datasetCode = 'a') =>
  ({
    datasetCode,
    fieldName,
    measureCode: fieldName,
    versionHash: `definition-${datasetCode}-${fieldName}`,
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
        versionHash: 'definition-a-population',
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
  expect(value(rows, 'added_count')).toBe(2)
  expect(value(rows, 'changed_count')).toBe(0)
  expect(value(rows, 'removed_count')).toBe(0)
  expect(value(rows, 'unchanged_count')).toBe(0)
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
  expect(value(rows, 'changed_count')).toBe(1)
  expect(value(rows, 'added_count')).toBe(1)
  expect(
    rows.some(row => row.dimension === 'changed_count' && row.groupBy === 'structural'),
  ).toBe(false)
})
function createTables(sqlite: Database, tables: SQLiteTable[]) {
  for (const table of tables) {
    const c = getTableConfig(table)
    sqlite.exec(
      `CREATE TABLE "${c.name}" (${c.columns.map(column => `"${column.name}" ${column.getSQLType()}`).join(',')})`,
    )
  }
}
test('frozen history follows sparse ancestry for no-op reissues and exact definition versions', async () => {
  const meta = new Database(':memory:'),
    history = new Database(':memory:')
  try {
    createTables(meta, [
      metaSchema.metaApiReleaseSetSnapshots,
      metaSchema.metaSnapshots,
      metaSchema.metaSnapshotSources,
      metaSchema.metaDatasets,
      metaSchema.metaSnapshotShardAssignments,
      metaSchema.metaDataShards,
    ])
    createTables(history, [
      historySchema.statsRecords,
      historySchema.statsFields,
      historySchema.statsFieldsI18n,
      historySchema.snapshotVersionChanges,
    ])
    meta.exec(`INSERT INTO apiReleaseSetSnapshots (apiReleaseSetId,snapshotId,role) VALUES ('api','reissue','primary');
      INSERT INTO snapshots (id,resourceType,parentSnapshotId) VALUES ('base','divisionStatistic',NULL),('reissue','divisionStatistic','base');
      INSERT INTO datasets (id,code) VALUES ('dataset','a');
      INSERT INTO snapshotSources (snapshotId,datasetId,resourceReleaseId,role) VALUES ('reissue','dataset','new-source','primary');`)
    history.exec(`INSERT INTO statsRecords (id,datasetCode,sourceReleaseId,referencePeriodCode,"values",geography,isCurrent,versionHash,fieldDefinitionHashes,fieldSources) VALUES
      ('yes','a','old-source','2025','{"population":"1"}','{"kind":"district","code":"one"}',0,'v1','{"population":"f1"}','{}'),
      ('yes','a','later-source','2025','{"population":"2"}','{"kind":"district","code":"one"}',1,'v2','{"population":"f2"}','{}'),
      ('wrong-period','a','old-source','2024','{}','{}',1,'v3','{}','{}'),
      ('unselected','a','new-source','2025','{}','{}',1,'v4','{}','{}');
      INSERT INTO snapshotVersionChanges (snapshotId,recordType,recordId,versionHash,operation) VALUES
        ('base','statsRecord','yes','v1','upsert'),('base','statsRecord','wrong-period','v3','upsert');
      INSERT INTO statsFields (datasetCode,fieldName,sourceReleaseId,isCurrent,versionHash) VALUES
        ('a','population','old-source',0,'f1'),('a','population','later-source',1,'f2');
      INSERT INTO statsFieldsI18n (datasetCode,fieldName,sourceReleaseId,isCurrent,versionHash,locale,name) VALUES
        ('a','population','old-source',0,'f1','en','Frozen definition'),('a','population','later-source',1,'f2','en','Latest definition');`)
    const targets = [
      { bindingName: 'history', db: drizzle({ client: history }) },
      { bindingName: 'copy', db: drizzle({ client: history }) },
    ]
    const data = await readStatisticsStatsData(
      drizzle({ client: meta }) as never,
      targets,
      { id: 'api', cohortKey: '2025' },
    )
    expect(data.records.map(row => [row.id, row.values])).toEqual([
      ['yes', { population: '1' }],
    ])
    expect(data.fields.map(row => row.versionHash)).toEqual(['f1'])
    expect(data.labels.map(row => row.name)).toEqual(['Frozen definition'])
    await expect(
      readStatisticsStatsData(drizzle({ client: meta }) as never, targets, {
        id: 'api',
        cohortKey: '1990',
      }),
    ).rejects.toThrow('No retained')
    history.exec(
      `INSERT INTO snapshotVersionChanges (snapshotId,recordType,recordId,versionHash,operation) VALUES ('base','statsRecord','yes','conflict','upsert')`,
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
