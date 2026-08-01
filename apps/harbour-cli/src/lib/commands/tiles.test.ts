import { describe, expect, test } from 'bun:test'

import { boundariesToClipGeoJson, boundariesToOsmiumPolygon } from './tiles.ts'

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
