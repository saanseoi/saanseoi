import { expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { publicApiKeyDigest, type PublicKeyLease } from '@repo/core/publicApiKey'
import { PublicKeyLeaseCoordinator } from './publicKeyLeaseCoordinator'

for (const fixture of [
  {
    name: 'daily',
    dayLimit: 5,
    monthLimit: null,
    dayCount: 5,
    monthCount: 5,
    resetAt: '2026-09-08T00:00:00Z',
  },
  {
    name: 'monthly',
    dayLimit: null,
    monthLimit: 10,
    dayCount: 2,
    monthCount: 10,
    resetAt: '2026-10-01T00:00:00Z',
  },
  {
    name: 'both',
    dayLimit: 5,
    monthLimit: 10,
    dayCount: 5,
    monthCount: 10,
    resetAt: '2026-10-01T00:00:00Z',
  },
  {
    name: 'unlimited',
    dayLimit: null,
    monthLimit: null,
    dayCount: 50,
    monthCount: 100,
    resetAt: null,
  },
  {
    name: 'below limits',
    dayLimit: 5,
    monthLimit: 10,
    dayCount: 4,
    monthCount: 9,
    resetAt: null,
  },
] as const) {
  test(`the coordinator enforces ${fixture.name} settled usage quotas and UTC resets`, async () => {
    const sqlite = new Database(':memory:')
    sqlite.exec(`
      CREATE TABLE api_key (id TEXT PRIMARY KEY, key_digest TEXT, revoked_at INTEGER, last_used_at INTEGER, requests_per_day INTEGER, requests_per_month INTEGER);
      CREATE TABLE api_key_origin_policy (api_key_id TEXT, hostname TEXT, action TEXT);
      CREATE TABLE api_key_usage (api_key_id TEXT, window TEXT, window_started_at INTEGER, request_count INTEGER);
    `)
    const apiKey = `pk.${'q'.repeat(43)}`
    sqlite
      .query(
        'INSERT INTO api_key (id, key_digest, requests_per_day, requests_per_month) VALUES (?, ?, ?, ?)',
      )
      .run(
        'quota-key',
        await publicApiKeyDigest(apiKey),
        fixture.dayLimit,
        fixture.monthLimit,
      )
    sqlite
      .query('INSERT INTO api_key_usage VALUES (?, ?, ?, ?)')
      .run('quota-key', 'day', Date.parse('2026-09-07T00:00:00Z'), fixture.dayCount)
    sqlite
      .query('INSERT INTO api_key_usage VALUES (?, ?, ?, ?)')
      .run('quota-key', 'month', Date.parse('2026-09-01T00:00:00Z'), fixture.monthCount)
    const realNow = Date.now
    let now = Date.parse('2026-09-07T23:59:00Z')
    Date.now = () => now
    let cached: unknown = null
    try {
      const coordinator = new PublicKeyLeaseCoordinator(
        {} as DurableObjectState,
        {
          DB_META: {
            prepare: (query: string) => ({
              bind: (...values: Array<string | number>) => ({
                first: async () => sqlite.query(query).get(...values),
                all: async () => ({ results: sqlite.query(query).all(...values) }),
                run: async () => sqlite.query(query).run(...values),
              }),
            }),
          },
          PUBLIC_KEY_LEASES: {
            get: async () => cached,
            put: async (_key: string, value: string) => {
              cached = JSON.parse(value)
            },
          },
        } as unknown as ConstructorParameters<typeof PublicKeyLeaseCoordinator>[1],
      )
      const refresh = async () => {
        const response = await coordinator.fetch(
          new Request('https://public-key-lease/refresh', {
            method: 'POST',
            body: JSON.stringify({ apiKey }),
          }),
        )
        expect(response.status).toBe(200)
        return (await response.json()) as PublicKeyLease
      }
      const lease = await refresh()
      expect(lease.status).toBe(fixture.resetAt ? 'exhausted' : 'active')
      if (fixture.resetAt) {
        expect(lease.resetAt).toBe(Date.parse(fixture.resetAt))
        expect(lease.nextCheckAt).toBeLessThanOrEqual(Date.parse(fixture.resetAt))
        now = Date.parse(fixture.resetAt)
        expect((await refresh()).status).toBe('active')
      }
    } finally {
      Date.now = realNow
      sqlite.close()
    }
  })
}
