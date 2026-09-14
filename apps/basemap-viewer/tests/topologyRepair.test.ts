import { describe, expect, it } from 'vitest'
import type { Polygon, Position } from 'geojson'
import {
  cleanStubGeometriesForLevel,
  GeometryCleanupError,
  type RoadFeatureCollection,
} from '../src/local-review/division-areas/geometryTools'
import type {
  ReviewInventory,
  StubAreas,
} from '../../../libs/core/src/pipeline/services/divisions/geographicReview'

const polygon = (ring: Position[]): Polygon => ({
  type: 'Polygon',
  coordinates: [ring],
})
const box = (w: number, e: number) =>
  polygon([
    [w, 0],
    [e, 0],
    [e, 1],
    [w, 1],
    [w, 0],
  ])
const inventory: ReviewInventory = {
  schemaVersion: 1,
  region: 'hk',
  domain: 'geographic',
  cohort: 'test',
  releaseSet: 'test',
  divisions: ['a', 'b', 'c'].map(id => ({
    id,
    names: { en: `Polygon ${id}` },
    level: 4,
    category: 'locality',
    class: 'neighbourhood',
    point: null,
    hierarchies: { administrative: [], locality: [], full: [], landform: [] },
  })),
}
const stubs = (...geometries: Polygon[]): StubAreas => ({
  type: 'FeatureCollection',
  schemaVersion: 1,
  region: 'hk',
  domain: 'geographic',
  cohort: 'test',
  variant: 'stub',
  features: geometries.map((geometry, i) => ({
    type: 'Feature',
    geometry,
    properties: { divisionId: ['a', 'b', 'c'][i]!, variant: 'stub' },
  })),
})
const land = (geometry = box(-1, 3)) => ({
  type: 'FeatureCollection' as const,
  features: [{ type: 'Feature' as const, properties: {}, geometry }],
})
const road = (x: number): RoadFeatureCollection => ({
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'LineString',
        coordinates: [
          [x, 0],
          [x, 1],
        ],
      },
    },
  ],
})
const points = (data: StubAreas, i = 0) => {
  const g = data.features[i]!.geometry
  return g.type === 'Polygon' ? g.coordinates.flat() : g.coordinates.flat(2)
}
const run = (data: StubAreas, roads?: RoadFeatureCollection) =>
  cleanStubGeometriesForLevel(data, inventory, land(), 4, roads)

