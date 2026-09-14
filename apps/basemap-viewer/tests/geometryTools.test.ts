import { describe, expect, it } from 'vitest'
import GeometryFactory from 'jsts/org/locationtech/jts/geom/GeometryFactory.js'
import GeoJSONReader from 'jsts/org/locationtech/jts/io/GeoJSONReader.js'
import OverlayOp from 'jsts/org/locationtech/jts/operation/overlay/OverlayOp.js'
import type { Polygon, Position } from 'geojson'
import {
  cleanStubGeometriesForLevel,
  cleanTownStubGeometries,
  GeometryCleanupError,
  LEVEL_4_GEOMETRY_CLEANUP_VERSION,
  TOWN_GEOMETRY_CLEANUP_ROAD_SNAP_METRES,
  TOWN_GEOMETRY_CLEANUP_VERSION,
} from '../src/local-review/division-areas/geometryTools'
import type {
  ReviewDivision,
  ReviewInventory,
  StubAreas,
} from '../../../libs/core/src/pipeline/services/divisions/geographicReview'

type Shape = import('jsts/org/locationtech/jts/geom/Geometry.js').default & {
  getArea(): number
}

const rectangle = (west: number, east: number): Polygon => ({
  type: 'Polygon',
  coordinates: [
    [
      [west, 0],
      [east, 0],
      [east, 1],
      [west, 1],
      [west, 0],
    ],
  ],
})

const division = (id: string, level: number): ReviewDivision => ({
  id,
  category: level === 3 ? 'locality' : 'administrative',
  class: level === 3 ? 'town' : 'district',
  level,
  names: { en: id },
  point: null,
  hierarchies: { administrative: [], locality: [], full: [], landform: [] },
})

const stub = (id: string, geometry: Polygon) => ({
  type: 'Feature' as const,
  id: `stub:${id}`,
  properties: { divisionId: id, variant: 'stub' },
  geometry,
})

const positions = (geometry: Polygon): Position[] => geometry.coordinates.flat(1)

