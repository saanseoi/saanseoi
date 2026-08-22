import { describe, expect, test } from 'bun:test'

import { createReleaseStatsPresentation } from './releaseStatsPresentation'
import type { ReleaseStatsCopy } from './releaseStats.types'

const copy: ReleaseStatsCopy = {
  labels: {
    added: 'Added',
    changed: 'Changed',
    removed: 'Removed',
    unchanged: 'Unchanged',
    dataset: 'Dataset',
    records: 'records',
    overview: 'Overview',
    changeSummary: 'Change summary',
    comparisonBaseline: 'Baseline',
    comparisonPrevious: 'Previous release',
    coverage: 'Coverage',
    completeness: 'Completeness',
    namesByLocale: 'Names by locale',
    provided: 'Provided',
    inferred: 'Inferred',
    localeLegend: 'Locale legend',
    completenessInfo: 'Completeness info',
    completenessInfoDescription: 'Coverage details',
    addressComponents: 'Address components',
    changeDistribution: 'Change distribution',
    recordsByType: 'Records by type',
    recordsByGeometryClass: 'Records by geometry class',
    typeLegend: 'Type legend',
    changeDistributionInfo: 'Distribution info',
    changeDistributionInfoDescription: 'Distribution details',
    processingActions: 'Processing actions',
    processingActionsInfo: 'Processing info',
    processingActionsInfoDescription: 'Processing details',
    qualityChecks: 'Quality checks',
    qualityInfo: 'Quality info',
    qualityInfoDescription: 'Quality details',
    qualityNone: 'No issues',
    noStats: 'No stats',
    stats: 'Stats',
    recordsByDistrict: 'Records by district',
    district: 'District',
    geometry: 'Geometry',
    geometryByDistrict: 'By District',
    geometryInfo: 'About geometry measurements',
    geometryInfoDescription: 'Geometry details',
    geometryFeatures: 'Features',
    geometryPolygons: 'Polygons',
    geometryArea: 'Area',
    geometryBoundarySegments: 'Boundary segments',
    geometryBoundaryLength: 'Boundary length',
    geometryUnofficial: 'Unofficial',
    notApplicable: 'Not applicable',
  },
  localeName: value => value,
  districtFallback: districtId => `District ${districtId}`,
  statLabel: value => value ?? 'Unspecified',
  processingAction: code => ({ issue: code, outcome: 'Processed', mode: 'Automatic' }),
}
const present = (
  stats: Parameters<typeof createReleaseStatsPresentation>[0]['stats'],
) => createReleaseStatsPresentation({ stats, locale: 'en', copy })

