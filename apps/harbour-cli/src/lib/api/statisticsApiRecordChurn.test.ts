import { expect, test } from 'bun:test'
import { buildStatisticsRecordChurn } from './statisticsApiRecordChurn'
import type { StatisticsStatsData } from './statisticsApiReleaseSetStats'

type RecordRow = StatisticsStatsData['records'][number]
const record = (overrides: Partial<RecordRow> = {}): RecordRow => ({
  id: '2025-record',
  datasetCode: 'population',
  sourceReleaseId: 'source-2025',
  sourceFeatureRef: 'publisher/2025/feature:23',
  divisionId: 'division-one',
  referencePeriodCode: '2025',
  referencePeriodStart: '2025-01-01',
  referencePeriodEnd: '2025-12-31',
  referencePeriodGranularity: 'year',
  referencePeriodEndYear: '2025',
  geography: {
    kind: 'district',
    code: 'one',
    areaCompanion: { cohortKey: '2025', domainCode: 'geographic', variant: 'censtatd' },
  },
  dimensions: { sex: 'female', age: 'adult' },
  values: { population: '10', households: '4' },
  versionHash: 'hash-2025',
  isCurrent: true,
  createdAt: '2025-01-01',
  updatedAt: '2025-01-01',
  ...overrides,
})

test('period, provenance, JSON key order and geometry cohort alone do not change a record', () => {
  const previous = record({
    id: '2024-record',
    sourceReleaseId: 'source-2024',
    sourceFeatureRef: 'publisher/2024/feature:5',
    referencePeriodCode: '2024',
    referencePeriodStart: '2024-01-01',
    referencePeriodEnd: '2024-12-31',
    referencePeriodEndYear: '2024',
    versionHash: 'hash-2024',
    createdAt: 'earlier',
    updatedAt: 'earlier',
    geography: {
      kind: 'district',
      code: 'one',
      areaCompanion: {
        cohortKey: '2024',
        variant: 'censtatd',
        domainCode: 'geographic',
      },
    },
    dimensions: { age: 'adult', sex: 'female' },
    values: { households: '4', population: '10' },
  })
  expect(buildStatisticsRecordChurn([record()], [previous])).toEqual({
    count: 1,
    added_count: 0,
    removed_count: 0,
    changed_count: 0,
    unchanged_count: 1,
  })
})

test('literal values, publisher status, field membership and division linkage count as changes', () => {
  const patches: Partial<RecordRow>[] = [
    { values: { population: '11', households: '4' } },
    { values: { population: 'suppressed', households: '4' } },
    { values: { population: '10' } },
    { values: { population: '10', households: '4', added: '1' } },
    { divisionId: null },
  ]
  for (const patch of patches) {
    expect(buildStatisticsRecordChurn([record(patch)], [record()])).toEqual({
      count: 1,
      added_count: 0,
      removed_count: 0,
      changed_count: 1,
      unchanged_count: 0,
    })
  }
})

test('dataset, geography and dimension identities remain distinct', () => {
  const patches: Partial<RecordRow>[] = [
    { datasetCode: 'housing' },
    { geography: { kind: 'district', code: 'two' } },
    { geography: { kind: 'new-town', code: 'one' } },
    { geography: { kind: 'district', code: 'one', class: 'urban' } },
    { dimensions: { age: 'adult', sex: 'male' } },
  ]
  for (const patch of patches) {
    expect(buildStatisticsRecordChurn([record(patch)], [record()])).toEqual({
      count: 1,
      added_count: 1,
      removed_count: 1,
      changed_count: 0,
      unchanged_count: 0,
    })
  }
})

test('duplicate retained copies match identical payloads first regardless of input order', () => {
  const a = record(),
    b = record({ values: { population: '20' } }),
    c = record({ values: { population: '30' } })
  const before = [a, a, b, c]
  const after = [b, record({ values: { population: '40' } }), a]
  const expected = {
    count: 3,
    added_count: 0,
    removed_count: 1,
    changed_count: 1,
    unchanged_count: 2,
  }
  expect(buildStatisticsRecordChurn(after, before)).toEqual(expected)
  expect(
    buildStatisticsRecordChurn([...after].reverse(), [...before].reverse()),
  ).toEqual(expected)
  expect(buildStatisticsRecordChurn(before, after)).toEqual({
    ...expected,
    count: 4,
    added_count: 1,
    removed_count: 0,
  })
})

test('first releases are all added and empty releases conserve removed records', () => {
  expect(buildStatisticsRecordChurn([record(), record()])).toEqual({
    count: 2,
    added_count: 2,
    changed_count: 0,
    removed_count: 0,
    unchanged_count: 0,
  })
  expect(buildStatisticsRecordChurn([], [record()])).toEqual({
    count: 0,
    added_count: 0,
    changed_count: 0,
    removed_count: 1,
    unchanged_count: 0,
  })
  expect(buildStatisticsRecordChurn([])).toEqual({
    count: 0,
    added_count: 0,
    changed_count: 0,
    removed_count: 0,
    unchanged_count: 0,
  })
})
