const GITHUB_APP_JWT_LIFETIME_SECONDS = 540

/** Creates an installation-token JWT from GitHub's Base64-encoded PEM download. */
export async function createGitHubAppJwt(appId: string, privateKeyBase64: string) {
  const issuedAt = Math.floor(Date.now() / 1000) - 60
  const signingInput = [
    base64UrlEncode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })),
    base64UrlEncode(
      JSON.stringify({
        exp: issuedAt + GITHUB_APP_JWT_LIFETIME_SECONDS,
        iat: issuedAt,
        iss: appId,
      }),
    ),
  ].join('.')
  const key = await crypto.subtle.importKey(
    'pkcs8',
    githubAppPrivateKeyToPkcs8(privateKeyBase64),
    { hash: 'SHA-256', name: 'RSASSA-PKCS1-v1_5' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(signingInput),
  )
  return `${signingInput}.${base64UrlEncode(signature)}`
}

function githubAppPrivateKeyToPkcs8(value: string) {
  const decoded = atob(value.replace(/\s/g, ''))
  if (decoded.startsWith('-----BEGIN RSA PRIVATE KEY-----'))
    return pkcs1ToPkcs8(pemToDer(decoded))
  if (decoded.startsWith('-----BEGIN PRIVATE KEY-----')) return pemToDer(decoded)
  return binaryToArrayBuffer(decoded)
}

function pemToDer(value: string) {
  const pemBody = value
    .replace(/^-----BEGIN (?:RSA )?PRIVATE KEY-----\s*/, '')
    .replace(/\s*-----END (?:RSA )?PRIVATE KEY-----\s*$/, '')
    .replace(/\s/g, '')
  return binaryToArrayBuffer(atob(pemBody))
}

function pkcs1ToPkcs8(value: ArrayBuffer) {
  const privateKey = new Uint8Array(value)
  const algorithmIdentifier = Uint8Array.of(
    0x30,
    0x0d,
    0x06,
    0x09,
    0x2a,
    0x86,
    0x48,
    0x86,
    0xf7,
    0x0d,
    0x01,
    0x01,
    0x01,
    0x05,
    0x00,
  )
  const privateKeyOctetString = concatBytes(
    Uint8Array.of(0x04),
    derLength(privateKey.length),
    privateKey,
  )
  const body = concatBytes(
    Uint8Array.of(0x02, 0x01, 0x00),
    algorithmIdentifier,
    privateKeyOctetString,
  )
  return concatBytes(Uint8Array.of(0x30), derLength(body.length), body).buffer
}

function derLength(length: number) {
  if (length < 0x80) return Uint8Array.of(length)

  const octets: number[] = []
  for (let remaining = length; remaining > 0; remaining >>= 8)
    octets.unshift(remaining & 0xff)
  return Uint8Array.of(0x80 | octets.length, ...octets)
}

function concatBytes(...parts: Uint8Array[]) {
  const result = new Uint8Array(parts.reduce((length, part) => length + part.length, 0))
  let offset = 0
  for (const part of parts) {
    result.set(part, offset)
    offset += part.length
  }
  return result
}

function binaryToArrayBuffer(value: string) {
  return Uint8Array.from(value, character => character.charCodeAt(0)).buffer
}

function base64UrlEncode(value: ArrayBuffer | string) {
  const bytes =
    typeof value === 'string' ? new TextEncoder().encode(value) : new Uint8Array(value)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}
