import type { I18nOrigin } from '@repo/db'
import { toIsoTimestamp } from '@repo/db'
import type {
  ApiReleaseSetScopedStatsRow,
  ReleaseScopedStatsRow,
} from '@repo/db/metaSchema'
import type { GeoJsonGeometry } from '../../geojson'
import type { DistrictGeometryStatistics } from './geometryStats'

export type StatsLocaleGroup = 'en' | 'zh-hant' | 'zh-hans'

export type LocaleStatsAccumulator = {
  altCoverage: Map<StatsLocaleGroup, number>
  aiTranslatedCoverage: Map<StatsLocaleGroup, number>
  count: Map<StatsLocaleGroup, number>
  humanTranslatedCoverage: Map<StatsLocaleGroup, number>
  inferredCoverage: Map<StatsLocaleGroup, number>
  providedCoverage: Map<StatsLocaleGroup, number>
  total: number
}

export type ChurnMetricName =
  | 'count'
  | 'unchanged_count'
  | 'changed_count'
  | 'added_count'
  | 'removed_count'

export type ChurnCounts = Record<ChurnMetricName, number>

export type QualityCounts = {
  geometry_changed_count: number
  locale_regression_count: number
  name_regression_count: number
  parent_changed_count: number
}

export type AddressDivisionQualityCounts = {
  ambiguous_area_count: number
  ambiguous_district_count: number
  unmatched_area_count: number
  unmatched_district_count: number
}

export type AddressApiReleaseSetStatsInput = {
  address2dCount: number
  address2dI18nCount: number
  address3dCount: number
  address3dI18nCount: number
  address3dUnitCount?: number
  areaLinkedCount?: number
  byDistrict?: Map<string, number> | Record<string, number>
  componentCounts?: Record<string, number>
  districtLinkedCount?: number
  missingStreetCount: number
  streetLinkedCount?: number
  localeStats?: LocaleStatsAccumulator
  churn?: {
    address2d?: ChurnCounts
    address3d?: ChurnCounts
    totals: ChurnCounts
  }
  quality?: Partial<QualityCounts> & Partial<AddressDivisionQualityCounts>
}

/**
 * Release-level address processing counts. These deliberately describe the
 * prepared source release, while API release-set stats describe the assembled
 * public API snapshot.
 */
export type AddressReleaseStatsInput = {
  address3dCount?: number
  address3dI18nCount?: number
  addedRows: number
  changedRows: number
  componentCounts: Record<string, number>
  deletedRows: number
  districtCounts: Record<string, number>
  localeCounts: Record<string, number>
  localisedRows: number
  processedRows: number
  recordedRows: number
  unchangedRows: number
  quality?: AddressDivisionQualityCounts
}

export type DivisionApiReleaseSetStatsInput = {
  byDistrict?: Map<string, number> | Record<string, number>
  divisionCount: number
  divisionI18nCount: number
  byDivisionType?: Map<string, number> | Record<string, number>
  byLevel?: Map<string, number> | Record<string, number>
  localeStats?: LocaleStatsAccumulator
  churn?: {
    byDivisionType?: Map<string, ChurnCounts> | Record<string, ChurnCounts>
    byLevel?: Map<string, ChurnCounts> | Record<string, ChurnCounts>
    totals: ChurnCounts
  }
  quality?: QualityCounts
}

/**
 * Turns exact, canonical geometry measurements into release-owned statistics.
 * Area geometry includes feature, polygon, area, boundary-segment, and
 * all-ring boundary-length measurements; boundary geometry deliberately has
 * no polygon or area measure.
 */
export function buildGeometryReleaseStatsRows(
  resourceType: 'divisionArea' | 'divisionBoundary',
  districts: DistrictGeometryStatistics,
  createdAt = toIsoTimestamp(),
): ReleaseScopedStatsRow[] {
  return [...districts]
    .sort(([left], [right]) => left.localeCompare(right))
    .flatMap(([districtId, metrics]) => {
      const grouping = { dimension: 'district', dimensionValue: districtId }
      const rows: ReleaseScopedStatsRow[] = [
        buildReleaseStatsRow(
          'geometry',
          'feature_count',
          'count',
          metrics.featureCount,
          createdAt,
          grouping,
        ),
        buildReleaseStatsRow(
          'geometry',
          'boundary_segment_count',
          'count',
          metrics.boundarySegmentCount,
          createdAt,
          grouping,
        ),
        buildReleaseStatsRow(
          'geometry',
          'boundary_length',
          'kilometres',
          metrics.boundaryLength,
          createdAt,
          grouping,
        ),
      ]
      if (resourceType === 'divisionArea') {
        rows.splice(
          1,
          0,
          buildReleaseStatsRow(
            'geometry',
            'polygon_count',
            'count',
            metrics.polygonCount ?? 0,
            createdAt,
            grouping,
          ),
          buildReleaseStatsRow(
            'geometry',
            'area',
            'square_kilometres',
            metrics.area ?? 0,
            createdAt,
            grouping,
          ),
        )
      }
      return rows
    })
}

