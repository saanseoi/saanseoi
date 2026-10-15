import { expect, test } from 'bun:test'

import { createCurrentDb, createHistoryDb } from '@repo/db'
import {
  createMockD1,
  fixtureEnv,
  run,
  DATASET_CODE,
  STATISTIC_ID,
} from '../routes/statistics/v0/statisticsFixtures'
import {
  countStatisticRecords,
  getStatisticRecord,
  listStatisticRecords,
  listStatisticFieldDefinitions,
  type StatisticReadSelection,
} from './statistics.ts'

test('batches every dynamic dictionary filter below D1 variable limits', async () => {
  let queryCount = 0
  const db = {
    select() {
      return {
        from() {
          return {
            where() {
              queryCount += 1
              return { all: () => [] }
            },
          }
        },
      }
    },
  } as never
  const values = Array.from({ length: 61 }, (_, index) => String(index))

  const definitions = await listStatisticFieldDefinitions([db], {
    datasetCodes: values.map(value => `dataset-${value}`),
    localeSelection: {
      mode: 'requested',
      locales: values.map(value => `en-${value}`),
    },
    selection: {
      mode: 'current',
      datasetCodes: values.map(value => `dataset-${value}`),
      snapshotIds: [],
      publications: [],
    },
  })

  expect(definitions).toEqual([])
  expect(queryCount).toBe(3)
})

test('replays sparse revisions and unchanged snapshots independently of mutable history flags', async () => {
  const fixture = fixtureEnv()
  const db = createHistoryDb(createMockD1(fixture.history))
  try {
    run(
      fixture.history,
      `INSERT INTO statsRecords (snapshotId, id, datasetCode, sourceFeatureRef, divisionId, referencePeriodCode, referencePeriodGranularity, referencePeriodEndYear, geography, definitionSetId, "values", versionHash, isCurrent, createdAt)
      SELECT 'correction', id, datasetCode, sourceFeatureRef, divisionId, referencePeriodCode, referencePeriodGranularity, referencePeriodEndYear, geography, definitionSetId, '{"totalPopulation":"250000","femalePopulation":"125000"}', 'correction-hash', 0, createdAt FROM statsRecords WHERE id = ? AND versionHash = 'record-version-hash'`,
      [STATISTIC_ID],
    )
    run(fixture.history, 'UPDATE statsRecords SET isCurrent = 0')
    const selection: StatisticReadSelection = {
      mode: 'history',
      snapshotProducers: {
        'snapshot-statistics': 'release-original',
        correction: 'release-correction',
        'unchanged-reissue': 'release-unchanged',
      },
      datasetCodes: [DATASET_CODE],
      snapshotIds: ['snapshot-statistics', 'correction', 'unchanged-reissue'],
      publications: [
        {
          datasetCode: DATASET_CODE,
          referencePeriodCode: '2021',
          snapshotId: 'unchanged-reissue',
        },
      ],
    }
    expect(
      await countStatisticRecords([db], { selection, cohortKey: '2021', filters: {} }),
    ).toBe(1)
    const rows = await listStatisticRecords([db], {
      selection,
      cohortKey: '2021',
      filters: {},
      limit: 1,
      offset: 0,
    })
    expect(rows.map(row => row.values)).toEqual([
      { totalPopulation: '250000', femalePopulation: '125000' },
    ])
    expect(rows[0]?.sourceReleaseId).toBe('release-correction')
    const combined: StatisticReadSelection = {
      ...selection,
      snapshotProducers: {
        ...selection.snapshotProducers,
        correction: { [DATASET_CODE]: 'dataset-producer' },
      },
    }
    const combinedRows = await listStatisticRecords([db], {
      selection: combined,
      cohortKey: '2021',
      filters: {},
      limit: 1,
      offset: 0,
    })
    expect(combinedRows[0]?.sourceReleaseId).toBe('dataset-producer')
    const ambiguous: StatisticReadSelection = {
      ...selection,
      snapshotProducers: {
        ...selection.snapshotProducers,
        correction: { unknown: 'other' },
      },
    }
    await expect(
      listStatisticRecords([db], {
        selection: ambiguous,
        cohortKey: '2021',
        filters: {},
        limit: 1,
        offset: 0,
      }),
    ).rejects.toThrow('Missing Statistics producer')

    expect(
      await listStatisticRecords([db], {
        selection,
        cohortKey: '2021',
        filters: {},
        limit: 1,
        offset: 1,
      }),
    ).toEqual([])
    const original = await getStatisticRecord([db], {
      selection: { ...selection, snapshotIds: ['snapshot-statistics'] },
      cohortKey: '2021',
      id: STATISTIC_ID,
    })
    expect(original?.values).toEqual({ totalPopulation: '235953' })
  } finally {
    fixture.close()
  }
})

test('selects field meanings by each pack hash while current retains older-period definitions', async () => {
  const fixture = fixtureEnv()
  const db = createCurrentDb(createMockD1(fixture.current))
  try {
    run(
      fixture.current,
      `INSERT INTO statsFields (datasetCode, fieldName, measureCode, measureVersionHash, sourceField, dimensions, statisticKind, aggregation, valueKind, unitCode, versionHash, createdAt)
      SELECT datasetCode, fieldName, measureCode, measureVersionHash, sourceField, '{"sex":"female"}', statisticKind, aggregation, valueKind, unitCode, 'redefined-field-hash', '2026-08-21T00:00:00.000Z' FROM statsFields WHERE datasetCode = ? AND fieldName = 'totalPopulation'`,
      [DATASET_CODE],
    )
    run(
      fixture.current,
      `INSERT INTO statsDefinitionSets VALUES ('redefined-set','{"totalPopulation":"redefined-field-hash"}')`,
    )
    run(
      fixture.current,
      `UPDATE statsRecords SET definitionSetId = 'redefined-set' WHERE id = ?`,
      [STATISTIC_ID],
    )
    const selection: StatisticReadSelection = {
      mode: 'current',
      datasetCodes: [DATASET_CODE],
      snapshotIds: [],
      publications: ['2020', '2021'].map(referencePeriodCode => ({
        datasetCode: DATASET_CODE,
        referencePeriodCode,
        snapshotId: 'published',
      })),
    }
    const definitions = await listStatisticFieldDefinitions([db], {
      selection,
      datasetCodes: [DATASET_CODE],
      localeSelection: { mode: 'none', locales: [] },
    })
    expect(new Set(definitions.map(field => field.versionHash))).toEqual(
      new Set(['field-version-hash', 'redefined-field-hash']),
    )
    for (const [cohortKey, dimensions] of [
      ['2020', { sex: 'all' }],
      ['2021', { sex: 'female' }],
    ] as const) {
      const records = await listStatisticRecords([db], {
        selection,
        cohortKey,
        filters: {},
        limit: 10,
        offset: 0,
      })
      const fields = await listStatisticFieldDefinitions([db], {
        selection,
        records,
        datasetCodes: [DATASET_CODE],
        localeSelection: { mode: 'none', locales: [] },
      })
      expect(fields).toHaveLength(1)
      expect(fields[0]?.dimensions).toEqual(dimensions)
    }
  } finally {
    fixture.close()
  }
})