describe('createReleaseStatsPresentation', () => {
  test('presents geometry facts in a name-sorted district table and claims the rows', () => {
    const model = createReleaseStatsPresentation({
      locale: 'en',
      copy,
      districtAreas: [
        {
          divisionId: 'district-b',
          name: 'Beta',
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [114.1, 22.3],
                [114.2, 22.3],
                [114.2, 22.4],
                [114.1, 22.3],
              ],
            ],
          },
        },
        {
          divisionId: 'district-a',
          name: 'Alpha',
          geometry: { type: 'Polygon', coordinates: [] },
        },
      ],
      stats: [
        {
          dimension: 'geometry',
          metric: 'feature_count',
          value: 1,
          groupBy: 'district',
          groupValue: 'district-b',
        },
        {
          dimension: 'geometry',
          metric: 'polygon_count',
          value: 2,
          groupBy: 'district',
          groupValue: 'district-b',
        },
        {
          dimension: 'geometry',
          metric: 'area',
          metricUnit: 'square_kilometres',
          value: 0.00012,
          groupBy: 'district',
          groupValue: 'district-b',
        },
        {
          dimension: 'geometry',
          metric: 'boundary_segment_count',
          metricUnit: 'count',
          value: 8,
          groupBy: 'district',
          groupValue: 'district-b',
        },
        {
          dimension: 'geometry',
          metric: 'boundary_length',
          metricUnit: 'kilometres',
          value: 0.0045,
          groupBy: 'district',
          groupValue: 'district-b',
        },
        {
          dimension: 'geometry',
          metric: 'feature_count',
          value: 1,
          groupBy: 'district',
          groupValue: 'district-a',
        },
        {
          dimension: 'geometry',
          metric: 'boundary_segment_count',
          metricUnit: 'count',
          value: 4,
          groupBy: 'district',
          groupValue: 'district-a',
        },
        {
          dimension: 'geometry',
          metric: 'boundary_length',
          metricUnit: 'kilometres',
          value: 1,
          groupBy: 'district',
          groupValue: 'district-a',
        },
      ],
    })
    expect(model.geometry?.id).toBe('stats-geometry-statistics')
    expect(model.geometry?.rows.map(row => row.label)).toEqual(['Alpha', 'Beta'])
    expect(model.geometry?.showArea).toBe(true)
    expect(model.geometry?.showFeatureCount).toBe(false)
    expect(model.geometry?.showPolygonCount).toBe(true)
    expect(model.geometry?.map).toEqual({
      features: [expect.objectContaining({ id: 'district-b', label: 'Beta' })],
      values: [{ id: 'district-b', value: 1 }],
    })
    expect(model.geometry?.rows[0]?.boundarySegmentCount).toBe('4')
    expect(model.geometry?.rows[1]?.area).not.toBe('0')
    expect(model.genericGroups).toEqual([])
  })

  test('keeps the feature column when districts have different feature counts', () => {
    const model = present([
      {
        dimension: 'geometry',
        metric: 'feature_count',
        value: 1,
        groupBy: 'district',
        groupValue: 'district-a',
      },
      {
        dimension: 'geometry',
        metric: 'boundary_segment_count',
        value: 4,
        groupBy: 'district',
        groupValue: 'district-a',
      },
      {
        dimension: 'geometry',
        metric: 'boundary_length',
        value: 1,
        groupBy: 'district',
        groupValue: 'district-a',
      },
      {
        dimension: 'geometry',
        metric: 'feature_count',
        value: 2,
        groupBy: 'district',
        groupValue: 'district-b',
      },
      {
        dimension: 'geometry',
        metric: 'boundary_segment_count',
        value: 8,
        groupBy: 'district',
        groupValue: 'district-b',
      },
      {
        dimension: 'geometry',
        metric: 'boundary_length',
        value: 2,
        groupBy: 'district',
        groupValue: 'district-b',
      },
    ])
    expect(model.geometry?.showFeatureCount).toBe(true)
  })

  test('hides polygon and area columns when a boundaries release has neither metric', () => {
    const model = present([
      {
        dimension: 'geometry',
        metric: 'feature_count',
        value: 1,
        groupBy: 'district',
        groupValue: 'district-a',
      },
      {
        dimension: 'geometry',
        metric: 'boundary_segment_count',
        value: 4,
        groupBy: 'district',
        groupValue: 'district-a',
      },
      {
        dimension: 'geometry',
        metric: 'boundary_length',
        value: 1.2,
        groupBy: 'district',
        groupValue: 'district-a',
      },
    ])

    expect(model.geometry?.showArea).toBe(false)
    expect(model.geometry?.showPolygonCount).toBe(false)
  })

  test('uses the canonical name and marks a non-official district', () => {
    const model = createReleaseStatsPresentation({
      locale: 'en',
      copy,
      districtNames: [
        {
          divisionId: '222b7818-970a-491d-98b6-b88d8c6f0161',
          name: 'Lok Ma Chau Loop',
          unofficial: true,
        },
      ],
      stats: [
        {
          dimension: 'geometry',
          metric: 'feature_count',
          value: 1,
          groupBy: 'district',
          groupValue: '222b7818-970a-491d-98b6-b88d8c6f0161',
        },
        {
          dimension: 'geometry',
          metric: 'boundary_segment_count',
          value: 4,
          groupBy: 'district',
          groupValue: '222b7818-970a-491d-98b6-b88d8c6f0161',
        },
        {
          dimension: 'geometry',
          metric: 'boundary_length',
          value: 1.2,
          groupBy: 'district',
          groupValue: '222b7818-970a-491d-98b6-b88d8c6f0161',
        },
      ],
    })

    expect(model.geometry?.rows).toEqual([
      expect.objectContaining({
        districtId: '222b7818-970a-491d-98b6-b88d8c6f0161',
        label: 'Lok Ma Chau Loop',
        unofficial: true,
      }),
    ])
  })
  test('distinguishes an all-new baseline from a prior-release churn summary', () => {
    expect(
      present([
        { dimension: 'count', metric: 'churn', value: 4 },
        { dimension: 'added_count', metric: 'churn', value: 4 },
        { dimension: 'changed_count', metric: 'churn', value: 0 },
        { dimension: 'removed_count', metric: 'churn', value: 0 },
        { dimension: 'unchanged_count', metric: 'churn', value: 0 },
      ]).overview?.churn?.baseline,
    ).toBe(true)
    expect(
      present([
        { dimension: 'count', metric: 'churn', value: 4 },
        { dimension: 'added_count', metric: 'churn', value: 1 },
        { dimension: 'unchanged_count', metric: 'churn', value: 3 },
      ]).overview?.churn?.baseline,
    ).toBe(false)
  })

  test('shapes standard sections and percentage labels once', () => {
    const model = present([
      { dimension: 'count', metric: 'churn', value: 10 },
      {
        dimension: 'locale_count',
        metric: 'completeness',
        groupBy: 'locale',
        groupValue: 'en',
        value: 10,
      },
      {
        dimension: 'locale_coverage',
        metric: 'completeness',
        groupBy: 'locale',
        groupValue: 'en',
        value: 62.5,
      },
      {
        dimension: 'component_coverage',
        metric: 'completeness',
        groupBy: 'addressComponent',
        groupValue: 'street',
        value: 50,
      },
      {
        dimension: 'records',
        metric: 'count',
        groupBy: 'type',
        groupValue: 'address',
        value: 10,
      },
      {
        metric: 'processing',
        groupBy: 'action',
        groupValue: 'automatic:normalised',
        value: 3,
      },
      { dimension: 'name_regression_count', metric: 'quality', value: 1 },
    ])
    expect(model.localeCoverage?.[0]?.coverageLabel).toBe('62.5%')
    expect(model.componentCoverage?.[0]?.formattedValue).toBe('50%')
    expect(model.processing).toHaveLength(1)
    expect(model.processing?.[0]?.issue).toBe('automatic:normalised')
    expect(model.quality?.issues).toHaveLength(1)
  })

  test('uses a source/table record count fallback without showing its supporting table row', () => {
    const model = present([
      {
        dimension: 'records',
        metric: 'count',
        groupBy: 'table',
        groupValue: 'addresses',
        value: 7,
      },
    ])
    expect(model.overview?.recordCount).toBe('7')
    expect(model.overview?.churn).toBeUndefined()
    expect(model.districtDistribution).toBeUndefined()
    expect(model.genericGroups).toHaveLength(0)
  })

  test('keeps primary and localised table counts together when the primary total is available', () => {
    const model = present([
      { dimension: 'records', metric: 'count', value: 7 },
      {
        dimension: 'records',
        metric: 'count',
        groupBy: 'table',
        groupValue: 'divisions',
        value: 7,
      },
      {
        dimension: 'localised_records',
        metric: 'count',
        groupBy: 'table',
        groupValue: 'divisionsI18n',
        value: 21,
      },
    ])
    expect(model.overview?.recordCount).toBe('7')
    expect(model.genericGroups).toEqual([
      expect.objectContaining({
        label: 'table',
        rows: expect.arrayContaining([
          expect.objectContaining({ groupValue: 'divisions', value: '7' }),
          expect.objectContaining({ groupValue: 'divisionsI18n', value: '21' }),
        ]),
      }),
    ])
  })

  test('presents division linkage separately from quality checks', () => {
    const model = present([
      { dimension: 'records', metric: 'count', value: 10 },
      {
        dimension: 'records',
        metric: 'linkage',
        groupBy: 'divisionLevel',
        groupValue: 'area',
        value: 7,
      },
      {
        dimension: 'missing_street_count',
        metric: 'quality',
        value: 2,
      },
    ])

    expect(model.divisionLinkage?.rows).toEqual([
      expect.objectContaining({ label: 'area', value: '7', coverageLabel: '70%' }),
    ])
    expect(model.quality?.issues).toHaveLength(1)
    expect(model.genericGroups).toEqual([])
  })

  test('renders record distributions as bars and keeps district identifiers out of generic cards', () => {
    const model = present([
      { dimension: 'records', metric: 'count', value: 10 },
      {
        dimension: 'records',
        metric: 'count',
        groupBy: 'divisionType',
        groupValue: 'district',
        value: 8,
      },
      {
        dimension: 'records',
        metric: 'count',
        groupBy: 'level',
        groupValue: '2',
        value: 8,
      },
      {
        dimension: 'records',
        metric: 'distribution',
        groupBy: 'district',
        groupValue: 'opaque-id',
        value: 8,
      },
    ])
    expect(model.recordDistributions.map(distribution => distribution.title)).toEqual([
      'divisionType',
      'level',
    ])
    expect(
      model.recordDistributions.every(distribution => !distribution.showChangeLegend),
    ).toBe(true)
    expect(model.genericGroups).toHaveLength(0)
  })

  test('keeps unknown and unrendered dimensions in generic groups with stable unique IDs', () => {
    const model = present([
      {
        dimension: 'source_metadata',
        metric: 'note',
        groupBy: 'source',
        groupValue: 'upstream',
        value: 8,
      },
      {
        dimension: 'strange_dimension',
        metric: 'mystery',
        groupBy: 'future_group',
        groupValue: 'value',
        metricUnit: 'percentage',
        value: 12.5,
      },
      {
        dimension: 'records',
        metric: 'distribution',
        groupBy: 'district',
        groupValue: 'd1',
        value: 1,
      },
      { dimension: 'another', metric: 'value', groupBy: 'overview', value: 1 },
    ])
    expect(
      model.genericGroups.flatMap(group => group.rows).map(row => row.dimension),
    ).toEqual(expect.arrayContaining(['source_metadata', 'strange_dimension']))
    expect(
      model.genericGroups
        .flatMap(group => group.rows)
        .find(row => row.dimension === 'strange_dimension')?.value,
    ).toBe('12.5%')
    const ids = model.headings.map(heading => heading.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  test('summarises uniform measure coverage, hides structural facts, and sends publisher markers to quality checks', () => {
    const model = present([
      { dimension: 'records', metric: 'count', value: 2 },
      {
        dimension: 'records',
        metric: 'count',
        groupBy: 'sourceLayer',
        groupValue: 'BG 21C',
        value: 2,
      },
      { dimension: 'observations', metric: 'count', value: 12 },
      {
        dimension: 'observations',
        metric: 'count',
        groupBy: 'measure',
        groupValue: 'age_1',
        value: 4,
      },
      {
        dimension: 'observations',
        metric: 'count',
        groupBy: 'measure',
        groupValue: 'age_2',
        value: 4,
      },
      {
        dimension: 'observations',
        metric: 'count',
        groupBy: 'measure',
        groupValue: 'age_3',
        value: 4,
      },
      {
        dimension: 'observations',
        metric: 'count',
        groupBy: 'referencePeriod',
        groupValue: '2021',
        value: 12,
      },
      {
        dimension: 'observations',
        metric: 'count',
        groupBy: 'valueKind',
        groupValue: 'numeric',
        value: 12,
      },
      {
        dimension: 'observations',
        metric: 'count',
        groupBy: 'observationStatus',
        groupValue: 'published',
        value: 10,
      },
      {
        dimension: 'observations',
        metric: 'count',
        groupBy: 'observationStatus',
        groupValue: 'suppressed',
        value: 2,
      },
      { dimension: 'measures', metric: 'count', value: 3 },
      {
        dimension: 'measures',
        metric: 'count',
        groupBy: 'unitCode',
        groupValue: 'publisher-unknown',
        value: 3,
      },
      {
        dimension: 'measures',
        metric: 'count',
        groupBy: 'statisticKind',
        groupValue: 'count',
        value: 2,
      },
      {
        dimension: 'measures',
        metric: 'count',
        groupBy: 'statisticKind',
        groupValue: 'density',
        value: 1,
      },
      {
        dimension: 'measures',
        metric: 'count',
        groupBy: 'aggregation',
        groupValue: 'total',
        value: 3,
      },
      { dimension: 'fields', metric: 'count', value: 3 },
      {
        dimension: 'fields',
        metric: 'count',
        groupBy: 'field',
        groupValue: 'POPULATION',
        value: 3,
      },
      {
        dimension: 'fields',
        metric: 'count',
        groupBy: 'unitCode',
        groupValue: 'person',
        value: 1,
      },
      { dimension: 'reference_periods', metric: 'count', value: 1 },
      { dimension: 'dimensions', metric: 'definition_count', value: 2 },
      { dimension: 'dimensions', metric: 'value_definition_count', value: 4 },
    ])

    expect(model.sourceLayerDistribution?.title).toBe('sourceLayer')
    expect(model.headings).not.toContainEqual(
      expect.objectContaining({ id: 'stats-structure' }),
    )
    expect(model.measureCoverage).toMatchObject({
      exceptions: [],
      rows: [
        { label: 'Measures', value: '3' },
        { label: 'Observations per measure', value: '4' },
      ],
    })
    const withMeasures = createReleaseStatsPresentation({
      copy,
      locale: 'en',
      measures: [
        {
          definition: 'Resident population at the reference period.',
          aggregation: 'total',
          name: 'Population',
          observationCount: 4,
          sourceField: 'POPULATION',
          statisticKind: 'count',
          unitCode: 'person',
          valueKind: 'numeric',
        },
      ],
      stats: [],
    })
    expect(withMeasures.measures).toMatchObject({
      rows: [expect.objectContaining({ name: 'Population', observationCount: 4 })],
    })
    expect(model.recordDistributions.map(distribution => distribution.title)).toEqual([
      'referencePeriod',
    ])
    expect(model.genericGroups.map(group => group.label)).not.toContain('valueKind')
    expect(model.genericGroups.map(group => group.label)).toEqual([
      'field',
      'statisticKind',
      'unitCode',
      'aggregation',
    ])
    expect(model.genericGroups.flatMap(group => group.rows)).not.toContainEqual(
      expect.objectContaining({ dimension: 'fields', groupValue: 'Unspecified' }),
    )
    expect(model.genericGroups).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'aggregation' }),
        expect.objectContaining({ label: 'statisticKind' }),
      ]),
    )
    expect(model.quality?.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'suppressed observations', value: '2' }),
        expect.objectContaining({
          label: 'Measures without a mapped unit',
          value: '3',
        }),
      ]),
    )
  })
})
