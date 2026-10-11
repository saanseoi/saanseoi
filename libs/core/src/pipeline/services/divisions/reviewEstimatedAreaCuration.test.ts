import { expect, test } from 'bun:test'
import {
  reconcileReviewEstimatedAreas,
  mergeReviewEstimatedAreas,
} from './reviewEstimatedAreaCuration'
import type {
  ReviewArea,
  ReviewInventory,
  SaanseoiEstimatedAreas,
} from './geographicReview'
const inventory: ReviewInventory = {
  schemaVersion: 1,
  region: 'hk',
  domain: 'geographic',
  cohort: 'test',
  releaseSet: 'test',
  divisions: [
    {
      id: 'active',
      category: 'hood',
      class: 'neighbourhood',
      level: 5,
      names: {},
      point: null,
      hierarchies: { full: [] },
    },
  ],
}
const feature = (id: string): ReviewArea => ({
  type: 'Feature',
  properties: { divisionId: id, variant: 'saanseoi', sourceAreaId: 'original' },
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
})
const estimatedAreas = (ids: string[]): SaanseoiEstimatedAreas => ({
  type: 'FeatureCollection',
  schemaVersion: 1,
  region: 'hk',
  domain: 'geographic',
  cohort: 'test',
  variant: 'saanseoi',
  features: ids.map(feature),
})
const holds = new Map([
  ['excluded', 'Excluded by curator.'],
  ['no-area', 'No geometry approved.'],
])

test('explicit curation withholds drawings without changing geometry or the input', () => {
  const original = estimatedAreas(['active', 'excluded', 'no-area'])
  const result = reconcileReviewEstimatedAreas(original, inventory, holds)
  expect(result.features).toEqual([original.features[0]!])
  expect(result.withheld).toEqual([
    { feature: original.features[1]!, reason: 'Excluded by curator.' },
    { feature: original.features[2]!, reason: 'No geometry approved.' },
  ])
  expect(original.features).toHaveLength(3)
  expect(
    reconcileReviewEstimatedAreas(JSON.parse(JSON.stringify(result)), inventory, holds),
  ).toEqual(result)
})

test('unknown IDs, duplicate IDs and invalid withheld geometry still block imports', () => {
  expect(() =>
    reconcileReviewEstimatedAreas(estimatedAreas(['unknown']), inventory, holds),
  ).toThrow('unique, known')
  expect(() =>
    reconcileReviewEstimatedAreas(
      estimatedAreas(['active', 'active']),
      inventory,
      holds,
    ),
  ).toThrow('Duplicate')
  const invalid = estimatedAreas(['excluded'])
  invalid.features[0]!.geometry = { type: 'Polygon', coordinates: [] }
  expect(() => reconcileReviewEstimatedAreas(invalid, inventory, holds)).toThrow(
    'Empty polygon',
  )
})

test('imports replace matching drawings while preserving unrelated withheld work', () => {
  const current = reconcileReviewEstimatedAreas(
    estimatedAreas(['active', 'excluded', 'no-area']),
    inventory,
    holds,
  )
  const imported = reconcileReviewEstimatedAreas(
    estimatedAreas(['excluded']),
    inventory,
    holds,
  )
  imported.withheld![0]!.feature.properties.sourceAreaId = 'new drawing'
  const result = reconcileReviewEstimatedAreas(
    mergeReviewEstimatedAreas(current, imported),
    inventory,
    holds,
  )
  expect(result.features).toEqual(current.features)
  expect(result.withheld).toHaveLength(2)
  expect(
    result.withheld!.find(item => item.feature.properties.divisionId === 'excluded')!
      .feature.properties.sourceAreaId,
  ).toBe('new drawing')
  expect(current.withheld![0]!.feature.properties.sourceAreaId).toBe('original')
})

test('a drawing becomes active when curation admits its identity', () => {
  const current = reconcileReviewEstimatedAreas(
    estimatedAreas(['active', 'excluded']),
    inventory,
    holds,
  )
  const admitted = {
    ...inventory,
    divisions: [...inventory.divisions, { ...inventory.divisions[0]!, id: 'excluded' }],
  }
  const result = reconcileReviewEstimatedAreas(current, admitted, new Map())
  expect(result.features.map(f => f.properties.divisionId)).toEqual([
    'active',
    'excluded',
  ])
  expect(result.withheld).toBeUndefined()
})
