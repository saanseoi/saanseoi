import { describe, expect, test } from 'bun:test'

import {
  buildGeometryReleaseStatsRows,
  buildAddressApiReleaseSetStatsRows,
  buildAddressReleaseStatsRows,
  buildDivisionApiReleaseSetStatsRows,
  buildLocaleStatsRows,
  type ChurnCounts,
} from './stats'
import {
  collectAddressCoverageCounts,
  type ResolvedAddressRecord,
} from './addressPipeline/types'

const churnCounts: ChurnCounts = {
  added_count: 2,
  changed_count: 3,
  count: 10,
  removed_count: 1,
  unchanged_count: 4,
}

describe('stats rows', () => {
  test('builds release-owned district geometry rows with only applicable metrics', () => {
    const areas = buildGeometryReleaseStatsRows(
      'divisionArea',
      new Map([
        [
          'district-a',
          {
            featureCount: 1,
            polygonCount: 2,
            area: 1.234567,
            boundarySegmentCount: 12,
            boundaryLength: 4.56789,
          },
        ],
      ]),
      '2026-08-17T00:00:00.000Z',
    )
    expect(
      areas.map(row => [row.type, row.dimension, row.metric, row.metricUnit]),
    ).toEqual([
      ['release', 'geometry', 'feature_count', 'count'],
      ['release', 'geometry', 'polygon_count', 'count'],
      ['release', 'geometry', 'area', 'square_kilometres'],
      ['release', 'geometry', 'boundary_segment_count', 'count'],
      ['release', 'geometry', 'boundary_length', 'kilometres'],
    ])
    expect(
      buildGeometryReleaseStatsRows(
        'divisionBoundary',
        new Map([
          [
            'district-a',
            { featureCount: 1, boundarySegmentCount: 1, boundaryLength: 2 },
          ],
        ]),
      ).map(row => row.metric),
    ).toEqual(['feature_count', 'boundary_segment_count', 'boundary_length'])
  })
  test('counts village-addressed premises as a distinct address component', () => {
    const { componentCounts } = collectAddressCoverageCounts([
      {
        base: { districtId: 'district' },
        coverageComponents: ['village_name'],
        i18n: [{ locale: 'en', streetName: null }],
      } as unknown as ResolvedAddressRecord,
    ])

    expect(componentCounts).toEqual({ village_name: 1 })
  })

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
      byDistrict: { 'district-id': 10 },
      componentCounts: { building_name: 4, street_name: 8 },
      districtLinkedCount: 10,
      areaLinkedCount: 10,
      missingStreetCount: 3,
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
        dimension: 'component_coverage',
        groupBy: 'addressComponent',
        groupValue: 'street_name',
        metric: 'completeness',
        metricUnit: 'percentage',
        value: 80,
      }),
    )
    expect(rows).toContainEqual(
      expect.objectContaining({
        dimension: 'records',
        groupBy: 'district',
        groupValue: 'district-id',
        metric: 'distribution',
        value: 10,
      }),
    )
    expect(rows).toContainEqual(
      expect.objectContaining({
        dimension: 'records',
        groupBy: 'divisionLevel',
        groupValue: 'district',
        metric: 'linkage',
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

  test('builds address source-release lifecycle stats', () => {
    const rows = buildAddressReleaseStatsRows({
      addedRows: 2,
      changedRows: 3,
      componentCounts: { street_name: 10, village_name: 10 },
      deletedRows: 1,
      districtCounts: { district: 10 },
      localeCounts: { en: 10 },
      localisedRows: 18,
      processedRows: 10,
      recordedRows: 10,
      unchangedRows: 5,
    })

    expect(rows).toContainEqual(
      expect.objectContaining({
        dimension: 'added_count',
        metric: 'churn',
        type: 'release',
        value: 2,
      }),
    )
    expect(rows).toContainEqual(
      expect.objectContaining({
        dimension: 'localised_records',
        groupBy: 'table',
        groupValue: 'address2dI18n',
        metric: 'count',
        type: 'release',
        value: 18,
      }),
    )
    expect(rows).toContainEqual(
      expect.objectContaining({
        dimension: 'component_coverage',
        groupBy: 'addressComponent',
        groupValue: 'street_name',
        metric: 'completeness',
        metricUnit: 'percentage',
        value: 100,
      }),
    )
    expect(rows).toContainEqual(
      expect.objectContaining({
        dimension: 'component_coverage',
        groupBy: 'addressComponent',
        groupValue: 'village_name',
        metric: 'completeness',
        metricUnit: 'percentage',
        value: 100,
      }),
    )
    expect(rows).toContainEqual(
      expect.objectContaining({
        dimension: 'records',
        groupBy: 'district',
        groupValue: 'district',
        metric: 'distribution',
        value: 10,
      }),
    )
  })

  test('builds division API release set presentation rows', () => {
    const rows = buildDivisionApiReleaseSetStatsRows({
      byDistrict: { 'district-id': 19 },
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
        groupBy: 'district',
        groupValue: 'district-id',
        metric: 'distribution',
        value: 19,
      }),
    )
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