describe('unsimplified topology repair', () => {
  it('keeps short edges and non-consecutive vertices, removing only consecutive duplicates and fixing closure', () => {
    const input = stubs(
      polygon([
        [0, 0],
        [1, 0],
        [1, 0.5],
        [1, 0.5000000001],
        [1, 1],
        [0, 1],
        [0, 1],
      ]),
    )
    const result = run(input).stubs
    for (const p of input.features[0]!.geometry.coordinates[0]!)
      expect(points(result)).toContainEqual(p)
    expect(points(result)).toHaveLength(7)
    expect(input.features[0]!.geometry.coordinates[0]!).toHaveLength(7)
  })
  it('nodes a T junction and gives both neighbours the same collinear nodes', () => {
    const result = run(
      stubs(
        box(0, 1),
        polygon([
          [1, 0],
          [2, 0],
          [2, 1],
          [1, 1],
          [1, 0.5],
          [1, 0],
        ]),
      ),
    ).stubs
    expect(points(result, 0)).toContainEqual([1, 0.5])
    expect(points(result, 1)).toContainEqual([1, 0.5])
    const edges = (i: number) =>
      points(result, i)
        .slice(1)
        .map((p, j) => [points(result, i)[j]!, p])
    for (const edge of edges(0).filter(e => e.every(p => p[0] === 1)))
      expect(edges(1)).toContainEqual([...edge].reverse())
  })
  it('snaps one shared chain to a single street without changing vertex order or coverage', () => {
    const shared: Position[] = [
      [1, 0],
      [1.00002, 0.25],
      [1.00002, 0.5],
      [1.00002, 0.75],
      [1, 1],
    ]
    const input = stubs(
      polygon([[0, 0], ...shared, [0, 1], [0, 0]]),
      polygon([...shared.slice().reverse(), [2, 0], [2, 1], shared.at(-1)!]),
    )
    const result = run(input, road(1)).stubs
    for (const y of [0.25, 0.5, 0.75]) {
      expect(points(result, 0)).toContainEqual([1, y])
      expect(points(result, 1)).toContainEqual([1, y])
    }
    expect(
      points(result, 0)
        .slice(1)
        .filter(p => p[0]! > 0 && p[0]! < 2)
        .map(p => p[1]),
    ).toEqual([1, 0.75, 0.5, 0.25, 0])
  })
  it('leaves an entire chain alone if one vertex is beyond 5 metres', () => {
    const shared: Position[] = [
      [1, 0],
      [1.00002, 0.25],
      [1.00006, 0.5],
      [1, 1],
    ]
    const result = run(
      stubs(
        polygon([[0, 0], ...shared, [0, 1], [0, 0]]),
        polygon([...shared.slice().reverse(), [2, 0], [2, 1], shared.at(-1)!]),
      ),
      road(1),
    ).stubs
    expect(points(result)).toContainEqual([1.00002, 0.25])
    expect(points(result)).toContainEqual([1.00006, 0.5])
  })
  it('does not jump between two nearby street centrelines', () => {
    const input = stubs(box(0, 1), box(1, 2))
    const result = run(input, {
      type: 'FeatureCollection',
      features: [...road(0.99998).features, ...road(1.00002).features],
    }).stubs
    expect(points(result).every(p => p[0] === 0 || p[0] === 1)).toBe(true)
  })
  it('retains authoritative coastline detail and water holes', () => {
    const coast = polygon([
      [0, 0],
      [2, 0],
      [2, 1],
      [1, 1],
      [1, 0.99999],
      [0.99999, 1],
      [0, 1],
      [0, 0],
    ])
    coast.coordinates.push([
      [0.2, 0.2],
      [0.2, 0.3],
      [0.3, 0.3],
      [0.3, 0.2],
      [0.2, 0.2],
    ])
    const result = cleanStubGeometriesForLevel(
      stubs(box(0, 2)),
      inventory,
      land(coast),
      4,
      road(0),
    ).stubs
    expect(points(result)).toContainEqual([1, 0.99999])
    expect(points(result)).toContainEqual([0.99999, 1])
    expect(result.features[0]!.geometry.coordinates).toHaveLength(2)
  })
  it('keeps intentional gaps and diagnoses missing explicitly intended coverage', () => {
    const input = stubs(box(0, 0.99999), box(1, 2))
    expect(points(run(input).stubs)).toContainEqual([0.99999, 1])
    try {
      cleanStubGeometriesForLevel(input, inventory, land(), 4, undefined, box(0, 2))
      throw Error('expected failure')
    } catch (error) {
      expect(error).toBeInstanceOf(GeometryCleanupError)
      expect((error as GeometryCleanupError).category).toBe('shared boundary')
      expect((error as GeometryCleanupError).coordinates.length).toBeGreaterThan(0)
    }
  })
  it('validates an older processed polygon using its saved shape as a preserved baseline', () => {
    const input = stubs(box(0, 1))
    input.features[0]!.properties.geometryCleanup = 'old-simplifier'
    const before = structuredClone(input)
    const result = run(input).stubs.features[0]!
    expect(result.geometry).toEqual(run(stubs(box(0, 1))).stubs.features[0]!.geometry)
    expect(result.properties.geometryWorkingBaseline).toMatchObject({
      geometry: input.features[0]!.geometry,
      processing: { geometryCleanup: 'old-simplifier' },
    })
    expect(result.properties.geometryOriginalDrawing).toBeUndefined()
    expect(input).toEqual(before)
  })
  it('reports the actual self-intersection and leaves source unchanged', () => {
    const input = stubs(
        polygon([
          [0, 0],
          [1, 1],
          [0, 1],
          [1, 0],
          [0, 0],
        ]),
      ),
      before = structuredClone(input)
    try {
      run(input)
      throw Error('expected failure')
    } catch (error) {
      const e = error as GeometryCleanupError
      expect(e.category).toBe('invalid ring')
      expect(e.coordinates).toContainEqual([0.5, 0.5])
    }
    expect(input).toEqual(before)
  })
  it('revalidates an entire current-version collection and is deterministic on reruns', () => {
    const first = run(stubs(box(0, 1), box(1, 2))).stubs
    expect(run(first).stubs).toEqual(first)
    expect(run(first).changedCount).toBe(0)
  })
})

describe('separate later simplification', () => {
  it('retains an unsimplified source and cleanup restores removed nodes', async () => {
    const { simplifyCleanedGeometries } = await import(
      '../src/local-review/division-areas/simplificationTools'
    )
    const input = stubs(
      box(0, 1),
      polygon([
        [1, 0],
        [2, 0],
        [2, 1],
        [1, 1],
        [1, 0.5],
        [1, 0],
      ]),
    )
    const cleaned = run(input).stubs
    const simplified = simplifyCleanedGeometries(cleaned, inventory, 4, 1)
    expect(points(simplified)).not.toContainEqual([1, 0.5])
    expect(points(simplified, 1)).not.toContainEqual([1, 0.5])
    expect(cleaned.features[0]!.properties.geometrySimplification).toBeUndefined()
    const restored = run(simplified).stubs
    expect(points(restored)).toContainEqual([1, 0.5])
    expect(points(restored, 1)).toContainEqual([1, 0.5])
    expect(restored.features[0]!.properties.geometrySimplification).toBeUndefined()
  })
  it('preserves edits to simplified output as the new working baseline', async () => {
    const { simplifyCleanedGeometries } = await import(
      '../src/local-review/division-areas/simplificationTools'
    )
    const simplified = simplifyCleanedGeometries(
      run(stubs(box(0, 1), box(1, 2))).stubs,
      inventory,
      4,
      1,
    )
    const g = simplified.features[0]!.geometry as Polygon
    g.coordinates[0]![1]![0]! += 0.00001
    const result = run(simplified).stubs.features[0]!
    expect(result.properties.geometryWorkingBaseline).toMatchObject({ geometry: g })
    expect(result.properties.geometrySimplification).toBeUndefined()
  })
})

