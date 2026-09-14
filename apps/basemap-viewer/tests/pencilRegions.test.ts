import { describe, it, expect } from 'vitest'
import {
  calculatePencilRegions,
  commitPencilRegions,
} from '../src/local-review/division-areas/pencilRegions'
import { pencilPolygon } from '../src/local-review/division-areas/pencilGeometry'
import type { Polygon } from 'geojson'
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
  it('does not offer unrelated polygons and refuses unreviewed ownership changes', () => {
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
    expect(() => commitPencilRegions([box], boundaries, 'new')).toThrow(
      'overlaps Other division',
    )
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
  const inventory = read(
    '../../../fixtures/divisions/hk/geographic-review-inventory.json',
  )
  const reference = read('../src/local-review/division-areas/reference-areas.json')
  const stubs = read('../../../fixtures/divisions/hk/stub-areas.json')
  const ids = new Set(
    inventory.divisions
      .filter((d: { level: number }) => d.level === 3)
      .map((d: { id: string }) => d.id),
  )
  const records = new Map<string, any>(
    reference.features.map((f: any) => [f.properties.divisionId, f]),
  )
  for (const f of stubs.features) records.set(f.properties.divisionId, f)
  const boundaries = [...records.values()]
    .filter(f => ids.has(f.properties.divisionId))
    .map(f => ({
      id: f.properties.divisionId,
      name: f.properties.name ?? f.properties.divisionId,
      geometry: f.geometry,
    }))
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
