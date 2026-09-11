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
      metaSchema.metaReleases,
      metaSchema.metaSnapshots,
      metaSchema.metaSnapshotSources,
      metaSchema.metaSnapshotShardAssignments,
      metaSchema.metaDataShards,
      stats,
    ])
    createTables(history, [
      historySchema.statsRecords,
      historySchema.statsFields,
      historySchema.statsFieldsI18n,
      historySchema.snapshotVersionChanges,
    ])
    meta.exec(`INSERT INTO releases (id,sourceReleaseId,resourceType) VALUES ('resource-reissue','publisher-reissue','divisionStatistic');
      INSERT INTO snapshots (id,resourceType,parentSnapshotId,cohortKey,revision) VALUES
        ('base','divisionStatistic',NULL,'2025',0),('reissue','divisionStatistic','base','2025',1);
      INSERT INTO snapshotSources (snapshotId,resourceReleaseId) VALUES ('reissue','resource-reissue');
      INSERT INTO stats (releaseId,dimension,metric,groupBy,groupValue,value) VALUES
        ('resource-reissue','observations','count','field','population',3495);`)
    history.exec(`INSERT INTO statsRecords (id,datasetCode,sourceReleaseId,referencePeriodCode,"values",geography,isCurrent,versionHash,fieldDefinitionHashes,fieldSources) VALUES
      ('packed','dataset','old-resource','2025','{"population":"12","landArea":"5"}','{}',0,'v1','{"population":"f1","landArea":"retained-other-field"}','{}'),
      ('packed','dataset','future-resource','2025','{"population":"13"}','{}',1,'v2','{"population":"f2"}','{}');
      INSERT INTO snapshotVersionChanges (snapshotId,recordType,recordId,versionHash,operation) VALUES ('base','statsRecord','packed','v1','upsert');
      INSERT INTO statsFields (datasetCode,fieldName,versionHash,sourceReleaseId,sourceField,statisticKind,aggregation,unitCode,valueKind) VALUES
        ('dataset','population','f1','old-resource','t_pop','count','total','person','numeric'),
        ('dataset','population','f2','future-resource','t_pop','count','total','person','numeric');
      INSERT INTO statsFieldsI18n (datasetCode,fieldName,versionHash,sourceReleaseId,locale,name,description) VALUES
        ('dataset','population','f1','old-resource','en','Population','Frozen meaning'),
        ('dataset','population','f2','future-resource','en','Future population','Future meaning');`)
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
