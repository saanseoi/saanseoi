import { expect, test } from 'vitest'
import { removeInteriorRings } from '../src/tools/division-areas/removeInteriorRings'
import type { MultiPolygon, Polygon } from 'geojson'

const outer = [
  [0, 0],
  [4, 0],
  [4, 4],
  [0, 4],
  [0, 0],
]
const hole = [
  [1, 1],
  [2, 1],
  [2, 2],
  [1, 2],
  [1, 1],
]

test('fills every interior ring without altering outer boundaries', () => {
  const polygon: Polygon = { type: 'Polygon', coordinates: [outer, hole] }
  const multiPolygon: MultiPolygon = {
    type: 'MultiPolygon',
    coordinates: [
      [outer, hole],
      [
        [
          [5, 0],
          [6, 0],
          [6, 1],
          [5, 1],
          [5, 0],
        ],
        hole,
      ],
    ],
  }

  expect(removeInteriorRings(polygon)).toEqual({
    geometry: { type: 'Polygon', coordinates: [outer] },
    removedHoleCount: 1,
  })
  expect(removeInteriorRings(multiPolygon)).toEqual({
    geometry: {
      type: 'MultiPolygon',
      coordinates: [
        [outer],
        [
          [
            [5, 0],
            [6, 0],
            [6, 1],
            [5, 1],
            [5, 0],
          ],
        ],
      ],
    },
    removedHoleCount: 2,
  })
})
