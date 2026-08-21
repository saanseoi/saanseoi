import type { ReleaseScopedStatsRow, ReleaseStatsRow } from '@repo/db/metaSchema'

import type { ReleaseProcessingAction } from '../db/processingActions'

export type CenstatdGeographyLinkPolicy =
  | { kind: 'reviewed_canonical_link'; domain: 'administrative'; cohortKey: string }
  | { kind: 'existing_domain_candidate'; domain: string }
  | { kind: 'domain_candidate'; domain: string }

/** The profile declares geography policy; structural stats do not make linkage judgements. */
export type CenstatdReleaseStatsProfile = {
  geographyLink: CenstatdGeographyLinkPolicy
}

export type CenstatdValidatedSourceFeature = {
  featureId: string
  layerName: string
}

export type CenstatdCanonicalObservation = {
  fieldName: string
  numericValue: string | null
  observationStatus: string
  referencePeriodCode: string
  sourceField?: string
}

export type CenstatdCanonicalField = {
  aggregation: string
  aggregationPercentile: number | null
  denominatorFieldName?: string | null
  dimensions: Record<string, string>
  fieldName: string
  sourceField?: string
  sourceNullOption?: string | null
  statisticKind: string
  unitCode: string
}

export type CenstatdCanonicalDimension = {
  dimensionCode: string
}

export type CenstatdCanonicalDimensionValue = {
  dimensionCode: string
  valueCode: string
}

export type CenstatdCanonicalStatistics = {
  dimensions: CenstatdCanonicalDimension[]
  fields: CenstatdCanonicalField[]
  observations: CenstatdCanonicalObservation[]
  values: CenstatdCanonicalDimensionValue[]
}

export function censtatdReleaseStatsProfileFor(
  datasetCode: string,
  sourceVersion: string,
): CenstatdReleaseStatsProfile {
  switch (datasetCode) {
    case 'ds-hk-hkgov-censtatd-division-statistic-land-area-population-density-district':
    case 'ds-hk-hkgov-censtatd-division-statistic-permanent-living-quarters-district':
    case 'ds-hk-hkgov-censtatd-division-statistic-population-households-district':
      return {
        geographyLink: {
          cohortKey: '2021',
          domain: 'administrative',
          kind: 'reviewed_canonical_link',
        },
      }
    case 'ds-hk-hkgov-censtatd-division-statistic-subdivided-units-district':
      if (sourceVersion !== '2016' && sourceVersion !== '2021') {
        throw new Error(
          `C&SD subdivided-units sourceVersion=${sourceVersion} has no reviewed district bridge.`,
        )
      }
      return {
        geographyLink: {
          cohortKey: sourceVersion,
          domain: 'administrative',
          kind: 'reviewed_canonical_link',
        },
      }
    case 'ds-hk-hkgov-censtatd-division-statistic-new-towns':
      return {
        geographyLink: {
          domain: 'hkgov-pland-new-town',
          kind: 'existing_domain_candidate',
        },
      }
    case 'ds-hk-hkgov-censtatd-division-statistic-permanent-living-quarters-area-type':
      return { geographyLink: { domain: 'area', kind: 'domain_candidate' } }
    case 'ds-hk-hkgov-censtatd-division-statistic-housing-market-areas-building-groups':
      return {
        geographyLink: { domain: 'housing-market-area', kind: 'domain_candidate' },
      }
    case 'ds-hk-hkgov-censtatd-division-statistic-major-housing-estates':
      return {
        geographyLink: { domain: 'major-housing-estate', kind: 'domain_candidate' },
      }
    default:
      return {
        geographyLink: { domain: 'statistical-geography', kind: 'domain_candidate' },
      }
  }
}

/**
 * Produces structural facts about one publisher source release. It deliberately
 * counts assertions and definitions only: publisher values are neither parsed
 * as JavaScript numbers nor compared across incomparable fields.
 */
