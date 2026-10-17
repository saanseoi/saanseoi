import { expect, it } from 'vitest'
import cases from './fixtures/taiPoCoastline.json'
import { cleanEstimatedAreaGeometriesForLevel } from '../src/tools/division-areas/geometryTools'
import type {
  ReviewInventory,
  SaanseoiEstimatedAreas,
} from '../../../libs/core/src/pipeline/services/divisions/geographicReview'
import type { Polygon, MultiPolygon } from 'geojson'
import GeoJSONReader from 'jsts/org/locationtech/jts/io/GeoJSONReader.js'
import GeometryFactory from 'jsts/org/locationtech/jts/geom/GeometryFactory.js'
import IsValidOp from 'jsts/org/locationtech/jts/operation/valid/IsValidOp.js'
import OverlayOp from 'jsts/org/locationtech/jts/operation/overlay/OverlayOp.js'

// Saved Tai Po town, San Tau Kok and Po Sam Pai outlines, with a cropped coastline.
for (const item of cases)
  it(`snaps the retained Tai Po outline ${item.id} without invalid topology`, () => {
    const inventory: ReviewInventory = {
      schemaVersion: 1,
      region: 'HK',
      domain: 'geographic',
      releaseSet: 'test',
      cohort: 'test',
      divisions: [
        {
          id: item.id,
          category: 'locality',
          class: 'town',
          level: 3,
          names: { en: 'Tai Po regression' },
          point: null,
          hierarchies: { full: [], administrative: [], locality: [], landform: [] },
        },
      ],
    }
    const areas: SaanseoiEstimatedAreas = {
      type: 'FeatureCollection',
      schemaVersion: 1,
      variant: 'saanseoi',
      domain: 'geographic',
      region: 'HK',
      cohort: 'test',
      features: [
        {
          type: 'Feature',
          properties: { divisionId: item.id, variant: 'saanseoi' },
          geometry: item.geometry as Polygon | MultiPolygon,
        },
      ],
    }
    const before = JSON.stringify(areas)
    const land = {
      type: 'FeatureCollection' as const,
      features: [
        {
          type: 'Feature' as const,
          properties: {},
          geometry: item.land as Polygon | MultiPolygon,
        },
      ],
    }
    const result = cleanEstimatedAreaGeometriesForLevel(
      areas,
      inventory,
      land,
      null,
      undefined,
      undefined,
      new Set([item.id]),
      true,
    )
    const reader = new GeoJSONReader(new GeometryFactory())
    const geometry = reader.read(result.estimatedAreas.features[0]!.geometry)
    expect(IsValidOp.isValid(geometry)).toBe(true)
    expect(geometry.isEmpty()).toBe(false)
    const water = OverlayOp.difference(geometry, reader.read(item.land))
    expect(water.getArea()).toBeLessThan(1e-15)
    expect(JSON.stringify(areas)).toBe(before)
  }, 10000)