export type LocalisedStatsRow = {
  hasAltName: boolean
  hasName: boolean
  meta: import('@repo/db').I18nMeta
  locale: string
}

export type StatsSnapshot<TLocalisedRow> = {
  churnHash: string
  id: string
  localisedRows: TLocalisedRow[]
  parentId: string | null
  geometry: GeoJsonGeometry | null
  type: string
}

/**
 * Creates empty counters for locale completeness metrics.
 */
export function createLocaleStatsAccumulator(): LocaleStatsAccumulator {
  return {
    altCoverage: new Map(),
    aiTranslatedCoverage: new Map(),
    count: new Map(),
    humanTranslatedCoverage: new Map(),
    inferredCoverage: new Map(),
    providedCoverage: new Map(),
    total: 0,
  }
}

/**
 * Folds one division's localised rows into the locale completeness counters.
 */
export function updateLocaleStatsAccumulator(
  statsAccumulator: LocaleStatsAccumulator,
  rows: LocalisedStatsRow[],
) {
  statsAccumulator.total += 1

  const coverageGroups = new Set<StatsLocaleGroup>()
  const provenanceGroups = {
    'ai-translated': new Set<StatsLocaleGroup>(),
    'human-translated': new Set<StatsLocaleGroup>(),
    inferred: new Set<StatsLocaleGroup>(),
    provided: new Set<StatsLocaleGroup>(),
  }
  const altCoverageGroups = new Set<StatsLocaleGroup>()

  for (const row of rows) {
    const group = toStatsLocaleGroup(row.locale)

    if (!group || !row.hasName) {
      continue
    }

    coverageGroups.add(group)

    const origin = resolveNameOrigin(row)
    if (origin) provenanceGroups[origin].add(group)

    if (row.hasAltName) {
      altCoverageGroups.add(group)
    }
  }

  incrementStatsCounts(statsAccumulator.count, coverageGroups)
  incrementStatsCounts(statsAccumulator.providedCoverage, provenanceGroups.provided)
  incrementStatsCounts(statsAccumulator.inferredCoverage, provenanceGroups.inferred)
  incrementStatsCounts(
    statsAccumulator.aiTranslatedCoverage,
    provenanceGroups['ai-translated'],
  )
  incrementStatsCounts(
    statsAccumulator.humanTranslatedCoverage,
    provenanceGroups['human-translated'],
  )
  incrementStatsCounts(statsAccumulator.altCoverage, altCoverageGroups)
}

/**
 * Converts accumulated locale completeness counters into release stats rows.
 */
export function buildLocaleStatsRows(statsAccumulator: LocaleStatsAccumulator) {
  const createdAt = toIsoTimestamp()
  const locales: StatsLocaleGroup[] = ['en', 'zh-hant', 'zh-hans']

  return locales.flatMap(locale => {
    const localeCount = statsAccumulator.count.get(locale) ?? 0
    const localeProvidedCount = statsAccumulator.providedCoverage.get(locale) ?? 0
    const localeInferredCount = statsAccumulator.inferredCoverage.get(locale) ?? 0
    const localeAiTranslatedCount =
      statsAccumulator.aiTranslatedCoverage.get(locale) ?? 0
    const localeHumanTranslatedCount =
      statsAccumulator.humanTranslatedCoverage.get(locale) ?? 0
    const localeAltCount = statsAccumulator.altCoverage.get(locale) ?? 0
    const total = statsAccumulator.total

    return [
      buildReleaseStatsRow(
        'completeness',
        'locale_count',
        'count',
        localeCount,
        createdAt,
        {
          dimension: 'locale',
          dimensionValue: locale,
        },
      ),
      buildReleaseStatsRow(
        'completeness',
        'locale_coverage',
        'percentage',
        percentage(localeCount, total),
        createdAt,
        {
          dimension: 'locale',
          dimensionValue: locale,
        },
      ),
      ...(
        [
          ['locale_coverage_provided', localeProvidedCount],
          ['locale_coverage_inferred', localeInferredCount],
          ['locale_coverage_ai_translated', localeAiTranslatedCount],
          ['locale_coverage_human_translated', localeHumanTranslatedCount],
        ] as const
      ).map(([category, count]) =>
        buildReleaseStatsRow(
          'completeness',
          category,
          'percentage',
          percentage(count, total),
          createdAt,
          {
            dimension: 'locale',
            dimensionValue: locale,
          },
        ),
      ),
      buildReleaseStatsRow(
        'completeness',
        'locale_alt_coverage',
        'percentage',
        percentage(localeAltCount, total),
        createdAt,
        {
          dimension: 'locale',
          dimensionValue: locale,
        },
      ),
    ]
  })
}

