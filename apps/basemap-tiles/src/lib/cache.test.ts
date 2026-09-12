import { afterEach, expect, test } from 'bun:test'
import { ResponseCache } from './cache'
import { applyAccessHeaders } from './access'

const cacheGlobal = globalThis as typeof globalThis & { caches: CacheStorage }
const originalCaches = cacheGlobal.caches
afterEach(() => {
  cacheGlobal.caches = originalCaches
})

test('errors are neither retained nor served by the tile cache', async () => {
  for (const status of [400, 401, 403, 404, 429, 500, 503]) {
    const writes: unknown[] = []
    const deletions: unknown[] = []
    cacheGlobal.caches = {
      default: {
        match: async () => new Response('old error', { status }),
        delete: async (key: unknown) => {
          deletions.push(key)
          return true
        },
        put: async (...args: unknown[]) => {
          writes.push(args)
        },
      },
    } as unknown as CacheStorage
    const cache = new ResponseCache({
      request: new Request('https://tiles.example/hk-dated/0/0/0.mvt'),
      env: { CACHE_CONTROL: 'public, max-age=31536000, immutable' },
      ctx: { waitUntil: () => {} } as unknown as ExecutionContext,
      allowedOrigin: '',
      latestRequest: false,
    })
    expect(await cache.match()).toBeUndefined()
    expect(deletions).toHaveLength(1)
    expect(
      cache.response('error', new Headers(), status).headers.get('cache-control'),
    ).toBe('no-store')
    expect(writes).toHaveLength(0)
  }
})

test('cached origin headers are cleared for a caller without an allowed origin', () => {
  const headers = applyAccessHeaders(
    new Headers({
      'Access-Control-Allow-Origin': 'https://old.example',
      'Timing-Allow-Origin': 'https://old.example',
      Vary: 'Accept-Encoding',
    }),
    '',
  )
  expect(headers.get('access-control-allow-origin')).toBeNull()
  expect(headers.get('timing-allow-origin')).toBeNull()
  expect(headers.get('vary')).toBe('Accept-Encoding, Origin')
})

test('successful tile bodies remain cacheable with access headers set per caller', async () => {
  let retained: Response | undefined
  const pending: Promise<unknown>[] = []
  cacheGlobal.caches = {
    default: {
      match: async () => retained?.clone(),
      put: async (_key: unknown, response: Response) => {
        retained = response
      },
    },
  } as unknown as CacheStorage
  const options = {
    request: new Request('https://tiles.example/hk-dated/0/0/0.mvt'),
    env: { CACHE_CONTROL: 'public, max-age=31536000, immutable' as const },
    ctx: {
      waitUntil: (promise: Promise<unknown>) => pending.push(promise),
    } as unknown as ExecutionContext,
    latestRequest: false,
  }
  const first = new ResponseCache({
    ...options,
    allowedOrigin: 'https://first.example',
  })
  expect(
    first
      .response('tile body', new Headers(), 200)
      .headers.get('access-control-allow-origin'),
  ).toBe('https://first.example')
  await Promise.all(pending)
  const second = await new ResponseCache({
    ...options,
    allowedOrigin: 'https://second.example',
  }).match()
  expect(await second?.text()).toBe('tile body')
  expect(second?.headers.get('cache-control')).toBe(options.env.CACHE_CONTROL)
  expect(second?.headers.get('access-control-allow-origin')).toBe(
    'https://second.example',
  )
  const denied = await new ResponseCache({ ...options, allowedOrigin: '' }).match()
  expect(denied?.headers.get('access-control-allow-origin')).toBeNull()
})
