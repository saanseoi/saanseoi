import { afterEach, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'

import { rollUpApiKeyUsage } from './apiKeyUsageRollup'

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
})

test('overlapping rollups finalise both sides of UTC day and month boundaries', async () => {
  const sqlite = new Database(':memory:')
  sqlite.exec(`
    CREATE TABLE apiKey (id TEXT PRIMARY KEY);
    CREATE TABLE apiKeyUsage (api_key_id TEXT, window TEXT, window_started_at INTEGER, request_count INTEGER,
      PRIMARY KEY (api_key_id, window, window_started_at));
    CREATE TABLE apiKeyUsageRollup (id TEXT PRIMARY KEY, datasets TEXT NOT NULL, revision TEXT NOT NULL, completed_through INTEGER NOT NULL);
    INSERT INTO apiKey VALUES ('key-123');
  `)
  const rows = [
    { apiKeyId: 'key-123', requestCount: 7, windowStartedAt: '2026-08-31T23:59:00Z' },
    { apiKeyId: 'key-123', requestCount: 3, windowStartedAt: '2026-09-01T00:01:00Z' },
  ]
  globalThis.fetch = Object.assign(
    async () => Response.json({ success: true, data: rows }),
    { preconnect: originalFetch.preconnect },
  )
  const db = {
    prepare: (query: string) => ({
      first: async () => sqlite.query(query).get(),
      bind: (...values: Array<string | number>) => ({
        run: () => ({ meta: { changes: sqlite.query(query).run(...values).changes } }),
      }),
    }),
    batch: async (statements: Array<{ run: () => unknown }>) =>
      sqlite.transaction(() => statements.map(statement => statement.run()))(),
  } as unknown as D1Database
  try {
    const env = {
      ANALYTICS_ENGINE_ACCOUNT_ID: 'local',
      ANALYTICS_ENGINE_READ_TOKEN: 'fixture',
      DB_META: db,
      USAGE_ROLLUP_DATASETS: 'api-usage',
    }
    for (let attempt = 0; attempt < 2; attempt++) {
      await rollUpApiKeyUsage(env, Date.parse('2026-09-01T00:05:00Z'))
      const totals = sqlite
        .query(
          "SELECT window, window_started_at AS startedAt, request_count AS count FROM apiKeyUsage WHERE window != 'minute' ORDER BY window, window_started_at",
        )
        .all()
      expect(totals).toEqual([
        { window: 'day', startedAt: Date.parse('2026-08-31T00:00:00Z'), count: 7 },
        { window: 'day', startedAt: Date.parse('2026-09-01T00:00:00Z'), count: 3 },
        { window: 'month', startedAt: Date.parse('2026-08-01T00:00:00Z'), count: 7 },
        { window: 'month', startedAt: Date.parse('2026-09-01T00:00:00Z'), count: 3 },
      ])
    }
  } finally {
    sqlite.close()
  }
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
        first: async () => null,
        bind(...values: unknown[]) {
          statements.push({ query, values })
          return this
        },
      }
    },
    batch: async () => [{ meta: { changes: 1 } }],
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
  const minuteWrite = statements.find(statement =>
    statement.query.includes('json_each'),
  )
  expect(JSON.parse(String(minuteWrite?.values[0]))).toEqual([
    {
      windowStartedAt: Date.parse('2026-08-13T12:20:00Z'),
      requestCount: 5,
      apiKeyId: 'key-123',
    },
  ])
  expect(
    statements
      .filter(statement => statement.query.includes('SUM(minute.request_count)'))
      .map(statement => statement.values[0]),
  ).toEqual(['day', 'month'])
})
