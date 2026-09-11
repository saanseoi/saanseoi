import { expect, test } from 'bun:test'
import { requireDefined } from '@repo/core/requireDefined'
import { Database } from 'bun:sqlite'
import { resolve } from 'node:path'
import { createLocalHarbourDb } from '@repo/core/testing/localDb'
import { loadMigrationSql } from '../../../../../../libs/core/src/testing/metaFixtures'
import { readStatisticSnapshotRecords } from '@repo/core/pipeline/services/statistics/statisticSnapshotRecords'
import { planCanonicalStatistics } from './planCanonicalStatistics'
import type { CanonicalStatsRows } from './normaliseHkgovCenstatdStatistics'

const NOW = '2026-09-11T12:00:00.000Z'
type RecordInput = CanonicalStatsRows['records'][number]
const record = (overrides: Partial<RecordInput> = {}): RecordInput => ({
  id: 'stats:stable',
  datasetCode: 'dataset',
  sourceReleaseId: 'release-1',
  sourceFeatureRef: 'source/2025/A',
  divisionId: 'division-A',
  geography: { kind: 'district', code: 'A' },
  referencePeriodCode: '2021',
  referencePeriodEndYear: '2021',
  referencePeriodStart: '2021-01-01',
  referencePeriodEnd: '2021-12-31',
  referencePeriodGranularity: 'year',
  values: { population: '100', age: '40' },
  fieldDefinitionHashes: { population: 'population-v1', age: 'age-v1' },
  fieldSources: {
    population: { sourceReleaseId: 'release-1', sourceFeatureRef: 'source/2025/A' },
    age: { sourceReleaseId: 'release-1', sourceFeatureRef: 'source/2025/A' },
  },
  ...overrides,
})
const canonical = (records: RecordInput[]): CanonicalStatsRows => ({
  records,
  fields: [],
  fieldsI18n: [],
  measures: [],
  measuresI18n: [],
  observations: [],
  dimensions: [],
  values: [],
  valuesI18n: [],
})

test('only changed geography packs create history and snapshot changes across releases', async () => {
  const history = new Database(':memory:')
  const meta = new Database(':memory:')
  history.exec(
    loadMigrationSql(resolve(import.meta.dir, '../../../../../../libs/db/migrations'), [
      'history',
    ]),
  )
  meta.exec(`CREATE TABLE snapshots(id TEXT PRIMARY KEY, parentSnapshotId TEXT);
    CREATE TABLE snapshotShardAssignments(snapshotId TEXT,dataShardId TEXT);
    CREATE TABLE dataShards(id TEXT,bindingName TEXT);
    INSERT INTO snapshots VALUES ('s1',NULL),('s2','s1'),('s3','s2'),('s4','s3'),('s5','s4');`)
  const metaDb = createLocalHarbourDb(meta)
  const historyDbs = [createLocalHarbourDb(history)]
  const stage = async (
    id: string,
    parentSnapshotId: string | null,
    records: RecordInput[],
  ) => {
    const plan = await planCanonicalStatistics({
      canonical: canonical(records),
      metaDb,
      historyDbs,
      snapshots: [{ id, parentSnapshotId, cohortKey: '2021' }],
      sourceReleaseId: id,
      now: NOW,
    })
    const batches = plan.buildBatches()
    expect(batches.current).toEqual([])
    for (const shard of batches.history)
      for (const sql of shard.batches) history.exec(sql)
    return plan
  }
  try {
    const initial = await stage('s1', null, [
      record(),
      record({ id: 'stats:other', geography: { kind: 'district', code: 'B' } }),
    ])
    expect(initial.changedRecords).toHaveLength(2)
    const unchanged = await stage('s2', 's1', [
      record({
        sourceReleaseId: 'new-publication',
        sourceFeatureRef: 'source/2026/A',
        fieldSources: {
          population: {
            sourceReleaseId: 'new-publication',
            sourceFeatureRef: 'source/2026/A',
          },
          age: {
            sourceReleaseId: 'new-publication',
            sourceFeatureRef: 'source/2026/A',
          },
        },
      }),
    ])
    expect(unchanged.changedRecords).toHaveLength(0)
    expect(unchanged.buildBatches().history).toEqual([])
    expect(history.query('SELECT count(*) AS n FROM statsRecords').get()).toEqual({
      n: 2,
    })
    expect(
      history.query('SELECT count(*) AS n FROM snapshotVersionChanges').get(),
    ).toEqual({ n: 2 })
    const corrected = await stage('s3', 's2', [
      record({
        sourceReleaseId: 'correction',
        values: { population: '101' },
        fieldDefinitionHashes: { population: 'population-v1' },
        fieldSources: {
          population: {
            sourceReleaseId: 'correction',
            sourceFeatureRef: 'correction/A',
          },
        },
      }),
    ])
    expect(corrected.changedRecords).toHaveLength(1)
    const old = await readStatisticSnapshotRecords(metaDb, historyDbs, 's2')
    const latest = await readStatisticSnapshotRecords(metaDb, historyDbs, 's3')
    expect(old.find(row => row.id === 'stats:stable')?.values).toEqual({
      population: '100',
      age: '40',
    })
    const revised = requireDefined(latest.find(row => row.id === 'stats:stable'))
    expect(revised.values).toEqual({ population: '101', age: '40' })
    expect(revised.fieldSources.population?.sourceReleaseId).toBe('correction')
    expect(revised.fieldSources.age?.sourceReleaseId).toBe('release-1')
    expect(latest).toHaveLength(2)
    expect(
      history.query('SELECT count(*) AS n FROM snapshotVersionChanges').get(),
    ).toEqual({ n: 3 })
    await stage('s3', 's2', [
      record({
        values: { population: '101' },
        fieldDefinitionHashes: { population: 'population-v1' },
        fieldSources: {
          population: {
            sourceReleaseId: 'correction',
            sourceFeatureRef: 'correction/A',
          },
        },
      }),
    ])
    expect(history.query('SELECT count(*) AS n FROM statsRecords').get()).toEqual({
      n: 3,
    })
    await expect(
      stage('s3', 's2', [record({ values: { population: '999' } })]),
    ).rejects.toThrow('already contains a different change')
    expect(history.query('SELECT count(*) AS n FROM statsRecords').get()).toEqual({
      n: 3,
    })
    const definitionChange = await stage('s4', 's3', [
      record({
        values: { population: '101' },
        fieldDefinitionHashes: { population: 'population-v2' },
        fieldSources: {
          population: {
            sourceReleaseId: 'definition-correction',
            sourceFeatureRef: 'definition/A',
          },
        },
      }),
    ])
    expect(definitionChange.changedRecords).toHaveLength(1)
    const suppressed = await stage('s5', 's4', [
      record({
        values: { population: 'suppressed' },
        fieldDefinitionHashes: { population: 'population-v2' },
        fieldSources: {
          population: {
            sourceReleaseId: 'suppression',
            sourceFeatureRef: 'suppression/A',
          },
        },
      }),
    ])
    expect(suppressed.changedRecords[0]?.values).toEqual({
      population: 'suppressed',
      age: '40',
    })
    expect(history.query('SELECT count(*) AS n FROM statsRecords').get()).toEqual({
      n: 5,
    })
  } finally {
    history.close()
    meta.close()
  }
})
