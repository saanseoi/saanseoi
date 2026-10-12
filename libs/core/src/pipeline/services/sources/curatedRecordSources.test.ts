import { expect, test } from 'bun:test'
import { curatedRecordSources } from './curatedRecordSources'

test('retains only concrete references and deduplicates roles for the same input', () => {
  const ref = {
    dataset: 'ds-hk-protomaps-island',
    recordId: 'land',
    componentIndexes: [0, 2],
  }
  expect(
    curatedRecordSources(
      {
        protomaps: [
          {
            ...ref,
            contributions: ['geometry'],
            matchingRule: 'exact',
            method: 'source-selection',
          },
          { ...ref, contributions: ['land-mask'] },
        ],
        saanseoi: [
          { method: 'intersect', contributions: ['geometry'] },
          {
            dataset: 'ds-hk-saanseoi-division',
            recordId: 'review-alias',
            curation: 'island-areas',
          },
        ],
        openstreetmap: [{ url: 'https://example.com', recordId: 'lookup' }],
      },
      'area',
    ),
  ).toEqual([
    { publisherCode: 'protomaps', dataset: ref.dataset, recordId: ref.recordId },
  ])
})

test('curation references remain in the retained internal source rather than public attribution', () => {
  const expected: ReturnType<typeof curatedRecordSources> = []
  const result = curatedRecordSources(
    {
      saanseoi: [
        {
          dataset: 'ds-hk-saanseoi-division',
          recordId: 'division',
          curation: 'division-geometry',
          contributions: ['geometry'],
        },
      ],
    },
    'area',
  )
  expect(result).toEqual(expected)
  expect(curatedRecordSources(result, 'area')).toEqual(expected)
})

test('invalid component references cannot be silently retained', () => {
  expect(() =>
    curatedRecordSources(
      { protomaps: [{ dataset: 'ds-test', recordId: 'x', componentIndexes: [2, 1] }] },
      'area',
    ),
  ).toThrow('component indexes')
})
