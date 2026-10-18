import { describe, expect, test } from 'bun:test'
import {
  compareSnapshotRecords,
  compareStatisticSnapshots,
  snapshotContent,
} from './apiSnapshotChanges'

describe('assembled snapshot changes', () => {
  test('ignores storage metadata and compares translations by locale', () => {
    const before = snapshotContent({
      id: 'a',
      name: 'Hill',
      versionHash: 'old',
      snapshotId: 'old',
      updatedAt: 'old',
    })
    const after = snapshotContent({
      id: 'a',
      name: 'Hill',
      versionHash: 'new',
      snapshotId: 'new',
      updatedAt: 'new',
    })
    expect(
      compareSnapshotRecords(new Map([['a', before]]), new Map([['a', after]])).counts
        .unchanged,
    ).toBe(1)
    const result = compareSnapshotRecords(
      new Map([['a', { ...before, translations: { en: { name: 'Hill' } } }]]),
      new Map([['a', { ...after, translations: { en: { name: 'Mountain' } } }]]),
    )
    expect(result.records[0]?.type).toBe('changed')
    expect(result.records[0]?.fields[0]?.path).toEqual(['translations', 'en', 'name'])
  })
  test('includes additions and deletions with deterministic pagination order', () => {
    const result = compareSnapshotRecords(
      new Map([
        ['z', { id: 'z' }],
        ['b', { id: 'b' }],
      ]),
      new Map([
        ['a', { id: 'a' }],
        ['b', { id: 'b' }],
      ]),
    )
    expect(result.counts).toEqual({ added: 1, changed: 0, removed: 1, unchanged: 1 })
    expect(result.records.map(record => record.id)).toEqual(['a', 'z'])
    expect(result.total).toBe(2)
  })
})

import type { RetainedStatisticRecord } from '@repo/core/pipeline/services/statistics/statisticSnapshotRecords.ts'
import { isStatisticsComparisonBaseline } from './apiReleaseVersions'

const statistic = (period: string, value = '10'): RetainedStatisticRecord => ({
  id: `district-${period}`,
  datasetCode: 'population',
  divisionId: 'district',
  snapshotId: `snapshot-${period}`,
  sourceReleaseId: `source-${period}`,
  operation: 'upsert',
  versionHash: `hash-${period}`,
  createdAt: period,
  referencePeriodCode: period,
  referencePeriodStart: `${period}-01-01`,
  referencePeriodEnd: `${period}-12-31`,
  referencePeriodEndYear: period,
  referencePeriodGranularity: 'year',
  isCurrent: true,
  geography: {
    kind: 'district',
    code: 'one',
    areaCompanion: { domainCode: 'geographic', variant: 'censtatd', cohortKey: period },
  },
  fieldDefinitionHashes: { population: 'definition' },
  values: { population: value },
  fieldSources: [],
})

describe('statistics period comparison', () => {
  test('a new period and different record IDs do not imply additions or removals', () => {
    const result = compareStatisticSnapshots([statistic('2024')], [statistic('2025')])
    expect(result.counts).toEqual({ added: 0, changed: 0, removed: 0, unchanged: 1 })
    expect(result.records).toEqual([])
    expect(result.total).toBe(1)
  })
  test('different values produce a matched geography with only semantic field differences', () => {
    const result = compareStatisticSnapshots(
      [statistic('2024')],
      [statistic('2025', '11')],
    )
    expect(result.counts).toEqual({ added: 0, changed: 1, removed: 0, unchanged: 0 })
    expect(result.records[0]?.fields.map(field => field.path)).toEqual([
      ['values', 'population'],
    ])
    expect(result.records[0]?.before?.referencePeriodCode).toBe('2024')
    expect(result.records[0]?.after?.referencePeriodCode).toBe('2025')
  })
  test('field-definition revisions and geographic coverage differences remain visible', () => {
    const after = statistic('2025')
    after.fieldDefinitionHashes.population = 'revised-definition'
    expect(
      compareStatisticSnapshots([statistic('2024')], [after]).records[0]?.fields.map(
        field => field.path,
      ),
    ).toEqual([['fieldDefinitionHashes', 'population']])
    after.geography.code = 'two'
    expect(compareStatisticSnapshots([statistic('2024')], [after]).counts).toEqual({
      added: 1,
      changed: 0,
      removed: 1,
      unchanged: 0,
    })
  })
  test('the baseline keeps annual, quarterly, region and API contracts separate', () => {
    const selected = {
      apiVersionId: 'v1',
      regionCode: 'hk',
      domainCode: 'government',
      cohortKey: '2025',
    }
    expect(
      isStatisticsComparisonBaseline({ ...selected, cohortKey: '2024' }, selected),
    ).toBe(true)
    for (const patch of [
      { cohortKey: '2023-Q3' },
      { apiVersionId: 'v2' },
      { regionCode: 'mo' },
      { domainCode: 'other' },
      { cohortKey: null },
    ])
      expect(isStatisticsComparisonBaseline({ ...selected, ...patch }, selected)).toBe(
        false,
      )
  })
})
