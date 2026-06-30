import { describe, expect, test } from 'bun:test'

import { isTransientD1ReadError, runWithD1ReadRetry } from './d1'

describe('atlas d1 helpers', () => {
  test('classifies transient D1 lock and internal errors as retryable', () => {
    const wrappedError = new Error('Failed query: select * from apiReleaseSets')
    wrappedError.cause = new Error(
      'D1_ERROR: Failed to parse body as JSON, got: Error: internal error; reference = abc123',
    )

    expect(isTransientD1ReadError(new Error('SQLITE_BUSY: database is locked'))).toBe(
      true,
    )
    expect(isTransientD1ReadError(wrappedError)).toBe(true)
    expect(
      isTransientD1ReadError(new Error('No active place snapshot is published.')),
    ).toBe(false)
  })

  test('retries transient D1 read failures and eventually returns the result', async () => {
    let attempts = 0

    const result = await runWithD1ReadRetry(async () => {
      attempts += 1

      if (attempts < 3) {
        throw new Error('database is locked')
      }

      return 'ok'
    })

    expect(result).toBe('ok')
    expect(attempts).toBe(3)
  })
})