export function buildCenstatdReleaseStats(
  features: readonly CenstatdValidatedSourceFeature[],
  canonical: CenstatdCanonicalStatistics,
  _profile: CenstatdReleaseStatsProfile,
  createdAt = new Date().toISOString(),
): ReleaseScopedStatsRow[] {
  const rows: ReleaseScopedStatsRow[] = []
  const add = (
    dimension: string,
    metric: string,
    value: number,
    grouping?: { groupBy: string; groupValue: string },
  ) => {
    rows.push({
      createdAt,
      dimension,
      groupBy: grouping?.groupBy ?? null,
      groupValue: grouping?.groupValue ?? null,
      metric,
      metricUnit: 'count',
      type: 'release',
      updatedAt: createdAt,
      value,
    })
  }
  const distribution = (
    dimension: string,
    groupBy: string,
    values: Iterable<string>,
  ) => {
    const counts = new Map<string, number>()
    for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1)
    for (const [groupValue, count] of [...counts].sort(([a], [b]) =>
      a.localeCompare(b),
    )) {
      add(dimension, 'count', count, { groupBy, groupValue })
    }
  }

  add('records', 'count', features.length)
  distribution(
    'records',
    'sourceLayer',
    features.map(feature => feature.layerName),
  )

  add('observations', 'count', canonical.observations.length)
  distribution(
    'observations',
    'field',
    canonical.observations.map(row => row.fieldName),
  )
  distribution(
    'observations',
    'referencePeriod',
    canonical.observations.map(row => row.referencePeriodCode),
  )
  distribution(
    'observations',
    'observationStatus',
    canonical.observations.map(row => row.observationStatus),
  )
  distribution(
    'observations',
    'valueKind',
    canonical.observations.map(row =>
      row.numericValue === null ? 'categorical' : 'numeric',
    ),
  )

  add('fields', 'count', canonical.fields.length)
  distribution(
    'fields',
    'statisticKind',
    canonical.fields.map(row => row.statisticKind),
  )
  distribution(
    'fields',
    'aggregation',
    canonical.fields.map(row => row.aggregation),
  )
  distribution(
    'fields',
    'unitCode',
    canonical.fields.map(row => row.unitCode),
  )

  add(
    'reference_periods',
    'count',
    new Set(canonical.observations.map(row => row.referencePeriodCode)).size,
  )
  add('dimensions', 'definition_count', canonical.dimensions.length)
  add('dimensions', 'value_definition_count', canonical.values.length)
  distribution(
    'dimensions',
    'definitionCode',
    canonical.dimensions.map(row => row.dimensionCode),
  )

  return rows
}

/**
 * Makes an approved canonical geography join inspectable in the release Audit
 * tab. Candidate domains intentionally produce no action: no canonical match
 * has been reviewed yet.
 */
export function buildCenstatdGeographyLinkAuditActions(
  profile: CenstatdReleaseStatsProfile,
  linkedFeatureCount: number,
): ReleaseProcessingAction[] {
  if (profile.geographyLink.kind !== 'reviewed_canonical_link') return []
  return [
    {
      action: 'map_censtatd_district_code_to_canonical_division',
      affectedRecordCount: linkedFeatureCount,
      evidence: {
        authority: 'hkgov-censtatd',
        cohortKey: profile.geographyLink.cohortKey,
        domain: profile.geographyLink.domain,
        sourceField: 'DC/dc',
      },
      mode: 'automatic',
      summary:
        'Resolved C&SD District Council district codes through the reviewed canonical district bridge.',
    },
  ]
}

