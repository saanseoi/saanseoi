import { describe, expect, test } from 'bun:test'

import {
  boundariesToClipGeoJson,
  boundariesToOsmiumPolygon,
  historicalBorderSourceRequired,
  polygoniseCoastlineFeatures,
  resolveTilesRetractionArtefacts,
} from './tiles.ts'

describe('resolveTilesRetractionArtefacts', () => {
  const region = {
    area: 'hong kong',
    code: 'hk' as const,
    description: 'Hong Kong',
    name: 'hongkong',
  }

  test('derives every deletion key from the requested region and version', () => {
    expect(
      resolveTilesRetractionArtefacts(region, '2026-08-20', {
        key: 'basemap/hk/hongkong-2026-08-20.pmtiles',
        manifestKey: 'basemap/hk/hongkong-2026-08-20.json',
      }),
    ).toContain('basemap/hk/hongkong-2026-08-20.pmtiles')
  })

  test('rejects catalogue keys outside the requested release', () => {
    expect(() =>
      resolveTilesRetractionArtefacts(region, '2026-08-20', {
        key: 'basemap/mo/macau-2026-08-20.pmtiles',
        manifestKey: 'basemap/hk/hongkong-2026-08-20.json',
      }),
    ).toThrow('catalogue archive key does not match')
  })
})

describe('historicalBorderSourceRequired', () => {
  test('requires the companion GBA archive for a Macao-only historical source', () => {
    expect(
      historicalBorderSourceRequired('mo', '/archives/2026-08-01/macau-260801.osm.pbf'),
    ).toBe(true)
  })

  test('uses a Guangdong archive as Macao’s complete border context', () => {
    expect(
      historicalBorderSourceRequired(
        'mo',
        '/archives/2026-08-01/guangdong-260801.osm.pbf',
      ),
    ).toBe(false)
  })
})

describe('boundariesToOsmiumPolygon', () => {
  test('preserves outer rings and marks interior rings as holes', () => {
    expect(
      boundariesToOsmiumPolygon([
        {
          osm_id: 1,
          geojson: {
            type: 'Polygon',
            coordinates: [
              [
                [113, 22],
                [114, 22],
                [114, 23],
                [113, 22],
              ],
              [
                [113.2, 22.2],
                [113.4, 22.2],
                [113.2, 22.4],
                [113.2, 22.2],
              ],
            ],
          },
        },
      ]),
    ).toBe(`gba
1
113 22
114 22
114 23
113 22
END
!2
113.2 22.2
113.4 22.2
113.2 22.4
113.2 22.2
END
END
`)
  })
})

describe('boundariesToClipGeoJson', () => {
  test('dissolves adjoining jurisdictions into one clipping footprint', () => {
    expect(
      boundariesToClipGeoJson([
        {
          osm_id: 1,
          geojson: {
            type: 'Polygon',
            coordinates: [
              [
                [113, 22],
                [114, 22],
                [114, 23],
                [113, 23],
                [113, 22],
              ],
            ],
          },
        },
        {
          osm_id: 2,
          geojson: {
            type: 'Polygon',
            coordinates: [
              [
                [114, 22],
                [115, 22],
                [115, 23],
                [114, 23],
                [114, 22],
              ],
            ],
          },
        },
      ]),
    ).toEqual({
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [114, 22],
            [113, 22],
            [113, 23],
            [114, 23],
            [115, 23],
            [115, 22],
            [114, 22],
          ],
        ],
      },
    })
  })
})

describe('polygoniseCoastlineFeatures', () => {
  test('cuts island land out of the enclosing water face', () => {
    const result = polygoniseCoastlineFeatures(
      [
        {
          geometry: {
            type: 'LineString',
            // OSM coastline direction puts the island land on the left.
            coordinates: [
              [2, 2],
              [8, 2],
              [8, 8],
              [2, 8],
              [2, 2],
            ],
          },
        },
      ],
      {
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [0, 0],
              [10, 0],
              [10, 10],
              [0, 10],
              [0, 0],
            ],
          ],
        },
      },
    )

    expect(result.land.features).toHaveLength(1)
    expect(result.water.features).toHaveLength(1)
    const waterGeometry = result.water.features[0]?.geometry
    if (!waterGeometry) {
      throw new Error('Expected the water feature to have a geometry')
    }

    expect(waterGeometry).toEqual({
      type: 'Polygon',
      coordinates: expect.any(Array),
    })
    expect((waterGeometry as { coordinates: unknown[][] }).coordinates).toHaveLength(2)
  })
})