function resolveNameOrigin(row: LocalisedStatsRow): I18nOrigin | undefined {
  return row.meta.fields?.name?.origin
}

/**
 * Compares previous and current snapshots to derive churn totals and per-type counts.
 */
export function buildChurnCounts<TLocalisedRow>(
  previousRows: Map<string, StatsSnapshot<TLocalisedRow>>,
  currentRows: Map<string, StatsSnapshot<TLocalisedRow>>,
) {
  const totals = createEmptyChurnCounts()
  const byType = new Map<string, ChurnCounts>()

  for (const current of currentRows.values()) {
    const previous = previousRows.get(current.id)
    const typeCounts = getChurnCountsForType(byType, current.type)

    totals.count += 1
    typeCounts.count += 1

    if (!previous) {
      totals.added_count += 1
      typeCounts.added_count += 1
      continue
    }

    if (previous.churnHash === current.churnHash) {
      totals.unchanged_count += 1
      typeCounts.unchanged_count += 1
      continue
    }

    totals.changed_count += 1
    typeCounts.changed_count += 1
  }

  for (const previous of previousRows.values()) {
    if (currentRows.has(previous.id)) {
      continue
    }

    totals.removed_count += 1
    getChurnCountsForType(byType, previous.type).removed_count += 1
  }

  return {
    totals,
    byType,
  }
}

/**
 * Compares shared snapshots to derive quality regressions and structural changes.
 */
export function buildQualityCounts<TLocalisedRow>(
  previousRows: Map<string, StatsSnapshot<TLocalisedRow>>,
  currentRows: Map<string, StatsSnapshot<TLocalisedRow>>,
  options: {
    hasLocaleRegression: (
      previous: TLocalisedRow[],
      current: TLocalisedRow[],
    ) => boolean
    hasNameRegression: (previous: TLocalisedRow[], current: TLocalisedRow[]) => boolean
  },
) {
  const counts: QualityCounts = {
    geometry_changed_count: 0,
    locale_regression_count: 0,
    name_regression_count: 0,
    parent_changed_count: 0,
  }

  for (const current of currentRows.values()) {
    const previous = previousRows.get(current.id)

    if (!previous) {
      continue
    }

    if (previous.parentId !== current.parentId) {
      counts.parent_changed_count += 1
    }

    if (JSON.stringify(previous.geometry) !== JSON.stringify(current.geometry)) {
      counts.geometry_changed_count += 1
    }

    if (options.hasLocaleRegression(previous.localisedRows, current.localisedRows)) {
      counts.locale_regression_count += 1
    }

    if (options.hasNameRegression(previous.localisedRows, current.localisedRows)) {
      counts.name_regression_count += 1
    }
  }

  return counts
}

/**
 * Converts churn counts into release stats rows for totals and per-type breakdowns.
 */
export function buildChurnStatsRows(churn: {
  totals: ChurnCounts
  byType: Map<string, ChurnCounts>
}) {
  const createdAt = toIsoTimestamp()
  const rows = buildChurnMetricRows(churn.totals, createdAt, null)

  for (const type of [...churn.byType.keys()].sort()) {
    const typeCounts = churn.byType.get(type)

    if (!typeCounts) {
      continue
    }

    rows.push(
      ...buildChurnMetricRows(typeCounts, createdAt, {
        dimension: 'type',
        dimensionValue: type,
      }),
    )
  }

  return rows
}

