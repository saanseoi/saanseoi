import { expect, test } from 'bun:test'
import { reconcileReviewStubs, mergeReviewStubs } from './reviewStubCuration'
import type { ReviewArea, ReviewInventory, StubAreas } from './geographicReview'
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
  properties: { divisionId: id, variant: 'stub', sourceAreaId: 'original' },
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
const stubs = (ids: string[]): StubAreas => ({
  type: 'FeatureCollection',
  schemaVersion: 1,
  region: 'hk',
  domain: 'geographic',
  cohort: 'test',
  variant: 'stub',
  features: ids.map(feature),
})
const holds = new Map([
  ['excluded', 'Excluded by curator.'],
  ['no-area', 'No geometry approved.'],
])

test('explicit curation withholds drawings without changing geometry or the input', () => {
  const original = stubs(['active', 'excluded', 'no-area'])
  const result = reconcileReviewStubs(original, inventory, holds)
  expect(result.features).toEqual([original.features[0]!])
  expect(result.withheld).toEqual([
    { feature: original.features[1]!, reason: 'Excluded by curator.' },
    { feature: original.features[2]!, reason: 'No geometry approved.' },
  ])
  expect(original.features).toHaveLength(3)
  expect(
    reconcileReviewStubs(JSON.parse(JSON.stringify(result)), inventory, holds),
  ).toEqual(result)
})

test('unknown IDs, duplicate IDs and invalid withheld geometry still block imports', () => {
  expect(() => reconcileReviewStubs(stubs(['unknown']), inventory, holds)).toThrow(
    'unique, known',
  )
  expect(() =>
    reconcileReviewStubs(stubs(['active', 'active']), inventory, holds),
  ).toThrow('Duplicate')
  const invalid = stubs(['excluded'])
  invalid.features[0]!.geometry = { type: 'Polygon', coordinates: [] }
  expect(() => reconcileReviewStubs(invalid, inventory, holds)).toThrow('Empty polygon')
})

test('imports replace matching drawings while preserving unrelated withheld work', () => {
  const current = reconcileReviewStubs(
    stubs(['active', 'excluded', 'no-area']),
    inventory,
    holds,
  )
  const imported = reconcileReviewStubs(stubs(['excluded']), inventory, holds)
  imported.withheld![0]!.feature.properties.sourceAreaId = 'new drawing'
  const result = reconcileReviewStubs(
    mergeReviewStubs(current, imported),
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
  const current = reconcileReviewStubs(stubs(['active', 'excluded']), inventory, holds)
  const admitted = {
    ...inventory,
    divisions: [...inventory.divisions, { ...inventory.divisions[0]!, id: 'excluded' }],
  }
  const result = reconcileReviewStubs(current, admitted, new Map())
  expect(result.features.map(f => f.properties.divisionId)).toEqual([
    'active',
    'excluded',
  ])
  expect(result.withheld).toBeUndefined()
})