describe('saved drawing baseline', () => {
  it('uses the current drawing even if a publisher source has a different shape', async () => {
    const { restoreUnsimplifiedCleanupSources } = await import(
      '../src/local-review/division-areas/cleanupSources'
    )
    const input = stubs(box(0, 1))
    input.features[0]!.properties.geometryCleanup = 'old-simplifier'
    input.features[0]!.properties.sourceAreaId = 'source-a'
    for (const sources of [
      [],
      [
        {
          type: 'Feature' as const,
          id: 'source-a',
          geometry: box(0, 2),
          properties: { divisionId: 'a', variant: 'publisher' },
        },
      ],
    ]) {
      const prepared = restoreUnsimplifiedCleanupSources(input, inventory, sources, 4)
      expect(prepared.features[0]!.geometry).toEqual(input.features[0]!.geometry)
      expect(run(prepared).stubs.features[0]!.geometry).toEqual(
        run(stubs(box(0, 1))).stubs.features[0]!.geometry,
      )
    }
    expect(input.features[0]!.properties.geometryCleanup).toBe('old-simplifier')
  })
})

describe('hand-drawn originals', () => {
  it('keeps the raw drawing through cleanup, simplification, export and future cleanup versions', async () => {
    const { simplifyCleanedGeometries } = await import(
      '../src/local-review/division-areas/simplificationTools'
    )
    const { restoreUnsimplifiedCleanupSources } = await import(
      '../src/local-review/division-areas/cleanupSources'
    )
    const input = stubs(box(0, 1), box(1, 2))
    const cleaned = run(input).stubs
    expect(cleaned.features[0]!.properties.geometryOriginalDrawing).toEqual(
      input.features[0]!.geometry,
    )
    const again = run(cleaned).stubs
    expect(again.features[0]!.properties.geometryOriginalDrawing).toEqual(
      input.features[0]!.geometry,
    )
    const exported = JSON.parse(
      JSON.stringify(simplifyCleanedGeometries(again, inventory, 4, 1)),
    )
    for (const feature of exported.features)
      feature.properties.geometryCleanup = 'previous-cleanup-version'
    const recovered = restoreUnsimplifiedCleanupSources(exported, inventory, [], 4)
    expect(recovered.features.map(f => f.geometry)).toEqual(
      input.features.map(f => f.geometry),
    )
    expect(recovered.features[0]!.properties.geometrySimplification).toBeUndefined()
    expect(
      run(recovered).stubs.features[0]!.properties.geometryOriginalDrawing,
    ).toEqual(input.features[0]!.geometry)
  })
})

describe('curved street snapping', () => {
  it('adds road bend nodes to both sides of a two-node shared boundary', () => {
    const result = run(stubs(box(0, 1), box(1, 2)), {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates: [
              [1, 0],
              [1.00002, 0.25],
              [0.99998, 0.75],
              [1, 1],
            ],
          },
        },
      ],
    }).stubs
    for (const index of [0, 1]) {
      expect(points(result, index)).toContainEqual([1.00002, 0.25])
      expect(points(result, index)).toContainEqual([0.99998, 0.75])
    }
  })
  it('rejects an intervening road detour outside the tolerance', () => {
    const result = run(stubs(box(0, 1), box(1, 2)), {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates: [
              [1, 0],
              [1.001, 0.5],
              [1, 1],
            ],
          },
        },
      ],
    }).stubs
    expect(points(result)).not.toContainEqual([1.001, 0.5])
  })
})

describe('selected cleanup', () => {
  it('leaves unselected polygons and their metadata untouched', () => {
    const input = stubs(box(0, 1), box(1, 2))
    input.features[1]!.properties.geometryCleanup = 'old-simplifier'
    const before = structuredClone(input)
    const result = cleanStubGeometriesForLevel(
      input,
      inventory,
      land(),
      4,
      undefined,
      undefined,
      new Set(['a']),
    )
    expect(result.levelCount).toBe(1)
    expect(result.stubs.features[1]).toEqual(before.features[1])
    expect(input).toEqual(before)
    expect(result.snappedCount).toBe(0)
    expect(result.addedNodeCount).toBe(0)
    const empty = cleanStubGeometriesForLevel(
      input,
      inventory,
      land(),
      4,
      undefined,
      undefined,
      new Set(),
    )
    expect(empty.stubs).toEqual(before)
    expect(empty.levelCount).toBe(0)
  })
  it('reports added nodes only when street snapping inserts them', () => {
    const result = run(stubs(box(0, 1), box(1, 2)), {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates: [
              [1, 0],
              [1.00002, 0.5],
              [1, 1],
            ],
          },
        },
      ],
    })
    expect(result.snappedCount).toBe(2)
    expect(result.addedNodeCount).toBe(2)
  })
})
