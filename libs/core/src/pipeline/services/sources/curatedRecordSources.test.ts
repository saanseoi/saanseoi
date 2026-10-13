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
            contributions: ['selection'],
          },
        ],
        openstreetmap: [{ url: 'https://example.com', recordId: 'lookup' }],
      },
      'area',
    ),
  ).toEqual([{ publisher: 'protomaps', dataset: ref.dataset, recordId: ref.recordId }])
})

test('authored curation retains publisher attribution without processing metadata', () => {
  const expected = [
    {
      publisher: 'saanseoi',
      dataset: 'ds-hk-saanseoi-division',
      recordId: 'division',
    },
  ]
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

test('authored geometry keeps attribution alongside construction evidence', () => {
  for (const evidence of [
    { method: 'union' },
    { islandGroup: { memberIds: ['island'] } },
    { geometryPartition: { method: 'intersect' } },
  ]) {
    expect(
      curatedRecordSources(
        {
          saanseoi: [
            {
              dataset: 'ds-hk-saanseoi-division',
              recordId: 'group',
              contributions: ['geometry'],
              ...evidence,
            },
          ],
        },
        'area',
      ),
    ).toEqual([
      {
        publisher: 'saanseoi',
        dataset: 'ds-hk-saanseoi-division',
        recordId: 'group',
      },
    ])
  }
})
