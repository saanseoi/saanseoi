import { describe, expect, test } from 'bun:test'

import {
  chunkArray,
  getMaxItemsPerInClause,
  getMaxRowsPerInsert,
  inferLocale,
  isRetryableSqliteWriteError,
  normalizeLocale,
  runStatementBatchWithWriteRetry,
  runStatementsInGroupsWithWriteRetry,
  runWithWriteRetry,
} from './utils'

describe('utils', () => {
  test('retries transient sqlite lock errors on writes', async () => {
    let attempts = 0

    const result = await runWithWriteRetry(async () => {
      attempts += 1

      if (attempts === 1) {
        throw new Error('Failed query', {
          cause: new Error('database is locked'),
        })
      }

      return 'ok'
    })

    expect(result).toBe('ok')
    expect(attempts).toBe(2)
    expect(
      isRetryableSqliteWriteError(
        new Error('wrapper', {
          cause: new Error('SQLITE_BUSY: database is locked'),
        }),
      ),
    ).toBe(true)
    expect(getMaxRowsPerInsert(7)).toBeLessThan(20)
    expect(getMaxRowsPerInsert(15)).toBe(6)
    expect(getMaxRowsPerInsert(18)).toBe(5)
    expect(getMaxRowsPerInsert(25)).toBe(3)
    expect(getMaxRowsPerInsert(11, 3)).toBe(8)
    expect(getMaxItemsPerInClause()).toBe(99)
    expect(getMaxItemsPerInClause(1, 4)).toBe(95)
    expect(getMaxItemsPerInClause(2, 5)).toBe(47)
    expect(chunkArray([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
  })

  test('normalizes locales and infers unlabeled name locales', () => {
    expect(normalizeLocale('ZH')).toBe('zh-hant')
    expect(normalizeLocale('zh_hk')).toBe('zh-hk')
    expect(normalizeLocale('value')).toBeNull()

    expect(inferLocale("Penny's Bay")).toEqual([
      {
        locale: 'en',
        value: "Penny's Bay",
      },
    ])
    expect(inferLocale('沙頭角廣場(九區)')).toEqual([
      {
        locale: 'zh-hans',
        value: '沙頭角廣場(九區)',
      },
    ])
    expect(inferLocale('半山 Mid-Levels')).toEqual([
      {
        locale: 'zh-hant',
        value: '半山',
      },
      {
        locale: 'en',
        value: 'Mid-Levels',
      },
    ])
    expect(inferLocale('掃管笏村第1區 So Kwun Wat Tsuen Area 1')).toEqual([
      {
        locale: 'zh-hant',
        value: '掃管笏村第1區',
      },
      {
        locale: 'en',
        value: 'So Kwun Wat Tsuen Area 1',
      },
    ])
    expect(inferLocale('13/31廣場 Plaza 13/31')).toEqual([
      {
        locale: 'zh-hant',
        value: '13/31廣場',
      },
      {
        locale: 'en',
        value: 'Plaza 13/31',
      },
    ])
  })

  test('falls back to the default batch size when groupSize is not positive', async () => {
    const executed: number[] = []

    await runStatementsInGroupsWithWriteRetry(
      {},
      [
        {
          async run() {
            executed.push(1)
          },
        },
        {
          async run() {
            executed.push(2)
          },
        },
      ],
      0,
    )

    expect(executed).toEqual([1, 2])
  })

  test('uses db.batch for grouped statement execution when available', async () => {
    const batches: unknown[][] = []
    const statements = [{ id: 1 }, { id: 2 }, { id: 3 }]

    await runStatementsInGroupsWithWriteRetry(
      {
        async batch(batchStatements: [unknown, ...unknown[]]) {
          batches.push(batchStatements)
        },
      },
      statements,
      2,
    )

    expect(batches).toEqual([[statements[0], statements[1]], [statements[2]]])
  })

  test('falls back to sequential statement execution without db.batch', async () => {
    const executed: number[] = []

    await runStatementBatchWithWriteRetry({}, [
      {
        async run() {
          executed.push(1)
        },
      },
      {
        async run() {
          executed.push(2)
        },
      },
    ])

    expect(executed).toEqual([1, 2])
  })
})
