import { describe, expect, test } from 'vitest'
import type { MultiPolygon } from 'geojson'
import type {
  ReviewInventory,
  SaanseoiEstimatedAreas,
} from '../../../../../libs/core/src/pipeline/services/divisions/geographicReview'
import { removeAccidentalDetachedParts } from './detachedPartCleanup'

const square = (x: number, y: number, size: number) =>
  [
    [
      [x, y],
      [x + size, y],
      [x + size, y + size],
      [x, y + size],
      [x, y],
    ],
  ] as MultiPolygon['coordinates'][number]

function inputs(category: 'administrative' | 'hood' | 'landform') {
  const geometry: MultiPolygon = {
    type: 'MultiPolygon',
    coordinates: [
      square(114, 22, 0.01),
      square(114.02, 22, 0.002),
      square(114.03, 22, 0.0001),
    ],
  }
  return {
    inventory: {
      schemaVersion: 1,
      region: 'hk',
      domain: 'geographic',
      cohort: 'test',
      releaseSet: 'test',
      divisions: [
        {
          id: 'area',
          category,
          class: category === 'landform' ? 'minor_island' : 'neighbourhood',
          level: category === 'landform' ? null : 5,
          names: { en: 'Area' },
          point: [114.005, 22.005],
          hierarchies: { administrative: [], locality: [], full: [], landform: [] },
        },
      ],
    } satisfies ReviewInventory,
    estimatedAreas: {
      type: 'FeatureCollection',
      schemaVersion: 1,
      region: 'hk',
      domain: 'geographic',
      cohort: 'test',
      variant: 'saanseoi',
      features: [
        {
          type: 'Feature',
          id: 'saanseoi:area',
          properties: {
            divisionId: 'area',
            variant: 'saanseoi',
            name: 'Area',
            geometryOriginalDrawing: geometry,
          },
          geometry,
        },
      ],
      withheld: [],
    } satisfies SaanseoiEstimatedAreas,
  }
}

describe('one-time detached polygon cleanup', () => {
  test('removes only tiny detached parts from a locality and adopts the result as its baseline', () => {
    const { estimatedAreas, inventory } = inputs('hood')
    const result = removeAccidentalDetachedParts(estimatedAreas, inventory)
    expect(result.changes).toMatchObject([{ divisionId: 'area', removedPartCount: 1 }])
    expect(result.estimatedAreas.features[0]!.geometry.type).toBe('MultiPolygon')
    expect(
      result.estimatedAreas.features[0]!.geometry.type === 'MultiPolygon'
        ? result.estimatedAreas.features[0]!.geometry.coordinates
        : [],
    ).toHaveLength(2)
    expect(
      result.estimatedAreas.features[0]!.properties.geometryOriginalDrawing,
    ).toBeUndefined()
    expect(
      result.estimatedAreas.features[0]!.properties.geometryWorkingBaseline,
    ).toBeDefined()
  })

  test('retains every administrative component', () => {
    const { estimatedAreas, inventory } = inputs('administrative')
    const result = removeAccidentalDetachedParts(estimatedAreas, inventory)
    expect(result.changes).toEqual([])
    expect(result.estimatedAreas).toEqual(estimatedAreas)
  })

  test('keeps only the principal polygon for an individual island', () => {
    const { estimatedAreas, inventory } = inputs('landform')
    const result = removeAccidentalDetachedParts(estimatedAreas, inventory)
    expect(result.changes).toMatchObject([{ divisionId: 'area', removedPartCount: 2 }])
    expect(result.estimatedAreas.features[0]!.geometry.type).toBe('Polygon')
  })
})