describe('town stub geometry cleanup', () => {
  it('extracts failing nodes from a JTS non-noded intersection', () => {
    const error = new GeometryCleanupError(
      4,
      'hood-id',
      new Error(
        'found non-noded intersection between LINESTRING ( 114.14466037509735 22.29048444613767, 114.1446605412932 22.290484440832827 ) and LINESTRING ( 114.14466037509735 22.29048444613767, 114.1446605412932 22.290484440832827 ) [ (114.14466037509735, 22.29048444613767, NaN) ]',
      ),
    )

    expect(error.divisionId).toBe('hood-id')
    expect(error.coordinates).toEqual([
      [114.14466037509735, 22.29048444613767],
      [114.1446605412932, 22.290484440832827],
    ])
  })

  it('clips water, closes a small seam, partitions overlap, and preserves other levels', () => {
    const inventory: ReviewInventory = {
      schemaVersion: 1,
      region: 'hk',
      domain: 'geographic',
      cohort: 'test',
      releaseSet: 'test',
      divisions: [
        division('town-a', 3),
        division('town-b', 3),
        division('district', 2),
      ],
    }
    const unchanged = stub('district', rectangle(4, 5))
    const stubs: StubAreas = {
      type: 'FeatureCollection',
      schemaVersion: 1,
      region: 'hk',
      domain: 'geographic',
      cohort: 'test',
      variant: 'stub',
      features: [
        stub('town-a', rectangle(-0.1, 1.01)),
        stub('town-b', rectangle(0.99, 2.1)),
        unchanged,
      ],
    }
    const result = cleanTownStubGeometries(stubs, inventory, {
      type: 'FeatureCollection',
      features: [{ type: 'Feature', properties: {}, geometry: rectangle(0, 2) }],
    })
    const towns = result.stubs.features.filter(feature =>
      feature.properties.divisionId.startsWith('town'),
    )
    const a = towns.find(feature => feature.properties.divisionId === 'town-a')!
    const b = towns.find(feature => feature.properties.divisionId === 'town-b')!
    const bounds = (geometry: Polygon) => {
      const points = positions(geometry)
      return [
        Math.min(...points.map(point => point[0]!)),
        Math.max(...points.map(point => point[0]!)),
      ]
    }
    const reader = new GeoJSONReader(new GeometryFactory())
    const overlap = (
      OverlayOp.intersection(
        reader.read(JSON.stringify(a.geometry)),
        reader.read(JSON.stringify(b.geometry)),
      ) as Shape
    ).getArea()

    expect(result.townCount).toBe(2)
    expect(result.changedCount).toBe(2)
    expect(overlap).toBeLessThan(1e-12)
    expect(
      Math.abs(bounds(a.geometry as Polygon)[1]! - bounds(b.geometry as Polygon)[0]!),
    ).toBeLessThan(1e-8)
    expect(
      positions(a.geometry as Polygon).every(
        point => point[0]! >= -1e-8 && point[0]! <= 2 + 1e-8,
      ),
    ).toBe(true)
    expect(
      positions(b.geometry as Polygon).every(
        point => point[0]! >= -1e-8 && point[0]! <= 2 + 1e-8,
      ),
    ).toBe(true)
    expect(a.properties.geometryCleanup).toBe(TOWN_GEOMETRY_CLEANUP_VERSION)
    expect(
      result.stubs.features.find(
        feature => feature.properties.divisionId === 'district',
      ),
    ).toEqual(unchanged)
  })

  it('uses the same land cleanup for levels 4 and 5', () => {
    for (const level of [4, 5] as const) {
      const id = `level-${level}`
      const inventory: ReviewInventory = {
        schemaVersion: 1,
        region: 'hk',
        domain: 'geographic',
        cohort: 'test',
        releaseSet: 'test',
        divisions: [division(id, level)],
      }
      const result = cleanStubGeometriesForLevel(
        {
          type: 'FeatureCollection',
          schemaVersion: 1,
          region: 'hk',
          domain: 'geographic',
          cohort: 'test',
          variant: 'stub',
          features: [stub(id, rectangle(-0.1, 1.1))],
        },
        inventory,
        {
          type: 'FeatureCollection',
          features: [{ type: 'Feature', properties: {}, geometry: rectangle(0, 1) }],
        },
        level,
      )
      expect(result.levelCount).toBe(1)
      expect(result.changedCount).toBe(1)
      expect(result.stubs.features[0]?.properties.geometryCleanup).toBe(
        level === 4
          ? LEVEL_4_GEOMETRY_CLEANUP_VERSION
          : 'level-5-land-coverage-road-snap-v8',
      )
      expect(result.stubs.features[0]?.properties.geometryCleanupLevel).toBe(level)
    }
  })

  it('keeps L4 corners to one miter point instead of round-join arcs', () => {
    const inventory: ReviewInventory = {
      schemaVersion: 1,
      region: 'hk',
      domain: 'geographic',
      cohort: 'test',
      releaseSet: 'test',
      divisions: [division('hood', 4)],
    }
    const result = cleanStubGeometriesForLevel(
      {
        type: 'FeatureCollection',
        schemaVersion: 1,
        region: 'hk',
        domain: 'geographic',
        cohort: 'test',
        variant: 'stub',
        features: [
          stub('hood', {
            type: 'Polygon',
            coordinates: [
              [
                [0, 0],
                [1, 0],
                [1, 0.2],
                [1, 0.4],
                [1, 0.6],
                [1, 1],
                [0, 1],
                [0, 0.8],
                [0, 0.6],
                [0, 0.4],
                [0, 0.2],
                [0, 0],
              ],
            ],
          }),
        ],
      },
      inventory,
      {
        type: 'FeatureCollection',
        features: [{ type: 'Feature', properties: {}, geometry: rectangle(0, 1) }],
      },
      4,
    )
    const ring =
      result.stubs.features[0]!.geometry.type === 'Polygon'
        ? result.stubs.features[0]!.geometry.coordinates[0]!
        : result.stubs.features[0]!.geometry.coordinates[0]![0]!
    expect(ring).toHaveLength(5)
    expect(result.stubs.features[0]?.properties.geometryCleanup).toBe(
      LEVEL_4_GEOMETRY_CLEANUP_VERSION,
    )
    expect(
      result.stubs.features[0]?.properties.geometryCleanupCoastlineDetailMetres,
    ).toBe(3)
  })

  it('snaps nearby boundary vertices to a street centreline before the land clip', () => {
    const inventory: ReviewInventory = {
      schemaVersion: 1,
      region: 'hk',
      domain: 'geographic',
      cohort: 'test',
      releaseSet: 'test',
      divisions: [division('town', 3)],
    }
    const result = cleanStubGeometriesForLevel(
      {
        type: 'FeatureCollection',
        schemaVersion: 1,
        region: 'hk',
        domain: 'geographic',
        cohort: 'test',
        variant: 'stub',
        features: [stub('town', rectangle(0.50003, 1))],
      },
      inventory,
      {
        type: 'FeatureCollection',
        features: [{ type: 'Feature', properties: {}, geometry: rectangle(0, 2) }],
      },
      3,
      {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: {},
            geometry: {
              type: 'LineString',
              coordinates: [
                [0.5, -1],
                [0.5, 2],
              ],
            },
          },
        ],
      },
    )
    const geometry = result.stubs.features[0]!.geometry
    const coordinates =
      geometry.type === 'Polygon'
        ? geometry.coordinates.flat(1)
        : geometry.coordinates.flat(2)
    expect(Math.min(...coordinates.map(point => point[0]!))).toBeCloseTo(0.5, 7)
    expect(result.stubs.features[0]?.properties.geometryCleanupRoadSnapMetres).toBe(
      TOWN_GEOMETRY_CLEANUP_ROAD_SNAP_METRES,
    )
  })

  it('leaves a boundary unchanged when the nearest street is beyond five metres', () => {
    const inventory: ReviewInventory = {
      schemaVersion: 1,
      region: 'hk',
      domain: 'geographic',
      cohort: 'test',
      releaseSet: 'test',
      divisions: [division('town', 3)],
    }
    const result = cleanStubGeometriesForLevel(
      {
        type: 'FeatureCollection',
        schemaVersion: 1,
        region: 'hk',
        domain: 'geographic',
        cohort: 'test',
        variant: 'stub',
        features: [stub('town', rectangle(0.5001, 1))],
      },
      inventory,
      {
        type: 'FeatureCollection',
        features: [{ type: 'Feature', properties: {}, geometry: rectangle(0, 2) }],
      },
      3,
      {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: {},
            geometry: {
              type: 'LineString',
              coordinates: [
                [0.5, -1],
                [0.5, 2],
              ],
            },
          },
        ],
      },
    )
    const geometry = result.stubs.features[0]!.geometry
    const coordinates =
      geometry.type === 'Polygon'
        ? geometry.coordinates.flat(1)
        : geometry.coordinates.flat(2)
    expect(Math.min(...coordinates.map(point => point[0]!))).toBeCloseTo(0.5001, 7)
  })

  it('removes sub-centimetre road-snap segments before L4 overlays', () => {
    const inventory: ReviewInventory = {
      schemaVersion: 1,
      region: 'hk',
      domain: 'geographic',
      cohort: 'test',
      releaseSet: 'test',
      divisions: [division('hood', 4)],
    }
    const result = cleanStubGeometriesForLevel(
      {
        type: 'FeatureCollection',
        schemaVersion: 1,
        region: 'hk',
        domain: 'geographic',
        cohort: 'test',
        variant: 'stub',
        features: [
          stub('hood', {
            type: 'Polygon',
            coordinates: [
              [
                [0.50003, 0],
                [0.5000301, 0.00000001],
                [1, 0],
                [1, 1],
                [0.50003, 1],
                [0.50003, 0],
              ],
            ],
          }),
        ],
      },
      inventory,
      {
        type: 'FeatureCollection',
        features: [{ type: 'Feature', properties: {}, geometry: rectangle(0, 2) }],
      },
      4,
      {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: {},
            geometry: {
              type: 'LineString',
              coordinates: [
                [0.5, -1],
                [0.5, 2],
              ],
            },
          },
        ],
      },
    )
    expect(result.levelCount).toBe(1)
    expect(result.stubs.features[0]?.properties.geometryCleanupLevel).toBe(4)
  })

  it('keeps the ordered vertices along a street boundary while simplifying L4', () => {
    const inventory: ReviewInventory = {
      schemaVersion: 1,
      region: 'hk',
      domain: 'geographic',
      cohort: 'test',
      releaseSet: 'test',
      divisions: [division('hood', 4)],
    }
    const result = cleanStubGeometriesForLevel(
      {
        type: 'FeatureCollection',
        schemaVersion: 1,
        region: 'hk',
        domain: 'geographic',
        cohort: 'test',
        variant: 'stub',
        features: [
          stub('hood', {
            type: 'Polygon',
            coordinates: [
              [
                [0.00001, 0],
                [1, 0],
                [1, 1],
                [0.00001, 1],
                [0.00001, 0.75],
                [0.00001, 0.5],
                [0.00001, 0.25],
                [0.00001, 0],
              ],
            ],
          }),
        ],
      },
      inventory,
      {
        type: 'FeatureCollection',
        features: [{ type: 'Feature', properties: {}, geometry: rectangle(0, 1) }],
      },
      4,
      {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: {},
            geometry: {
              type: 'LineString',
              coordinates: [
                [0, -1],
                [0, 2],
              ],
            },
          },
        ],
      },
    )
    const geometry = result.stubs.features[0]!.geometry
    const ring =
      geometry.type === 'Polygon'
        ? geometry.coordinates[0]!
        : geometry.coordinates[0]![0]!
    expect(
      ring.some(
        position =>
          Math.abs(position[0]! - 0) < 1e-12 && Math.abs(position[1]! - 0.5) < 1e-12,
      ),
    ).toBe(true)
    expect(result.stubs.features[0]?.properties.geometryCleanup).toBe(
      LEVEL_4_GEOMETRY_CLEANUP_VERSION,
    )
  })

  it('repartitions a level when a new stub is added after cleanup', () => {
    const inventory: ReviewInventory = {
      schemaVersion: 1,
      region: 'hk',
      domain: 'geographic',
      cohort: 'test',
      releaseSet: 'test',
      divisions: [division('town-a', 3), division('town-b', 3), division('town-c', 3)],
    }
    const land = {
      type: 'FeatureCollection' as const,
      features: [
        { type: 'Feature' as const, properties: {}, geometry: rectangle(0, 3) },
      ],
    }
    const first = cleanTownStubGeometries(
      {
        type: 'FeatureCollection',
        schemaVersion: 1,
        region: 'hk',
        domain: 'geographic',
        cohort: 'test',
        variant: 'stub',
        features: [stub('town-a', rectangle(0, 1)), stub('town-b', rectangle(1, 2))],
      },
      inventory,
      land,
    )
    const second = cleanTownStubGeometries(
      {
        ...first.stubs,
        features: [...first.stubs.features, stub('town-c', rectangle(1.5, 2.5))],
      },
      inventory,
      land,
    )
    const reader = new GeoJSONReader(new GeometryFactory())
    const cleaned = second.stubs.features
    for (let left = 0; left < cleaned.length; left += 1) {
      for (let right = left + 1; right < cleaned.length; right += 1) {
        const overlap = (
          OverlayOp.intersection(
            reader.read(JSON.stringify(cleaned[left]!.geometry)),
            reader.read(JSON.stringify(cleaned[right]!.geometry)),
          ) as Shape
        ).getArea()
        expect(overlap).toBeLessThan(1e-12)
      }
    }
    expect(second.changedCount).toBe(3)
  })
})
