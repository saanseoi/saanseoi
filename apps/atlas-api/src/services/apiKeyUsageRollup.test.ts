import { afterEach, expect, test } from 'bun:test'

import { rollUpApiKeyUsage } from './apiKeyUsageRollup'

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
})

test('combines dataset totals and refreshes derived D1 windows', async () => {
  const analyticsQueries: string[] = []
  const statements: Array<{ query: string; values: unknown[] }> = []
  const responses = [
    [{ apiKeyId: 'key-123', requestCount: 3, windowStartedAt: '2026-08-13T12:20:00Z' }],
    [{ apiKeyId: 'key-123', requestCount: 2, windowStartedAt: '2026-08-13T12:20:00Z' }],
  ]
  globalThis.fetch = (async (_input, init) => {
    analyticsQueries.push(String(init?.body))
    return Response.json({ success: true, data: responses.shift() })
  }) as typeof fetch
  const db = {
    prepare(query: string) {
      return {
        bind(...values: unknown[]) {
          statements.push({ query, values })
          return this
        },
      }
    },
    batch: async () => [],
  } as unknown as D1Database

  const result = await rollUpApiKeyUsage(
    {
      ANALYTICS_ENGINE_ACCOUNT_ID: 'account-123',
      ANALYTICS_ENGINE_READ_TOKEN: 'read-token',
      DB_META: db,
      USAGE_ROLLUP_DATASETS: 'api-usage,tile-usage',
    },
    Date.parse('2026-08-13T12:25:00Z'),
  )

  expect(result).toEqual({ apiKeys: 1, minuteWindows: 1 })
  expect(analyticsQueries).toHaveLength(2)
  expect(
    analyticsQueries.every(query => query.includes('toStartOfMinute(timestamp)')),
  ).toBe(true)
  expect(
    analyticsQueries.every(query =>
      query.includes("timestamp >= toDateTime('2026-08-13 12:03:00')"),
    ),
  ).toBe(true)
  expect(
    analyticsQueries.every(query =>
      query.includes("timestamp < toDateTime('2026-08-13 12:23:00')"),
    ),
  ).toBe(true)
  expect(analyticsQueries).toEqual(
    expect.arrayContaining([
      expect.stringContaining('FROM "api-usage"'),
      expect.stringContaining('FROM "tile-usage"'),
    ]),
  )
  expect(statements).toHaveLength(3)
  expect(statements[0]?.values).toEqual([
    Date.parse('2026-08-13T12:20:00Z'),
    5,
    'key-123',
  ])
  expect(statements.slice(1).map(statement => statement.values[0])).toEqual([
    'day',
    'month',
  ])
})
