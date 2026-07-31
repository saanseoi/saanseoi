export type TokenAudience = 'atlas-api' | 'basemap-tiles'

export type AccessTokenClaims = {
  aud: TokenAudience
  env: string
  exp: number
  iat: number
  sub: string
}

const encoder = new TextEncoder()
const decoder = new TextDecoder()
const MAX_TOKEN_LIFETIME_SECONDS = 15 * 60
const MAX_CLOCK_SKEW_SECONDS = 60

const encode = (value: Uint8Array) =>
  btoa(String.fromCharCode(...value))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '')

const decode = (value: string) => {
  const padded = value.replaceAll('-', '+').replaceAll('_', '/')
  const binary = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, '='))
  return Uint8Array.from(binary, character => character.charCodeAt(0))
}

const importKey = (jwk: string, usages: ('sign' | 'verify')[]) =>
  crypto.subtle.importKey(
    'jwk',
    JSON.parse(jwk) as JsonWebKey,
    'Ed25519',
    false,
    usages,
  )

const parseClaims = (value: string): AccessTokenClaims | null => {
  try {
    const claims = JSON.parse(
      decoder.decode(decode(value)),
    ) as Partial<AccessTokenClaims>
    return (claims.aud === 'atlas-api' || claims.aud === 'basemap-tiles') &&
      typeof claims.env === 'string' &&
      typeof claims.exp === 'number' &&
      typeof claims.iat === 'number' &&
      typeof claims.sub === 'string'
      ? (claims as AccessTokenClaims)
      : null
  } catch {
    return null
  }
}

const hasExpectedHeader = (value: string) => {
  try {
    const header = JSON.parse(decoder.decode(decode(value))) as {
      alg?: unknown
      typ?: unknown
    }
    return header.alg === 'EdDSA' && header.typ === 'JWT'
  } catch {
    return false
  }
}

export const createAccessToken = async (
  claims: AccessTokenClaims,
  privateJwk: string,
): Promise<string> => {
  const header = encode(encoder.encode(JSON.stringify({ alg: 'EdDSA', typ: 'JWT' })))
  const payload = encode(encoder.encode(JSON.stringify(claims)))
  const signingInput = `${header}.${payload}`
  const signature = await crypto.subtle.sign(
    'Ed25519',
    await importKey(privateJwk, ['sign']),
    encoder.encode(signingInput),
  )
  return `${signingInput}.${encode(new Uint8Array(signature))}`
}

export const verifyAccessToken = async (
  token: string,
  publicJwk: string,
  audience: TokenAudience,
  environment: string,
): Promise<AccessTokenClaims | null> => {
  const [header, payload, signature, extra] = token.split('.')
  if (!header || !payload || !signature || extra) return null
  if (!hasExpectedHeader(header)) return null
  const claims = parseClaims(payload)
  if (!claims || claims.aud !== audience || claims.env !== environment) return null
  const now = Math.floor(Date.now() / 1000)
  if (
    claims.exp <= now ||
    claims.iat > now + MAX_CLOCK_SKEW_SECONDS ||
    claims.exp <= claims.iat ||
    claims.exp - claims.iat > MAX_TOKEN_LIFETIME_SECONDS
  ) {
    return null
  }
  try {
    const valid = await crypto.subtle.verify(
      'Ed25519',
      await importKey(publicJwk, ['verify']),
      decode(signature),
      encoder.encode(`${header}.${payload}`),
    )
    return valid ? claims : null
  } catch {
    return null
  }
}
