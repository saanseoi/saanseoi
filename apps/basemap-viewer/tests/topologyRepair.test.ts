import { describe, expect, it } from 'vitest'
import type { Polygon, Position } from 'geojson'
import {
  cleanEstimatedAreaGeometriesForLevel,
  GeometryCleanupError,
  validateSharedCoverage,
  type RoadFeatureCollection,
} from '../src/local-review/division-areas/geometryTools'
import type {
  ReviewInventory,
  SaanseoiEstimatedAreas,
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
const estimatedAreas = (...geometries: Polygon[]): SaanseoiEstimatedAreas => ({
  type: 'FeatureCollection',
  schemaVersion: 1,
  region: 'hk',
  domain: 'geographic',
  cohort: 'test',
  variant: 'saanseoi',
  features: geometries.map((geometry, i) => ({
    type: 'Feature',
    geometry,
    properties: { divisionId: ['a', 'b', 'c'][i]!, variant: 'saanseoi' },
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
const points = (data: SaanseoiEstimatedAreas, i = 0) => {
  const g = data.features[i]!.geometry
  return g.type === 'Polygon' ? g.coordinates.flat() : g.coordinates.flat(2)
}
const run = (data: SaanseoiEstimatedAreas, roads?: RoadFeatureCollection) =>
  cleanEstimatedAreaGeometriesForLevel(data, inventory, land(), 4, roads)

describe('unsimplified topology repair', () => {
  it('keeps short edges and non-consecutive vertices, removing only consecutive duplicates and fixing closure', () => {
    const input = estimatedAreas(
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
    const result = run(input).estimatedAreas
    for (const p of input.features[0]!.geometry.coordinates[0]!)
      expect(points(result)).toContainEqual(p)
    expect(points(result)).toHaveLength(7)
    expect(input.features[0]!.geometry.coordinates[0]!).toHaveLength(7)
  })
  it('nodes a T junction and gives both neighbours the same collinear nodes', () => {
    const result = run(
      estimatedAreas(
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
    ).estimatedAreas
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
    const input = estimatedAreas(
      polygon([[0, 0], ...shared, [0, 1], [0, 0]]),
      polygon([...shared.slice().reverse(), [2, 0], [2, 1], shared.at(-1)!]),
    )
    const result = run(input, road(1)).estimatedAreas
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
      estimatedAreas(
        polygon([[0, 0], ...shared, [0, 1], [0, 0]]),
        polygon([...shared.slice().reverse(), [2, 0], [2, 1], shared.at(-1)!]),
      ),
      road(1),
    ).estimatedAreas
    expect(points(result)).toContainEqual([1.00002, 0.25])
    expect(points(result)).toContainEqual([1.00006, 0.5])
  })
  it('does not jump between two nearby street centrelines', () => {
    const input = estimatedAreas(box(0, 1), box(1, 2))
    const result = run(input, {
      type: 'FeatureCollection',
      features: [...road(0.99998).features, ...road(1.00002).features],
    }).estimatedAreas
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
    const result = cleanEstimatedAreaGeometriesForLevel(
      estimatedAreas(box(0, 2)),
      inventory,
      land(coast),
      4,
      road(0),
    ).estimatedAreas
    expect(points(result)).toContainEqual([1, 0.99999])
    expect(points(result)).toContainEqual([0.99999, 1])
    expect(result.features[0]!.geometry.coordinates).toHaveLength(2)
  })
  it('keeps intentional gaps and diagnoses missing explicitly intended coverage', () => {
    const input = estimatedAreas(box(0, 0.99999), box(1, 2))
    expect(points(run(input).estimatedAreas)).toContainEqual([0.99999, 1])
    try {
      cleanEstimatedAreaGeometriesForLevel(
        input,
        inventory,
        land(),
        4,
        undefined,
        box(0, 2),
      )
      throw Error('expected failure')
    } catch (error) {
      expect(error).toBeInstanceOf(GeometryCleanupError)
      expect((error as GeometryCleanupError).category).toBe('shared boundary')
      expect((error as GeometryCleanupError).coordinates.length).toBeGreaterThan(0)
    }
  })
  it('validates an older processed polygon using its saved shape as a preserved baseline', () => {
    const input = estimatedAreas(box(0, 1))
    input.features[0]!.properties.geometryCleanup = 'old-simplifier'
    const before = structuredClone(input)
    const result = run(input).estimatedAreas.features[0]!
    expect(result.geometry).toEqual(
      run(estimatedAreas(box(0, 1))).estimatedAreas.features[0]!.geometry,
    )
    expect(result.properties.geometryWorkingBaseline).toMatchObject({
      geometry: input.features[0]!.geometry,
      processing: { geometryCleanup: 'old-simplifier' },
    })
    expect(result.properties.geometryOriginalDrawing).toBeUndefined()
    expect(input).toEqual(before)
  })
  it('reports the actual self-intersection and leaves source unchanged', () => {
    const input = estimatedAreas(
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
    const first = run(estimatedAreas(box(0, 1), box(1, 2))).estimatedAreas
    expect(run(first).estimatedAreas).toEqual(first)
    expect(run(first).changedCount).toBe(0)
  })
})

describe('separate later simplification', () => {
  it('retains an unsimplified source and cleanup restores removed nodes', async () => {
    const { simplifyCleanedGeometries } = await import(
      '../src/local-review/division-areas/simplificationTools'
    )
    const input = estimatedAreas(
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
    const cleaned = run(input).estimatedAreas
    const simplified = simplifyCleanedGeometries(cleaned, inventory, 4, 1)
    expect(points(simplified)).not.toContainEqual([1, 0.5])
    expect(points(simplified, 1)).not.toContainEqual([1, 0.5])
    expect(cleaned.features[0]!.properties.geometrySimplification).toBeUndefined()
    const restored = run(simplified).estimatedAreas
    expect(points(restored)).toContainEqual([1, 0.5])
    expect(points(restored, 1)).toContainEqual([1, 0.5])
    expect(restored.features[0]!.properties.geometrySimplification).toBeUndefined()
  })
  it('preserves edits to simplified output as the new working baseline', async () => {
    const { simplifyCleanedGeometries } = await import(
      '../src/local-review/division-areas/simplificationTools'
    )
    const simplified = simplifyCleanedGeometries(
      run(estimatedAreas(box(0, 1), box(1, 2))).estimatedAreas,
      inventory,
      4,
      1,
    )
    const g = simplified.features[0]!.geometry as Polygon
    g.coordinates[0]![1]![0]! += 0.00001
    const result = run(simplified).estimatedAreas.features[0]!
    expect(result.properties.geometryWorkingBaseline).toMatchObject({ geometry: g })
    expect(result.properties.geometrySimplification).toBeUndefined()
  })
})

describe('saved drawing baseline', () => {
  it('uses the current drawing even if a publisher source has a different shape', async () => {
    const { restoreUnsimplifiedCleanupSources } = await import(
      '../src/local-review/division-areas/cleanupSources'
    )
    const input = estimatedAreas(box(0, 1))
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
      expect(run(prepared).estimatedAreas.features[0]!.geometry).toEqual(
        run(estimatedAreas(box(0, 1))).estimatedAreas.features[0]!.geometry,
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
    const input = estimatedAreas(box(0, 1), box(1, 2))
    const cleaned = run(input).estimatedAreas
    expect(cleaned.features[0]!.properties.geometryOriginalDrawing).toEqual(
      input.features[0]!.geometry,
    )
    const again = run(cleaned).estimatedAreas
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
      run(recovered).estimatedAreas.features[0]!.properties.geometryOriginalDrawing,
    ).toEqual(input.features[0]!.geometry)
  })
})

describe('curved street snapping', () => {
  it('adds road bend nodes to both sides of a two-node shared boundary', () => {
    const result = run(estimatedAreas(box(0, 1), box(1, 2)), {
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
    }).estimatedAreas
    for (const index of [0, 1]) {
      expect(points(result, index)).toContainEqual([1.00002, 0.25])
      expect(points(result, index)).toContainEqual([0.99998, 0.75])
    }
  })
  it('rejects an intervening road detour outside the tolerance', () => {
    const result = run(estimatedAreas(box(0, 1), box(1, 2)), {
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
    }).estimatedAreas
    expect(points(result)).not.toContainEqual([1.001, 0.5])
  })
})

describe('selected cleanup', () => {
  it('clips a single selection to detailed coastal notches without processing neighbours', () => {
    const coast = polygon([
      [0, 0],
      [2, 0],
      [2, 1],
      [1.6, 1],
      [1.6, 0.7],
      [1.4, 0.7],
      [1.4, 1],
      [0, 1],
      [0, 0],
    ])
    const input = estimatedAreas(
      box(0, 2),
      polygon([
        [3, 0],
        [4, 1],
        [3, 1],
        [4, 0],
        [3, 0],
      ]),
    )
    const untouched = structuredClone(input.features[1])
    const result = cleanEstimatedAreaGeometriesForLevel(
      input,
      inventory,
      land(coast),
      4,
      undefined,
      undefined,
      new Set(['a']),
    )
    expect(result.levelCount).toBe(1)
    expect(result.changedCount).toBe(1)
    expect(result.snappedCount).toBe(0)
    expect(
      result.estimatedAreas.features[0]!.geometry.coordinates.flat(),
    ).toContainEqual([1.6, 0.7])
    expect(
      result.estimatedAreas.features[0]!.geometry.coordinates.flat(),
    ).toContainEqual([1.4, 0.7])
    expect(result.estimatedAreas.features[1]).toEqual(untouched)
    expect(
      result.estimatedAreas.features[0]!.properties.geometryCleanupRoadSnapMetres,
    ).toBe(0)
  })

  it('leaves unselected polygons and their metadata untouched', () => {
    const input = estimatedAreas(box(0, 1), box(1, 2))
    input.features[1]!.properties.geometryCleanup = 'old-simplifier'
    const before = structuredClone(input)
    const result = cleanEstimatedAreaGeometriesForLevel(
      input,
      inventory,
      land(),
      4,
      undefined,
      undefined,
      new Set(['a']),
    )
    expect(result.levelCount).toBe(1)
    expect(result.estimatedAreas.features[1]).toEqual(before.features[1])
    expect(input).toEqual(before)
    expect(result.snappedCount).toBe(0)
    expect(result.addedNodeCount).toBe(0)
    const empty = cleanEstimatedAreaGeometriesForLevel(
      input,
      inventory,
      land(),
      4,
      undefined,
      undefined,
      new Set(),
    )
    expect(empty.estimatedAreas).toEqual(before)
    expect(empty.levelCount).toBe(0)
  })
  it('reports added nodes only when street snapping inserts them', () => {
    const result = run(estimatedAreas(box(0, 1), box(1, 2)), {
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

it('nodes source edges once when coastline intersections are computed at fractional coordinates', () => {
  const input = estimatedAreas(
    polygon([
      [114.18, 22.27],
      [114.2, 22.28],
      [114.19, 22.3],
      [114.17, 22.29],
      [114.18, 22.27],
    ]),
  )
  const coast = land(
    polygon([
      [114.175, 22.265],
      [114.195, 22.265],
      [114.195, 22.305],
      [114.175, 22.305],
      [114.175, 22.265],
    ]),
  )
  const before = structuredClone(input)
  const result = cleanEstimatedAreaGeometriesForLevel(input, inventory, coast, 4)
  expect(result.levelCount).toBe(1)
  expect(result.changedCount).toBe(1)
  expect(input).toEqual(before)
})

describe('simplification uses the cleanup selection', () => {
  it('simplifies cleaned selected divisions without requiring cleanup of other drawings', async () => {
    const { simplifyCleanedGeometries } = await import(
      '../src/local-review/division-areas/simplificationTools'
    )
    const input = estimatedAreas(box(0, 1), box(1, 2), box(4, 5))
    const selection = new Set(['a', 'b'])
    const cleaned = cleanEstimatedAreaGeometriesForLevel(
      input,
      inventory,
      land(),
      4,
      undefined,
      undefined,
      selection,
    ).estimatedAreas
    const before = structuredClone(cleaned)
    const result = simplifyCleanedGeometries(cleaned, inventory, 4, 1, selection)
    expect(result.features[0]!.properties.geometrySimplification).toBeDefined()
    expect(result.features[1]!.properties.geometrySimplification).toBeDefined()
    expect(result.features[2]).toEqual(input.features[2])
    expect(cleaned).toEqual(before)
    expect(() =>
      simplifyCleanedGeometries(cleaned, inventory, 4, 1, new Set(['a', 'c'])),
    ).toThrow('Polygon c')
    expect(() =>
      simplifyCleanedGeometries(cleaned, inventory, 4, 1, new Set()),
    ).toThrow('Select drawn L4')
  })
  it('requires fresh cleanup after geometry is edited', async () => {
    const { simplifyCleanedGeometries } = await import(
      '../src/local-review/division-areas/simplificationTools'
    )
    const cleaned = run(estimatedAreas(box(0, 1))).estimatedAreas
    cleaned.features[0]!.geometry = box(0, 0.9)
    expect(() =>
      simplifyCleanedGeometries(cleaned, inventory, 4, 1, new Set(['a'])),
    ).toThrow('Polygon a')
    const recleaned = run(cleaned).estimatedAreas
    expect(() =>
      simplifyCleanedGeometries(recleaned, inventory, 4, 1, new Set(['a'])),
    ).not.toThrow()
  })
})

describe('coverage comparison at floating-point intersections', () => {
  const a = [114.188971, 22.2881981]
  const b = [114.18916972867066, 22.288413096136185]
  const c = [114.1892703, 22.2885219]
  const d = [114.188, 22.289]
  const source = polygon([a, c, d, a])
  it('accepts the reported Causeway Bay intersection residue without changing coordinates', async () => {
    const { default: GeoJSONReader } = await import(
      'jsts/org/locationtech/jts/io/GeoJSONReader.js'
    )
    const { default: OverlayOp } = await import(
      'jsts/org/locationtech/jts/operation/overlay/OverlayOp.js'
    )
    const { default: GeometryFactory } = await import(
      'jsts/org/locationtech/jts/geom/GeometryFactory.js'
    )
    const reader = new GeoJSONReader(new GeometryFactory())
    const noded = polygon([a, b, c, d, a])
    // Confirm the exact coordinates reproduce the old non-empty-difference failure.
    const difference = OverlayOp.overlayOp(
      reader.read(noded),
      reader.read(source),
      OverlayOp.SYMDIFFERENCE,
    )
    expect(difference.isEmpty()).toBe(false)
    const before = structuredClone(noded)
    expect(() => validateSharedCoverage([noded], [source])).not.toThrow()
    expect(() => validateSharedCoverage([source], [noded])).not.toThrow()
    expect(noded).toEqual(before)
  })
  it('still rejects a real millimetre-scale boundary displacement', () => {
    const displaced = polygon([a, [b[0]! + 1e-8, b[1]!], c, d, a])
    expect(() => validateSharedCoverage([displaced], [source])).toThrow('covered area')
  })
  it('rejects tiny detached regions even when their area is small', () => {
    const tiny = polygon([
      [114.2, 22.3],
      [114.2000000001, 22.3],
      [114.2, 22.3000000001],
      [114.2, 22.3],
    ])
    expect(() => validateSharedCoverage([source, tiny], [source])).toThrow(
      'covered area',
    )
  })
})

it('cleans and simplifies selected L6 drawings while preserving other levels', async () => {
  const { simplifyCleanedGeometries } = await import(
    '../src/local-review/division-areas/simplificationTools'
  )
  const l6 = {
    ...inventory,
    divisions: inventory.divisions.map(d => ({ ...d, level: d.id === 'c' ? 4 : 6 })),
  }
  const input = estimatedAreas(box(0, 1), box(1, 2), box(4, 5))
  const selected = new Set(['a', 'b', 'c'])
  const result = cleanEstimatedAreaGeometriesForLevel(
    input,
    l6,
    land(),
    6,
    undefined,
    undefined,
    selected,
  )
  expect(result.levelCount).toBe(2)
  expect(result.estimatedAreas.features[0]!.properties.geometryCleanupLevel).toBe(6)
  expect(result.estimatedAreas.features[2]).toEqual(input.features[2])
  const simplified = simplifyCleanedGeometries(
    result.estimatedAreas,
    l6,
    6,
    1,
    selected,
  )
  expect(simplified.features[0]!.properties.geometrySimplification).toBeDefined()
  expect(simplified.features[2]).toEqual(input.features[2])
})

it('cleans L6 coast intersections containing an area and an isolated touching edge', () => {
  const l6 = {
    ...inventory,
    divisions: inventory.divisions.map(d => ({ ...d, level: 6 })),
  }
  const input = estimatedAreas(box(0, 1))
  input.features[0]!.geometry = {
    type: 'MultiPolygon',
    coordinates: [box(0, 1).coordinates, box(3, 4).coordinates],
  }
  const result = cleanEstimatedAreaGeometriesForLevel(input, l6, land(box(-1, 3)), 6)
  const output = result.estimatedAreas.features[0]!.geometry as Polygon
  expect(output.type).toBe('Polygon')
  expect(output.coordinates[0]).toHaveLength(5)
  expect(output.coordinates[0]).toEqual(
    expect.arrayContaining(box(0, 1).coordinates[0]!),
  )
  expect(input.features[0]!.geometry.type).toBe('MultiPolygon')
})
