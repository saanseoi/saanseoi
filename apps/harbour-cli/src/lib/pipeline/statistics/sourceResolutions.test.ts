import { expect, test } from 'bun:test'
import { statisticSourceResolutions } from './sourceResolutions'

test('statistics retain all resolved observations against the exact source and release', () => {
  const sources = new Map([
    ['publisher/ref', { sourceRecordId: 'source', versionHash: 'hash' }],
  ])
  const records = ['observation-b', 'observation-a'].map(id => ({
    id,
    fieldSources: {
      population: { sourceFeatureRef: 'publisher/ref', sourceReleaseId: 'release' },
    },
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

test('resolves every contributing source once and excludes sources retained from older revisions', () => {
  const records = [
    {
      id: 'packed-record',
      referencePeriodEndYear: '2021',
      fieldSources: {
        population: { sourceFeatureRef: 'publisher/first', sourceReleaseId: 'release' },
        femalePopulation: {
          sourceFeatureRef: 'publisher/first',
          sourceReleaseId: 'release',
        },
        households: {
          sourceFeatureRef: 'publisher/second',
          sourceReleaseId: 'release',
        },
        landArea: { sourceFeatureRef: 'publisher/old', sourceReleaseId: 'old-release' },
      },
    },
  ]
  const sources = new Map([
    ['publisher/first', { sourceRecordId: 'first', versionHash: 'first-hash' }],
    ['publisher/second', { sourceRecordId: 'second', versionHash: 'second-hash' }],
  ])
  const resolutions = statisticSourceResolutions(records, sources, 'release')
  expect(resolutions).toHaveLength(2)
  expect(resolutions.map(resolution => resolution.row.sourceRecordId)).toEqual([
    'first',
    'second',
  ])
  for (const { row } of resolutions)
    expect(row.resolutions.entities.statistic).toEqual(['packed-record'])
})
