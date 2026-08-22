import { afterEach, expect, test } from 'bun:test'
import { Database, type SQLQueryBindings } from 'bun:sqlite'

import { rollUpAccessAnalyticsDaily } from './accessAnalyticsRollup'

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
})

function createAnalyticsD1(
  options: { failOnRun?: (query: string, values: unknown[]) => boolean } = {},
) {
  const sqlite = new Database(':memory:')
  sqlite.exec(`
    CREATE TABLE accessAnalyticsDaily (
      day TEXT NOT NULL,
      scope TEXT NOT NULL,
      entityId TEXT NOT NULL,
      metrics TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      PRIMARY KEY (day, scope, entityId)
    );
    CREATE TABLE accessAnalyticsRollups (
      period TEXT NOT NULL,
      scope TEXT NOT NULL,
      entityId TEXT NOT NULL,
      metrics TEXT NOT NULL,
      asOf TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      PRIMARY KEY (period, scope, entityId)
    );
  `)

  function statement(query: string) {
    const prepared = sqlite.query(query)
    let values: SQLQueryBindings[] = []
    const bound = {
      bind(...nextValues: SQLQueryBindings[]) {
        values = nextValues
        return bound
      },
      async run() {
        if (options.failOnRun?.(query, values)) {
          throw new Error('Injected batch failure')
        }
        const result = prepared.run(...values)
        return { meta: { changes: result.changes } }
      },
    }
    return bound
  }

  return {
    db: {
      prepare: statement,
      async batch(statements: Array<{ run: () => Promise<unknown> }>) {
        sqlite.exec('BEGIN')
        try {
          const results = []
          for (const prepared of statements) results.push(await prepared.run())
          sqlite.exec('COMMIT')
          return results
        } catch (error) {
          sqlite.exec('ROLLBACK')
          throw error
        }
      },
    } as unknown as D1Database,
    rows<T>(query: string) {
      return sqlite.query(query).all() as T[]
    },
    close() {
      sqlite.close()
    },
  }
}

test('aggregates settled Analytics Engine hits into non-zero daily rows', async () => {
  const queries: string[] = []
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    queries.push(String(init?.body))
    return Response.json({
      success: true,
      data: [
        {
          day: '2026-08-20 00:00:00',
          scope: 'dataset',
          entityId: 'dataset-1',
          metricKey: 'apiRequests.direct',
          metricValue: 2,
        },
        {
          day: '2026-08-20 00:00:00',
          scope: 'publisher',
          entityId: 'hkgov',
          metricKey: 'apiRequests',
          metricValue: 3,
        },
        {
          day: '2026-08-20 00:00:00',
          scope: 'publisher',
          entityId: 'hkgov',
          metricKey: 'downloads',
          metricValue: 1,
        },
        {
          day: '2026-08-20 00:00:00',
          scope: 'publisher',
          entityId: 'unused',
          metricKey: 'apiRequests',
          metricValue: 0,
        },
      ],
    })
  }) as unknown as typeof fetch

  const { db, rows, close } = createAnalyticsD1()
  try {
    await expect(
      rollUpAccessAnalyticsDaily(
        {
          ANALYTICS_ENGINE_ACCOUNT_ID: 'account-123',
          ANALYTICS_ENGINE_READ_TOKEN: 'read-token',
          DB_META: db,
          PRODUCT_USAGE_DATASET: 'ss-product-usage-local',
        },
        Date.parse('2026-08-21T00:15:00Z'),
      ),
    ).resolves.toEqual({ days: 2, rows: 2 })

    expect(queries[0]).toContain('FROM "ss-product-usage-local"')
    expect(queries[0]).toContain("index1 = 'api.access'")
    expect(queries[0]).toContain('HAVING metricValue > 0')
    expect(
      rows<{ day: string; scope: string; entityId: string; metrics: string }>(
        'SELECT day, scope, entityId, metrics FROM accessAnalyticsDaily',
      ),
    ).toEqual([
      {
        day: '2026-08-20',
        scope: 'dataset',
        entityId: 'dataset-1',
        metrics: '{"apiRequests.direct":2}',
      },
      {
        day: '2026-08-20',
        scope: 'publisher',
        entityId: 'hkgov',
        metrics: '{"apiRequests":3,"downloads":1}',
      },
    ])
    const allTime = rows<{ period: string; metrics: string }>(
      'SELECT period, metrics FROM accessAnalyticsRollups',
    )
    expect(allTime).toHaveLength(2)
    expect(allTime.every(row => row.period === 'all_time')).toBe(true)
    expect(
      JSON.parse(
        allTime.find(row => row.metrics.includes('apiRequests.direct'))?.metrics ??
          '{}',
      ),
    ).toEqual({ 'apiRequests.direct': 2 })
    expect(
      JSON.parse(
        allTime.find(row => row.metrics.includes('downloads'))?.metrics ?? '{}',
      ),
    ).toEqual({ apiRequests: 3, downloads: 1 })
  } finally {
    close()
  }
})

