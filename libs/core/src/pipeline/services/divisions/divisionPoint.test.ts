import { expect, test } from 'bun:test'
import { canonicalDivisionPoint, createDivisionPointGuard } from './divisionPoint'
import type { GeoJsonGeometry } from '../../geojson'

const u: GeoJsonGeometry = {
  type: 'Polygon',
  coordinates: [
    [
      [0, 0],
      [6, 0],
      [6, 6],
      [4, 6],
      [4, 2],
      [2, 2],
      [2, 6],
      [0, 6],
      [0, 0],
    ],
  ],
}
const hole: GeoJsonGeometry = {
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

test('derives interior points for concave polygons, holes and disjoint parts', () => {
  const multi: GeoJsonGeometry = {
    type: 'MultiPolygon',
    coordinates: [
      u.coordinates as number[][][],
      (hole.coordinates as number[][][]).map(ring =>
        ring.map(([x, y]) => [x! + 20, y!]),
      ),
    ],
  } as GeoJsonGeometry
  for (const area of [u, hole, multi]) {
    const guard = createDivisionPointGuard()
    const point = canonicalDivisionPoint(area, { id: 'test', guard })
    expect(point?.type).toBe('Point')
    expect(canonicalDivisionPoint(point, { id: 'test', area })).toEqual(point)
    expect(guard.snapshot()[0]).toMatchObject({
      status: 'passed',
      checked: 1,
      failed: 0,
    })
  }
})
test('guards reject existing points outside, in holes, or on the boundary', () => {
  for (const coordinates of [
    [3, 4],
    [0, 0],
    [20, 20],
  ] as [number, number][]) {
    const guard = createDivisionPointGuard()
    expect(() =>
      canonicalDivisionPoint(
        { type: 'Point', coordinates },
        { id: 'test', area: u, guard },
      ),
    ).toThrow('outside the interior')
    expect(guard.snapshot()[0]).toMatchObject({ status: 'failed', failed: 1 })
  }
  expect(() =>
    canonicalDivisionPoint(
      { type: 'Point', coordinates: [5, 5] },
      { id: 'hole', area: hole },
    ),
  ).toThrow()
})
test('preserves supplied valid points and does not invent missing coordinates', () => {
  const point = { type: 'Point' as const, coordinates: [1, 1] as [number, number] }
  expect(canonicalDivisionPoint(point, { id: 'test', area: u })).toEqual(point)
  expect(canonicalDivisionPoint(null, { id: 'missing' })).toBeNull()
  expect(canonicalDivisionPoint(null, { id: 'derived', area: u })?.type).toBe('Point')
  expect(() =>
    canonicalDivisionPoint({ type: 'Point', coordinates: [NaN, 1] }, { id: 'invalid' }),
  ).toThrow()
})
