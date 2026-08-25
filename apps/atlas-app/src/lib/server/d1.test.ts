import { describe, expect, test } from 'bun:test'

import { runWithD1ReadRetry } from './d1'

describe('atlas-app D1 read retries', () => {
  test('retries a read blocked by a concurrent write', async () => {
    let attempts = 0

    const result = await runWithD1ReadRetry(async () => {
      attempts += 1
      if (attempts < 3) throw new Error('SQLITE_BUSY: database is locked')
      return 'ok'
    })

    expect(result).toBe('ok')
    expect(attempts).toBe(3)
  })

  test('retries wrapped D1 internal errors', async () => {
    let attempts = 0

    const result = await runWithD1ReadRetry(async () => {
      attempts += 1
      if (attempts === 1) {
        const error = new Error('Failed query: select * from apiReleaseSets')
        error.cause = new Error(
          'D1_ERROR: Failed to parse body as JSON, got: Error: internal error',
        )
        throw error
      }
      return 'ok'
    })

    expect(result).toBe('ok')
    expect(attempts).toBe(2)
  })

  test('retries a closed D1 binding socket', async () => {
    let attempts = 0

    const result = await runWithD1ReadRetry(async () => {
      attempts += 1
      if (attempts === 1) {
        const error = new Error('Failed query: select * from publishers')
        error.cause = new Error('fetch failed')
        throw error
      }
      return 'ok'
    })

    expect(result).toBe('ok')
    expect(attempts).toBe(2)
  })

  test('does not retry non-transient failures', async () => {
    let attempts = 0

    await expect(
      runWithD1ReadRetry(async () => {
        attempts += 1
        throw new Error('no such table: apiReleaseSets')
      }),
    ).rejects.toThrow('no such table: apiReleaseSets')

    expect(attempts).toBe(1)
  })
})
