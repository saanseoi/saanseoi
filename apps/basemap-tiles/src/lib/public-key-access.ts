import {
  isCurrentPublicKeyLease,
  isPublicKeyOriginAllowed,
  isPublicKeyLease,
  publicApiKeyDigest,
  PublicKeyLeaseUnavailableError,
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

  try {
    const apiKey = readPublicApiKey(request)
    if (!apiKey) return null
    const digest = await publicApiKeyDigest(apiKey)
    const storageKey = publicKeyLeaseStorageKey(digest)
    const cached = await env.PUBLIC_KEY_LEASES.get<PublicKeyLease>(storageKey, 'json')
    const lease =
      cached && isCurrentPublicKeyLease(cached)
        ? cached
        : await refreshLease(apiKey, env)
    return lease
      ? {
          unmetered: false as const,
          lease,
          originAllowed: isPublicKeyOriginAllowed(lease, request.headers.get('Origin')),
        }
      : null
  } catch (error) {
    if (error instanceof PublicKeyLeaseUnavailableError) throw error
    throw new PublicKeyLeaseUnavailableError()
  }
}

const refreshLease = async (apiKey: string, env: PublicKeyBindings) => {
  const response = await env.PUBLIC_KEY_LEASE_COORDINATOR.getByName(
    coordinatorName,
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
}
