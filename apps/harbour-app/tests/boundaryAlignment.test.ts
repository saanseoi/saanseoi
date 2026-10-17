import { it, expect } from 'vitest'
import {
  alignBoundary,
  BoundaryAlignmentError,
} from '../src/tools/division-areas/boundaryAlignment'
import type { Polygon } from 'geojson'
const box = (w: number, s: number, e: number, n: number): Polygon => ({
  type: 'Polygon',
  coordinates: [
    [
      [w, s],
      [e, s],
      [e, n],
      [w, n],
      [w, s],
    ],
  ],
})
const parent = box(114, 22, 114.01, 22.01)
it('aligns a contained child edge to its reference and adds shared nodes', () => {
  const child = box(114.00001, 22.002, 114.005, 22.008)
  const before = structuredClone(parent)
  const result = alignBoundary(parent, child, 'inside')
  expect(result.geometry.coordinates.flat(2)).toContain(114)
  expect(JSON.stringify(result.reference)).toContain('[114,22.002]')
  expect(parent).toEqual(before)
})
it('closes a narrow gap between differently levelled neighbours', () => {
  const result = alignBoundary(
    parent,
    box(114.01001, 22.002, 114.015, 22.008),
    'neighbour',
  )
  expect(JSON.stringify(result.geometry)).toContain('[114.01,22.002]')
})
it('clips a small child overshoot to exact inclusion', () => {
  const result = alignBoundary(
    parent,
    box(113.99999, 22.002, 114.005, 22.008),
    'inside',
  )
  expect(
    Math.min(...(result.geometry as Polygon).coordinates[0]!.map(p => p[0]!)),
  ).toBe(114)
})
it('rejects a wrong relationship rather than removing distant land', () => {
  expect(() =>
    alignBoundary(parent, box(114.005, 22.002, 114.015, 22.008), 'inside'),
  ).toThrow('more than 5 m')
})
it('identifies an invalid selected polygon and its topology fault', () => {
  const selfIntersecting: Polygon = {
    type: 'Polygon',
    coordinates: [
      [
        [114, 22],
        [114.01, 22.01],
        [114.01, 22],
        [114, 22.01],
        [114, 22],
      ],
    ],
  }
  try {
    alignBoundary(parent, selfIntersecting, 'inside')
    throw Error('Expected alignment to fail')
  } catch (error) {
    expect(error).toBeInstanceOf(BoundaryAlignmentError)
    expect(error).toMatchObject({
      coordinate: [114.005, 22.005],
      message:
        'Selected target polygon is invalid: Self-intersection at 114.0050000, 22.0050000.',
    })
  }
})

it('follows reference bends instead of leaving a straight shortcut', () => {
  const anchor: Polygon = {
    type: 'Polygon',
    coordinates: [
      [
        [114, 22],
        [114.01, 22],
        [114.01002, 22.005],
        [114.01, 22.01],
        [114, 22.01],
        [114, 22],
      ],
    ],
  }
  const target = box(114.010025, 22.002, 114.015, 22.008)
  const result = alignBoundary(anchor, target, 'neighbour')
  expect(JSON.stringify(result.geometry)).toContain('[114.01002,22.005]')
})
it('preserves an interior hole during containment alignment', () => {
  const child = box(114.00001, 22.002, 114.005, 22.008)
  child.coordinates.push(box(114.002, 22.004, 114.003, 22.005).coordinates[0]!)
  const result = alignBoundary(parent, child, 'inside')
  expect((result.geometry as Polygon).coordinates).toHaveLength(2)
})

it('does not disturb a detailed coastline that is already aligned', () => {
  const coastline: Polygon = {
    type: 'Polygon',
    coordinates: [
      [
        [114, 22],
        [114.01, 22],
        [114.01, 22.005],
        [114.00999, 22.00501],
        [114.01, 22.00502],
        [114.01, 22.01],
        [114, 22.01],
        [114, 22],
      ],
    ],
  }
  const result = alignBoundary(coastline, structuredClone(coastline), 'inside')
  // The narrow notch must survive rather than being snapped shut or removed.
  expect(JSON.stringify(result.geometry)).toContain('[114.00999,22.00501]')
})
