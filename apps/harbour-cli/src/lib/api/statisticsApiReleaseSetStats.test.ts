import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { historyEventsSqlForTables, historySchema, metaSchema } from '@repo/db'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { getTableConfig, type SQLiteTable } from 'drizzle-orm/sqlite-core'
import { releaseFixtureSchemaSql } from '../../../../../libs/core/src/testing/releaseFixtures'
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
  category: string,
  dimension: string | null = null,
  dimensionValue: string | null = null,
) =>
  rows.find(
    row =>
      (row.category === category ||
        (row.category === 'changes' && row.measure === category)) &&
      row.dimension === dimension &&
      row.dimensionValue === dimensionValue,
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
    rows.some(row => row.measure === 'changed_count' && row.dimension === 'structural'),
  ).toBe(false)
})
function createTables(sqlite: Database, tables: SQLiteTable[]) {
  for (const table of tables) {
    const c = getTableConfig(table)
    sqlite.exec(
      `CREATE TABLE "${c.name}" (${c.columns.map(column => `"${column.name}" ${column.getSQLType()}${column.name === 'operation' ? " DEFAULT 'upsert'" : ''}`).join(',')})`,
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
      metaSchema.metaSnapshotLineages,
      metaSchema.metaSnapshotResourceReleases,
      metaSchema.metaDatasets,
      metaSchema.metaSnapshotShardAssignments,
      metaSchema.metaDataShards,
    ])
    meta.exec(releaseFixtureSchemaSql())
    meta.exec(
      "INSERT INTO sourceReleases(id,datasetId) VALUES ('source','dataset'); INSERT INTO resourceReleases(id,sourceReleaseId) VALUES ('new-source','source');",
    )
    createTables(history, [
      historySchema.statsRecords,
      historySchema.statsDefinitionSets,
      historySchema.statsFields,
      historySchema.statsFieldsI18n,
    ])
    history.exec(
      `CREATE VIEW historyEvents AS ${historyEventsSqlForTables(new Set(['statsRecords', 'statsFields', 'statsFieldsI18n']))}`,
    )
    meta.exec(`INSERT INTO apiReleaseSetSnapshots (apiReleaseSetId,snapshotId,role) VALUES ('api','reissue','primary');
      INSERT OR IGNORE INTO snapshotLineages (id,code,resourceType,regionCode,variant,identityMode,versionHash,createdAt,updatedAt) VALUES ('fixture-lineage-' || 'base','fixture-lineage-' || 'base','divisionStatistic','hk','default','persistent','fixture','2026-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z');
UPDATE snapshotLineages SET resourceType='divisionStatistic' WHERE id='fixture-lineage-' || 'base' AND resourceType IS NULL;
INSERT OR IGNORE INTO snapshotLineages (id,code,resourceType,regionCode,variant,identityMode,versionHash,createdAt,updatedAt) VALUES ('fixture-lineage-' || 'reissue','fixture-lineage-' || 'reissue','divisionStatistic','hk','default','persistent','fixture','2026-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z');
UPDATE snapshotLineages SET resourceType='divisionStatistic' WHERE id='fixture-lineage-' || 'reissue' AND resourceType IS NULL;
INSERT INTO snapshots (id, snapshotLineageId, parentSnapshotId) VALUES
('base', 'fixture-lineage-' || 'base', NULL),
('reissue', 'fixture-lineage-' || 'reissue', 'base');
      INSERT INTO datasets (id,code) VALUES ('dataset','a');
      INSERT INTO snapshotResourceReleases (snapshotId,resourceReleaseId,role) VALUES ('reissue','new-source','primary');`)
    history.exec(`INSERT INTO statsDefinitionSets (id,fieldDefinitionHashes) VALUES
      ('definitions-f1','{"population":"f1"}'),('definitions-f2','{"population":"f2"}'),('definitions-empty','{}');
      INSERT INTO statsRecords (id,datasetCode,sourceReleaseId,referencePeriodCode,"values",geography,isCurrent,versionHash,definitionSetId,fieldSources) VALUES
      ('yes','a','old-source','2025','{"population":"1"}','{"kind":"district","code":"one"}',0,'v1','definitions-f1','{}'),
      ('yes','a','later-source','2025','{"population":"2"}','{"kind":"district","code":"one"}',1,'v2','definitions-f2','{}'),
      ('wrong-period','a','old-source','2024','{}','{}',1,'v3','definitions-empty','{}'),
      ('unselected','a','new-source','2025','{}','{}',1,'v4','definitions-empty','{}');

      INSERT INTO statsFields (datasetCode,fieldName,sourceReleaseId,isCurrent,versionHash) VALUES
        ('a','population','old-source',0,'f1'),('a','population','later-source',1,'f2');
      INSERT INTO statsFieldsI18n (datasetCode,fieldName,sourceReleaseId,isCurrent,versionHash,locale,name) VALUES
        ('a','population','old-source',0,'f1','en','Frozen definition'),('a','population','later-source',1,'f2','en','Latest definition');`)
    history.exec(
      "UPDATE statsRecords SET snapshotId=CASE WHEN versionHash IN ('v1','v3') THEN 'base' ELSE 'other' END; UPDATE statsFields SET snapshotId=CASE WHEN versionHash='f1' THEN 'base' ELSE 'other' END; UPDATE statsFieldsI18n SET snapshotId=CASE WHEN versionHash='f1' THEN 'base' ELSE 'other' END;",
    )
    const targets = [{ bindingName: 'history', db: drizzle({ client: history }) }]
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
      `INSERT INTO statsRecords(snapshotId,id,versionHash,sourceReleaseId,operation) VALUES ('base','yes','conflict','source','upsert')`,
    )
    await expect(
      readStatisticsStatsData(drizzle({ client: meta }) as never, targets, {
        id: 'api',
        cohortKey: '2025',
      }),
    ).rejects.toThrow('Ambiguous')
  } finally {
    meta.close()
    history.close()
  }
})
