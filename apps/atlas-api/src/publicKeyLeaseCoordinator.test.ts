import assert from 'node:assert/strict'
import test from 'node:test'

import { PublicKeyLeaseCoordinator } from './publicKeyLeaseCoordinator'

const publicKey = `pk.${'a'.repeat(43)}`

test('the global coordinator coalesces concurrent refreshes for one public key', async () => {
  let keyLookups = 0
  const coordinator = new PublicKeyLeaseCoordinator(
    {} as DurableObjectState,
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
