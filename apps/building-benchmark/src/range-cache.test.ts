import { expect, test } from 'bun:test'
import { cachedRanges, CHUNK_BYTES } from './range-cache'

// Exercise byte boundaries and cross-request reuse with public deterministic source bytes.
test('aligned cache chunks preserve ranges, reuse nearby bytes and isolate run namespaces', async () => {
  const source = Uint8Array.from({ length: CHUNK_BYTES * 3 + 123 }, (_, i) => i % 251)
  const entries = new Map<string, Response>()
  const cache = {
    async match(request: Request) {
      return entries.get(request.url)?.clone()
    },
    async put(request: Request, response: Response) {
      entries.set(request.url, response.clone())
    },
  } as Cache
  const bucket = {
    async get(_key: string, options: { range: { offset: number; length: number } }) {
      const { offset, length } = options.range
      return { arrayBuffer: async () => source.slice(offset, offset + length).buffer }
    },
  } as R2Bucket
  const metrics = () => ({
    cacheHits: 0,
    cacheMisses: 0,
    cacheBytes: 0,
    rangeRequests: 0,
    rangeBytes: 0,
  })
  const first = metrics()
  const reader = cachedRanges(
    bucket,
    'release/landsd.fgb',
    cache,
    'first',
    'https://example.com',
    first,
  )
  expect(new Uint8Array(await reader.getRange(CHUNK_BYTES - 11, 100))).toEqual(
    source.slice(CHUNK_BYTES - 11, CHUNK_BYTES + 89),
  )
  expect(first.rangeRequests).toBe(2)
  const second = metrics()
  const shifted = cachedRanges(
    bucket,
    'release/landsd.fgb',
    cache,
    'first',
    'https://example.com',
    second,
  )
  expect(new Uint8Array(await shifted.getRange(CHUNK_BYTES - 5, 200))).toEqual(
    source.slice(CHUNK_BYTES - 5, CHUNK_BYTES + 195),
  )
  expect(second.cacheHits).toBe(2)
  expect(second.rangeRequests).toBe(0)
  const isolated = metrics()
  const other = cachedRanges(
    bucket,
    'release/landsd.fgb',
    cache,
    'other',
    'https://example.com',
    isolated,
  )
  expect(new Uint8Array(await other.getRange(CHUNK_BYTES * 3, 1000))).toEqual(
    source.slice(CHUNK_BYTES * 3),
  )
  expect(isolated.rangeRequests).toBe(1)
  expect(isolated.cacheHits).toBe(0)
})
