import { expect, test } from 'bun:test'
import { statisticSourceResolutions } from './sourceResolutions'

test('statistics retain all resolved observations against the exact source and release', () => {
  const sources = new Map([
    ['publisher/ref', { sourceRecordId: 'source', versionHash: 'hash' }],
  ])
  const records = ['observation-b', 'observation-a'].map(id => ({
    id,
    sourceFeatureRef: 'publisher/ref',
    divisionId: 'district',
    referencePeriodEndYear: '2021',
  }))
  expect(statisticSourceResolutions(records, sources, 'release')).toEqual([
    {
      shardYear: '2021',
      row: {
        snapshotId: null,
        sourceReleaseId: 'release',
        sourceRecordId: 'source',
        sourceVersionHash: 'hash',
        resolutions: {
          entities: {
            statistic: ['observation-a', 'observation-b'],
            division: ['district'],
          },
        },
      },
    },
  ])
  expect(() => statisticSourceResolutions(records, new Map(), 'release')).toThrow(
    'Missing publisher assertion',
  )
})
