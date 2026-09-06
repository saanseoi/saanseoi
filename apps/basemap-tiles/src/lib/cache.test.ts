import { afterEach, expect, test } from 'bun:test'
import { ResponseCache } from './cache'
import { applyAccessHeaders } from './access'

const originalCaches = globalThis.caches
afterEach(() => {
  globalThis.caches = originalCaches
})

test('errors are neither retained nor served by the tile cache', async () => {
  for (const status of [400, 401, 403, 404, 429, 500, 503]) {
    const writes: unknown[] = []
    const deletions: unknown[] = []
    globalThis.caches = {
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
