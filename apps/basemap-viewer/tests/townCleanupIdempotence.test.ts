import { describe, expect, it } from 'vitest'
import type { Polygon } from 'geojson'
import {
  cleanTownStubGeometries,
  TOWN_GEOMETRY_CLEANUP_VERSION,
} from '../src/local-review/division-areas/geometryTools'
import type {
  ReviewInventory,
  StubAreas,
} from '../../../libs/core/src/pipeline/services/divisions/geographicReview'

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

describe('town cleanup reruns', () => {
  it('does not reprocess a town already cleaned by the current version', () => {
    const inventory: ReviewInventory = {
      schemaVersion: 1,
      region: 'hk',
      domain: 'geographic',
      cohort: 'test',
      releaseSet: 'test',
      divisions: [
        {
          id: 'town',
          category: 'locality',
          class: 'town',
          level: 3,
          names: { en: 'Town' },
          point: null,
          hierarchies: {
            administrative: [],
            locality: [],
            full: [],
            landform: [],
          },
        },
      ],
    }
    const stubs: StubAreas = {
      type: 'FeatureCollection',
      schemaVersion: 1,
      region: 'hk',
      domain: 'geographic',
      cohort: 'test',
      variant: 'stub',
      features: [
        {
          type: 'Feature',
          id: 'stub:town',
          properties: {
            divisionId: 'town',
            variant: 'stub',
            geometryCleanup: TOWN_GEOMETRY_CLEANUP_VERSION,
          },
          geometry: rectangle(0, 1),
        },
      ],
    }

    const result = cleanTownStubGeometries(stubs, inventory, {
      type: 'FeatureCollection',
      features: [],
    })

    expect(result).toEqual({ stubs, townCount: 1, changedCount: 0 })
  })
})
