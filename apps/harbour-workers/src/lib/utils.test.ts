import { describe, expect, test } from 'bun:test'

import {
  chunkArray,
  getMaxRowsPerInsert,
  isRetryableSqliteWriteError,
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
    expect(chunkArray([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
  })
})