/**
 * Converts quality counters into release stats rows.
 */
export function buildQualityStatsRows(counts: QualityCounts) {
  const createdAt = toIsoTimestamp()

  return [
    buildReleaseStatsRow(
      'quality',
      'parent_changed_count',
      'count',
      counts.parent_changed_count,
      createdAt,
    ),
    buildReleaseStatsRow(
      'quality',
      'locale_regression_count',
      'count',
      counts.locale_regression_count,
      createdAt,
    ),
    buildReleaseStatsRow(
      'quality',
      'name_regression_count',
      'count',
      counts.name_regression_count,
      createdAt,
    ),
    buildReleaseStatsRow(
      'quality',
      'geometry_changed_count',
      'count',
      counts.geometry_changed_count,
      createdAt,
    ),
  ]
}

/**
 * Builds presentation stats for a source address release. Address records do
 * not have division-style type buckets, so the useful comparison is the
 * canonical address count and its lifecycle outcome.
 */
export function buildAddressReleaseStatsRows(input: AddressReleaseStatsInput) {
  const createdAt = toIsoTimestamp()
  const recordedRows = input.recordedRows || input.processedRows
  const churn: ChurnCounts = {
    added_count: input.addedRows,
    changed_count: input.changedRows,
    count: recordedRows,
    removed_count: input.deletedRows,
    unchanged_count: input.unchangedRows,
  }

  const rows = [
    ...buildChurnMetricRows(churn, createdAt, null),
    buildReleaseStatsRow('records', 'count', 'count', recordedRows, createdAt, {
      dimension: 'table',
      dimensionValue: 'address2d',
    }),
    ...(input.address3dCount === undefined
      ? []
      : [
          buildReleaseStatsRow(
            'detail_records',
            'count',
            'count',
            input.address3dCount,
            createdAt,
            {
              dimension: 'table',
              dimensionValue: 'address3d',
            },
          ),
        ]),
    ...(input.address3dI18nCount === undefined
      ? []
      : [
          buildReleaseStatsRow(
            'localised_detail_records',
            'count',
            'count',
            input.address3dI18nCount,
            createdAt,
            {
              dimension: 'table',
              dimensionValue: 'address3dI18n',
            },
          ),
        ]),
    ...buildAddressLocaleStatsRows(input.localeCounts, recordedRows, createdAt),
    ...buildAddressComponentStatsRows(input.componentCounts, recordedRows, createdAt),
    ...buildDistrictDistributionStatsRows(input.districtCounts, createdAt),
    buildReleaseStatsRow(
      'localised_records',
      'count',
      'count',
      input.localisedRows,
      createdAt,
      { dimension: 'table', dimensionValue: 'address2dI18n' },
    ),
  ]

  if (input.quality) {
    rows.push(
      buildReleaseStatsRow(
        'quality',
        'unmatched_area_count',
        'count',
        input.quality.unmatched_area_count,
        createdAt,
      ),
      buildReleaseStatsRow(
        'quality',
        'unmatched_district_count',
        'count',
        input.quality.unmatched_district_count,
        createdAt,
      ),
      buildReleaseStatsRow(
        'quality',
        'ambiguous_area_count',
        'count',
        input.quality.ambiguous_area_count,
        createdAt,
      ),
      buildReleaseStatsRow(
        'quality',
        'ambiguous_district_count',
        'count',
        input.quality.ambiguous_district_count,
        createdAt,
      ),
    )
  }

  return rows
}

/**
 * Locale coverage for addresses is intentionally separate from name coverage.
 * An address is present for a locale when it has a complete formatted label.
 */
export function buildAddressLocaleStatsRows(
  localeCounts: Record<string, number>,
  total: number,
  createdAt = toIsoTimestamp(),
) {
  return ['en', 'zh-hant', 'zh-hans'].flatMap(locale => {
    const count = localeCounts[locale] ?? 0
    return [
      buildReleaseStatsRow('completeness', 'locale_count', 'count', count, createdAt, {
        dimension: 'locale',
        dimensionValue: locale,
      }),
      buildReleaseStatsRow(
        'completeness',
        'locale_coverage',
        'percentage',
        percentage(count, total),
        createdAt,
        { dimension: 'locale', dimensionValue: locale },
      ),
    ]
  })
}

