import { expect, test } from 'bun:test'
import {
  observeDownload,
  pinnedRelease,
  recordBasemapAccess,
  resolveLatestRelease,
} from './release-usage'

test('attributes only dated map data and archive downloads', () => {
  expect(pinnedRelease('/hongkong-2026-10-01/14/1/2.mvt')).toBe('hk/2026-10-01')
  expect(pinnedRelease('/macau-2026-08-01.json')).toBe('mo/2026-08-01')
  expect(pinnedRelease('/downloads/gba/2026-10-01.pmtiles')).toBe('gba/2026-10-01')
  for (const path of [
    '/hongkong-latest.json',
    '/render/hk/hongkong-2026-10-01-dark.webp',
    '/releases/hk/2026-10-01.json',
  ])
    expect(pinnedRelease(path)).toBeNull()
})
test('download completion fires once after consumption and never on cancellation', async () => {
  let count = 0
  const full = observeDownload(new Response('archive'), () => count++)
  expect(count).toBe(0)
  expect(await full.text()).toBe('archive')
  expect(count).toBe(1)
  const partial = observeDownload(
    new Response(
      new ReadableStream({
        pull(c) {
          c.enqueue(new Uint8Array([1]))
        },
      }),
    ),
    () => count++,
  )
  const reader = partial.body!.getReader()
  await reader.read()
  await reader.cancel()
  expect(count).toBe(1)
})
test('emits the common daily-rollup contract', () => {
  const points: unknown[] = []
  recordBasemapAccess(
    { writeDataPoint: point => points.push(point) },
    'hk/2026-10-01',
    '/hongkong-2026-10-01.json',
    'apiRequests',
    200,
  )
  expect(points).toHaveLength(1)
  const point = points[0] as { indexes: string[]; blobs: string[] }
  expect(point.indexes).toEqual(['api.access'])
  expect(point.blobs[5]).toBe('basemap_release')
  expect(point.blobs[6]).toBe('hk/2026-10-01')
  expect(point.blobs[10]).toBe('apiRequests')
})
test('resolves latest by the served archive ETag, including an older version pin', async () => {
  const bucket = {
    get: async () => ({
      json: async () => ({
        versions: [
          { version: '2026-10-01', key: 'basemap/hk/hongkong-2026-10-01.pmtiles' },
          { version: '2026-09-01', key: 'basemap/hk/hongkong-2026-09-01.pmtiles' },
        ],
      }),
    }),
    head: async (key: string) => ({
      etag: key.includes('2026-09') ? 'september-test-etag' : 'october-test-etag',
    }),
  } as unknown as Pick<R2Bucket, 'get' | 'head'>
  expect(
    await resolveLatestRelease(
      '/hongkong-latest/14/1/2.mvt',
      '"september-test-etag"',
      bucket,
    ),
  ).toBe('hk/2026-09-01')
  expect(
    await resolveLatestRelease('/hongkong-latest.json', 'unknown-test-etag', bucket),
  ).toBeNull()
})

test('worker counts public archive downloads but excludes range, HEAD and rejected methods', async () => {
  const { default: worker } = await import('../index')
  const points: unknown[] = []
  const env = {
    AUTH_MODE: 'required',
    PRODUCT_USAGE: { writeDataPoint: (point: unknown) => points.push(point) },
    BUCKET: {
      get: async (key: string) =>
        key.endsWith('regions.json')
          ? { json: async () => ({ regions: [{ code: 'hk', name: 'hongkong' }] }) }
          : {
              body: new Response('archive').body,
              size: 7,
              httpEtag: '"archive-etag"',
            },
    },
  } as unknown as Parameters<typeof worker.fetch>[1]
  const ctx = { waitUntil: () => {} } as unknown as ExecutionContext
  const url = 'https://tiles.saanseoi.hk/downloads/hk/2026-10-01.pmtiles'
  const response = await worker.fetch(new Request(url), env, ctx)
  expect(response.status).toBe(200)
  expect(points).toHaveLength(0)
  expect(await response.text()).toBe('archive')
  expect(points).toHaveLength(1)
  expect(
    (
      await worker.fetch(
        new Request(url, { headers: { Range: 'bytes=0-1' } }),
        env,
        ctx,
      )
    ).status,
  ).toBe(416)
  const head = await worker.fetch(new Request(url, { method: 'HEAD' }), env, ctx)
  expect(head.status).toBe(200)
  expect(head.headers.get('Content-Length')).toBe('7')
  expect(await head.text()).toBe('')
  expect(
    (await worker.fetch(new Request(url, { method: 'POST' }), env, ctx)).status,
  ).toBe(405)
  expect(points).toHaveLength(1)
})
