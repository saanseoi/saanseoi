import { describe, expect, it } from 'vitest'
import GeometryFactory from 'jsts/org/locationtech/jts/geom/GeometryFactory.js'
import GeoJSONReader from 'jsts/org/locationtech/jts/io/GeoJSONReader.js'
import OverlayOp from 'jsts/org/locationtech/jts/operation/overlay/OverlayOp.js'
import type { Polygon, Position } from 'geojson'
import { cleanTownStubGeometries } from '../src/local-review/division-areas/geometryTools'
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
    expect(a.properties.geometryCleanup).toBe('town-land-coverage-medium-v2')
    expect(
      result.stubs.features.find(
        feature => feature.properties.divisionId === 'district',
      ),
    ).toEqual(unchanged)
  })
})
