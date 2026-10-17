import { expect, it } from 'vitest'
import type { MultiPolygon, Position } from 'geojson'
import {
  polygonPartForEdit,
  replaceEditedRing,
} from '../src/tools/division-areas/polygonPartSelection'
const rectangle = (x: number, y: number, size: number): Position[] => [
  [x, y],
  [x + size, y],
  [x + size, y + size],
  [x, y + size],
  [x, y],
]
const geometry: MultiPolygon = {
  type: 'MultiPolygon',
  coordinates: [
    [rectangle(114.2, 22.4, 0.001)],
    [rectangle(114.1, 22.4, 0.05), rectangle(114.11, 22.41, 0.001)],
  ],
}
it('edits the clicked part regardless of coordinate order', () => {
  expect(polygonPartForEdit(geometry, [114.12, 22.42])).toBe(1)
  expect(polygonPartForEdit(geometry, [114.2005, 22.4005])).toBe(0)
  expect(
    polygonPartForEdit(
      { ...geometry, coordinates: [...geometry.coordinates].reverse() },
      [114.12, 22.42],
    ),
  ).toBe(0)
})
it('defaults to the largest part for list selection and the nearest part for exterior clicks', () => {
  expect(polygonPartForEdit(geometry, null)).toBe(1)
  expect(polygonPartForEdit(geometry, [114.09999, 22.42])).toBe(1)
  expect(polygonPartForEdit(geometry, [114.20101, 22.4005])).toBe(0)
})
it('preserves other parts and holes when editing the selected ring', () => {
  const before = structuredClone(geometry)
  const ring = rectangle(114.1, 22.4, 0.06)
  const result = replaceEditedRing(geometry, 1, ring) as MultiPolygon
  expect(result.coordinates[1]![0]).toEqual(ring)
  expect(result.coordinates[1]![1]).toEqual(geometry.coordinates[1]![1])
  expect(result.coordinates[0]).toEqual(geometry.coordinates[0])
  expect(geometry).toEqual(before)
})
