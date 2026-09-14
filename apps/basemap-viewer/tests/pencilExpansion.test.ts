import { describe, it, expect } from 'vitest'
import {
  expandPencilStroke,
  commitPencilRegions,
} from '../src/local-review/division-areas/pencilRegions'
import type { Polygon } from 'geojson'
const original: Polygon = {
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
describe('two-intersection polygon expansion', () => {
  it('adds the outside lobe and inserts both intersection nodes', () => {
    const result = expandPencilStroke(original, [
      [1, 0.5],
      [3, 0.5],
      [3, 1.5],
      [1, 1.5],
    ])
    expect(result.intersections).toEqual(
      expect.arrayContaining([
        [2, 0.5],
        [2, 1.5],
      ]),
    )
    expect(result.geometry?.type).toBe('Polygon')
    const ring = (result.geometry as Polygon).coordinates[0]!
    for (const point of [
      [0, 0],
      [2, 0],
      [2, 0.5],
      [3, 0.5],
      [3, 1.5],
      [2, 1.5],
      [2, 2],
      [0, 2],
    ])
      expect(ring).toContainEqual(point)
    expect(original.coordinates[0]).toHaveLength(5)
  })
  it('expands from boundary endpoints without requiring a closed stroke', () => {
    expect(
      expandPencilStroke(original, [
        [2, 0.5],
        [3, 0.5],
        [3, 1.5],
        [2, 1.5],
      ]).geometry,
    ).not.toBeNull()
  })
  it('waits for the second contact and rejects a non-expanding cut', () => {
    expect(
      expandPencilStroke(original, [
        [1, 0.5],
        [3, 0.5],
      ]).geometry,
    ).toBeNull()
    expect(
      expandPencilStroke(original, [
        [-1, 1],
        [3, 1],
      ]).geometry,
    ).toBeNull()
  })
  it('rejects a multiple-crossing replacement with no net area growth', () => {
    expect(
      expandPencilStroke(original, [
        [-1, 0.5],
        [3, 0.5],
        [3, 1.5],
        [-1, 1.5],
      ]).geometry,
    ).toBeNull()
  })
  it('preserves distant polygon parts', () => {
    const distant: Polygon = {
      type: 'Polygon',
      coordinates: [
        [
          [5, 5],
          [6, 5],
          [6, 6],
          [5, 6],
          [5, 5],
        ],
      ],
    }
    const result = expandPencilStroke(
      {
        type: 'MultiPolygon',
        coordinates: [original.coordinates, distant.coordinates],
      },
      [
        [2, 0.5],
        [3, 0.5],
        [3, 1.5],
        [2, 1.5],
      ],
    )
    expect(result.geometry?.type).toBe('MultiPolygon')
    expect(result.geometry?.coordinates).toHaveLength(2)
  })
})

it('expands the real Ma On Shan browser stroke', async () => {
  const { readFileSync } = await import('node:fs')
  const read = (path: string) =>
    JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'))
  const input = read('./pencilExpansionStroke.json').features[0]
  const seed = read('../../../fixtures/divisions/hk/stub-areas.json')
  const source = seed.features.find(
    (f: any) => f.properties.divisionId === input.properties.divisionId,
  )
  const result = expandPencilStroke(source.geometry, input.geometry.coordinates)
  expect(result.geometry).not.toBeNull()
  const points =
    result.geometry!.type === 'Polygon'
      ? result.geometry!.coordinates.flat()
      : result.geometry!.coordinates.flat(2)
  for (const intersection of result.intersections)
    expect(points).toContainEqual(intersection)
  const inventory = read(
    '../../../fixtures/divisions/hk/geographic-review-inventory.json',
  )
  const reference = read('../src/local-review/division-areas/reference-areas.json')
  const ids = new Set(
    inventory.divisions.filter((d: any) => d.level === 3).map((d: any) => d.id),
  )
  const records = new Map<string, any>(
    reference.features.map((f: any) => [f.properties.divisionId, f]),
  )
  for (const f of seed.features) records.set(f.properties.divisionId, f)
  const boundaries = [...records.values()]
    .filter(f => ids.has(f.properties.divisionId))
    .map(f => ({
      id: f.properties.divisionId,
      name: f.properties.divisionId,
      geometry: f.geometry,
    }))
  const regions: Polygon[] =
    result.geometry!.type === 'Polygon'
      ? [result.geometry!]
      : result.geometry!.coordinates.map(coordinates => ({
          type: 'Polygon',
          coordinates,
        }))
  expect(
    commitPencilRegions(regions, boundaries, input.properties.divisionId).geometry,
  ).toBeDefined()
})

it('replaces an old narrow protrusion instead of unioning it back into the outline', () => {
  const old: Polygon = {
    type: 'Polygon',
    coordinates: [
      [
        [0, 0],
        [2, 0],
        [2, 0.9],
        [2.03, 1],
        [2, 1.1],
        [2, 2],
        [0, 2],
        [0, 0],
      ],
    ],
  }
  const stroke = [
    [1, 0.2],
    [3, 0.2],
    [3, 0.8],
    [1.995, 0.8],
    [1.995, 1.2],
    [3, 1.2],
    [3, 1.8],
    [1, 1.8],
  ]
  const result = expandPencilStroke(old, stroke)
  expect(result.intersections).toHaveLength(4)
  const ring = (result.geometry as Polygon).coordinates[0]!
  expect(ring).not.toContainEqual([2.03, 1])
  expect(ring).toContainEqual([1.995, 0.8])
  expect(ring).toContainEqual([1.995, 1.2])
  for (const point of [
    [0, 0],
    [2, 0],
    [2, 2],
    [0, 2],
  ])
    expect(ring).toContainEqual(point)
  expect(old.coordinates[0]).toContainEqual([2.03, 1])
})

it('replaces the same sliver with reversed stroke and ring directions', () => {
  const ring = [
    [0, 0],
    [2, 0],
    [2, 0.9],
    [2.03, 1],
    [2, 1.1],
    [2, 2],
    [0, 2],
    [0, 0],
  ]
  const stroke = [
    [1, 0.2],
    [3, 0.2],
    [3, 0.8],
    [1.995, 0.8],
    [1.995, 1.2],
    [3, 1.2],
    [3, 1.8],
    [1, 1.8],
  ]
  for (const outline of [ring, [...ring].reverse()])
    for (const path of [stroke, [...stroke].reverse()]) {
      const result = expandPencilStroke(
        { type: 'Polygon', coordinates: [outline] },
        path,
      )
      expect(result.geometry).not.toBeNull()
      expect((result.geometry as Polygon).coordinates[0]).not.toContainEqual([2.03, 1])
    }
})

describe('expansion along shared road edges', () => {
  it.each([
    [
      [2, 0.2],
      [2, 0.5],
      [3, 0.5],
      [3, 1.5],
      [2, 1.5],
      [2, 1.8],
    ],
    [
      [1, 0.2],
      [2, 0.2],
      [2, 0.5],
      [3, 0.5],
      [3, 1.5],
      [1, 1.5],
    ],
    [
      [1, 0.5],
      [3, 0.5],
      [3, 1.5],
      [2, 1.5],
      [2, 1.8],
      [1, 1.8],
    ],
  ])('closes an outside lobe despite shared boundary stretches: %j', (...stroke) => {
    const result = expandPencilStroke(original, stroke)
    expect(result.geometry).not.toBeNull()
    const ring = (result.geometry as Polygon).coordinates[0]!
    for (const p of [
      [0, 0],
      [2, 0],
      [2, 2],
      [0, 2],
      [3, 0.5],
      [3, 1.5],
    ])
      expect(ring).toContainEqual(p)
    expect(
      commitPencilRegions([result.geometry as Polygon], [], 'selected').geometry,
    ).toBeDefined()
  })
  it('waits when the stroke only follows the existing edge', () => {
    expect(
      expandPencilStroke(original, [
        [2, 0.2],
        [2, 0.5],
        [2, 1.8],
      ]).geometry,
    ).toBeNull()
  })
})
