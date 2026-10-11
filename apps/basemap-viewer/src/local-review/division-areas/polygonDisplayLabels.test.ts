import { describe, expect, it } from 'vitest'
import {
  largestPolygonGeometry,
  largestPolygonLabelPoint,
  polygonDisplayLabelData,
} from './polygonDisplayLabels'

describe('polygon display labels', () => {
  it('creates one label at the centre of the largest polygon part', () => {
    const data = polygonDisplayLabelData({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          id: 'area-a',
          properties: { divisionId: 'a', label: 'Area A' },
          geometry: {
            type: 'MultiPolygon',
            coordinates: [
              [
                [
                  [0, 0],
                  [1, 0],
                  [1, 1],
                  [0, 1],
                  [0, 0],
                ],
              ],
              [
                [
                  [10, 10],
                  [14, 10],
                  [14, 12],
                  [10, 12],
                  [10, 10],
                ],
              ],
            ],
          },
        },
      ],
    })

    expect(data.features).toHaveLength(1)
    expect(data.features[0]).toMatchObject({
      id: 'area-a',
      properties: { divisionId: 'a', label: 'Area A' },
      geometry: { type: 'Point', coordinates: [12, 11] },
    })
  })

  it('places the label in the broad interior away from the hole', () => {
    const point = largestPolygonLabelPoint({
      type: 'Polygon',
      coordinates: [
        [
          [0, 0],
          [6, 0],
          [6, 4],
          [0, 4],
          [0, 0],
        ],
        [
          [4, 1],
          [5, 1],
          [5, 3],
          [4, 3],
          [4, 1],
        ],
      ],
    })
    expect(point[0]).toBeCloseTo(2, 2)
    expect(point[1]).toBeCloseTo(2, 2)
  })

  it('removes detached smaller parts without changing the largest polygon', () => {
    const largest = [
      [0, 0],
      [4, 0],
      [4, 2],
      [0, 2],
      [0, 0],
    ]
    expect(
      largestPolygonGeometry({
        type: 'MultiPolygon',
        coordinates: [
          [
            [
              [10, 10],
              [11, 10],
              [11, 11],
              [10, 11],
              [10, 10],
            ],
          ],
          [largest],
        ],
      }),
    ).toEqual({ type: 'Polygon', coordinates: [largest] })
  })
})
