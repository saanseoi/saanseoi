import { describe, expect, test } from 'bun:test'

import {
  buildCenstatdGeographyLinkAuditActions,
  buildCenstatdReleaseStats,
  buildCenstatdStructuralChurnStats,
  censtatdReleaseStatsProfileFor,
} from './censtatdReleaseStats'

const timestamp = '2026-08-18T00:00:00.000Z'

describe('buildCenstatdReleaseStats', () => {
  test('counts two-layer HMA/building-group source features and structural observations', () => {
    const rows = buildCenstatdReleaseStats(
      [
        { featureId: 'bg-1', layerName: 'BG_21C' },
        { featureId: 'bg-2', layerName: 'BG_21C' },
        { featureId: 'hma-1', layerName: 'HMA_21C' },
      ],
      {
        dimensions: [
          { dimensionCode: 'housing-market-area' },
          { dimensionCode: 'building-group' },
        ],
        fields: [
          {
            aggregation: 'total',
            aggregationPercentile: null,
            periodicity: null,
            dimensions: {},
            fieldName: 't_pop',
            statisticKind: 'count',
            unitCode: 'person',
          },
          {
            aggregation: 'none',
            aggregationPercentile: null,
            periodicity: null,
            dimensions: {},
            fieldName: 'status',
            statisticKind: 'quantity',
            unitCode: 'category',
          },
        ],
        observations: [
          {
            fieldName: 't_pop',
            numericValue: '100',
            observationStatus: 'published',
            referencePeriodCode: '2021',
          },
          {
            fieldName: 'status',
            numericValue: null,
            observationStatus: 'suppressed',
            referencePeriodCode: '2021',
          },
        ],
        values: [
          { dimensionCode: 'housing-market-area', valueCode: 'A' },
          { dimensionCode: 'building-group', valueCode: 'A-1' },
          { dimensionCode: 'building-group', valueCode: 'A-2' },
        ],
      },
      censtatdReleaseStatsProfileFor(
        'ds-hk-hkgov-censtatd-division-statistic-housing-market-areas-building-groups',
        '2021',
      ),
      timestamp,
    )

    expect(rows).toContainEqual(
      expect.objectContaining({ dimension: 'records', metric: 'count', value: 3 }),
    )
    expect(rows).toContainEqual(
      expect.objectContaining({
        dimension: 'records',
        groupBy: 'sourceLayer',
        groupValue: 'BG_21C',
        value: 2,
      }),
    )
    expect(rows).toContainEqual(
      expect.objectContaining({
        dimension: 'observations',
        groupBy: 'valueKind',
        groupValue: 'categorical',
        value: 1,
      }),
    )
    expect(rows).toContainEqual(
      expect.objectContaining({
        dimension: 'dimensions',
        metric: 'value_definition_count',
        value: 3,
      }),
    )
  })

  test('keeps actual-person density values structural rather than summing them', () => {
    const rows = buildCenstatdReleaseStats(
      [{ featureId: '11', layerName: 'Density_2024' }],
      {
        dimensions: [{ dimensionCode: 'district' }],
        fields: [
          {
            aggregation: 'total',
            aggregationPercentile: null,
            periodicity: null,
            dimensions: {},
            fieldName: 'MYPOPN_LAND',
            statisticKind: 'count',
            unitCode: 'person',
          },
        ],
        observations: [
          {
            fieldName: 'MYPOPN_LAND',
            numericValue: '243300',
            observationStatus: 'published',
            referencePeriodCode: '2024',
          },
        ],
        values: [{ dimensionCode: 'district', valueCode: '11' }],
      },
      censtatdReleaseStatsProfileFor(
        'ds-hk-hkgov-censtatd-division-statistic-land-area-population-density-district',
        '2024',
      ),
      timestamp,
    )

    expect(
      rows.find(row => row.dimension === 'observations' && !row.groupBy)?.value,
    ).toBe(1)
    expect(rows.some(row => row.value === 243300)).toBeFalse()
  })

  test('declares reviewed district links and pending statistical domains distinctly', () => {
    const district = censtatdReleaseStatsProfileFor(
      'ds-hk-hkgov-censtatd-division-statistic-subdivided-units-district',
      '2016',
    )
    expect(district.geographyLink).toEqual({
      cohortKey: '2016',
      domain: 'administrative',
      kind: 'reviewed_canonical_link',
    })
    expect(buildCenstatdGeographyLinkAuditActions(district, 18)).toEqual([
      expect.objectContaining({
        action: 'map_censtatd_district_code_to_canonical_division',
        affectedRecordCount: 18,
      }),
    ])

    for (const datasetCode of [
      'ds-hk-hkgov-censtatd-division-statistic-permanent-living-quarters',
      'ds-hk-hkgov-censtatd-division-statistic-housing-market-areas-building-groups',
      'ds-hk-hkgov-censtatd-division-statistic-major-housing-estates',
    ]) {
      const profile = censtatdReleaseStatsProfileFor(datasetCode, '2021')
      expect(profile.geographyLink.kind).toBe('domain_candidate')
      expect(buildCenstatdGeographyLinkAuditActions(profile, 1)).toEqual([])
    }
    expect(
      censtatdReleaseStatsProfileFor(
        'ds-hk-hkgov-censtatd-division-statistic-new-towns',
        '2021',
      ).geographyLink.kind,
    ).toBe('existing_domain_candidate')
  })

  test('reports compatible structural schema churn without comparing values', () => {
    const current = buildCenstatdReleaseStats(
      [{ featureId: '1', layerName: 'DC_GHS' }],
      {
        dimensions: [
          { dimensionCode: 'district' },
          { dimensionCode: 'district-class' },
        ],
        fields: [
          {
            aggregation: 'total',
            aggregationPercentile: null,
            periodicity: null,
            dimensions: {},
            fieldName: 'population',
            statisticKind: 'count',
            unitCode: 'person',
          },
          {
            aggregation: 'total',
            aggregationPercentile: null,
            periodicity: null,
            dimensions: {},
            fieldName: 'households',
            statisticKind: 'count',
            unitCode: 'household',
          },
        ],
        observations: [
          {
            fieldName: 'population',
            numericValue: '999999',
            observationStatus: 'published',
            referencePeriodCode: '2025',
          },
          {
            fieldName: 'households',
            numericValue: '1',
            observationStatus: 'published',
            referencePeriodCode: '2025',
          },
        ],
        values: [],
      },
      censtatdReleaseStatsProfileFor(
        'ds-hk-hkgov-censtatd-division-statistic-population-households-district',
        '2026-Q2',
      ),
      timestamp,
    )
    const previous = current
      .filter(
        row =>
          !(
            (row.dimension === 'observations' &&
              row.groupBy === 'field' &&
              row.groupValue === 'households') ||
            (row.dimension === 'dimensions' &&
              row.groupBy === 'definitionCode' &&
              row.groupValue === 'district-class')
          ),
      )
      .map((row, index) => ({
        ...row,
        apiReleaseSetId: null,
        createdAt: row.createdAt ?? timestamp,
        groupBy: row.groupBy ?? null,
        groupValue: row.groupValue ?? null,
        id: `previous-${index}`,
        releaseId: 'release-previous',
        snapshotId: null,
        updatedAt: row.updatedAt ?? timestamp,
      }))

    const churn = buildCenstatdStructuralChurnStats(current, previous, timestamp)
    expect(churn).toContainEqual(
      expect.objectContaining({
        dimension: 'added_count',
        groupBy: 'structural',
        groupValue: 'fields',
        value: 1,
      }),
    )
    expect(churn).toContainEqual(
      expect.objectContaining({
        dimension: 'added_count',
        groupValue: 'dimensions',
        value: 1,
      }),
    )
    expect(churn.some(row => row.value === 999999)).toBeFalse()
  })
})
