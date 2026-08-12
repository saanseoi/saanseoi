import {
  isCurrentPublicKeyLease,
  isPublicKeyLease,
  publicApiKeyDigest,
  publicKeyLeaseCoordinatorName,
  PublicKeyLeaseUnavailableError,
  publicKeyLeaseStorageKey,
  type PublicKeyLease,
} from '@repo/core/publicApiKey'

export type PublicKeyLeaseBindings = {
  PUBLIC_KEY_LEASE_COORDINATOR: DurableObjectNamespace
  PUBLIC_KEY_LEASES: KVNamespace
}

export const resolvePublicKeyLease = async (
  apiKey: string,
  env: PublicKeyLeaseBindings,
): Promise<PublicKeyLease | null> => {
  try {
    const digest = await publicApiKeyDigest(apiKey)
    const storageKey = publicKeyLeaseStorageKey(digest)
    const cached = await env.PUBLIC_KEY_LEASES.get<PublicKeyLease>(storageKey, 'json')
    if (cached && isCurrentPublicKeyLease(cached)) return cached

    const response = await env.PUBLIC_KEY_LEASE_COORDINATOR.getByName(
      publicKeyLeaseCoordinatorName(digest),
    ).fetch('https://public-key-lease/refresh', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ apiKey }),
    })
    if (response.status === 401) return null
    if (!response.ok) throw new PublicKeyLeaseUnavailableError()
    const lease = await response.json<unknown>()
    if (!isPublicKeyLease(lease)) throw new PublicKeyLeaseUnavailableError()
    return lease
  } catch (error) {
    if (error instanceof PublicKeyLeaseUnavailableError) throw error
    throw new PublicKeyLeaseUnavailableError()
  }
}

export const retryAfterSeconds = (lease: PublicKeyLease, now = Date.now()) =>
  Math.max(1, Math.ceil(((lease.resetAt ?? lease.nextCheckAt) - now) / 1_000))
