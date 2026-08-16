import { expect, test } from 'bun:test'

import { createGitHubAppJwt } from './githubApp.ts'

test('signs a JWT with GitHub’s Base64-encoded RSA PEM download', async () => {
  const keyPair = (await crypto.subtle.generateKey(
    {
      hash: 'SHA-256',
      modulusLength: 2048,
      name: 'RSASSA-PKCS1-v1_5',
      publicExponent: Uint8Array.of(1, 0, 1),
    },
    true,
    ['sign', 'verify'],
  )) as CryptoKeyPair
  const pkcs8 = await crypto.subtle.exportKey('pkcs8', keyPair.privateKey)
  if (!(pkcs8 instanceof ArrayBuffer))
    throw new Error('Expected a binary PKCS#8 private key.')
  const pkcs1 = extractPkcs1PrivateKey(pkcs8)
  const pem = `-----BEGIN RSA PRIVATE KEY-----\n${toBase64(pkcs1)}\n-----END RSA PRIVATE KEY-----\n`

  const jwt = await createGitHubAppJwt('123', btoa(pem))
  const [header, payload, signature] = jwt.split('.')
  if (!header || !payload || !signature) throw new Error('Expected a signed JWT.')

  expect(JSON.parse(new TextDecoder().decode(fromBase64Url(header)))).toEqual({
    alg: 'RS256',
    typ: 'JWT',
  })
  expect(JSON.parse(new TextDecoder().decode(fromBase64Url(payload))).iss).toBe('123')
  expect(
    await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      keyPair.publicKey,
      fromBase64Url(signature),
      new TextEncoder().encode(`${header}.${payload}`),
    ),
  ).toBe(true)
})

function extractPkcs1PrivateKey(value: ArrayBuffer) {
  const bytes = new Uint8Array(value)
  if (bytes[0] !== 0x30) throw new Error('Expected a PKCS#8 sequence.')
  let offset = readDerLength(bytes, 1).offset
  offset = skipDerValue(bytes, offset)
  offset = skipDerValue(bytes, offset)
  if (bytes[offset] !== 0x04)
    throw new Error('Expected a PKCS#8 private-key octet string.')
  const { length, offset: valueOffset } = readDerLength(bytes, offset + 1)
  return bytes.slice(valueOffset, valueOffset + length)
}

function skipDerValue(bytes: Uint8Array, offset: number) {
  return skipDerLength(bytes, offset + 1)
}

function skipDerLength(bytes: Uint8Array, offset: number) {
  const { length, offset: valueOffset } = readDerLength(bytes, offset)
  return valueOffset + length
}

function readDerLength(bytes: Uint8Array, offset: number) {
  const first = bytes[offset]
  if (first === undefined) throw new Error('Missing DER length.')
  if (first < 0x80) return { length: first, offset: offset + 1 }

  const octets = first & 0x7f
  let length = 0
  for (let index = 0; index < octets; index += 1)
    length = (length << 8) | (bytes[offset + 1 + index] ?? 0)
  return { length, offset: offset + 1 + octets }
}

function toBase64(bytes: Uint8Array) {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function fromBase64Url(value: string) {
  const padded =
    value.replaceAll('-', '+').replaceAll('_', '/') +
    '='.repeat((4 - (value.length % 4)) % 4)
  return Uint8Array.from(atob(padded), character => character.charCodeAt(0))
}
