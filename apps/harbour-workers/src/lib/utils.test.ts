import { describe, expect, test } from 'bun:test'

import {
  chunkArray,
  getMaxItemsPerInClause,
  getMaxRowsPerInsert,
  inferLocale,
  isRetryableSqliteWriteError,
  normalizeLocale,
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
    expect(getMaxItemsPerInClause()).toBe(99)
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
})