test('does not retry Analytics Engine authentication failures', async () => {
  let requests = 0
  globalThis.fetch = (async () => {
    requests += 1
    return Response.json(
      {
        success: false,
        errors: [{ message: 'Unauthorised' }],
      },
      { status: 401 },
    )
  }) as unknown as typeof fetch

  const { db, close } = createAnalyticsD1()
  try {
    await expect(
      rollUpAccessAnalyticsDaily(
        {
          ANALYTICS_ENGINE_ACCOUNT_ID: 'account-123',
          ANALYTICS_ENGINE_READ_TOKEN: 'read-token',
          DB_META: db,
          PRODUCT_USAGE_DATASET: 'ss-product-usage-local',
        },
        Date.parse('2026-08-21T00:15:00Z'),
      ),
    ).rejects.toMatchObject({
      phase: 'analytics_engine_query',
      httpStatus: 401,
    })
    expect(requests).toBe(1)
  } finally {
    close()
  }
})

test('labels Analytics Engine transport failures as query errors', async () => {
  globalThis.fetch = (async () => {
    throw new Error('Analytics Engine request failed')
  }) as unknown as typeof fetch

  const { db, close } = createAnalyticsD1()
  try {
    await expect(
      rollUpAccessAnalyticsDaily(
        {
          ANALYTICS_ENGINE_ACCOUNT_ID: 'account-123',
          ANALYTICS_ENGINE_READ_TOKEN: 'read-token',
          DB_META: db,
          PRODUCT_USAGE_DATASET: 'ss-product-usage-local',
        },
        Date.parse('2026-08-21T00:15:00Z'),
      ),
    ).rejects.toMatchObject({
      phase: 'analytics_engine_query',
      httpStatus: null,
    })
  } finally {
    close()
  }
})

test('keeps daily rows unchanged when a large atomic refresh fails', async () => {
  const { db, rows, close } = createAnalyticsD1({
    failOnRun: (query, values) =>
      query.includes('INSERT INTO accessAnalyticsDaily') &&
      values.includes('entity-49'),
  })
  await db
    .prepare(`
    INSERT INTO accessAnalyticsDaily
      (day, scope, entityId, metrics, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?)
    `)
    .bind(
      '2026-08-20',
      'publisher',
      'original',
      '{"apiRequests":99}',
      'original',
      'original',
    )
    .run()

  globalThis.fetch = (async () =>
    Response.json({
      success: true,
      data: Array.from({ length: 49 }, (_, index) => ({
        day: '2026-08-20 00:00:00',
        scope: 'publisher',
        entityId: `entity-${index + 1}`,
        metricKey: 'apiRequests',
        metricValue: 1,
      })),
    })) as unknown as typeof fetch

  try {
    await expect(
      rollUpAccessAnalyticsDaily(
        {
          ANALYTICS_ENGINE_ACCOUNT_ID: 'account-123',
          ANALYTICS_ENGINE_READ_TOKEN: 'read-token',
          DB_META: db,
          PRODUCT_USAGE_DATASET: 'ss-product-usage-local',
        },
        Date.parse('2026-08-21T00:15:00Z'),
      ),
    ).rejects.toMatchObject({
      phase: 'd1_write',
      message: 'Injected batch failure',
    })

    expect(
      rows<{ day: string; scope: string; entityId: string; metrics: string }>(
        'SELECT day, scope, entityId, metrics FROM accessAnalyticsDaily',
      ),
    ).toEqual([
      {
        day: '2026-08-20',
        scope: 'publisher',
        entityId: 'original',
        metrics: '{"apiRequests":99}',
      },
    ])
  } finally {
    close()
  }
})
