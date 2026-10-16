import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { getTableConfig, type SQLiteTable } from 'drizzle-orm/sqlite-core'
import { historySchema, metaSchema, stats } from '@repo/db'
import { readStatisticsSourceMeasures } from './statisticsSourceMeasures'

function createTables(sqlite: Database, tables: SQLiteTable[]) {
  for (const table of tables) {
    const config = getTableConfig(table)
    sqlite.exec(
      `CREATE TABLE "${config.name}" (${config.columns.map(column => `"${column.name}" ${column.getSQLType()}`).join(',')})`,
    )
  }
}

test('source catalogue preserves unchanged reissue counts and frozen definitions', async () => {
  const meta = new Database(':memory:'),
    history = new Database(':memory:')
  try {
    createTables(meta, [
      metaSchema.metaResourceReleases,
      metaSchema.metaSnapshots,
      metaSchema.metaSnapshotLineages,
      metaSchema.metaSnapshotResourceReleases,
      metaSchema.metaSnapshotShardAssignments,
      metaSchema.metaDataShards,
      stats,
    ])
    createTables(history, [
      historySchema.statsRecords,
      historySchema.statsFields,
      historySchema.statsFieldsI18n,
      historySchema.statsDefinitionSets,
    ])
    for (const db of [history])
      db.exec(
        `CREATE VIEW historyEvents AS SELECT snapshotId, 'statsRecord' AS recordType, id AS recordId, '' AS locale, versionHash, 'upsert' AS operation, createdAt, NULL AS producerDatasetCode FROM statsRecords`,
      )
    meta.exec(`INSERT INTO resourceReleases (id,sourceReleaseId,resourceType) VALUES ('resource-reissue','publisher-reissue','divisionStatistic');
      INSERT INTO snapshotLineages (id,code,resourceType,regionCode,variant,identityMode)
      VALUES ('statistics','statistics','divisionStatistic','hk','default','persistent');
      INSERT INTO snapshots (id, snapshotLineageId, parentSnapshotId, cohortKey, revision) VALUES
('base', 'statistics', NULL, '2025', 0),
('reissue', 'statistics', 'base', '2025', 1);
      INSERT INTO snapshotResourceReleases (snapshotId,resourceReleaseId,role) VALUES ('base','resource-original','primary'),('reissue','resource-reissue','primary');
      INSERT INTO stats (resourceReleaseId,category,measure,dimension,dimensionValue,value) VALUES
        ('resource-reissue','observations','count','field','population',3495);`)
    history.exec(`INSERT INTO statsDefinitionSets (id,fieldDefinitionHashes) VALUES
      ('frozen','{"population":"f1","landArea":"retained-other-field"}'),
      ('future','{"population":"f2"}');
      INSERT INTO statsRecords (snapshotId,id,datasetCode,sourceFeatureRef,referencePeriodCode,referencePeriodGranularity,referencePeriodEndYear,"values",geography,isCurrent,versionHash,definitionSetId,fieldSources) VALUES
      ('base','packed','dataset','source-feature','2025','year','2025','{"population":"12","landArea":"5"}','{}',0,'v1','frozen','[]'),
      ('future','packed','dataset','source-feature','2025','year','2025','{"population":"13"}','{}',1,'v2','future','[]');
      INSERT INTO statsFields (snapshotId,operation,datasetCode,fieldName,versionHash,sourceField,statisticKind,aggregation,unitCode,valueKind) VALUES
        ('base','upsert','dataset','population','f1','t_pop','count','total','person','numeric'),
        ('future','upsert','dataset','population','f2','t_pop','count','total','person','numeric');
      INSERT INTO statsFieldsI18n (snapshotId,operation,datasetCode,fieldName,versionHash,locale,name,description) VALUES
        ('base','upsert','dataset','population','f1','en','Population','Frozen meaning'),
        ('future','upsert','dataset','population','f2','en','Future population','Future meaning');`)
    history.exec("UPDATE statsRecords SET operation='upsert'")
    const input = {
      metaDb: drizzle({ client: meta }) as never,
      historyDbs: [drizzle({ client: history }) as never],
      datasetCode: 'dataset',
      sourceReleaseId: 'publisher-reissue',
    }
    expect(await readStatisticsSourceMeasures(input)).toEqual([
      {
        definition: 'Frozen meaning',
        name: 'Population',
        observationCount: 3495,
        aggregation: 'total',
        sourceField: 't_pop',
        statisticKind: 'count',
        unitCode: 'person',
        valueKind: 'numeric',
      },
    ])
    expect(
      await readStatisticsSourceMeasures({ ...input, includeUnobserved: true }),
    ).toEqual(await readStatisticsSourceMeasures(input))
    expect(
      await readStatisticsSourceMeasures({ ...input, sourceReleaseId: 'missing' }),
    ).toEqual([])
  } finally {
    meta.close()
    history.close()
  }
})
