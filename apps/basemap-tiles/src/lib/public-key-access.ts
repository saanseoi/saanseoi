import {
  isCurrentPublicKeyLease,
  publicApiKeyDigest,
  publicKeyLeaseStorageKey,
  readPublicApiKey,
  type PublicKeyLease,
} from '@repo/core/publicApiKey'

import { isUnmeteredOrigin } from './access'

const coordinatorName = 'all-public-keys'

type PublicKeyBindings = Pick<
  CloudflareBindings,
  | 'AUTH_MODE'
  | 'CORE_ORIGIN_SUFFIXES'
  | 'DIAGNOSTIC_ORIGINS'
  | 'DEV_ORIGINS'
  | 'HUB_ORIGINS'
  | 'PREVIEW_PREFIXES'
> & {
  PUBLIC_KEY_LEASE_COORDINATOR: DurableObjectNamespace
  PUBLIC_KEY_LEASES: KVNamespace
}

export const authenticatePublicKeyRequest = async (
  request: Request,
  env: PublicKeyBindings,
) => {
  if (
    String(env.AUTH_MODE) === 'disabled' ||
    isUnmeteredOrigin(request.headers.get('Origin'), env)
  ) {
    return { unmetered: true as const }
  }

  const apiKey = readPublicApiKey(request)
  if (!apiKey) return null
  const digest = await publicApiKeyDigest(apiKey)
  const storageKey = publicKeyLeaseStorageKey(digest)
  const cached = await env.PUBLIC_KEY_LEASES.get<PublicKeyLease>(storageKey, 'json')
  const lease =
    cached && isCurrentPublicKeyLease(cached) ? cached : await refreshLease(apiKey, env)
  return lease ? { unmetered: false as const, lease } : null
}

export const retryAfterSeconds = (lease: PublicKeyLease, now = Date.now()) =>
  Math.max(1, Math.ceil(((lease.resetAt ?? lease.nextCheckAt) - now) / 1_000))

const refreshLease = async (apiKey: string, env: PublicKeyBindings) => {
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
