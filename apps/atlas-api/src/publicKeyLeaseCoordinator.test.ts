import assert from 'node:assert/strict'
import test from 'node:test'
import { Database } from 'bun:sqlite'
import { publicApiKeyDigest } from '@repo/core/publicApiKey'

import { PublicKeyLeaseCoordinator } from './publicKeyLeaseCoordinator'

const publicKey = `pk.${'a'.repeat(43)}`

test('revocation is honoured at the lease deadline with a real local key record', async () => {
  const sqlite = new Database(':memory:')
  sqlite.exec(`
    CREATE TABLE apiKey (id TEXT PRIMARY KEY, key_digest TEXT, revoked_at INTEGER, last_used_at INTEGER, requests_per_day INTEGER, requests_per_month INTEGER);
    CREATE TABLE apiKeyOriginPolicy (api_key_id TEXT, hostname TEXT, action TEXT);
  `)
  sqlite
    .query('INSERT INTO apiKey (id, key_digest) VALUES (?, ?)')
    .run('key-123', await publicApiKeyDigest(publicKey))
  let cached: unknown = null
  const now = Date.now
  let clock = now()
  Date.now = () => clock
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
    const request = () =>
      new Request('https://public-key-lease/refresh', {
        method: 'POST',
        body: JSON.stringify({ apiKey: publicKey }),
      })
    const first = await coordinator.fetch(request())
    const lease = (await first.json()) as { nextCheckAt: number }
    assert.equal(first.status, 200)
    sqlite.query('UPDATE apiKey SET revoked_at = ?').run(clock)
    clock = lease.nextCheckAt - 1
    assert.equal((await coordinator.fetch(request())).status, 200)
    clock = lease.nextCheckAt
    assert.equal((await coordinator.fetch(request())).status, 401)
  } finally {
    Date.now = now
    sqlite.close()
  }
})

test('the coordinator revalidates malformed cached leases against revoked keys', async () => {
  let lookups = 0
  const coordinator = new PublicKeyLeaseCoordinator(
    {} as DurableObjectState,
    {
      PUBLIC_KEY_LEASES: {
        get: async () => ({
          keyId: 'key-123',
          status: 'revoked',
          nextCheckAt: Date.now() + 60_000,
        }),
      },
      DB_META: {
        prepare: () => ({
          bind: () => ({
            first: async () => {
              lookups++
              return { id: 'key-123', revokedAt: 1 }
            },
          }),
        }),
      },
    } as unknown as ConstructorParameters<typeof PublicKeyLeaseCoordinator>[1],
  )
  const response = await coordinator.fetch(
    new Request('https://public-key-lease/refresh', {
      method: 'POST',
      body: JSON.stringify({ apiKey: publicKey }),
    }),
  )
  assert.equal(response.status, 401)
  assert.equal(lookups, 1)
})

test('the coordinator coalesces concurrent refreshes for one public key', async () => {
  let keyLookups = 0
  const coordinator = new PublicKeyLeaseCoordinator(
    {} as DurableObjectState,
    {
      DB_META: {
        prepare(query: string) {
          return {
            bind: () => ({
              first: async () => {
                if (query.includes('FROM apiKey')) {
                  keyLookups += 1
                  return {
                    id: 'key-123',
                    requestsPerMinute: null,
                    requestsPerDay: null,
                    requestsPerMonth: null,
                    revokedAt: null,
                  }
                }
                return null
              },
              all: async () => ({ results: [], success: true }),
              run: async () => ({ success: true }),
            }),
          }
        },
      } as unknown as D1Database,
      PUBLIC_KEY_LEASES: {
        get: async () => null,
        put: async () => {},
      } as unknown as KVNamespace,
    } as ConstructorParameters<typeof PublicKeyLeaseCoordinator>[1],
  )

  const request = () =>
    new Request('https://public-key-lease/refresh', {
      method: 'POST',
      body: JSON.stringify({ apiKey: publicKey }),
    })
  const [first, second] = await Promise.all([
    coordinator.fetch(request()),
    coordinator.fetch(request()),
  ])

  assert.equal(first.status, 200)
  assert.equal(second.status, 200)
  assert.equal(keyLookups, 1)
  assert.deepEqual(await first.json(), await second.json())
})
