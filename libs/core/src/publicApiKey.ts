export const publicApiKeyPattern = /^pk\.[A-Za-z0-9_-]{43}$/

export type PublicKeyLease = {
  keyId: string
  status: 'active' | 'exhausted'
  nextCheckAt: number
  resetAt?: number
  originPolicy?: {
    allowedHostnames: string[]
    blockedHostnames: string[]
  }
}

export type PublicKeyUsage =
  | { status: 'active' }
  | { status: 'exhausted'; resetAt: number }

/** The edge could not verify a stale public key because its lease source failed. */
export class PublicKeyLeaseUnavailableError extends Error {
  constructor() {
    super('Public API key validation is temporarily unavailable')
    this.name = 'PublicKeyLeaseUnavailableError'
  }
}

export const readPublicApiKey = (request: Request) => {
  const header = request.headers.get('x-api-key')
  const query = new URL(request.url).searchParams.get('access_token')
  const key = header ?? query
  return key && publicApiKeyPattern.test(key) ? key : null
}

export const publicApiKeyDigest = async (key: string) => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key))
  return [...new Uint8Array(digest)]
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('')
}

export const publicKeyLeaseStorageKey = (keyDigest: string) =>
  `public-key-lease:${keyDigest}`

/**
 * Each key has its own coordinator so usage writes for a busy key are
 * serialised without making unrelated keys wait for one another.
 */
export const publicKeyLeaseCoordinatorName = (keyDigest: string) =>
  `public-key:${keyDigest}`

type PublicKeyLeaseCoordinatorNamespace = {
  getByName(name: string): {
    fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>
  }
}

export const consumePublicKeyUsage = async (
  apiKey: string,
  coordinator: PublicKeyLeaseCoordinatorNamespace,
): Promise<PublicKeyUsage> => {
  try {
    const digest = await publicApiKeyDigest(apiKey)
    const response = await coordinator
      .getByName(publicKeyLeaseCoordinatorName(digest))
      .fetch('https://public-key-lease/consume', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ apiKey }),
      })
    if (!response.ok) throw new PublicKeyLeaseUnavailableError()
    const usage = await response.json<unknown>()
    if (!isPublicKeyUsage(usage)) throw new PublicKeyLeaseUnavailableError()
    return usage
  } catch (error) {
    if (error instanceof PublicKeyLeaseUnavailableError) throw error
    throw new PublicKeyLeaseUnavailableError()
  }
}

export const isCurrentPublicKeyLease = (lease: PublicKeyLease, now = Date.now()) =>
  isPublicKeyLease(lease) && lease.nextCheckAt > now

export const isPublicKeyLease = (value: unknown): value is PublicKeyLease => {
  if (typeof value !== 'object' || value === null) return false
  const lease = value as Record<string, unknown>
  const originPolicy = lease.originPolicy
  const validOriginPolicy =
    originPolicy === undefined ||
    (typeof originPolicy === 'object' &&
      originPolicy !== null &&
      hasStringArray((originPolicy as Record<string, unknown>).allowedHostnames) &&
      hasStringArray((originPolicy as Record<string, unknown>).blockedHostnames))
  return (
    typeof lease.keyId === 'string' &&
    (lease.status === 'active' || lease.status === 'exhausted') &&
    typeof lease.nextCheckAt === 'number' &&
    Number.isFinite(lease.nextCheckAt) &&
    (lease.resetAt === undefined ||
      (typeof lease.resetAt === 'number' && Number.isFinite(lease.resetAt))) &&
    validOriginPolicy
  )
}

export const isPublicKeyUsage = (value: unknown): value is PublicKeyUsage => {
  if (typeof value !== 'object' || value === null) return false
  const usage = value as Record<string, unknown>
  return (
    usage.status === 'active' ||
    (usage.status === 'exhausted' &&
      typeof usage.resetAt === 'number' &&
      Number.isFinite(usage.resetAt))
  )
}

const hasStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every(item => typeof item === 'string')

export const isPublicKeyOriginAllowed = (
  lease: PublicKeyLease,
  origin: string | null,
) => {
  const policy = lease.originPolicy
  if (!policy) return true
  const hostname = publicKeyOriginHostname(origin)
  if (hostname && policy.blockedHostnames.includes(hostname)) return false
  return (
    policy.allowedHostnames.length === 0 ||
    (hostname !== null && policy.allowedHostnames.includes(hostname))
  )
}

const publicKeyOriginHostname = (origin: string | null) => {
  if (!origin) return null
  try {
    const url = new URL(origin)
    return url.protocol === 'http:' || url.protocol === 'https:'
      ? url.hostname.toLowerCase()
      : null
  } catch {
    return null
  }
}
