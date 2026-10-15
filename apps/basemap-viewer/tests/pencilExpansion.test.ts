import { describe, it, expect } from 'vitest'
import {
  expandPencilStroke,
  commitPencilRegions,
} from '../src/local-review/division-areas/pencilRegions'
import type { Polygon } from 'geojson'
import type { PencilBoundary } from '../src/local-review/division-areas/pencilRegions'
import reviewFixture from './fixtures/pencilReviewBoundaries.json'
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
  const seed = read(
    '../../../fixtures/meta/curations/saanseoi-division/division-geometry.json',
  )
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
  const boundaries = reviewFixture.boundaries as PencilBoundary[]
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

it('automatically resolves a crossed expansion into the face retaining the main polygon', () => {
  const stroke = [
    [2, 0.2],
    [3, 1.5],
    [3, 0.5],
    [2, 1.8],
  ]
  for (const path of [stroke, [...stroke].reverse()]) {
    const before = structuredClone(path)
    const result = expandPencilStroke(original, path)
    expect(result.geometry?.type).toBe('Polygon')
    const ring = (result.geometry as Polygon).coordinates[0]!
    for (const p of [
      [0, 0],
      [2, 0],
      [2, 2],
      [0, 2],
    ])
      expect(ring).toContainEqual(p)
    // The crossing is noded; the loop beyond it is not saved as a detached island.
    expect(ring.some(p => p[0]! > 2)).toBe(true)
    expect(ring).not.toContainEqual([3, 1.5])
    expect(
      commitPencilRegions([result.geometry as Polygon], [], 'selected').geometry,
    ).toBeDefined()
    expect(path).toEqual(before)
  }
})

it('preserves holes and reports neighbour overlap after resolving crossings', () => {
  const hole = [
    [0.2, 0.2],
    [0.2, 0.4],
    [0.4, 0.4],
    [0.4, 0.2],
    [0.2, 0.2],
  ]
  const result = expandPencilStroke(
    { type: 'Polygon', coordinates: [original.coordinates[0]!, hole] },
    [
      [2, 0.2],
      [3, 1.5],
      [3, 0.5],
      [2, 1.8],
    ],
  )
  expect(result.geometry?.type).toBe('Polygon')
  expect((result.geometry as Polygon).coordinates).toHaveLength(2)
  expect(
    commitPencilRegions(
      [result.geometry as Polygon],
      [
        {
          id: 'neighbour',
          name: 'Neighbour',
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [2, 0.8],
                [2.2, 0.8],
                [2.2, 1.2],
                [2, 1.2],
                [2, 0.8],
              ],
            ],
          },
        },
      ],
      'selected',
    ).overlaps,
  ).toEqual([{ id: 'neighbour', name: 'Neighbour' }])
})
