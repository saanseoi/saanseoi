import assert from 'node:assert/strict'
import test from 'node:test'
import { PbfReader } from 'pbf'
import { VectorTile } from '@mapbox/vector-tile'
import vectorTilePbf from 'vt-pbf'
import {
  filterInsideRegionLabels,
  isPointInRegion,
  type RegionBoundary,
} from './region-labels'

const HONG_KONG_BOUNDARY: RegionBoundary = {
  type: 'Feature' as const,
  properties: {},
  geometry: {
    type: 'Polygon' as const,
    coordinates: [
      [
        [113.94, 22.49],
        [113.946, 22.49],
        [113.946, 22.505],
        [113.94, 22.505],
        [113.94, 22.49],
      ],
    ],
  },
}

const EXTENT = 4096
const ZOOM = 14

function tilePoint(longitude: number, latitude: number) {
  const scale = EXTENT * 2 ** ZOOM
  const x = ((longitude + 180) / 360) * scale
  const y =
    ((1 - Math.asinh(Math.tan((latitude * Math.PI) / 180)) / Math.PI) / 2) * scale
  return {
    x: Math.floor(x / EXTENT),
    y: Math.floor(y / EXTENT),
    point: [Math.round(x % EXTENT), Math.round(y % EXTENT)],
  }
}

test('classifies the Shenzhen Bay Port enclave as Hong Kong', () => {
  assert.equal(isPointInRegion(HONG_KONG_BOUNDARY, [113.944, 22.495]), true)
  assert.equal(isPointInRegion(HONG_KONG_BOUNDARY, [113.95, 22.497]), false)
})

test('keeps only label features whose anchor is within the requested boundary', () => {
  const inside = tilePoint(113.944, 22.495)
  const outside = tilePoint(113.95, 22.497)
  assert.equal(inside.x, outside.x)
  assert.equal(inside.y, outside.y)

  const source = vectorTilePbf.fromGeojsonVt(
    {
      pois: {
        features: [
          { type: 1, geometry: [inside.point], tags: { name: 'Inside' } },
          { type: 1, geometry: [outside.point], tags: { name: 'Outside' } },
        ],
      },
    },
    { extent: EXTENT, version: 2 },
  )
  const sourceData = new ArrayBuffer(source.byteLength)
  new Uint8Array(sourceData).set(source)
  const filtered = filterInsideRegionLabels(
    sourceData,
    HONG_KONG_BOUNDARY,
    ZOOM,
    inside.x,
    inside.y,
    VectorTile,
    PbfReader,
    vectorTilePbf.fromVectorTileJs,
  )
  const result = new VectorTile(new PbfReader(filtered))
  const pois = result.layers.pois
  assert.ok(pois)

  assert.equal(pois.length, 1)
  assert.deepEqual(pois.feature(0).properties, {
    name: 'Inside',
    'saanseoi:inside_region': true,
  })
})
