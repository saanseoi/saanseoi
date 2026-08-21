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
      geography: null,
      divisionId: null,
      referencePeriodCode: '2016',
      referencePeriodEnd: null,
      referencePeriodEndYear: '2016',
      referencePeriodGranularity: 'year',
      referencePeriodStart: null,
      sourceFeatureRef: 'feature',
      sourceReleaseId: 'release',
      updatedAt: '2026-08-18T00:00:00.000Z',
      values: {},
    }
    const batches = buildCanonicalStatsSqlBatches({
      current: [{ rows: [record], table: 'statsRecords' }],
      history: [],
      dictionaries: [],
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
      geography: null,
      divisionId: null,
      referencePeriodCode: '2021',
      referencePeriodEnd: null,
      referencePeriodEndYear: '2021',
      referencePeriodGranularity: 'year',
      referencePeriodStart: null,
      sourceFeatureRef: `feature:${index}`,
      sourceReleaseId: 'release',
      updatedAt: '2026-08-18T00:00:00.000Z',
      values: { population: { numericValue: String(index) } },
    }))
    const batches = buildCanonicalStatsSqlBatches({
      current: [{ rows, table: 'statsRecords' }],
      history: [],
      dictionaries: [],
    })

    expect(batches.current).toHaveLength(1)
    expect(batches.current[0]?.match(/INSERT INTO/g)).toHaveLength(1)
    expect(batches.current[0]).toContain("'stats:0'")
    expect(batches.current[0]).toContain("'stats:99'")
  })

  test('groups history by period end year and versions dictionaries in each shard', () => {
    const base = {
      createdAt: '2026-08-20T00:00:00.000Z',
      datasetCode: 'stats',
      dimensions: {},
      divisionId: null,
      geography: null,
      isCurrent: true,
      referencePeriodEnd: null,
      referencePeriodGranularity: 'year',
      referencePeriodStart: null,
      sourceFeatureRef: 'feature',
      sourceReleaseId: 'release-2026',
      updatedAt: '2026-08-20T00:00:00.000Z',
      values: {},
      versionHash: 'version',
    }
    const batches = buildCanonicalStatsSqlBatches({
      current: [],
      history: [
        {
          rows: [
            {
              ...base,
              id: 'stats:2024',
              referencePeriodCode: '2024',
              referencePeriodEndYear: '2024',
            },
            {
              ...base,
              id: 'stats:2024-25',
              referencePeriodCode: '2024/25',
              referencePeriodEndYear: '2025',
            },
          ],
          table: 'statsRecords',
        },
      ],
      dictionaries: [
        {
          rows: [
            {
              createdAt: base.createdAt,
              datasetCode: 'stats',
              fieldName: 'population',
              isCurrent: true,
              sourceReleaseId: base.sourceReleaseId,
              updatedAt: base.updatedAt,
              versionHash: 'field-version',
            },
            {
              createdAt: base.createdAt,
              datasetCode: 'stats',
              fieldName: 'population',
              isCurrent: true,
              sourceReleaseId: 'release-2025',
              updatedAt: base.updatedAt,
              versionHash: 'field-version',
            },
          ],
          table: 'statsFields',
        },
      ],
    })

    expect(batches.history.map(target => target.shardYear)).toEqual(['2024', '2025'])
    expect(batches.history[0]?.batches.join('\n')).toContain("'stats:2024'")
    expect(batches.history[1]?.batches.join('\n')).toContain("'stats:2024-25'")
    expect(batches.history[0]?.batches.join('\n')).toContain(
      'ON CONFLICT ("datasetCode", "fieldName", "sourceReleaseId", "versionHash")',
    )
    expect(batches.history[1]?.batches.join('\n')).toContain("'field-version'")
    expect(batches.history[0]?.batches.join('\n')).toContain('"isCurrent"')
    expect(batches.history[0]?.batches.join('\n')).toContain(
      '"sourceReleaseId" = \'release-2026\'',
    )
    expect(batches.history[0]?.batches.join('\n')).toContain(
      '"sourceReleaseId" = \'release-2025\'',
    )
    expect(batches.current.join('\n')).toContain(
      'ON CONFLICT ("datasetCode", "fieldName")',
    )
    expect(batches.current.join('\n')).not.toContain('"isCurrent"')
  })
})

describe('replayCanonicalStatsSqlBatches', () => {
  test('checks remote prerequisites before mutating the local cache', async () => {
    const executed: string[] = []
    await expect(
      replayCanonicalStatsSqlBatches(
        { environment: 'preview', remote: true },
        {
          currentBinding: {
            prepare(sql: string) {
              return {
                async run() {
                  executed.push(sql)
                },
              }
            },
          },
          historyTargets: [],
          state: { bindings: {} },
        } as never,
        { current: ['SELECT 1;'], history: [] },
        { importOptions: { accountId: 'account', apiToken: 'token' } },
      ),
    ).rejects.toThrow('current.databaseId')
    expect(executed).toEqual([])
  })

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
        historyTargets: [
          {
            binding,
            bindingName: 'DB_HISTORY_HK_BEFORE',
            year: 'BEFORE',
          },
        ],
        state: { bindings: {} },
      } as never,
      {
        current: ['SELECT 1;', 'SELECT 2;'],
        history: [{ batches: ['SELECT 3;'], shardYear: '2021' }],
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