/** Meaningful optional components that can be inspected in an address label. */
export function buildAddressComponentStatsRows(
  componentCounts: Record<string, number>,
  total: number,
  createdAt = toIsoTimestamp(),
) {
  return [
    'street_name',
    'street_number',
    'village_name',
    'building_name',
    'estate_name',
    'phase',
    'block',
  ].map(component =>
    buildReleaseStatsRow(
      'completeness',
      'component_coverage',
      'percentage',
      percentage(componentCounts[component] ?? 0, total),
      createdAt,
      { dimension: 'addressComponent', dimensionValue: component },
    ),
  )
}

/** A count per canonical district identifier, consumed by the map presentation. */
export function buildDistrictDistributionStatsRows(
  districtCounts: Map<string, number> | Record<string, number>,
  createdAt = toIsoTimestamp(),
) {
  const entries =
    districtCounts instanceof Map
      ? [...districtCounts.entries()]
      : Object.entries(districtCounts)

  return entries
    .filter(([, count]) => count > 0)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([districtId, count]) =>
      buildReleaseStatsRow('records', 'count', 'count', count, createdAt, {
        dimension: 'district',
        dimensionValue: districtId,
      }),
    )
}

function buildApiReleaseSetDistrictDistributionStatsRows(
  districtCounts: Map<string, number> | Record<string, number>,
  createdAt = toIsoTimestamp(),
) {
  const entries =
    districtCounts instanceof Map
      ? [...districtCounts.entries()]
      : Object.entries(districtCounts)

  return entries
    .filter(([, count]) => count > 0)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([districtId, count]) =>
      buildApiReleaseSetStatsRow('records', 'count', 'count', count, createdAt, {
        dimension: 'district',
        dimensionValue: districtId,
      }),
    )
}

export function buildAddressApiReleaseSetStatsRows(
  input: AddressApiReleaseSetStatsInput,
) {
  const createdAt = toIsoTimestamp()
  const rows: ApiReleaseSetScopedStatsRow[] = [
    buildApiReleaseSetStatsRow(
      'records',
      'count',
      'count',
      input.address2dCount,
      createdAt,
    ),
    buildApiReleaseSetStatsRow(
      'records',
      'count',
      'count',
      input.address2dCount,
      createdAt,
      {
        dimension: 'table',
        dimensionValue: 'address2d',
      },
    ),
    buildApiReleaseSetStatsRow(
      'localised_records',
      'count',
      'count',
      input.address2dI18nCount,
      createdAt,
      {
        dimension: 'table',
        dimensionValue: 'address2dI18n',
      },
    ),
    buildApiReleaseSetStatsRow(
      'detail_records',
      'count',
      'count',
      input.address3dCount,
      createdAt,
      {
        dimension: 'table',
        dimensionValue: 'address3d',
      },
    ),
    buildApiReleaseSetStatsRow(
      'localised_detail_records',
      'count',
      'count',
      input.address3dI18nCount,
      createdAt,
      {
        dimension: 'table',
        dimensionValue: 'address3dI18n',
      },
    ),
    ...(input.address3dUnitCount == null
      ? []
      : [
          buildApiReleaseSetStatsRow(
            'units',
            'count',
            'count',
            input.address3dUnitCount,
            createdAt,
            { dimension: 'table', dimensionValue: 'address3d' },
          ),
        ]),
    buildApiReleaseSetStatsRow(
      'quality',
      'missing_street_count',
      'count',
      input.missingStreetCount,
      createdAt,
    ),
  ]

  rows.push(
    ...buildAddressApiReleaseSetComponentStatsRows(
      input.componentCounts,
      input.address2dCount,
      createdAt,
    ),
    ...buildApiReleaseSetDistrictDistributionStatsRows(input.byDistrict ?? {}),
  )

  for (const [level, value] of [
    ['area', input.areaLinkedCount],
    ['district', input.districtLinkedCount],
    ['street', input.streetLinkedCount],
  ] as const) {
    if (value !== undefined)
      rows.push(
        buildApiReleaseSetStatsRow('records', 'linkage', 'count', value, createdAt, {
          dimension: 'divisionLevel',
          dimensionValue: level,
        }),
      )
  }

  if (input.localeStats) {
    rows.push(...buildApiReleaseSetLocaleStatsRows(input.localeStats, createdAt))
  }

  if (input.churn) {
    rows.push(...buildApiReleaseSetChurnMetricRows(input.churn.totals, createdAt, null))
    rows.push(
      ...buildOptionalGroupedChurnRows(input.churn.address2d, createdAt, {
        dimension: 'table',
        dimensionValue: 'address2d',
      }),
      ...buildOptionalGroupedChurnRows(input.churn.address3d, createdAt, {
        dimension: 'table',
        dimensionValue: 'address3d',
      }),
    )
  }

  if (input.quality) {
    for (const category of [
      'locale_regression_count',
      'name_regression_count',
      'geometry_changed_count',
    ] as const) {
      const value = input.quality[category]
      if (value === undefined) continue
      rows.push(
        buildApiReleaseSetStatsRow('quality', category, 'count', value, createdAt),
      )
    }
    for (const category of [
      'unmatched_area_count',
      'unmatched_district_count',
      'ambiguous_area_count',
      'ambiguous_district_count',
    ] as const) {
      const value = input.quality[category]
      if (value === undefined) continue
      rows.push(
        buildApiReleaseSetStatsRow('quality', category, 'count', value, createdAt),
      )
    }
  }

  return rows
}

