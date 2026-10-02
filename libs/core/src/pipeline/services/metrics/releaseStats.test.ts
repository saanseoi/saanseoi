import { describe, expect, test } from 'bun:test'

import {
  buildGeometryReleaseStatsRows,
  buildAddressApiReleaseSetStatsRows,
  buildAddressReleaseStatsRows,
  buildDivisionApiReleaseSetStatsRows,
  buildLocaleStatsRows,
  type ChurnCounts,
} from './releaseStats'
import {
  collectAddressCoverageCounts,
  type ResolvedAddressRecord,
} from '../addresses/types'

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
    expect(areas.map(row => [row.category, row.measure, row.unit])).toEqual([
      ['geometry', 'feature_count', 'count'],
      ['geometry', 'polygon_count', 'count'],
      ['geometry', 'area', 'square_kilometres'],
      ['geometry', 'boundary_segment_count', 'count'],
      ['geometry', 'boundary_length', 'kilometres'],
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
      ).map(row => row.measure),
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
      aiTranslatedCoverage: new Map(),
      count: new Map([['en', 2]]),
      humanTranslatedCoverage: new Map(),
      inferredCoverage: new Map(),
      providedCoverage: new Map([['en', 1]]),
      total: 4,
    })

    expect(rows.every(row => !('kind' in row))).toBe(true)
    expect(rows).toContainEqual(
      expect.objectContaining({
        category: 'completeness',
        dimension: 'locale',
        dimensionValue: 'en',
        measure: 'locale_coverage',
        unit: 'percentage',

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
      quality: {
        ambiguous_area_count: 1,
        ambiguous_district_count: 0,
        unmatched_area_count: 2,
        unmatched_district_count: 4,
      },
      streetLinkedCount: 0,
      churn: {
        address2d: churnCounts,
        totals: churnCounts,
      },
    })

    expect(rows.every(row => !('kind' in row))).toBe(true)
    expect(rows).toContainEqual(
      expect.objectContaining({
        category: 'records',
        dimension: null,
        measure: 'count',
        unit: 'count',
        value: 10,
      }),
    )
    expect(rows).toContainEqual(
      expect.objectContaining({
        category: 'completeness',
        dimension: 'addressComponent',
        dimensionValue: 'street_name',
        measure: 'component_coverage',
        unit: 'percentage',
        value: 80,
      }),
    )
    expect(rows).toContainEqual(
      expect.objectContaining({
        category: 'records',
        dimension: 'district',
        dimensionValue: 'district-id',
        measure: 'count',
        value: 10,
      }),
    )
    expect(rows).toContainEqual(
      expect.objectContaining({
        category: 'records',
        dimension: 'divisionLevel',
        dimensionValue: 'district',
        measure: 'linkage',
        value: 10,
      }),
    )
    expect(rows).toContainEqual(
      expect.objectContaining({
        category: 'detail_records',
        dimension: 'table',
        dimensionValue: 'address3d',
        value: 4,
      }),
    )
    expect(rows).toContainEqual(
      expect.objectContaining({
        category: 'records',
        dimension: 'divisionLevel',
        dimensionValue: 'street',
        measure: 'linkage',
        value: 0,
      }),
    )
    expect(rows).toContainEqual(
      expect.objectContaining({
        category: 'quality',
        measure: 'missing_street_count',
        value: 3,
      }),
    )
    expect(rows).toContainEqual(
      expect.objectContaining({
        category: 'quality',
        measure: 'ambiguous_area_count',
        value: 1,
      }),
    )
    expect(rows).toContainEqual(
      expect.objectContaining({
        category: 'changes',
        dimension: 'table',
        dimensionValue: 'address2d',
        measure: 'added_count',
        value: 2,
      }),
    )
  })

  test('builds address source-release lifecycle stats', () => {
    const rows = buildAddressReleaseStatsRows({
      address3dCount: 3,
      address3dI18nCount: 6,
      addedRows: 2,
      changedRows: 3,
      componentCounts: { street_name: 10, village_name: 10 },
      deletedRows: 1,
      districtCounts: { district: 10 },
      localeCounts: { en: 10 },
      localisedRows: 18,
      processedRows: 10,
      quality: {
        ambiguous_area_count: 1,
        ambiguous_district_count: 2,
        unmatched_area_count: 3,
        unmatched_district_count: 4,
      },
      recordedRows: 10,
      unchangedRows: 5,
    })

    expect(
      rows.filter(row => row.dimension === 'table' && row.measure === 'count'),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ dimensionValue: 'address2d', value: 10 }),
        expect.objectContaining({ dimensionValue: 'address2dI18n', value: 18 }),
        expect.objectContaining({ dimensionValue: 'address3d', value: 3 }),
        expect.objectContaining({ dimensionValue: 'address3dI18n', value: 6 }),
      ]),
    )
    expect(rows).toContainEqual(
      expect.objectContaining({
        category: 'changes',
        measure: 'added_count',

        value: 2,
      }),
    )
    expect(rows).toContainEqual(
      expect.objectContaining({
        category: 'localised_records',
        dimension: 'table',
        dimensionValue: 'address2dI18n',
        measure: 'count',

        value: 18,
      }),
    )
    expect(rows).toContainEqual(
      expect.objectContaining({
        category: 'completeness',
        dimension: 'addressComponent',
        dimensionValue: 'street_name',
        measure: 'component_coverage',
        unit: 'percentage',
        value: 100,
      }),
    )
    expect(rows).toContainEqual(
      expect.objectContaining({
        category: 'completeness',
        dimension: 'addressComponent',
        dimensionValue: 'village_name',
        measure: 'component_coverage',
        unit: 'percentage',
        value: 100,
      }),
    )
    expect(rows).toContainEqual(
      expect.objectContaining({
        category: 'records',
        dimension: 'district',
        dimensionValue: 'district',
        measure: 'count',
        value: 10,
      }),
    )
    expect(rows).toContainEqual(
      expect.objectContaining({
        category: 'quality',
        measure: 'unmatched_district_count',
        value: 4,
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

    expect(rows.every(row => !('kind' in row))).toBe(true)
    expect(rows).toContainEqual(
      expect.objectContaining({
        category: 'records',
        dimension: 'district',
        dimensionValue: 'district-id',
        measure: 'count',
        value: 19,
      }),
    )
    expect(rows).toContainEqual(
      expect.objectContaining({
        category: 'records',
        dimension: 'table',
        dimensionValue: 'divisions',
        value: 19,
      }),
    )
    expect(rows).toContainEqual(
      expect.objectContaining({
        category: 'records',
        dimension: 'divisionType',
        dimensionValue: 'district',
        value: 18,
      }),
    )
    expect(rows).toContainEqual(
      expect.objectContaining({
        category: 'quality',
        measure: 'parent_changed_count',
        value: 4,
      }),
    )
    expect(rows).toContainEqual(
      expect.objectContaining({
        category: 'changes',
        dimension: 'divisionType',
        dimensionValue: 'district',
        measure: 'changed_count',
        value: 3,
      }),
    )
  })
})
