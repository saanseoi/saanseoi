import { expect, test } from 'bun:test'

import type { GeoJsonGeometry, GeoJsonPosition } from '@repo/core/pipeline/geojson'

import { simplifyPolygonCoverage } from './simplifyPolygonCoverage.ts'

test('simplifies a shared coverage edge once for both polygons', async () => {
  const geometries: GeoJsonGeometry[] = [
    {
      type: 'Polygon',
      coordinates: [
        [
          [0, 0],
          [5, 0],
          [5, 1],
          [4.8, 2],
          [5.2, 3],
          [5, 4],
          [5, 5],
          [0, 5],
          [0, 0],
        ],
      ],
    },
    {
      type: 'Polygon',
      coordinates: [
        [
          [5, 0],
          [10, 0],
          [10, 5],
          [5, 5],
          [5, 4],
          [5.2, 3],
          [4.8, 2],
          [5, 1],
          [5, 0],
        ],
      ],
    },
  ]

  const { geometries: simplifiedGeometries } = await simplifyPolygonCoverage(
    geometries,
    0.5,
  )
  const [left, right] = simplifiedGeometries
  expect(left).toBeDefined()
  expect(right).toBeDefined()
  expect(sharedSegments(left!, right!).length).toBeGreaterThan(0)
})

function sharedSegments(left: GeoJsonGeometry, right: GeoJsonGeometry) {
  const leftSegments = new Set(segmentKeys(left))
  return segmentKeys(right)
    .filter(segment => leftSegments.has(segment))
    .sort()
}

function segmentKeys(geometry: GeoJsonGeometry) {
  if (geometry.type !== 'Polygon') {
    throw new Error('Test geometry must be a Polygon.')
  }
  return geometry.coordinates.flatMap(ring =>
    ring.slice(1).map((position, index) => segmentKey(ring[index]!, position)),
  )
}

function segmentKey(first: GeoJsonPosition, second: GeoJsonPosition) {
  const [a, b] = [first.join(','), second.join(',')].sort()
  return `${a}|${b}`
}
