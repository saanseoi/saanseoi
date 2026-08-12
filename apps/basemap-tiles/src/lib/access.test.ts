import assert from 'node:assert/strict'
import test from 'node:test'
import { createAccessToken } from '@repo/auth'
import {
  applyAccessHeaders,
  getAllowedOrigin,
  isUnmeteredOrigin,
  type OriginAccessConfig,
} from './access'
import { authenticateTileRequest } from './token-access'

const config: OriginAccessConfig = {
  DIAGNOSTIC_ORIGINS: 'https://maplibre.org',
  DEV_ORIGINS: 'http://localhost:5174',
  CORE_ORIGIN_SUFFIXES: '*.hype.hk,*.saanseoi.hk',
  HUB_ORIGINS: 'https://hype.hk,https://saanseoi.hk',
  PREVIEW_PREFIXES: 'preview.',
  EXTERNAL_ORIGINS: '',
}

test('allows configured, derived preview, and SaanSeoi origins', () => {
  assert.equal(getAllowedOrigin('https://maplibre.org', config), 'https://maplibre.org')
  assert.equal(
    getAllowedOrigin('https://preview.saanseoi.hk', config),
    'https://preview.saanseoi.hk',
  )
  assert.equal(
    getAllowedOrigin('https://maps.saanseoi.hk', config),
    'https://maps.saanseoi.hk',
  )
})

test('rejects malformed and lookalike origins', () => {
  assert.equal(getAllowedOrigin('not an origin', config), '')
  assert.equal(getAllowedOrigin('https://saanseoi.hk.example', config), '')
  assert.equal(getAllowedOrigin(null, config), '')
})

test('exposes Resource Timing only to an allowed origin', () => {
  const allowed = applyAccessHeaders(new Headers(), 'https://maps.saanseoi.hk')
  assert.equal(allowed.get('access-control-allow-origin'), 'https://maps.saanseoi.hk')
  assert.equal(allowed.get('timing-allow-origin'), 'https://maps.saanseoi.hk')
  assert.equal(allowed.get('vary'), 'Origin')

  const denied = applyAccessHeaders(new Headers(), '')
  assert.equal(denied.get('access-control-allow-origin'), null)
  assert.equal(denied.get('timing-allow-origin'), null)
  assert.equal(denied.get('vary'), 'Origin')
})

test('only configured first-party origins are unmetered', () => {
  assert.equal(isUnmeteredOrigin('https://saanseoi.hk', config), true)
  assert.equal(isUnmeteredOrigin('https://hype.hk:443', config), true)
  assert.equal(isUnmeteredOrigin('https://maps.saanseoi.hk', config), true)
  assert.equal(isUnmeteredOrigin('http://localhost:5174', config), true)
  assert.equal(isUnmeteredOrigin('https://preview.hype.hk', config), true)
  assert.equal(isUnmeteredOrigin('https://maplibre.org', config), true)
  assert.equal(isUnmeteredOrigin('https://hype.hk.example', config), false)
  assert.equal(isUnmeteredOrigin(null, config), false)
})

test('requires a production tiles token outside the unmetered browser origins', async () => {
  const keyPair = (await crypto.subtle.generateKey('Ed25519', true, [
    'sign',
    'verify',
  ])) as CryptoKeyPair
  const privateJwk = JSON.stringify(
    await crypto.subtle.exportKey('jwk', keyPair.privateKey),
  )
  const publicJwk = JSON.stringify(
    await crypto.subtle.exportKey('jwk', keyPair.publicKey),
  )
  const now = Math.floor(Date.now() / 1000)
  const token = await createAccessToken(
    {
      aud: 'basemap-tiles',
      env: 'production',
      exp: now + 15 * 60,
      iat: now,
      sub: 'key-123',
    },
    privateJwk,
  )
  const env = {
    ...config,
    ACCESS_TOKEN_PUBLIC_JWK: publicJwk,
    AUTH_MODE: 'required',
    ENVIRONMENT: 'production',
  } as Pick<
    CloudflareBindings,
    | 'ACCESS_TOKEN_PUBLIC_JWK'
    | 'AUTH_MODE'
    | 'ENVIRONMENT'
    | 'CORE_ORIGIN_SUFFIXES'
    | 'DIAGNOSTIC_ORIGINS'
    | 'DEV_ORIGINS'
    | 'HUB_ORIGINS'
    | 'PREVIEW_PREFIXES'
  >

  assert.deepEqual(
    await authenticateTileRequest(
      new Request('https://tiles.saanseoi.hk/hk-latest/0/0/0.mvt', {
        headers: {
          authorization: `Bearer ${token}`,
          origin: 'https://example.com',
        },
      }),
      env,
    ),
    {
      unmetered: false,
      claims: {
        aud: 'basemap-tiles',
        env: 'production',
        exp: now + 15 * 60,
        iat: now,
        sub: 'key-123',
      },
    },
  )
  assert.equal(
    await authenticateTileRequest(
      new Request('https://tiles.saanseoi.hk/hk-latest/0/0/0.mvt'),
      env,
    ),
    null,
  )
})
