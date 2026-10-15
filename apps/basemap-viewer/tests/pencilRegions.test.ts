import { describe, it, expect } from 'vitest'
import {
  calculatePencilRegions,
  commitPencilRegions,
  sameLevelOverlapWarnings,
} from '../src/local-review/division-areas/pencilRegions'
import { pencilPolygon } from '../src/local-review/division-areas/pencilGeometry'
import type { Polygon } from 'geojson'
import type { PencilBoundary } from '../src/local-review/division-areas/pencilRegions'
import reviewFixture from './fixtures/pencilReviewBoundaries.json'
const box: Polygon = {
  type: 'Polygon',
  coordinates: [
    [
      [0, 0],
      [2, 0],
      [2, 2],
      [0, 2],
      [0, 0],
    ],
  ],
}
describe('pencil linework regions', () => {
  it('nodes a bow-tie stroke into two valid regions', () => {
    const result = calculatePencilRegions(
      [
        [
          [0, 0],
          [2, 2],
          [0, 2],
          [2, 0],
          [0, 0],
        ],
      ],
      [],
    )
    expect(result.regions).toHaveLength(2)
    for (const region of result.regions) {
      expect(region.coordinates[0]).toContainEqual([1, 1])
      expect(() => pencilPolygon(region.coordinates[0]!)).not.toThrow()
    }
  })
  it('splits an existing ring with an open stroke and preserves the input', () => {
    const boundaries = [{ id: 'a', name: 'A', geometry: box }]
    const result = calculatePencilRegions(
      [
        [
          [-1, 1],
          [3, 1],
        ],
      ],
      boundaries,
    )
    expect(result.regions).toHaveLength(2)
    for (const region of result.regions) {
      expect(region.coordinates[0]).toContainEqual([0, 1])
      expect(region.coordinates[0]).toContainEqual([2, 1])
    }
    expect(box.coordinates[0]).toHaveLength(5)
  })
  it('inserts shared intersection vertices into neighbouring saved boundaries', () => {
    const boundaries = [{ id: 'neighbour', name: 'Neighbour', geometry: box }]
    const result = calculatePencilRegions(
      [
        [
          [0, 0.5],
          [-1, 0.5],
          [-1, 1.5],
          [0, 1.5],
        ],
      ],
      boundaries,
    )
    const region = result.regions.find(g => g.coordinates[0]!.some(p => p[0] === -1))!
    const saved = commitPencilRegions([region], boundaries, 'new')
    expect(saved.boundaries[0]!.geometry.coordinates[0]).toContainEqual([0, 0.5])
    expect(saved.boundaries[0]!.geometry.coordinates[0]).toContainEqual([0, 1.5])
    expect(box.coordinates[0]).toHaveLength(5)
  })
  it('does not offer unrelated polygons and warns without blocking overlapping drawings', () => {
    const boundaries = [{ id: 'other', name: 'Other division', geometry: box }]
    expect(
      calculatePencilRegions(
        [
          [
            [10, 10],
            [11, 11],
          ],
        ],
        boundaries,
      ).regions,
    ).toHaveLength(0)
    expect(commitPencilRegions([box], boundaries, 'new').overlaps).toEqual([
      { id: 'other', name: 'Other division' },
    ])
  })
  it('supports multiple strokes and retains holes', () => {
    const strokes = [
      [
        [0, 0],
        [3, 0],
        [3, 3],
      ],
      [
        [3, 3],
        [0, 3],
        [0, 0],
      ],
      [
        [1, 1],
        [2, 1],
        [2, 2],
        [1, 2],
        [1, 1],
      ],
    ]
    const result = calculatePencilRegions(strokes, [])
    expect(result.regions).toHaveLength(2)
    expect(result.regions.some(r => r.coordinates.length === 2)).toBe(true)
  })
})

it('saves the retained browser crossing among real review boundaries', async () => {
  const { readFileSync } = await import('node:fs')
  const read = (path: string) =>
    JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'))
  const input = read('./pencilBrowserStroke.json')
  const boundaries = reviewFixture.boundaries as PencilBoundary[]
  const before = structuredClone(boundaries)
  const result = calculatePencilRegions(
    input.features.map((f: any) => f.geometry.coordinates),
    boundaries,
  )
  const upper = result.regions.find(g => g.coordinates[0]!.every(p => p[1]! > 22.4279))!
  expect(upper).toBeDefined()
  const saved = commitPencilRegions(
    [upper],
    boundaries,
    input.features[0].properties.divisionId,
  )
  expect(saved.geometry.type).toBe('Polygon')
  expect(boundaries).toEqual(before)
  for (const b of saved.boundaries)
    expect(b.geometry).toEqual(before.find(old => old.id === b.id)!.geometry)
})

it('marks both overlapping polygons only at the same level and clears resolved warnings', () => {
  const box = {
    type: 'Polygon' as const,
    coordinates: [
      [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
        [0, 0],
      ],
    ],
  }
  const a = { id: 'a', name: 'A', level: 4, geometry: box }
  const b = { id: 'b', name: 'B', level: 4, geometry: box }
  expect(sameLevelOverlapWarnings([a, b])).toEqual(
    new Map([
      ['a', ['B']],
      ['b', ['A']],
    ]),
  )
  expect(sameLevelOverlapWarnings([a, { ...b, level: 3 }]).size).toBe(0)
  const adjacent = {
    type: 'Polygon' as const,
    coordinates: [
      [
        [1, 0],
        [2, 0],
        [2, 1],
        [1, 1],
        [1, 0],
      ],
    ],
  }
  expect(sameLevelOverlapWarnings([a, { ...b, geometry: adjacent }]).size).toBe(0)
})