function buildAddressApiReleaseSetComponentStatsRows(
  componentCounts: Record<string, number> | undefined,
  total: number,
  createdAt: string,
) {
  if (!componentCounts) return []

  return Object.entries(componentCounts)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([component, count]) =>
      buildApiReleaseSetStatsRow(
        'completeness',
        'component_coverage',
        'percentage',
        percentage(count, total),
        createdAt,
        { dimension: 'addressComponent', dimensionValue: component },
      ),
    )
}

export function buildDivisionApiReleaseSetStatsRows(
  input: DivisionApiReleaseSetStatsInput,
) {
  const createdAt = toIsoTimestamp()
  const rows: ApiReleaseSetScopedStatsRow[] = [
    buildApiReleaseSetStatsRow(
      'records',
      'count',
      'count',
      input.divisionCount,
      createdAt,
    ),
    buildApiReleaseSetStatsRow(
      'records',
      'count',
      'count',
      input.divisionCount,
      createdAt,
      {
        dimension: 'table',
        dimensionValue: 'divisions',
      },
    ),
    buildApiReleaseSetStatsRow(
      'localised_records',
      'count',
      'count',
      input.divisionI18nCount,
      createdAt,
      {
        dimension: 'table',
        dimensionValue: 'divisionsI18n',
      },
    ),
  ]

  rows.push(
    ...buildApiReleaseSetDistrictDistributionStatsRows(input.byDistrict ?? {}),
    ...buildGroupedCountRows(
      input.byDivisionType,
      'records',
      createdAt,
      'divisionType',
    ),
    ...buildGroupedCountRows(input.byLevel, 'records', createdAt, 'level'),
  )

  if (input.localeStats) {
    rows.push(...buildApiReleaseSetLocaleStatsRows(input.localeStats, createdAt))
  }

  if (input.churn) {
    rows.push(...buildApiReleaseSetChurnMetricRows(input.churn.totals, createdAt, null))
    rows.push(
      ...buildGroupedChurnRows(input.churn.byDivisionType, createdAt, 'divisionType'),
      ...buildGroupedChurnRows(input.churn.byLevel, createdAt, 'level'),
    )
  }

  if (input.quality) {
    rows.push(
      buildApiReleaseSetStatsRow(
        'quality',
        'parent_changed_count',
        'count',
        input.quality.parent_changed_count,
        createdAt,
      ),
      buildApiReleaseSetStatsRow(
        'quality',
        'locale_regression_count',
        'count',
        input.quality.locale_regression_count,
        createdAt,
      ),
      buildApiReleaseSetStatsRow(
        'quality',
        'name_regression_count',
        'count',
        input.quality.name_regression_count,
        createdAt,
      ),
      buildApiReleaseSetStatsRow(
        'quality',
        'geometry_changed_count',
        'count',
        input.quality.geometry_changed_count,
        createdAt,
      ),
    )
  }

  return rows
}

/**
 * Reports whether any previously available locale disappeared in the current rows.
 */
export function hasLocaleRegression<TLocalisedRow extends { locale: string }>(
  previousRows: TLocalisedRow[],
  currentRows: TLocalisedRow[],
) {
  const currentLocales = new Set(currentRows.map(row => row.locale))
  return previousRows.some(row => !currentLocales.has(row.locale))
}

