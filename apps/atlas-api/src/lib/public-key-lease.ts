import {
  isCurrentPublicKeyLease,
  publicApiKeyDigest,
  publicKeyLeaseStorageKey,
  type PublicKeyLease,
} from '@repo/core/publicApiKey'

const coordinatorName = 'all-public-keys'

export type PublicKeyLeaseBindings = {
  PUBLIC_KEY_LEASE_COORDINATOR: DurableObjectNamespace
  PUBLIC_KEY_LEASES: KVNamespace
}

export const resolvePublicKeyLease = async (
  apiKey: string,
  env: PublicKeyLeaseBindings,
): Promise<PublicKeyLease | null> => {
  const digest = await publicApiKeyDigest(apiKey)
  const storageKey = publicKeyLeaseStorageKey(digest)
  const cached = await env.PUBLIC_KEY_LEASES.get<PublicKeyLease>(storageKey, 'json')
  if (cached && isCurrentPublicKeyLease(cached)) return cached

  const response = await env.PUBLIC_KEY_LEASE_COORDINATOR.getByName(
    coordinatorName,
  ).fetch('https://public-key-lease/refresh', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ apiKey }),
  })
  if (!response.ok) return null
  return response.json<PublicKeyLease>()
}

export const retryAfterSeconds = (lease: PublicKeyLease, now = Date.now()) =>
  Math.max(1, Math.ceil(((lease.resetAt ?? lease.nextCheckAt) - now) / 1_000))
