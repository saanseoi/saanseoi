import { expect, test } from 'bun:test'
import fixture from '../../../../../../fixtures/meta/curations/saanseoi-division/division-geometry.json'
import { assembleCuratedDivisions } from './assemble'

const id = 'bdb9c4be-d63c-4f59-8841-a28edc314d81'
const drawing = fixture.features.find(feature => feature.properties.divisionId === id)!
const input = {
  divisions: [
    {
      id,
      class: 'town',
      category: 'locality',
      level: 3,
      geometry: { type: 'Point', coordinates: [113.8636197, 22.2541524] },
    },
  ],
  names: [],
  areas: [],
  hierarchy: { entries: [] },
  estimatedAreas: { features: [drawing] },
  islands: [],
}

test('Tai O publishes the exported core point inside its unchanged curated polygon', () => {
  const result = assembleCuratedDivisions(input)
  const point = drawing.properties.corePoint!
  expect(point).toEqual([113.86301225825224, 22.253648978814084])
  expect(JSON.parse(result.divisions[0]!.geometry)).toEqual({
    type: 'Point',
    coordinates: point,
  })
  expect(result.divisions[0]).not.toHaveProperty('bbox')
  expect(JSON.parse(result.areas[0]!.geometry)).toEqual(drawing.geometry)
})

test('Tai O source point alone fails canonical area validation', () => {
  const withoutOverride = structuredClone(drawing)
  delete withoutOverride.properties.corePoint
  expect(() =>
    assembleCuratedDivisions({
      ...input,
      estimatedAreas: { features: [withoutOverride] },
    }),
  ).toThrow('point lies outside the interior of its canonical area')
})
