import { describe, expect, it } from 'vitest'
import { buildDiff, type DiffInputFeature } from '../src/lib/diff'

const labelFeature = (
  id: number,
  sourceLayer: string,
  label: string | undefined,
  geometry: DiffInputFeature['geometry'],
  properties: Record<string, unknown> = {},
): DiffInputFeature => ({
  id,
  sourceLayer,
  label,
  geometry,
  properties,
})

describe('basemap label diff', () => {
  it('ignores geometry, IDs, and coverage properties when labels match', () => {
    const primary = labelFeature(
      1,
      'roads',
      'Main Street',
      {
        type: 'LineString',
        coordinates: [
          [1, 1],
          [2, 2],
        ],
      },
      { kind: 'road' },
    )
    const comparison = labelFeature(
      2,
      'roads',
      'Main Street',
      {
        type: 'LineString',
        coordinates: [
          [20, 20],
          [30, 30],
        ],
      },
      { kind: 'path' },
    )

    const result = buildDiff([primary], [comparison])

    expect(result.summary).toEqual({ added: 0, removed: 0, labelChanges: [] })
    expect(result.data.features).toHaveLength(0)
  })

  it('reports added and removed labels while ignoring relocated labels', () => {
    const result = buildDiff(
      [
        labelFeature(1, 'places', 'Old place', {
          type: 'Point',
          coordinates: [1, 1],
        }),
        labelFeature(2, 'roads', 'Same road', {
          type: 'LineString',
          coordinates: [
            [1, 1],
            [2, 2],
          ],
        }),
      ],
      [
        labelFeature(3, 'places', 'New place', {
          type: 'Point',
          coordinates: [10, 10],
        }),
        labelFeature(4, 'roads', 'Same road', {
          type: 'LineString',
          coordinates: [
            [20, 20],
            [30, 30],
          ],
        }),
      ],
    )

    expect(result.summary).toEqual({
      added: 1,
      removed: 1,
      labelChanges: [
        {
          status: 'added',
          label: 'New place',
          sourceLayer: 'places',
          featureId: 3,
          centre: [10, 10],
        },
        {
          status: 'removed',
          label: 'Old place',
          sourceLayer: 'places',
          featureId: 1,
          centre: [1, 1],
        },
      ],
    })
    expect(
      result.data.features.map(feature => [feature.id, feature.properties.diffStatus]),
    ).toEqual([
      [3, 'added'],
      [1, 'removed'],
    ])
  })

  it('treats a renamed label as one addition and one removal', () => {
    const result = buildDiff(
      [
        labelFeature(9, 'places', 'Old name', {
          type: 'Point',
          coordinates: [1, 1],
        }),
      ],
      [
        labelFeature(9, 'places', 'New name', {
          type: 'Point',
          coordinates: [2, 2],
        }),
      ],
    )

    expect(result.summary).toEqual({
      added: 1,
      removed: 1,
      labelChanges: [
        {
          status: 'added',
          label: 'New name',
          sourceLayer: 'places',
          featureId: 9,
          centre: [2, 2],
        },
        {
          status: 'removed',
          label: 'Old name',
          sourceLayer: 'places',
          featureId: 9,
          centre: [1, 1],
        },
      ],
    })
    expect(result.data.features.map(feature => feature.properties.diffStatus)).toEqual([
      'added',
      'removed',
    ])
  })

  it('does not emit unlabeled features', () => {
    const unlabeled: DiffInputFeature = {
      id: 10,
      sourceLayer: 'landuse',
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 1],
            [0, 0],
          ],
        ],
      },
      properties: { kind: 'park' },
    }

    expect(buildDiff([unlabeled], []).summary).toEqual({
      added: 0,
      removed: 0,
      labelChanges: [],
    })
    expect(buildDiff([unlabeled], []).data.features).toHaveLength(0)
  })

  it('keeps line and area geometry only as label placement anchors', () => {
    const result = buildDiff(
      [],
      [
        labelFeature(11, 'roads', 'New road', {
          type: 'LineString',
          coordinates: [
            [1, 1],
            [2, 2],
          ],
        }),
        labelFeature(12, 'landuse', 'New park', {
          type: 'Polygon',
          coordinates: [
            [
              [0, 0],
              [1, 0],
              [1, 1],
              [0, 1],
              [0, 0],
            ],
          ],
        }),
      ],
    )

    expect(
      result.data.features.map(feature => [
        feature.properties.diffStatus,
        feature.properties.diffGeometry,
      ]),
    ).toEqual([
      ['added', 'area'],
      ['added', 'line'],
    ])
  })
})
