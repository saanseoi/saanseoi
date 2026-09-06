import { afterEach, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { readFileSync } from 'node:fs'
import { rollUpApiKeyUsage } from './apiKeyUsageRollup'

const originalFetch = globalThis.fetch
const databases: Database[] = []
afterEach(() => {
  globalThis.fetch = originalFetch
  for (const db of databases.splice(0)) db.close()
})

type Usage = { apiKeyId: string; requestCount: number; windowStartedAt: string }

function fixture() {
  const sqlite = new Database(':memory:')
  databases.push(sqlite)
  sqlite.exec(`
    CREATE TABLE api_key (id TEXT PRIMARY KEY);
    CREATE TABLE api_key_usage (api_key_id TEXT, window TEXT, window_started_at INTEGER, request_count INTEGER,
      PRIMARY KEY (api_key_id, window, window_started_at));
    INSERT INTO api_key VALUES ('key-123');
  `)
  sqlite.exec(
    readFileSync(
      new URL(
        '../../../../libs/db/migrations/meta/20260906175725_wooden_celestials/migration.sql',
        import.meta.url,
      ),
      'utf8',
    ),
  )
  let fail: (sql: string) => boolean = () => false
  const db = {
    prepare(query: string) {
      return {
        values: [] as Array<string | number | null>,
        bind(...values: Array<string | number | null>) {
          this.values = values
          return this
        },
        async first() {
          return sqlite.query(query).get(...this.values)
        },
        run() {
          if (fail(query)) throw new Error('Injected permanent write failure')
          const result = sqlite.query(query).run(...this.values)
          return { success: true, results: [], meta: { changes: result.changes } }
        },
      }
    },
    async batch(statements: Array<{ run: () => unknown }>) {
      return sqlite.transaction(() => statements.map(statement => statement.run()))()
    },
  } as unknown as D1Database
  const env = {
    DB_META: db,
    ANALYTICS_ENGINE_ACCOUNT_ID: 'local',
    ANALYTICS_ENGINE_READ_TOKEN: 'fixture',
    USAGE_ROLLUP_DATASETS: 'api-usage',
  }
  return {
    sqlite,
    env,
    failWrites: (predicate: typeof fail) => {
      fail = predicate
    },
  }
}

function mockUsage(rows: Usage[]) {
  const queries: string[] = []
  globalThis.fetch = Object.assign(
    async (_input: unknown, init?: RequestInit) => {
      const query = String(init?.body)
      queries.push(query)
      const times = [...query.matchAll(/toDateTime\('([^']+)'\)/g)].map(match =>
        Date.parse(`${match[1]}Z`),
      )
      const [start, end] = times
      if (start === undefined || end === undefined)
        throw new Error('Expected bounded usage query')
      return Response.json({
        data: rows.filter(
          row =>
            Date.parse(row.windowStartedAt) >= start &&
            Date.parse(row.windowStartedAt) < end,
        ),
      })
    },
    { preconnect: originalFetch.preconnect },
  )
  return queries
}

const scheduledTime = Date.parse('2026-09-07T12:25:00Z')
const row = {
  apiKeyId: 'key-123',
  requestCount: 3,
  windowStartedAt: '2026-09-07T12:10:00Z',
}

test('duplicate dataset names are counted once', async () => {
  const { sqlite, env } = fixture()
  const queries = mockUsage([row])
  await rollUpApiKeyUsage(
    { ...env, USAGE_ROLLUP_DATASETS: 'api-usage, api-usage' },
    scheduledTime,
  )
  expect(
    sqlite
      .query("SELECT request_count FROM api_key_usage WHERE window = 'minute'")
      .get(),
  ).toEqual({ request_count: 3 })
  expect(queries).toHaveLength(1)
})

test('a derived-write failure rolls back more than one old minute batch', async () => {
  const { sqlite, env, failWrites } = fixture()
  const rows = Array.from({ length: 101 }, (_, index) => {
    const apiKeyId = `key-${index}`
    sqlite.query('INSERT INTO api_key VALUES (?)').run(apiKeyId)
    return { ...row, apiKeyId }
  })
  mockUsage(rows)
  failWrites(query => query.includes('SUM(minute.request_count)'))
  await expect(rollUpApiKeyUsage(env, scheduledTime)).rejects.toThrow(
    'Injected permanent write failure',
  )
  expect(sqlite.query('SELECT COUNT(*) AS count FROM api_key_usage').get()).toEqual({
    count: 0,
  })
  failWrites(() => false)
  await rollUpApiKeyUsage(env, scheduledTime)
  expect(
    sqlite
      .query(
        "SELECT SUM(request_count) AS count FROM api_key_usage WHERE window = 'day'",
      )
      .get(),
  ).toEqual({ count: 303 })
})

test('a slower old invocation cannot replace a newer committed snapshot', async () => {
  const { sqlite, env } = fixture()
  let releaseOld!: () => void
  let oldStarted!: () => void
  const started = new Promise<void>(resolve => {
    oldStarted = resolve
  })
  const waiting = new Promise<void>(resolve => {
    releaseOld = resolve
  })
  let calls = 0
  globalThis.fetch = Object.assign(
    async () => {
      const first = calls++ === 0
      if (first) {
        oldStarted()
        await waiting
      }
      return Response.json({ data: [{ ...row, requestCount: first ? 3 : 9 }] })
    },
    { preconnect: originalFetch.preconnect },
  )
  const old = rollUpApiKeyUsage(env, scheduledTime)
  await started
  try {
    await rollUpApiKeyUsage(env, scheduledTime + 60_000)
  } finally {
    releaseOld()
  }
  await old
  expect(
    sqlite
      .query("SELECT request_count FROM api_key_usage WHERE window = 'minute'")
      .get(),
  ).toEqual({ request_count: 9 })
  expect(
    sqlite.query("SELECT request_count FROM api_key_usage WHERE window = 'day'").get(),
  ).toEqual({ request_count: 9 })
})

test('a later run recovers usage in a missed interval beyond the overlap', async () => {
  const { sqlite, env } = fixture()
  mockUsage([row, { ...row, requestCount: 7, windowStartedAt: '2026-09-07T12:30:00Z' }])
  await rollUpApiKeyUsage(env, scheduledTime)
  await rollUpApiKeyUsage(env, scheduledTime + 60 * 60_000)
  expect(
    sqlite
      .query(
        "SELECT SUM(request_count) AS count FROM api_key_usage WHERE window = 'minute'",
      )
      .get(),
  ).toEqual({ count: 10 })
})

test('an empty authoritative replay clears previously counted usage', async () => {
  const { sqlite, env } = fixture()
  mockUsage([row])
  await rollUpApiKeyUsage(env, scheduledTime)
  mockUsage([])
  await rollUpApiKeyUsage(env, scheduledTime + 60_000)
  expect(
    sqlite.query("SELECT request_count FROM api_key_usage WHERE window = 'day'").get(),
  ).toEqual({ request_count: 0 })
})

test('malformed analytics rows fail the snapshot rather than silently undercounting', async () => {
  const { sqlite, env } = fixture()
  globalThis.fetch = Object.assign(
    async () => Response.json({ data: [{ ...row, requestCount: null }] }),
    { preconnect: originalFetch.preconnect },
  )
  await expect(rollUpApiKeyUsage(env, scheduledTime)).rejects.toThrow()
  expect(sqlite.query('SELECT COUNT(*) AS count FROM api_key_usage').get()).toEqual({
    count: 0,
  })
})

test('one unavailable dataset leaves all totals and the checkpoint unchanged', async () => {
  const { sqlite, env } = fixture()
  const configured = { ...env, USAGE_ROLLUP_DATASETS: 'api-usage,tile-usage' }
  mockUsage([row])
  await rollUpApiKeyUsage(configured, scheduledTime)
  const checkpoint = sqlite.query('SELECT * FROM api_key_usage_rollup').get()
  globalThis.fetch = Object.assign(
    async (_input: unknown, init?: RequestInit) =>
      String(init?.body).includes('"tile-usage"')
        ? Response.json({ success: false }, { status: 401 })
        : Response.json({ data: [{ ...row, requestCount: 10 }] }),
    { preconnect: originalFetch.preconnect },
  )
  await expect(rollUpApiKeyUsage(configured, scheduledTime + 60_000)).rejects.toThrow()
  expect(sqlite.query('SELECT * FROM api_key_usage_rollup').get()).toEqual(checkpoint)
  expect(
    sqlite.query("SELECT request_count FROM api_key_usage WHERE window = 'day'").get(),
  ).toEqual({ request_count: 6 })
})

test('transient batch failures replay once without duplicate usage', async () => {
  const { sqlite, env } = fixture()
  mockUsage([row])
  const batch = env.DB_META.batch.bind(env.DB_META)
  let calls = 0
  env.DB_META.batch = async statements => {
    if (calls++ === 0) throw new Error('SQLITE_BUSY: database is locked')
    return batch(statements)
  }
  await rollUpApiKeyUsage(env, scheduledTime)
  expect(calls).toBe(2)
  expect(
    sqlite.query("SELECT request_count FROM api_key_usage WHERE window = 'day'").get(),
  ).toEqual({ request_count: 3 })
})

test('a lost batch acknowledgement cannot reapply or undo a committed snapshot', async () => {
  const { sqlite, env } = fixture()
  mockUsage([row])
  const batch = env.DB_META.batch.bind(env.DB_META)
  let calls = 0
  env.DB_META.batch = async statements => {
    const results = await batch(statements)
    if (calls++ === 0) throw new Error('D1_ERROR: internal error')
    return results
  }
  await rollUpApiKeyUsage(env, scheduledTime)
  expect(calls).toBe(2)
  expect(
    sqlite.query("SELECT request_count FROM api_key_usage WHERE window = 'day'").get(),
  ).toEqual({ request_count: 3 })
  expect(
    sqlite
      .query('SELECT completed_through AS completedThrough FROM api_key_usage_rollup')
      .get(),
  ).toEqual({ completedThrough: scheduledTime - 120_000 })
})

test('empty intervals advance the checkpoint and later outages recover from it', async () => {
  const { sqlite, env } = fixture()
  mockUsage([])
  await rollUpApiKeyUsage(env, scheduledTime)
  mockUsage([{ ...row, windowStartedAt: '2026-09-07T12:30:00Z' }])
  for (let attempt = 0; attempt < 3; attempt++)
    await rollUpApiKeyUsage(env, scheduledTime + 60 * 60_000)
  expect(
    sqlite
      .query('SELECT completed_through AS completedThrough FROM api_key_usage_rollup')
      .get(),
  ).toEqual({ completedThrough: scheduledTime + 58 * 60_000 })
  expect(
    sqlite.query("SELECT request_count FROM api_key_usage WHERE window = 'day'").get(),
  ).toEqual({ request_count: 3 })
})

test('out-of-order cron deliveries cannot rewind a completed checkpoint', async () => {
  const { sqlite, env } = fixture()
  const queries = mockUsage([row])
  await rollUpApiKeyUsage(env, scheduledTime)
  const checkpoint = sqlite.query('SELECT * FROM api_key_usage_rollup').get()
  await rollUpApiKeyUsage(env, scheduledTime - 60_000)
  expect(queries).toHaveLength(1)
  expect(sqlite.query('SELECT * FROM api_key_usage_rollup').get()).toEqual(checkpoint)
})

test('dataset reordering is harmless but dataset replacement requires reconciliation', async () => {
  const { sqlite, env } = fixture()
  mockUsage([row])
  await rollUpApiKeyUsage(
    { ...env, USAGE_ROLLUP_DATASETS: 'api-usage,tile-usage' },
    scheduledTime,
  )
  await rollUpApiKeyUsage(
    { ...env, USAGE_ROLLUP_DATASETS: 'tile-usage,api-usage' },
    scheduledTime,
  )
  await expect(rollUpApiKeyUsage(env, scheduledTime)).rejects.toThrow(
    'reconcile historical usage',
  )
  expect(
    sqlite.query("SELECT request_count FROM api_key_usage WHERE window = 'day'").get(),
  ).toEqual({ request_count: 6 })
})
