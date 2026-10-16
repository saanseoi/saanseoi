import { expect, it } from 'vitest'
import { cleanIslandGeometries } from '../src/tools/division-areas/islandCleanup'
const rect = (a: number, b: number) => ({
  type: 'Polygon',
  coordinates: [
    [
      [a, 0],
      [b, 0],
      [b, 1],
      [a, 1],
      [a, 0],
    ],
  ],
})
it('clips a null-level reference island without changing inputs or other drawings', () => {
  const estimatedAreas: any = {
    schemaVersion: 1,
    features: [
      { type: 'Feature', properties: { divisionId: 'other' }, geometry: rect(4, 5) },
    ],
  }
  const inventory: any = {
    divisions: [{ id: 'island', class: 'minor_island', level: null }],
  }
  const references: any = [
    { type: 'Feature', properties: { divisionId: 'island' }, geometry: rect(0, 2) },
  ]
  const before = structuredClone({ estimatedAreas, inventory, references })
  const land: any = {
    type: 'FeatureCollection',
    features: [{ type: 'Feature', properties: {}, geometry: rect(0, 1) }],
  }
  const result = cleanIslandGeometries(
    estimatedAreas,
    inventory,
    references,
    land,
    new Set(['island']),
  )
  expect(result.count).toBe(1)
  expect(result.estimatedAreas.features[0]).toEqual(estimatedAreas.features[0])
  expect(
    Math.max(
      ...(result.estimatedAreas.features[1]!.geometry.coordinates.flat(2) as number[]),
    ),
  ).toBe(1)
  expect({ estimatedAreas, inventory, references }).toEqual(before)
})
