export const publicApiKeyPattern = /^pk\.[A-Za-z0-9_-]{43}$/

export type PublicKeyLease = {
  keyId: string
  status: 'active' | 'exhausted'
  nextCheckAt: number
  resetAt?: number
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
  lease.nextCheckAt > now