/**
 * Reports whether previously tracked primary or alternate names are missing from the current rows.
 */
export function hasNameRegression<
  TLocalisedRow extends {
    meta: import('@repo/db').I18nMeta
    locale: string
    name: string | null
    nameAlts: string | null
  },
>(previousRows: TLocalisedRow[], currentRows: TLocalisedRow[]) {
  const currentByLocale = new Map(currentRows.map(row => [row.locale, row]))

  for (const previous of previousRows) {
    const current = currentByLocale.get(previous.locale)

    if (!current) {
      if (hasTrackedNames(previous)) {
        return true
      }

      continue
    }

    const currentNames = getNameSet(current)
    const previousPrimaryName = !previous.meta.isLocaleInferred ? previous.name : null

    if (previousPrimaryName && !currentNames.has(previousPrimaryName)) {
      return true
    }

    for (const previousAltName of getAltNames(previous)) {
      if (!currentNames.has(previousAltName)) {
        return true
      }
    }
  }

  return false
}

function buildReleaseStatsRow(
  category: string,
  measure: string,
  unit: string,
  value: number,
  timestamp: string,
  grouping?: {
    dimension: string
    dimensionValue: string
  },
): ReleaseScopedStatsRow {
  return buildStatsRow(category, measure, unit, value, timestamp, grouping)
}

function buildApiReleaseSetStatsRow(
  category: string,
  measure: string,
  unit: string,
  value: number,
  timestamp: string,
  grouping?: {
    dimension: string
    dimensionValue: string
  },
): ApiReleaseSetScopedStatsRow {
  return buildStatsRow(category, measure, unit, value, timestamp, grouping)
}

function buildStatsRow(
  category: string,
  measure: string,
  unit: string,
  value: number,
  timestamp: string,
  grouping?: {
    dimension: string
    dimensionValue: string
  },
) {
  return {
    createdAt: timestamp,
    category,
    dimension: grouping?.dimension ?? null,
    dimensionValue: grouping?.dimensionValue ?? null,
    measure,
    unit,
    updatedAt: timestamp,
    value,
  }
}

function buildApiReleaseSetLocaleStatsRows(
  statsAccumulator: LocaleStatsAccumulator,
  createdAt: string,
) {
  const locales: StatsLocaleGroup[] = ['en', 'zh-hant', 'zh-hans']

  return locales.flatMap(locale => {
    const localeCount = statsAccumulator.count.get(locale) ?? 0
    const localeProvidedCount = statsAccumulator.providedCoverage.get(locale) ?? 0
    const localeInferredCount = statsAccumulator.inferredCoverage.get(locale) ?? 0
    const localeAiTranslatedCount =
      statsAccumulator.aiTranslatedCoverage.get(locale) ?? 0
    const localeHumanTranslatedCount =
      statsAccumulator.humanTranslatedCoverage.get(locale) ?? 0
    const localeAltCount = statsAccumulator.altCoverage.get(locale) ?? 0
    const total = statsAccumulator.total

    return [
      buildApiReleaseSetStatsRow(
        'completeness',
        'locale_count',
        'count',
        localeCount,
        createdAt,
        {
          dimension: 'locale',
          dimensionValue: locale,
        },
      ),
      buildApiReleaseSetStatsRow(
        'completeness',
        'locale_coverage',
        'percentage',
        percentage(localeCount, total),
        createdAt,
        {
          dimension: 'locale',
          dimensionValue: locale,
        },
      ),
      ...(
        [
          ['locale_coverage_provided', localeProvidedCount],
          ['locale_coverage_inferred', localeInferredCount],
          ['locale_coverage_ai_translated', localeAiTranslatedCount],
          ['locale_coverage_human_translated', localeHumanTranslatedCount],
        ] as const
      ).map(([category, count]) =>
        buildApiReleaseSetStatsRow(
          'completeness',
          category,
          'percentage',
          percentage(count, total),
          createdAt,
          {
            dimension: 'locale',
            dimensionValue: locale,
          },
        ),
      ),
      buildApiReleaseSetStatsRow(
        'completeness',
        'locale_alt_coverage',
        'percentage',
        percentage(localeAltCount, total),
        createdAt,
        {
          dimension: 'locale',
          dimensionValue: locale,
        },
      ),
    ]
  })
}

