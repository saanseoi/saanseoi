import { describe, expect, test } from 'bun:test'

import {
  buildCanonicalStatsSqlBatches,
  replayCanonicalStatsSqlBatches,
} from './canonicalStatsSql.ts'

describe('buildCanonicalStatsSqlBatches', () => {
  test('keeps unrelated reference periods in the current view', () => {
    const record = {
      createdAt: '2026-08-18T00:00:00.000Z',
      id: 'stats:2016',
      datasetCode: 'stats',
      dimensions: {},
      geographyCohortId: null,
      divisionId: null,
      referencePeriodCode: '2016',
      referencePeriodEnd: null,
      referencePeriodGranularity: 'year',
      referencePeriodStart: null,
      sourceFeatureId: 'feature',
      sourceReleaseId: 'release',
      updatedAt: '2026-08-18T00:00:00.000Z',
      values: {},
    }
    const batches = buildCanonicalStatsSqlBatches({
      current: [{ rows: [record], table: 'statsRecords' }],
      history: [],
    })

    expect(batches.current.join('\n')).not.toContain('DELETE FROM "statsRecords"')
    expect(batches.current.join('\n')).toContain('ON CONFLICT ("id") DO UPDATE SET')
  })

  test('combines compatible canonical rows into D1-sized multi-row statements', () => {
    const rows = Array.from({ length: 100 }, (_, index) => ({
      createdAt: '2026-08-18T00:00:00.000Z',
      id: `stats:${index}`,
      datasetCode: 'stats',
      dimensions: {},
      geographyCohortId: null,
      divisionId: null,
      referencePeriodCode: '2021',
      referencePeriodEnd: null,
      referencePeriodGranularity: 'year',
      referencePeriodStart: null,
      sourceFeatureId: `feature:${index}`,
      sourceReleaseId: 'release',
      updatedAt: '2026-08-18T00:00:00.000Z',
      values: { population: { numericValue: String(index) } },
    }))
    const batches = buildCanonicalStatsSqlBatches({
      current: [{ rows, table: 'statsRecords' }],
      history: [],
    })

    expect(batches.current).toHaveLength(1)
    expect(batches.current[0]?.match(/INSERT INTO/g)).toHaveLength(1)
    expect(batches.current[0]).toContain("'stats:0'")
    expect(batches.current[0]).toContain("'stats:99'")
  })
})

describe('replayCanonicalStatsSqlBatches', () => {
  test('reports each local canonical SQL batch', async () => {
    const executed: string[] = []
    const binding = {
      prepare(sql: string) {
        return {
          async run() {
            executed.push(sql)
          },
        }
      },
    }
    const progress: string[] = []

    await replayCanonicalStatsSqlBatches(
      { environment: 'dev', remote: false },
      {
        currentBinding: binding,
        historyBinding: binding,
        historyTargets: [],
        state: { bindings: {} },
      } as never,
      '2021',
      {
        current: ['SELECT 1;', 'SELECT 2;'],
        history: ['SELECT 3;'],
      },
      {
        onProgress(event) {
          progress.push(
            `${event.phase}:${event.completedBatches}/${event.totalBatches}`,
          )
        },
      },
    )

    expect(executed).toEqual(['SELECT 1;', 'SELECT 2;', 'SELECT 3;'])
    expect(progress).toEqual([
      'local-current-replay:0/3',
      'local-current-replay:1/3',
      'local-current-replay:2/3',
      'local-history-replay:2/3',
      'local-history-replay:3/3',
    ])
  })
})
