import { describe, expect, test } from 'bun:test'

import { runWithWriteRetry } from './utils'

describe('pipeline write retry utilities', () => {
  test('falls back to retry defaults when options contain invalid numbers', async () => {
    let attempts = 0
    const retryEvents: Array<{ attempt: number; delayMs: number; maxRetries: number }> =
      []

    await runWithWriteRetry(
      () => {
        attempts += 1

        if (attempts === 1) {
          throw new Error('database is locked')
        }
      },
      {
        attempt: undefined,
        maxRetries: Number.NaN,
        onRetry(event) {
          retryEvents.push({
            attempt: event.attempt,
            delayMs: event.delayMs,
            maxRetries: event.maxRetries,
          })
        },
        retryDelayMs: 0,
      },
    )

    expect(attempts).toBe(2)
    expect(retryEvents).toEqual([
      {
        attempt: 1,
        delayMs: 0,
        maxRetries: 3,
      },
    ])
  })
})
