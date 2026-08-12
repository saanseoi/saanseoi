import assert from 'node:assert/strict'
import test from 'node:test'

import { PublicKeyLeaseCoordinator } from './publicKeyLeaseCoordinator'

const publicKey = `pk.${'a'.repeat(43)}`

test('the per-key coordinator coalesces concurrent refreshes', async () => {
  let keyLookups = 0
  const coordinator = new PublicKeyLeaseCoordinator(
    {
      blockConcurrencyWhile: <T>(callback: () => Promise<T>) => callback(),
    } as unknown as DurableObjectState,
    {
      DB_META: {
        prepare(query: string) {
          return {
            bind: () => ({
              first: async () => {
                if (query.includes('FROM api_key')) {
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

test('persists configured-key usage before allowing the next request', async () => {
  let requestCount = 0
  const statements: string[] = []
  const coordinator = new PublicKeyLeaseCoordinator(
    {
      blockConcurrencyWhile: <T>(callback: () => Promise<T>) => callback(),
    } as unknown as DurableObjectState,
    {
      DB_META: {
        prepare(query: string) {
          const statement = {
            query,
            values: [] as unknown[],
            bind(...values: unknown[]) {
              this.values = values
              return this
            },
            async first() {
              if (query.includes('FROM api_key_usage')) {
                return requestCount === 0 ? null : { requestCount }
              }
              return {
                id: 'key-123',
                requestsPerMinute: 1,
                requestsPerDay: null,
                requestsPerMonth: null,
                revokedAt: null,
              }
            },
          }
          return statement
        },
        async batch(batch: D1PreparedStatement[]) {
          for (const statement of batch) {
            statements.push((statement as unknown as { query: string }).query)
            requestCount += 1
          }
          return []
        },
      } as unknown as D1Database,
      PUBLIC_KEY_LEASES: {} as KVNamespace,
    } as ConstructorParameters<typeof PublicKeyLeaseCoordinator>[1],
  )
  const consume = () =>
    coordinator.fetch(
      new Request('https://public-key-lease/consume', {
        method: 'POST',
        body: JSON.stringify({ apiKey: publicKey }),
      }),
    )

  const first = await consume()
  const second = await consume()

  assert.equal(first.status, 200)
  assert.deepEqual(await first.json(), { status: 'active' })
  assert.equal(second.status, 200)
  assert.deepEqual(await second.json(), {
    status: 'exhausted',
    resetAt: new Date().setUTCSeconds(0, 0) + 60_000,
  })
  assert.equal(statements.length, 1)
  assert.match(statements[0] ?? '', /INSERT INTO api_key_usage/)
})
