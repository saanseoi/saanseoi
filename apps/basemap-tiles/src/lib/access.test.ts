import assert from 'node:assert/strict'
import test from 'node:test'
import {
  applyAccessHeaders,
  getAllowedOrigin,
  isUnmeteredOrigin,
  type OriginAccessConfig,
} from './access'
import { authenticatePublicKeyRequest } from './public-key-access'
import worker from '../index'

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

test('requires a production public key outside the unmetered browser origins', async () => {
  const lease = {
    keyId: 'key-123',
    status: 'active' as const,
    nextCheckAt: Date.now() + 60_000,
  }
  const env = {
    ...config,
    AUTH_MODE: 'required',
    ENVIRONMENT: 'production',
    PUBLIC_KEY_LEASES: {
      get: async () => lease,
    },
    PUBLIC_KEY_LEASE_COORDINATOR: {},
  } as unknown as Parameters<typeof authenticatePublicKeyRequest>[1]

  assert.deepEqual(
    await authenticatePublicKeyRequest(
      new Request(
        'https://tiles.saanseoi.hk/hk-latest/0/0/0.mvt?access_token=pk.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        {
          headers: {
            origin: 'https://example.com',
          },
        },
      ),
      env,
    ),
    {
      unmetered: false,
      lease,
      originAllowed: true,
    },
  )
  assert.equal(
    await authenticatePublicKeyRequest(
      new Request('https://tiles.saanseoi.hk/hk-latest/0/0/0.mvt'),
      env,
    ),
    null,
  )
})

test('carries public-key origin policy to the tile edge', async () => {
  const lease = {
    keyId: 'key-123',
    status: 'active' as const,
    nextCheckAt: Date.now() + 60_000,
    originPolicy: {
      allowedHostnames: ['maps.example.com'],
      blockedHostnames: ['rogue.example.com'],
    },
  }
  const env = {
    ...config,
    AUTH_MODE: 'required',
    ENVIRONMENT: 'production',
    PUBLIC_KEY_LEASES: { get: async () => lease },
    PUBLIC_KEY_LEASE_COORDINATOR: {},
  } as unknown as Parameters<typeof authenticatePublicKeyRequest>[1]

  assert.deepEqual(
    await authenticatePublicKeyRequest(
      new Request(
        'https://tiles.saanseoi.hk/hk-latest/0/0/0.mvt?access_token=pk.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        { headers: { origin: 'https://rogue.example.com' } },
      ),
      env,
    ),
    { unmetered: false, lease, originAllowed: false },
  )
})

test('allows browser preflight for public-key headers', async () => {
  const response = await worker.fetch(
    new Request('https://tiles.saanseoi.hk/hk-latest.json', {
      method: 'OPTIONS',
      headers: { origin: 'https://example.com' },
    }),
    {
      ...config,
      AUTH_MODE: 'required',
      ENVIRONMENT: 'production',
      EXTERNAL_ORIGINS: '*',
    } as CloudflareBindings,
    { waitUntil: () => {} } as unknown as ExecutionContext,
  )

  assert.equal(response.status, 204)
  assert.equal(
    response.headers.get('access-control-allow-origin'),
    'https://example.com',
  )
  assert.match(
    response.headers.get('access-control-allow-headers') ?? '',
    /authorization/i,
  )
  assert.match(response.headers.get('access-control-allow-headers') ?? '', /x-api-key/i)
})
