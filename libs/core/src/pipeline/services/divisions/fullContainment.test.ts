import { expect, test } from 'bun:test'
import type { Polygon, MultiPolygon } from 'geojson'
import { createFullContainmentAnnotator } from './fullContainment'
import { containmentGeometryHash } from './containmentGeometry'

const box = (west: number, south: number, east: number, north: number): Polygon => ({
  type: 'Polygon',
  coordinates: [
    [
      [west, south],
      [east, south],
      [east, north],
      [west, north],
      [west, south],
    ],
  ],
})
const relation = (
  child: Array<Polygon | MultiPolygon>,
  parent: Array<Polygon | MultiPolygon>,
) =>
  createFullContainmentAnnotator(
    new Map([
      ['child', child],
      ['parent', parent],
    ]),
  )('child', { full: [[{ id: 'parent', class: 'district', name: null }]] }).full[0]![0]!

test('whole-area containment includes equal polygons and shared boundaries', () => {
  for (const child of [box(0, 0, 5, 5), box(0, 0, 10, 10)])
    expect(relation([child], [box(0, 0, 10, 10)]).full_containment).toBe(true)
  expect(relation([box(0, 0, 11, 5)], [box(0, 0, 10, 10)]).full_containment).toBe(false)
})

test('a parent hole excludes a child even when all child vertices lie inside the parent', () => {
  const parent = box(0, 0, 10, 10)
  parent.coordinates.push(box(4, 4, 6, 6).coordinates[0]!)
  expect(relation([box(2, 2, 8, 8)], [parent]).full_containment).toBe(false)
  const child = box(2, 2, 8, 8)
  child.coordinates.push(box(4, 4, 6, 6).coordinates[0]!)
  expect(relation([child], [parent]).full_containment).toBe(true)
})

test('edges crossing a concavity cannot be mistaken for full containment', () => {
  const parent: Polygon = {
    type: 'Polygon',
    coordinates: [
      [
        [0, 0],
        [10, 0],
        [10, 10],
        [6, 10],
        [6, 4],
        [4, 4],
        [4, 10],
        [0, 10],
        [0, 0],
      ],
    ],
  }
  expect(relation([box(2, 2, 8, 8)], [parent]).full_containment).toBe(false)
})

test('all disconnected child parts and the union of parent rows participate', () => {
  const a = box(0, 0, 2, 2),
    b = box(8, 0, 10, 2)
  expect(relation([a, b], [a]).full_containment).toBe(false)
  expect(relation([a, b], [b, a]).full_containment).toBe(true)
  expect(relation([box(0, 0, 10, 2)], [a, b]).full_containment).toBe(false)
  expect(
    relation([box(0, 0, 10, 2)], [box(0, 0, 5, 2), box(5, 0, 10, 2)]).full_containment,
  ).toBe(true)
  expect(containmentGeometryHash([a, b])).toBe(
    containmentGeometryHash([
      {
        type: 'MultiPolygon',
        coordinates: [b.coordinates, a.coordinates],
      },
    ]),
  )
})

test('missing, empty and invalid geometry produce unknown and clear stale evidence', () => {
  const invalid: Polygon = {
    type: 'Polygon',
    coordinates: [
      [
        [0, 0],
        [4, 4],
        [0, 4],
        [4, 0],
        [0, 0],
      ],
    ],
  }
  for (const child of [[], [invalid], [{ type: 'Polygon' as const, coordinates: [] }]])
    expect(relation(child, [box(0, 0, 10, 10)])).toMatchObject({
      full_containment: null,
    })
  const hierarchy = {
    full: [
      [
        {
          id: 'parent',
          name: null,
          class: 'district',
          full_containment: true,
          containment_geometry: { division: 'old', ancestor: 'old' },
        },
      ],
    ],
  }
  const result = createFullContainmentAnnotator(new Map())('child', hierarchy)
  expect(result.full[0]![0]!.full_containment).toBeNull()
  expect(result.full[0]![0]!.containment_geometry).toBeUndefined()
  expect(hierarchy.full[0]![0]!.full_containment).toBe(true)
})
