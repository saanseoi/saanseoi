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
