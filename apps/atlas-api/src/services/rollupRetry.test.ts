import { expect, test } from 'bun:test'

import {
  RollupJobError,
  runWithTransientAnalyticsRetry,
  runWithTransientD1WriteRetry,
} from './rollupRetry'

test('retries only transient Analytics Engine responses', async () => {
  let attempts = 0

  await expect(
    runWithTransientAnalyticsRetry(async () => {
      attempts += 1
      if (attempts < 3) {
        throw new RollupJobError('analytics_engine_query', 'Service unavailable', 503)
      }
      return 'ok'
    }),
  ).resolves.toBe('ok')
  expect(attempts).toBe(3)

  attempts = 0
  await expect(
    runWithTransientAnalyticsRetry(async () => {
      attempts += 1
      throw new RollupJobError('analytics_engine_query', 'Unauthorised', 401)
    }),
  ).rejects.toMatchObject({ httpStatus: 401 })
  expect(attempts).toBe(1)
})

test('retries transient D1 write failures and preserves their phase', async () => {
  let attempts = 0

  await expect(
    runWithTransientD1WriteRetry(async () => {
      attempts += 1
      if (attempts < 3) throw new Error('SQLITE_BUSY: database is locked')
      return 'ok'
    }),
  ).resolves.toBe('ok')
  expect(attempts).toBe(3)

  await expect(
    runWithTransientD1WriteRetry(async () => {
      throw new Error('constraint failed')
    }),
  ).rejects.toMatchObject({ phase: 'd1_write', httpStatus: null })
})