function buildGroupedCountRows(
  counts: Map<string, number> | Record<string, number> | undefined,
  category: string,
  createdAt: string,
  dimension: string,
) {
  return mapEntries(counts).map(([dimensionValue, value]) =>
    buildApiReleaseSetStatsRow(category, 'count', 'count', value, createdAt, {
      dimension,
      dimensionValue,
    }),
  )
}

function buildGroupedChurnRows(
  counts: Map<string, ChurnCounts> | Record<string, ChurnCounts> | undefined,
  createdAt: string,
  dimension: string,
) {
  return mapEntries(counts).flatMap(([dimensionValue, churnCounts]) =>
    buildApiReleaseSetChurnMetricRows(churnCounts, createdAt, {
      dimension,
      dimensionValue,
    }),
  )
}

function buildOptionalGroupedChurnRows(
  counts: ChurnCounts | undefined,
  createdAt: string,
  grouping: {
    dimension: string
    dimensionValue: string
  },
) {
  if (!counts) {
    return []
  }

  return buildApiReleaseSetChurnMetricRows(counts, createdAt, grouping)
}

function buildApiReleaseSetChurnMetricRows(
  counts: ChurnCounts,
  timestamp: string,
  grouping: {
    dimension: string
    dimensionValue: string
  } | null,
) {
  return churnMetricNames.map(category =>
    buildApiReleaseSetStatsRow(
      'changes',
      category,
      'count',
      counts[category],
      timestamp,
      grouping ?? undefined,
    ),
  )
}

function mapEntries<T>(values: Map<string, T> | Record<string, T> | undefined) {
  if (!values) {
    return []
  }

  return values instanceof Map
    ? [...values.entries()].sort(([left], [right]) => left.localeCompare(right))
    : Object.entries(values).sort(([left], [right]) => left.localeCompare(right))
}

function incrementStatsCounts(
  target: Map<StatsLocaleGroup, number>,
  groups: Set<StatsLocaleGroup>,
) {
  for (const group of groups) {
    target.set(group, (target.get(group) ?? 0) + 1)
  }
}

function toStatsLocaleGroup(locale: string): StatsLocaleGroup | null {
  if (locale === 'en') {
    return 'en'
  }

  if (['zh', 'zh-hant', 'zh-hk', 'zh-mo', 'zh-tw'].includes(locale)) {
    return 'zh-hant'
  }

  if (['zh-hans', 'zh-cn', 'zh-sg'].includes(locale)) {
    return 'zh-hans'
  }

  return null
}

function buildChurnMetricRows(
  counts: ChurnCounts,
  timestamp: string,
  grouping: {
    dimension: string
    dimensionValue: string
  } | null,
) {
  return churnMetricNames.map(category =>
    buildReleaseStatsRow(
      'changes',
      category,
      'count',
      counts[category],
      timestamp,
      grouping ?? undefined,
    ),
  )
}

const churnMetricNames: ChurnMetricName[] = [
  'count',
  'unchanged_count',
  'changed_count',
  'added_count',
  'removed_count',
]

function createEmptyChurnCounts(): ChurnCounts {
  return {
    added_count: 0,
    changed_count: 0,
    count: 0,
    removed_count: 0,
    unchanged_count: 0,
  }
}

function getChurnCountsForType(byType: Map<string, ChurnCounts>, type: string) {
  const existing = byType.get(type)

  if (existing) {
    return existing
  }

  const counts = createEmptyChurnCounts()
  byType.set(type, counts)
  return counts
}

function hasTrackedNames(row: {
  meta: import('@repo/db').I18nMeta
  name: string | null
  nameAlts: string | null
}) {
  return Boolean((!row.meta.isLocaleInferred && row.name) || row.nameAlts)
}

function getNameSet(row: { name: string | null; nameAlts: string | null }) {
  const names = new Set<string>()

  if (row.name) {
    names.add(row.name)
  }

  for (const altName of getAltNames(row)) {
    names.add(altName)
  }

  return names
}

function getAltNames(row: { nameAlts: string | null }) {
  if (!row.nameAlts) {
    return []
  }

  return row.nameAlts
    .split('|')
    .map(value => value.trim())
    .filter(Boolean)
}

function percentage(value: number, total: number) {
  if (total <= 0) {
    return 0
  }

  return (value / total) * 100
}
