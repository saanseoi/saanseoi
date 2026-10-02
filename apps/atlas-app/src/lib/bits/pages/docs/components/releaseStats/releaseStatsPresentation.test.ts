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
    changeSummary: 'Change Summary',
    comparisonBaseline: 'Baseline',
    comparisonPrevious: 'Previous release',
    coverage: 'Coverage',
    completeness: 'Completeness',
    namesByLocale: 'Names by Locale',
    provided: 'Provided',
    inferred: 'Inferred',
    aiTranslated: 'AI translated',
    humanTranslated: 'Human translated',
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
  test('renders retained zero locale coverage as chart rows instead of a generic measure grid', () => {
    const model = present(
      ['en', 'zh-hant', 'zh-hans'].flatMap(dimensionValue =>
        ['locale_count', 'locale_coverage', 'locale_alt_coverage'].map(category => ({
          category: 'completeness',
          measure: category,
          dimension: 'locale',
          dimensionValue,
          value: 0,
        })),
      ),
    )
    expect(model.localeCoverage).toHaveLength(3)
    expect(
      model.localeCoverage?.every(row => row.coverage === 0 && row.count === '0'),
    ).toBe(true)
    expect(model.headings.some(heading => heading.id === 'stats-names-by-locale')).toBe(
      true,
    )
    expect(model.headings.some(heading => heading.id === 'stats-locale')).toBe(false)
  })
  test('treats legacy locale coverage without provenance rows as source-provided', () => {
    const model = present([
      {
        category: 'completeness',
        measure: 'locale_count',
        dimension: 'locale',
        dimensionValue: 'en',
        value: 10,
      },
      {
        category: 'completeness',
        measure: 'locale_coverage',
        dimension: 'locale',
        dimensionValue: 'en',
        value: 100,
      },
    ])
    expect(model.localeCoverage?.[0]?.segments).toEqual([
      { label: 'provided', tone: 'provided', value: 100 },
    ])
  })
  test('shows all statistical records as added only for a first-release baseline', () => {
    const input = {
      resourceType: 'divisionStatistic',
      locale: 'en',
      copy,
      stats: [{ category: 'records', measure: 'count', value: 3495 }],
    }
    const baseline = createReleaseStatsPresentation({ ...input, isFirstRelease: true })
    expect(baseline.overview?.churn?.metrics.map(measure => measure.value)).toEqual([
      3495, 0, 0, 0,
    ])
    expect(baseline.overview?.churn?.baseline).toBe(true)
    expect(createReleaseStatsPresentation(input).overview?.churn?.unavailable).toBe(
      true,
    )
  })
  test('keeps statistical release churn ahead of the profile', () => {
    const model = createReleaseStatsPresentation({
      resourceType: 'divisionStatistic',
      locale: 'en',
      copy,
      stats: [
        { category: 'records', measure: 'count', value: 10 },
        { category: 'changes', measure: 'count', value: 10 },
        { category: 'changes', measure: 'added_count', value: 3 },
        { category: 'changes', measure: 'unchanged_count', value: 7 },
      ],
    })
    expect(model.overview?.recordCount).toBe('10')
    expect(model.overview?.churn?.metrics.map(measure => measure.value)).toEqual([
      3, 0, 0, 7,
    ])
    expect(model.headings[0]?.id).toBe('stats-overview')
    expect(model.statisticsProfile).toBeDefined()
  })
  test('summarises statistical fields without hiding uneven coverage or unknown statistics', () => {
    const model = createReleaseStatsPresentation({
      locale: 'en',
      copy,
      resourceType: 'divisionStatistic',
      stats: [
        { category: 'records', measure: 'count', value: 10 },
        { category: 'fields', measure: 'count', value: 3 },
        { category: 'observations', measure: 'count', value: 25 },
        ...['population', 'income'].map(dimensionValue => ({
          category: 'observations',
          measure: 'count',
          dimension: 'field',
          dimensionValue,
          value: 10,
        })),
        {
          category: 'observations',
          measure: 'count',
          dimension: 'field',
          dimensionValue: 'rent',
          value: 5,
        },
        {
          category: 'observations',
          measure: 'count',
          dimension: 'observationStatus',
          dimensionValue: 'published',
          value: 20,
        },
        {
          category: 'observations',
          measure: 'count',
          dimension: 'observationStatus',
          dimensionValue: 'suppressed',
          value: 3,
        },
        {
          category: 'observations',
          measure: 'count',
          dimension: 'observationStatus',
          dimensionValue: 'unavailable',
          value: 2,
        },
        {
          category: 'observations',
          measure: 'count',
          dimension: 'referencePeriod',
          dimensionValue: '2021',
          value: 25,
        },
        { category: 'custom', measure: 'count', value: 7 },
      ],
    })
    expect(model.statisticsProfile?.coverage).toEqual({
      fieldCount: '3',
      standardCount: '2',
      observations: '10',
      uniform: false,
      exceptions: [{ label: 'rent', value: '5' }],
    })
    expect(model.statisticsProfile?.availability.map(row => row.percentage)).toEqual([
      80, 12, 8,
    ])
    expect(model.statisticsProfile?.metrics).toContainEqual({
      label: 'Reference period',
      value: '2021',
    })
    expect(model.headings.map(row => row.id)).not.toContain('stats-field')
    expect(model.overview?.churn?.unavailable).toBe(true)
    expect(model.overview).toBeDefined()
    expect(model.measures).toBeUndefined()
    expect(model.genericGroups[0]?.rows).toContainEqual(
      expect.objectContaining({ category: 'custom', value: '7' }),
    )
  })

  test('keeps multiple statistical periods and handles zero observations without invalid percentages', () => {
    const model = createReleaseStatsPresentation({
      locale: 'en',
      copy,
      resourceType: 'divisionStatistic',
      stats: [
        { category: 'observations', measure: 'count', value: 0 },
        {
          category: 'observations',
          measure: 'count',
          dimension: 'observationStatus',
          dimensionValue: 'published',
          value: 0,
        },
        ...['2016', '2021'].map(dimensionValue => ({
          category: 'observations',
          measure: 'count',
          dimension: 'referencePeriod',
          dimensionValue,
          value: 0,
        })),
      ],
    })
    expect(model.statisticsProfile?.availability[0]?.percentage).toBe(0)
    expect(model.statisticsProfile?.distributions[0]?.rows).toEqual([
      { label: '2016', value: '0', percentage: 0 },
      { label: '2021', value: '0', percentage: 0 },
    ])
    expect(model.statisticsProfile?.coverage).toBeUndefined()
  })

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
          category: 'geometry',
          measure: 'feature_count',
          value: 1,
          dimension: 'district',
          dimensionValue: 'district-b',
        },
        {
          category: 'geometry',
          measure: 'polygon_count',
          value: 2,
          dimension: 'district',
          dimensionValue: 'district-b',
        },
        {
          category: 'geometry',
          measure: 'area',
          unit: 'square_kilometres',
          value: 0.00012,
          dimension: 'district',
          dimensionValue: 'district-b',
        },
        {
          category: 'geometry',
          measure: 'boundary_segment_count',
          unit: 'count',
          value: 8,
          dimension: 'district',
          dimensionValue: 'district-b',
        },
        {
          category: 'geometry',
          measure: 'boundary_length',
          unit: 'kilometres',
          value: 0.0045,
          dimension: 'district',
          dimensionValue: 'district-b',
        },
        {
          category: 'geometry',
          measure: 'feature_count',
          value: 1,
          dimension: 'district',
          dimensionValue: 'district-a',
        },
        {
          category: 'geometry',
          measure: 'boundary_segment_count',
          unit: 'count',
          value: 4,
          dimension: 'district',
          dimensionValue: 'district-a',
        },
        {
          category: 'geometry',
          measure: 'boundary_length',
          unit: 'kilometres',
          value: 1,
          dimension: 'district',
          dimensionValue: 'district-a',
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
        category: 'geometry',
        measure: 'feature_count',
        value: 1,
        dimension: 'district',
        dimensionValue: 'district-a',
      },
      {
        category: 'geometry',
        measure: 'boundary_segment_count',
        value: 4,
        dimension: 'district',
        dimensionValue: 'district-a',
      },
      {
        category: 'geometry',
        measure: 'boundary_length',
        value: 1,
        dimension: 'district',
        dimensionValue: 'district-a',
      },
      {
        category: 'geometry',
        measure: 'feature_count',
        value: 2,
        dimension: 'district',
        dimensionValue: 'district-b',
      },
      {
        category: 'geometry',
        measure: 'boundary_segment_count',
        value: 8,
        dimension: 'district',
        dimensionValue: 'district-b',
      },
      {
        category: 'geometry',
        measure: 'boundary_length',
        value: 2,
        dimension: 'district',
        dimensionValue: 'district-b',
      },
    ])
    expect(model.geometry?.showFeatureCount).toBe(true)
  })

  test('hides polygon and area columns when a boundaries release has neither measure', () => {
    const model = present([
      {
        category: 'geometry',
        measure: 'feature_count',
        value: 1,
        dimension: 'district',
        dimensionValue: 'district-a',
      },
      {
        category: 'geometry',
        measure: 'boundary_segment_count',
        value: 4,
        dimension: 'district',
        dimensionValue: 'district-a',
      },
      {
        category: 'geometry',
        measure: 'boundary_length',
        value: 1.2,
        dimension: 'district',
        dimensionValue: 'district-a',
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
          category: 'geometry',
          measure: 'feature_count',
          value: 1,
          dimension: 'district',
          dimensionValue: '222b7818-970a-491d-98b6-b88d8c6f0161',
        },
        {
          category: 'geometry',
          measure: 'boundary_segment_count',
          value: 4,
          dimension: 'district',
          dimensionValue: '222b7818-970a-491d-98b6-b88d8c6f0161',
        },
        {
          category: 'geometry',
          measure: 'boundary_length',
          value: 1.2,
          dimension: 'district',
          dimensionValue: '222b7818-970a-491d-98b6-b88d8c6f0161',
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
        { category: 'changes', measure: 'count', value: 4 },
        { category: 'changes', measure: 'added_count', value: 4 },
        { category: 'changes', measure: 'changed_count', value: 0 },
        { category: 'changes', measure: 'removed_count', value: 0 },
        { category: 'changes', measure: 'unchanged_count', value: 0 },
      ]).overview?.churn?.baseline,
    ).toBe(true)
    expect(
      present([
        { category: 'changes', measure: 'count', value: 4 },
        { category: 'changes', measure: 'added_count', value: 1 },
        { category: 'changes', measure: 'unchanged_count', value: 3 },
      ]).overview?.churn?.baseline,
    ).toBe(false)
  })

  test('shapes standard sections and percentage labels once', () => {
    const model = present([
      { category: 'changes', measure: 'count', value: 10 },
      {
        category: 'completeness',
        measure: 'locale_count',
        dimension: 'locale',
        dimensionValue: 'en',
        value: 10,
      },
      {
        category: 'completeness',
        measure: 'locale_coverage',
        dimension: 'locale',
        dimensionValue: 'en',
        value: 62.5,
      },
      {
        category: 'completeness',
        measure: 'locale_coverage_provided',
        dimension: 'locale',
        dimensionValue: 'en',
        value: 20,
      },
      {
        category: 'completeness',
        measure: 'locale_coverage_inferred',
        dimension: 'locale',
        dimensionValue: 'en',
        value: 10,
      },
      {
        category: 'completeness',
        measure: 'locale_coverage_ai_translated',
        dimension: 'locale',
        dimensionValue: 'en',
        value: 25,
      },
      {
        category: 'completeness',
        measure: 'locale_coverage_human_translated',
        dimension: 'locale',
        dimensionValue: 'en',
        value: 7.5,
      },
      {
        category: 'completeness',
        measure: 'component_coverage',
        dimension: 'addressComponent',
        dimensionValue: 'street',
        value: 50,
      },
      {
        category: 'records',
        measure: 'count',
        dimension: 'type',
        dimensionValue: 'address',
        value: 10,
      },
      {
        category: 'processing',
        dimension: 'action',
        dimensionValue: 'automatic:normalised',
        value: 3,
      },
      { category: 'quality', measure: 'name_regression_count', value: 1 },
    ])
    expect(model.localeCoverage?.[0]?.coverageLabel).toBe('62.5%')
    expect(model.localeCoverage?.[0]?.segments).toEqual([
      { label: 'provided', tone: 'provided', value: 20 },
      { label: 'inferred', tone: 'inferred', value: 10 },
      { label: 'ai-translated', tone: 'ai-translated', value: 25 },
      { label: 'human-translated', tone: 'human-translated', value: 7.5 },
    ])
    expect(model.componentCoverage?.[0]?.formattedValue).toBe('50%')
    expect(model.processing).toHaveLength(1)
    expect(model.processing?.[0]?.issue).toBe('automatic:normalised')
    expect(model.quality?.issues).toHaveLength(1)
  })

  test('keeps the table count visible when it supplies the overview total', () => {
    const model = present([
      {
        category: 'records',
        measure: 'count',
        dimension: 'table',
        dimensionValue: 'addresses',
        value: 7,
      },
    ])
    expect(model.overview?.recordCount).toBe('7')
    expect(model.overview?.churn?.unavailable).toBe(true)
    expect(model.districtDistribution).toBeUndefined()
    expect(model.genericGroups[0]?.rows).toEqual([
      expect.objectContaining({ dimensionValue: 'addresses', value: '7' }),
    ])
  })

  test('keeps primary and localised table counts together when the primary total is available', () => {
    const model = present([
      { category: 'records', measure: 'count', value: 7 },
      {
        category: 'records',
        measure: 'count',
        dimension: 'table',
        dimensionValue: 'divisions',
        value: 7,
      },
      {
        category: 'localised_records',
        measure: 'count',
        dimension: 'table',
        dimensionValue: 'divisionsI18n',
        value: 21,
      },
    ])
    expect(model.overview?.recordCount).toBe('7')
    expect(model.genericGroups).toEqual([
      expect.objectContaining({
        label: 'Record Types',
        rows: expect.arrayContaining([
          expect.objectContaining({ dimensionValue: 'divisions', value: '7' }),
          expect.objectContaining({ dimensionValue: 'divisionsI18n', value: '21' }),
        ]),
      }),
    ])
  })

  test('presents division linkage separately from quality checks', () => {
    const model = present([
      { category: 'records', measure: 'count', value: 10 },
      {
        category: 'records',
        measure: 'linkage',
        dimension: 'divisionLevel',
        dimensionValue: 'area',
        value: 7,
      },
      {
        category: 'quality',
        measure: 'missing_street_count',
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
      { category: 'records', measure: 'count', value: 10 },
      {
        category: 'records',
        measure: 'count',
        dimension: 'divisionType',
        dimensionValue: 'district',
        value: 8,
      },
      {
        category: 'records',
        measure: 'count',
        dimension: 'level',
        dimensionValue: '2',
        value: 8,
      },
      {
        category: 'records',
        measure: 'count',
        dimension: 'district',
        dimensionValue: 'opaque-id',
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
        category: 'source_metadata',
        measure: 'note',
        dimension: 'source',
        dimensionValue: 'upstream',
        value: 8,
      },
      {
        category: 'strange_dimension',
        measure: 'mystery',
        dimension: 'future_group',
        dimensionValue: 'value',
        unit: 'percentage',
        value: 12.5,
      },
      {
        category: 'records',
        measure: 'count',
        dimension: 'district',
        dimensionValue: 'd1',
        value: 1,
      },
      { category: 'another', measure: 'value', dimension: 'overview', value: 1 },
    ])
    expect(
      model.genericGroups.flatMap(group => group.rows).map(row => row.category),
    ).toEqual(expect.arrayContaining(['source_metadata', 'strange_dimension']))
    expect(
      model.genericGroups
        .flatMap(group => group.rows)
        .find(row => row.category === 'strange_dimension')?.value,
    ).toBe('12.5%')
    const ids = model.headings.map(heading => heading.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  test('summarises uniform measure coverage, hides structural facts, and sends publisher markers to quality checks', () => {
    const model = present([
      { category: 'records', measure: 'count', value: 2 },
      {
        category: 'records',
        measure: 'count',
        dimension: 'sourceLayer',
        dimensionValue: 'BG 21C',
        value: 2,
      },
      { category: 'observations', measure: 'count', value: 12 },
      {
        category: 'observations',
        measure: 'count',
        dimension: 'measure',
        dimensionValue: 'age_1',
        value: 4,
      },
      {
        category: 'observations',
        measure: 'count',
        dimension: 'measure',
        dimensionValue: 'age_2',
        value: 4,
      },
      {
        category: 'observations',
        measure: 'count',
        dimension: 'measure',
        dimensionValue: 'age_3',
        value: 4,
      },
      {
        category: 'observations',
        measure: 'count',
        dimension: 'referencePeriod',
        dimensionValue: '2021',
        value: 12,
      },
      {
        category: 'observations',
        measure: 'count',
        dimension: 'valueKind',
        dimensionValue: 'numeric',
        value: 12,
      },
      {
        category: 'observations',
        measure: 'count',
        dimension: 'observationStatus',
        dimensionValue: 'published',
        value: 10,
      },
      {
        category: 'observations',
        measure: 'count',
        dimension: 'observationStatus',
        dimensionValue: 'suppressed',
        value: 2,
      },
      { category: 'measures', measure: 'count', value: 3 },
      {
        category: 'measures',
        measure: 'count',
        dimension: 'unitCode',
        dimensionValue: 'publisher-unknown',
        value: 3,
      },
      {
        category: 'measures',
        measure: 'count',
        dimension: 'statisticKind',
        dimensionValue: 'count',
        value: 2,
      },
      {
        category: 'measures',
        measure: 'count',
        dimension: 'statisticKind',
        dimensionValue: 'density',
        value: 1,
      },
      {
        category: 'measures',
        measure: 'count',
        dimension: 'aggregation',
        dimensionValue: 'total',
        value: 3,
      },
      { category: 'fields', measure: 'count', value: 3 },
      {
        category: 'fields',
        measure: 'count',
        dimension: 'field',
        dimensionValue: 'POPULATION',
        value: 3,
      },
      {
        category: 'fields',
        measure: 'count',
        dimension: 'unitCode',
        dimensionValue: 'person',
        value: 1,
      },
      { category: 'reference_periods', measure: 'count', value: 1 },
      { category: 'dimensions', measure: 'definition_count', value: 2 },
      { category: 'dimensions', measure: 'value_definition_count', value: 4 },
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
      expect.objectContaining({ category: 'fields', dimensionValue: 'Unspecified' }),
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

test('Places consolidates localised metrics, retains zero coverage and leaves unknown metrics inspectable', () => {
  const model = createReleaseStatsPresentation({
    resourceType: 'place',
    locale: 'en',
    copy,
    stats: [
      { category: 'records', measure: 'count', value: 100 },
      { category: 'reference_name_count', measure: 'count', value: 100 },
      {
        category: 'reference_name_coverage',
        measure: 'percentage',
        value: 100,
        dimension: 'field',
        dimensionValue: 'referenceName',
      },
      ...[
        'coverage',
        'value_count',
        'provided_coverage',
        'inferred_coverage',
        'ai_translated_coverage',
        'human_translated_coverage',
        'missing_value_count',
        'conflict_count',
      ].map(suffix => ({
        category: `localisation_${suffix}`,
        measure: suffix.endsWith('coverage') ? 'percentage' : 'count',
        value: suffix === 'missing_value_count' ? 100 : 0,
        dimension: 'field_locale',
        dimensionValue: 'name:ja',
      })),
      {
        category: 'future_metric',
        measure: 'count',
        value: 4,
        dimension: 'field_locale',
        dimensionValue: 'name:ja',
      },
    ],
  })
  expect(model.overview?.recordCount).toBe('100')
  expect(model.placeProfile?.metrics[0]).toEqual({
    label: 'Reference names',
    value: '100',
    coverage: '100%',
  })
  expect(model.placeProfile?.fields[0].rows[0]).toMatchObject({
    coverage: 0,
    coverageLabel: '0%',
    missing: '100',
    conflicts: '0',
  })
  expect(
    model.genericGroups.flatMap(group => group.rows).map(row => row.category),
  ).toEqual(['future_metric'])
  expect(model.headings.map(heading => heading.id)).toContain('stats-place-languages')
})

test('Places Any name coverage uses the distinct reference count rather than adding overlapping locales', () => {
  const model = createReleaseStatsPresentation({
    resourceType: 'place',
    locale: 'en',
    copy,
    stats: [
      { category: 'records', measure: 'count', value: 100 },
      { category: 'reference_name_count', measure: 'count', value: 90 },
      {
        category: 'reference_name_coverage',
        measure: 'percentage',
        value: 90,
        dimension: 'field',
        dimensionValue: 'referenceName',
      },
      ...['en', 'zh-hant'].map(locale => ({
        category: 'localisation_coverage',
        measure: 'percentage',
        value: 70,
        dimension: 'field_locale',
        dimensionValue: `name:${locale}`,
      })),
      {
        category: 'localisation_coverage',
        measure: 'percentage',
        value: 10,
        dimension: 'field_locale',
        dimensionValue: 'brandName:en',
      },
    ],
  })
  expect(
    model.placeProfile?.fields.find(field => field.code === 'name')?.any,
  ).toMatchObject({ count: '90', coverageLabel: '90%', available: true })
  expect(
    model.placeProfile?.fields.find(field => field.code === 'brandName')?.any,
  ).toMatchObject({ count: '—', coverageLabel: '—', available: false })
  expect(model.overview?.churn?.metrics.map(measure => measure.formattedValue)).toEqual(
    ['—', '—', '—', '—'],
  )
})

test('a first Places release uses an all-added baseline', () => {
  const model = createReleaseStatsPresentation({
    resourceType: 'place',
    isFirstRelease: true,
    locale: 'en',
    copy,
    stats: [{ category: 'records', measure: 'count', value: 100 }],
  })
  expect(model.overview?.churn?.metrics.map(measure => measure.formattedValue)).toEqual(
    ['100', '0', '0', '0'],
  )
})