/** Records every source-wide numeric normalisation as one inspectable audit action. */
export function buildCenstatdNormalisationAuditActions(
  canonical: CenstatdCanonicalStatistics,
): ReleaseProcessingAction[] {
  const affectedRecordCount = canonical.observations.filter(
    observation =>
      observation.sourceField === 'MYPOPN_LAND' && observation.numericValue !== null,
  ).length
  return affectedRecordCount
    ? [
        {
          action: 'normalise_censtatd_population_thousands_to_persons',
          affectedRecordCount,
          evidence: {
            sourceField: 'MYPOPN_LAND',
            sourceUnit: 'thousand persons',
            targetUnit: 'person',
            factor: 1000,
          },
          mode: 'automatic',
          summary:
            'Converted C&SD population values expressed in thousands to persons without changing their source precision.',
        },
      ]
    : []
}

/**
 * Makes every reviewed source-field-to-field decision inspectable alongside the
 * release that used it. These are manual curation decisions, not value transforms.
 */
export function buildCenstatdFieldCurationAuditActions(
  canonical: CenstatdCanonicalStatistics,
): ReleaseProcessingAction[] {
  const observationCounts = new Map<string, number>()
  for (const observation of canonical.observations) {
    if (!observation.sourceField) continue
    observationCounts.set(
      observation.sourceField,
      (observationCounts.get(observation.sourceField) ?? 0) + 1,
    )
  }
  return canonical.fields
    .filter(field => field.sourceField)
    .sort((left, right) => left.sourceField!.localeCompare(right.sourceField!))
    .map(field => ({
      action: 'curate_censtatd_measure_metadata',
      affectedRecordCount: observationCounts.get(field.sourceField!) ?? 0,
      evidence: {
        aggregation: field.aggregation,
        aggregationPercentile: field.aggregationPercentile,
        denominatorFieldName: field.denominatorFieldName ?? null,
        fieldName: field.fieldName,
        sourceField: field.sourceField,
        sourceNullOption: field.sourceNullOption ?? null,
        statisticKind: field.statisticKind,
        unitCode: field.unitCode,
      },
      mode: 'manual',
      summary: `Reviewed C&SD metadata for publisher field ${field.sourceField}.`,
    }))
}

/**
 * Compares frozen structural facts from compatible source releases. It avoids
 * value churn entirely: compilation releases may legitimately revise historic
 * fields and periods without being comparable numerical series.
 */
export function buildCenstatdStructuralChurnStats(
  current: readonly ReleaseScopedStatsRow[],
  previous: readonly ReleaseStatsRow[] | null,
  createdAt = new Date().toISOString(),
): ReleaseScopedStatsRow[] {
  if (!previous?.length) return []

  const rows: ReleaseScopedStatsRow[] = []
  for (const [groupValue, dimension, groupBy] of [
    ['fields', 'observations', 'field'],
    ['dimensions', 'dimensions', 'definitionCode'],
    ['reference_periods', 'observations', 'referencePeriod'],
  ] as const) {
    const currentValues = groupedValues(current, dimension, groupBy)
    const previousValues = groupedValues(previous, dimension, groupBy)
    if (!currentValues.size && !previousValues.size) continue
    const added = [...currentValues].filter(value => !previousValues.has(value)).length
    const removed = [...previousValues].filter(
      value => !currentValues.has(value),
    ).length
    const unchanged = [...currentValues].filter(value =>
      previousValues.has(value),
    ).length
    for (const [churnDimension, value] of [
      ['added_count', added],
      ['removed_count', removed],
      ['unchanged_count', unchanged],
      ['count', currentValues.size],
    ] as const) {
      rows.push({
        createdAt,
        dimension: churnDimension,
        groupBy: 'structural',
        groupValue,
        metric: 'churn',
        metricUnit: 'count',
        type: 'release',
        updatedAt: createdAt,
        value,
      })
    }
  }
  return rows
}

function groupedValues(
  rows: readonly Pick<ReleaseScopedStatsRow, 'dimension' | 'groupBy' | 'groupValue'>[],
  dimension: string,
  groupBy: string,
) {
  return new Set(
    rows
      .filter(row => row.dimension === dimension && row.groupBy === groupBy)
      .map(row => row.groupValue)
      .filter((value): value is string => Boolean(value)),
  )
}
