import { expect, test } from 'bun:test'
import { PublicKeyLeaseUnavailableError } from '@repo/core/publicApiKey'
import { resolvePublicKeyLease, type PublicKeyLeaseBindings } from './public-key-lease'

const apiKey = `pk.${'a'.repeat(43)}`

test('the API rejects an expired coordinator lease rather than extending revoked access', async () => {
  const expired = { keyId: 'key-1', status: 'active', nextCheckAt: Date.now() - 1 }
  const env = {
    PUBLIC_KEY_LEASES: { get: async () => expired },
    PUBLIC_KEY_LEASE_COORDINATOR: {
      getByName: () => ({ fetch: async () => Response.json(expired) }),
    },
  } as unknown as PublicKeyLeaseBindings
  await expect(resolvePublicKeyLease(apiKey, env)).rejects.toBeInstanceOf(
    PublicKeyLeaseUnavailableError,
  )
})

test('the API does not use a stale KV lease after the coordinator reports revocation', async () => {
  const env = {
    PUBLIC_KEY_LEASES: {
      get: async () => ({ keyId: 'key-1', status: 'active', nextCheckAt: 0 }),
    },
    PUBLIC_KEY_LEASE_COORDINATOR: {
      getByName: () => ({ fetch: async () => new Response(null, { status: 401 }) }),
    },
  } as unknown as PublicKeyLeaseBindings
  expect(await resolvePublicKeyLease(apiKey, env)).toBeNull()
})
