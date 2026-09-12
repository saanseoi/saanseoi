import { expect, test } from 'bun:test'
import { archiveVersionForRequest, isLatestRequest } from './index'
import { tileBodyCacheKey } from './lib/cache'

test('allows archive-versioned latest requests to use the edge cache', () => {
  expect(isLatestRequest('hong-kong-latest', false, 'archive-etag')).toBe(false)
})

test('keeps unversioned latest resources and latest renders dynamic', () => {
  expect(isLatestRequest('hong-kong-latest', false, null)).toBe(true)
  expect(isLatestRequest('hong-kong-2026-08-13', false, null)).toBe(false)
  expect(isLatestRequest('hong-kong-2026-08-13', true, 'archive-etag')).toBe(true)
})

test('pins latest tile PMTiles metadata to the advertised archive version', () => {
  expect(
    archiveVersionForRequest('hong-kong-latest', [0, 0, 0], undefined, 'etag'),
  ).toBe('etag')
  expect(
    archiveVersionForRequest('hong-kong-latest', [0, 0, 0], 'head-etag', 'etag'),
  ).toBe('head-etag')
  expect(
    archiveVersionForRequest('hong-kong-2026-08-13', [0, 0, 0], undefined, 'etag'),
  ).toBeUndefined()
})

test('shares authenticated tile cache entries while retaining version pins', () => {
  const firstCacheKey = tileBodyCacheKey(
    new Request(
      'https://tiles.saanseoi.hk/hong-kong-2026-08-13/8/219/111.mvt?v=archive-etag&access_token=pk.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa&scale=2',
    ),
  )

  expect(firstCacheKey).toBe(
    'https://tiles.saanseoi.hk/hong-kong-2026-08-13/8/219/111.mvt?v=archive-etag&scale=2',
  )
  expect(
    tileBodyCacheKey(
      new Request(
        'https://tiles.saanseoi.hk/hong-kong-2026-08-13/8/219/111.mvt?v=archive-etag&access_token=pk.bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb&scale=2',
      ),
    ),
  ).toBe(firstCacheKey)
})
