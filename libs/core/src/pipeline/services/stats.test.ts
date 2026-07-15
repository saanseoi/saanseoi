import { describe, expect, test } from 'bun:test'

import {
  buildAddressApiReleaseSetStatsRows,
  buildDivisionApiReleaseSetStatsRows,
  buildLocaleStatsRows,
  type ChurnCounts,
} from './stats'

const churnCounts: ChurnCounts = {
  added_count: 2,
  changed_count: 3,
  count: 10,
  removed_count: 1,
  unchanged_count: 4,
}

describe('stats rows', () => {
  test('release locale stats use release scope', () => {
    const rows = buildLocaleStatsRows({
      altCoverage: new Map([['en', 1]]),
      count: new Map([['en', 2]]),
      nonInferredCoverage: new Map([['en', 1]]),
      total: 4,
    })

    expect(rows.every(row => row.type === 'release')).toBe(true)
    expect(rows).toContainEqual(
      expect.objectContaining({
        dimension: 'locale_coverage',
        groupBy: 'locale',
        groupValue: 'en',
        metric: 'completeness',
        metricUnit: 'percentage',
        type: 'release',
        value: 50,
      }),
    )
  })

  test('builds address API release set presentation rows', () => {
    const rows = buildAddressApiReleaseSetStatsRows({
      address2dCount: 10,
      address2dI18nCount: 18,
      address3dCount: 4,
      address3dI18nCount: 6,
      divisionLinkedCount: 9,
      missingDivisionCount: 1,
      missingStreetCount: 3,
      streetLinkedCount: 7,
      churn: {
        address2d: churnCounts,
        totals: churnCounts,
      },
    })

    expect(rows.every(row => row.type === 'apiReleaseSet')).toBe(true)
    expect(rows).toContainEqual(
      expect.objectContaining({
        dimension: 'records',
        groupBy: null,
        metric: 'count',
        metricUnit: 'count',
        value: 10,
      }),
    )
    expect(rows).toContainEqual(
      expect.objectContaining({
        dimension: 'detail_records',
        groupBy: 'table',
        groupValue: 'address3d',
        value: 4,
      }),
    )
    expect(rows).toContainEqual(
      expect.objectContaining({
        dimension: 'missing_street_count',
        metric: 'quality',
        value: 3,
      }),
    )
    expect(rows).toContainEqual(
      expect.objectContaining({
        dimension: 'added_count',
        groupBy: 'table',
        groupValue: 'address2d',
        metric: 'churn',
        value: 2,
      }),
    )
  })

  test('builds division API release set presentation rows', () => {
    const rows = buildDivisionApiReleaseSetStatsRows({
      byDivisionType: {
        country: 1,
        district: 18,
      },
      byLevel: {
        '0': 1,
        '2': 18,
      },
      churn: {
        byDivisionType: {
          district: churnCounts,
        },
        totals: churnCounts,
      },
      divisionCount: 19,
      divisionI18nCount: 42,
      quality: {
        geometry_changed_count: 1,
        locale_regression_count: 2,
        name_regression_count: 3,
        parent_changed_count: 4,
      },
    })

    expect(rows.every(row => row.type === 'apiReleaseSet')).toBe(true)
    expect(rows).toContainEqual(
      expect.objectContaining({
        dimension: 'records',
        groupBy: 'table',
        groupValue: 'divisions',
        value: 19,
      }),
    )
    expect(rows).toContainEqual(
      expect.objectContaining({
        dimension: 'records',
        groupBy: 'divisionType',
        groupValue: 'district',
        value: 18,
      }),
    )
    expect(rows).toContainEqual(
      expect.objectContaining({
        dimension: 'parent_changed_count',
        metric: 'quality',
        value: 4,
      }),
    )
    expect(rows).toContainEqual(
      expect.objectContaining({
        dimension: 'changed_count',
        groupBy: 'divisionType',
        groupValue: 'district',
        metric: 'churn',
        value: 3,
      }),
    )
  })
})
