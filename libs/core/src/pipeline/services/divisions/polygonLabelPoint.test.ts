import { expect, test } from 'bun:test'
import { polygonLabelPoint } from './polygonLabelPoint'
import { canonicalDivisionPoint } from './divisionPoint'
import type { Polygon, MultiPolygon } from 'geojson'
import type { GeoJsonGeometry } from '../../geojson'

const crescent: Polygon = {
  type: 'Polygon',
  coordinates: [
    [
      [0, 0],
      [6, 0],
      [6, 1],
      [1, 1],
      [1, 6],
      [0, 6],
      [0, 0],
    ],
  ],
}
const hole: Polygon = {
  type: 'Polygon',
  coordinates: [
    [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
      [0, 0],
    ],
    [
      [2, 2],
      [2, 8],
      [8, 8],
      [8, 2],
      [2, 2],
    ],
  ],
}
test('generated labels stay strictly inside concave and holed polygons', () => {
  for (const area of [crescent, hole]) {
    const point = { type: 'Point' as const, coordinates: polygonLabelPoint(area) }
    expect(
      canonicalDivisionPoint(point, { id: 'label', area: area as GeoJsonGeometry }),
    ).toEqual(point)
    expect(point.coordinates.every(value => value > 0)).toBe(true)
  }
  const [x, y] = polygonLabelPoint(crescent)
  expect(x).toBeGreaterThan(0.5)
  expect(y).toBeGreaterThan(0.5)
  expect(x).toBeLessThan(1)
  expect(y).toBeLessThan(1)
})
test('generated labels use the largest component rather than the space between parts', () => {
  const area: MultiPolygon = {
    type: 'MultiPolygon',
    coordinates: [
      [
        [
          [20, 20],
          [20.1, 20],
          [20.1, 20.1],
          [20, 20.1],
          [20, 20],
        ],
      ],
      crescent.coordinates,
    ],
  }
  expect(polygonLabelPoint(area)).toEqual(polygonLabelPoint(crescent))
})

test('uses the bounds centre when it is strictly inside the largest part', () => {
  const triangle: Polygon = {
    type: 'Polygon',
    coordinates: [
      [
        [0, 0],
        [8, 0],
        [6, 6],
        [0, 0],
      ],
    ],
  }
  expect(polygonLabelPoint(triangle)).toEqual([4, 3])
})
