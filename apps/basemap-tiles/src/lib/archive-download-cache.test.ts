import { expect, test } from 'bun:test'
import { ARCHIVE_CACHE_CHUNK_SIZE, type ArchiveCache } from './archive-download-cache'
import { routingArtifact } from './routing-artifacts'

const url = 'https://tiles.test/downloads/hk/2026-10-01.pmtiles'

function fixture(initial: Uint8Array = new Uint8Array([1, 2, 3])) {
  let bytes = initial
  let etag = 'first'
  let heads = 0
  let changedDuringRead = false
  const reads: R2GetOptions[] = []
  const saved = new Map<string, Response>()
  const cache: ArchiveCache = {
    match: async key => saved.get(String(key))?.clone(),
    put: async (key, response) => {
      saved.set(String(key), new Response(await response.arrayBuffer(), response))
    },
  }
  const metadata = () => ({ size: bytes.length, etag, httpEtag: `"${etag}"` })
  const bucket = {
    head: async () => {
      heads++
      return metadata()
    },
    get: async (_key: string, options: R2GetOptions) => {
      reads.push(options)
      if (changedDuringRead || (options.onlyIf as R2Conditional).etagMatches !== etag)
        return metadata()
      const { offset, length } = options.range as { offset: number; length: number }
      const response = new Response(bytes.slice(offset, offset + length))
      return {
        ...metadata(),
        body: response.body,
        arrayBuffer: () => response.arrayBuffer(),
      }
    },
  } as unknown as R2Bucket
  const env = { BUCKET: bucket, SOURCES: bucket }
  return {
    env,
    cache,
    saved,
    reads,
    heads: () => heads,
    changeDuringRead: () => {
      changedDuringRead = true
    },
    replace: (next: Uint8Array) => {
      bytes = next
      etag = 'second'
    },
    fetch: (request = new Request(url)) => routingArtifact(request, env, cache),
  }
}

test('large archives cache bounded chunks and ignore query parameters in cache identity', async () => {
  const bytes = new Uint8Array(ARCHIVE_CACHE_CHUNK_SIZE + 37).fill(42)
  const f = fixture(bytes)
  for (const requestUrl of [url, `${url}?utm_source=another`]) {
    const response = await f.fetch(new Request(requestUrl))
    expect(response?.headers.get('Cache-Control')).toBe('no-store')
    expect(response?.headers.get('Content-Length')).toBe(String(bytes.length))
    expect(Buffer.compare(Buffer.from(await response!.arrayBuffer()), bytes)).toBe(0)
  }
  expect(f.heads()).toBe(2)
  expect(f.reads).toEqual([
    {
      range: { offset: 0, length: ARCHIVE_CACHE_CHUNK_SIZE },
      onlyIf: { etagMatches: 'first' },
    },
    {
      range: { offset: ARCHIVE_CACHE_CHUNK_SIZE, length: 37 },
      onlyIf: { etagMatches: 'first' },
    },
  ])
  expect(f.saved.size).toBe(2)
  for (const response of f.saved.values()) {
    expect(response.headers.get('Cache-Control')).toBe(
      'public, max-age=31536000, immutable',
    )
    expect(Number(response.headers.get('Content-Length'))).toBeLessThanOrEqual(
      ARCHIVE_CACHE_CHUNK_SIZE,
    )
  }
})

test('replacement archives use new ETag cache keys and missing objects cannot use old chunks', async () => {
  const f = fixture()
  await (await f.fetch())!.arrayBuffer()
  f.replace(new Uint8Array([4, 5, 6]))
  expect(new Uint8Array(await (await f.fetch())!.arrayBuffer())).toEqual(
    new Uint8Array([4, 5, 6]),
  )
  expect(f.reads).toHaveLength(2)
  expect(f.saved.size).toBe(2)
  f.env.BUCKET.head = async () => null
  expect((await f.fetch())?.status).toBe(404)
})

test('cache failures fall back to R2 and replacement during a read fails instead of mixing bytes', async () => {
  const f = fixture()
  f.cache.match = async () => {
    throw new Error('cache unavailable')
  }
  f.cache.put = async () => {
    throw new Error('cache unavailable')
  }
  expect(new Uint8Array(await (await f.fetch())!.arrayBuffer())).toEqual(
    new Uint8Array([1, 2, 3]),
  )
  f.changeDuringRead()
  await expect((await f.fetch())!.arrayBuffer()).rejects.toThrow('Archive changed')
})

test('HEAD, conditional requests and rejected methods never read archive chunks', async () => {
  const f = fixture()
  for (const [request, status] of [
    [new Request(url, { method: 'HEAD' }), 200],
    [new Request(url, { headers: { 'If-None-Match': '"first"' } }), 304],
    [new Request(url, { headers: { Range: 'bytes=0-1' } }), 416],
    [new Request(url, { method: 'POST' }), 405],
  ] as const) {
    expect((await f.fetch(request))?.status).toBe(status)
  }
  expect(f.reads).toHaveLength(0)
  expect(f.saved.size).toBe(0)
})

test('Worker counts completed cache hits and misses, but not cancelled or conditional downloads', async () => {
  const { default: worker } = await import('../index')
  const f = fixture(new Uint8Array(ARCHIVE_CACHE_CHUNK_SIZE + 1))
  const points: unknown[] = []
  const env = {
    ...f.env,
    PRODUCT_USAGE: { writeDataPoint: (point: unknown) => points.push(point) },
  } as unknown as Parameters<typeof worker.fetch>[1]
  const ctx = { waitUntil: () => {} } as unknown as ExecutionContext
  const cacheGlobal = globalThis as typeof globalThis & { caches: CacheStorage }
  const previous = cacheGlobal.caches
  cacheGlobal.caches = { default: f.cache } as CacheStorage
  try {
    for (let i = 0; i < 2; i++) {
      const response = await worker.fetch(new Request(url), env, ctx)
      expect(points).toHaveLength(i)
      expect(response.headers.get('Cache-Control')).toBe('no-store')
      await response.arrayBuffer()
      expect(points).toHaveLength(i + 1)
    }
    expect(f.reads).toHaveLength(2)
    const cancelled = await worker.fetch(new Request(url), env, ctx)
    const reader = cancelled.body!.getReader()
    await reader.read()
    await reader.cancel()
    const conditional = await worker.fetch(
      new Request(url, {
        headers: { 'If-None-Match': '"first"' },
      }),
      env,
      ctx,
    )
    expect(conditional.status).toBe(304)
    expect(points).toHaveLength(2)
  } finally {
    cacheGlobal.caches = previous
  }
})
