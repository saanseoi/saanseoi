import assert from 'node:assert/strict'
import test from 'node:test'
import { VectorTile } from '@mapbox/vector-tile'
import { TileType } from 'pmtiles'
import { PbfReader } from 'pbf'
import vectorTilePbf from 'vt-pbf'
import { mock } from 'bun:test'

const source = vectorTilePbf.fromGeojsonVt(
  {
    places: {
      features: [
        { type: 1, geometry: [[2048, 2048]], tags: { name: 'Inside' } },
        { type: 1, geometry: [[3072, 2048]], tags: { name: 'Outside' } },
      ],
    },
  },
  { extent: 4096, version: 2 },
)
const sourceData = new ArrayBuffer(source.byteLength)
new Uint8Array(sourceData).set(source)

mock.module('./lib/pmtiles', () => ({
  openPmtiles: () => ({
    getHeader: async () => ({ minZoom: 0, maxZoom: 0, tileType: TileType.Mvt }),
    getZxy: async () => ({ data: sourceData }),
  }),
}))

const worker = (await import('./index')).default

test('serves boundary-filtered MVT labels through the Worker route', async () => {
  const reads: string[] = []
  const objects = new Map<string, unknown>([
    [
      'basemap/regions.json',
      {
        regions: [
          {
            code: 'test-region',
            name: 'test-region',
            description: 'Test region',
          },
        ],
      },
    ],
    [
      'basemap/test-region/test-region-2026-08-06.boundary.geojson',
      {
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [-1, -1],
              [1, -1],
              [1, 1],
              [-1, 1],
              [-1, -1],
            ],
          ],
        },
      },
    ],
  ])
  const bucket = {
    async get(key: string) {
      reads.push(key)
      const value = objects.get(key)
      return value === undefined ? null : { json: async () => value }
    },
  }
  const env: CloudflareBindings = {
    ACCESS_TOKEN_PUBLIC_JWK: '',
    AUTH_MODE: 'required',
    BUCKET: bucket as R2Bucket,
    CACHE_CONTROL: 'public, max-age=31536000, immutable',
    CORE_ORIGIN_SUFFIXES: '*.hype.hk,*.type.hk,*.saanseoi.hk',
    DEV_ORIGINS: 'http://localhost:5173,http://localhost:5174',
    DIAGNOSTIC_ORIGINS:
      'https://maplibre.org,https://pmtiles.io,https://protomaps.github.io',
    ENVIRONMENT: 'production',
    EXTERNAL_ORIGINS: '*',
    HUB_ORIGINS: 'https://hype.hk,https://breadline.hk,https://hkghostsigns.com',
    PREVIEW_PREFIXES: 'preview.',
    PUBLIC_HOSTNAME: 'tiles.saanseoi.hk',
    TILE_RATE_LIMIT: { limit: async () => ({ success: true }) },
    TILE_USAGE: { writeDataPoint() {} },
  }

  Object.assign(globalThis, {
    caches: {
      default: {
        match: async () => undefined,
        put: async () => undefined,
        delete: async () => true,
      },
    },
  })
  const pending: Promise<unknown>[] = []
  const ctx = {
    waitUntil(promise: Promise<unknown>) {
      pending.push(promise)
    },
  } as ExecutionContext

  const response = await worker.fetch(
    new Request(
      'https://tiles.example/test-region-2026-08-06/0/0/0.mvt?labels=inside',
      { headers: { Origin: 'https://maps.saanseoi.hk' } },
    ),
    env,
    ctx,
  )
  await Promise.all(pending)

  assert.equal(response.status, 200)
  assert.equal(response.headers.get('content-type'), 'application/x-protobuf')
  assert.equal(response.headers.get('cache-control'), 'public, max-age=300')
  assert.deepEqual(reads, [
    'basemap/regions.json',
    'basemap/test-region/test-region-2026-08-06.boundary.geojson',
  ])

  const result = new VectorTile(new PbfReader(await response.arrayBuffer()))
  const places = result.layers.places
  assert.ok(places)
  assert.equal(places.length, 1)
  assert.deepEqual(places.feature(0).properties, {
    name: 'Inside',
    'saanseoi:inside_region': true,
  })
})
