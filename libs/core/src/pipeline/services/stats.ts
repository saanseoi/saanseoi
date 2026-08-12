import { toIsoTimestamp } from '@repo/db'
import type {
  ApiReleaseSetScopedStatsRow,
  ReleaseScopedStatsRow,
} from '@repo/db/metaSchema'
import type { GeoJsonGeometry } from '../geojson'

export type StatsLocaleGroup = 'en' | 'zh-hant' | 'zh-hans'

export type LocaleStatsAccumulator = {
  altCoverage: Map<StatsLocaleGroup, number>
  count: Map<StatsLocaleGroup, number>
  nonInferredCoverage: Map<StatsLocaleGroup, number>
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

export type AddressApiReleaseSetStatsInput = {
  address2dCount: number
  address2dI18nCount: number
  address3dCount: number
  address3dI18nCount: number
  divisionLinkedCount: number
  streetLinkedCount: number
  missingDivisionCount: number
  missingStreetCount: number
  localeStats?: LocaleStatsAccumulator
  churn?: {
    address2d?: ChurnCounts
    address3d?: ChurnCounts
    totals: ChurnCounts
  }
  quality?: Pick<
    QualityCounts,
    'geometry_changed_count' | 'locale_regression_count' | 'name_regression_count'
  >
}

/**
 * Release-level address processing counts. These deliberately describe the
 * prepared source release, while API release-set stats describe the assembled
 * public API snapshot.
 */
export type AddressReleaseStatsInput = {
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
}

export type DivisionApiReleaseSetStatsInput = {
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

export type LocalisedStatsRow = {
  hasAltName: boolean
  hasName: boolean
  isLocaleInferred: boolean
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
    count: new Map(),
    nonInferredCoverage: new Map(),
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
  const nonInferredCoverageGroups = new Set<StatsLocaleGroup>()
  const altCoverageGroups = new Set<StatsLocaleGroup>()

  for (const row of rows) {
    const group = toStatsLocaleGroup(row.locale)

    if (!group || !row.hasName) {
      continue
    }

    coverageGroups.add(group)

    if (!row.isLocaleInferred) {
      nonInferredCoverageGroups.add(group)
    }

    if (row.hasAltName) {
      altCoverageGroups.add(group)
    }
  }

  incrementStatsCounts(statsAccumulator.count, coverageGroups)
  incrementStatsCounts(statsAccumulator.nonInferredCoverage, nonInferredCoverageGroups)
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
    const localeNonInferredCount = statsAccumulator.nonInferredCoverage.get(locale) ?? 0
    const localeAltCount = statsAccumulator.altCoverage.get(locale) ?? 0
    const total = statsAccumulator.total

    return [
      buildReleaseStatsRow(
        'locale_count',
        'completeness',
        'count',
        localeCount,
        createdAt,
        {
          groupBy: 'locale',
          groupValue: locale,
        },
      ),
      buildReleaseStatsRow(
        'locale_coverage',
        'completeness',
        'percentage',
        percentage(localeCount, total),
        createdAt,
        {
          groupBy: 'locale',
          groupValue: locale,
        },
      ),
      buildReleaseStatsRow(
        'locale_coverage_non_inferred',
        'completeness',
        'percentage',
        percentage(localeNonInferredCount, total),
        createdAt,
        {
          groupBy: 'locale',
          groupValue: locale,
        },
      ),
      buildReleaseStatsRow(
        'locale_alt_coverage',
        'completeness',
        'percentage',
        percentage(localeAltCount, total),
        createdAt,
        {
          groupBy: 'locale',
          groupValue: locale,
        },
      ),
    ]
  })
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
        groupBy: 'type',
        groupValue: type,
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
      'parent_changed_count',
      'quality',
      'count',
      counts.parent_changed_count,
      createdAt,
    ),
    buildReleaseStatsRow(
      'locale_regression_count',
      'quality',
      'count',
      counts.locale_regression_count,
      createdAt,
    ),
    buildReleaseStatsRow(
      'name_regression_count',
      'quality',
      'count',
      counts.name_regression_count,
      createdAt,
    ),
    buildReleaseStatsRow(
      'geometry_changed_count',
      'quality',
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

  return [
    ...buildChurnMetricRows(churn, createdAt, null),
    ...buildAddressLocaleStatsRows(input.localeCounts, recordedRows, createdAt),
    ...buildAddressComponentStatsRows(input.componentCounts, recordedRows, createdAt),
    ...buildDistrictDistributionStatsRows(input.districtCounts, createdAt),
    buildReleaseStatsRow(
      'localised_records',
      'count',
      'count',
      input.localisedRows,
      createdAt,
      { groupBy: 'table', groupValue: 'address2dI18n' },
    ),
  ]
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
      buildReleaseStatsRow('locale_count', 'completeness', 'count', count, createdAt, {
        groupBy: 'locale',
        groupValue: locale,
      }),
      buildReleaseStatsRow(
        'locale_coverage',
        'completeness',
        'percentage',
        percentage(count, total),
        createdAt,
        { groupBy: 'locale', groupValue: locale },
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
      'component_coverage',
      'completeness',
      'percentage',
      percentage(componentCounts[component] ?? 0, total),
      createdAt,
      { groupBy: 'addressComponent', groupValue: component },
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
      buildReleaseStatsRow('records', 'distribution', 'count', count, createdAt, {
        groupBy: 'district',
        groupValue: districtId,
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
        groupBy: 'table',
        groupValue: 'address2d',
      },
    ),
    buildApiReleaseSetStatsRow(
      'records',
      'count',
      'count',
      input.address3dCount,
      createdAt,
      {
        groupBy: 'table',
        groupValue: 'address3d',
      },
    ),
    buildApiReleaseSetStatsRow(
      'localised_records',
      'count',
      'count',
      input.address2dI18nCount,
      createdAt,
      {
        groupBy: 'table',
        groupValue: 'address2dI18n',
      },
    ),
    buildApiReleaseSetStatsRow(
      'localised_records',
      'count',
      'count',
      input.address3dI18nCount,
      createdAt,
      {
        groupBy: 'table',
        groupValue: 'address3dI18n',
      },
    ),
    buildApiReleaseSetStatsRow(
      'detail_records',
      'count',
      'count',
      input.address3dCount,
      createdAt,
      {
        groupBy: 'table',
        groupValue: 'address3d',
      },
    ),
    buildApiReleaseSetStatsRow(
      'localised_detail_records',
      'count',
      'count',
      input.address3dI18nCount,
      createdAt,
      {
        groupBy: 'table',
        groupValue: 'address3dI18n',
      },
    ),
    buildApiReleaseSetStatsRow(
      'division_linked_count',
      'quality',
      'count',
      input.divisionLinkedCount,
      createdAt,
    ),
    buildApiReleaseSetStatsRow(
      'street_linked_count',
      'quality',
      'count',
      input.streetLinkedCount,
      createdAt,
    ),
    buildApiReleaseSetStatsRow(
      'missing_division_count',
      'quality',
      'count',
      input.missingDivisionCount,
      createdAt,
    ),
    buildApiReleaseSetStatsRow(
      'missing_street_count',
      'quality',
      'count',
      input.missingStreetCount,
      createdAt,
    ),
  ]

  if (input.localeStats) {
    rows.push(...buildApiReleaseSetLocaleStatsRows(input.localeStats, createdAt))
  }

  if (input.churn) {
    rows.push(...buildApiReleaseSetChurnMetricRows(input.churn.totals, createdAt, null))
    rows.push(
      ...buildOptionalGroupedChurnRows(input.churn.address2d, createdAt, {
        groupBy: 'table',
        groupValue: 'address2d',
      }),
      ...buildOptionalGroupedChurnRows(input.churn.address3d, createdAt, {
        groupBy: 'table',
        groupValue: 'address3d',
      }),
    )
  }

  if (input.quality) {
    rows.push(
      buildApiReleaseSetStatsRow(
        'locale_regression_count',
        'quality',
        'count',
        input.quality.locale_regression_count,
        createdAt,
      ),
      buildApiReleaseSetStatsRow(
        'name_regression_count',
        'quality',
        'count',
        input.quality.name_regression_count,
        createdAt,
      ),
      buildApiReleaseSetStatsRow(
        'geometry_changed_count',
        'quality',
        'count',
        input.quality.geometry_changed_count,
        createdAt,
      ),
    )
  }

  return rows
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
        groupBy: 'table',
        groupValue: 'divisions',
      },
    ),
    buildApiReleaseSetStatsRow(
      'localised_records',
      'count',
      'count',
      input.divisionI18nCount,
      createdAt,
      {
        groupBy: 'table',
        groupValue: 'divisionsI18n',
      },
    ),
  ]

  rows.push(
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
        'parent_changed_count',
        'quality',
        'count',
        input.quality.parent_changed_count,
        createdAt,
      ),
      buildApiReleaseSetStatsRow(
        'locale_regression_count',
        'quality',
        'count',
        input.quality.locale_regression_count,
        createdAt,
      ),
      buildApiReleaseSetStatsRow(
        'name_regression_count',
        'quality',
        'count',
        input.quality.name_regression_count,
        createdAt,
      ),
      buildApiReleaseSetStatsRow(
        'geometry_changed_count',
        'quality',
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
    isLocaleInferred: boolean
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
    const previousPrimaryName = !previous.isLocaleInferred ? previous.name : null

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
  dimension: string,
  metric: string,
  metricUnit: string,
  value: number,
  timestamp: string,
  grouping?: {
    groupBy: string
    groupValue: string
  },
): ReleaseScopedStatsRow {
  return buildStatsRow(
    'release',
    dimension,
    metric,
    metricUnit,
    value,
    timestamp,
    grouping,
  )
}

function buildApiReleaseSetStatsRow(
  dimension: string,
  metric: string,
  metricUnit: string,
  value: number,
  timestamp: string,
  grouping?: {
    groupBy: string
    groupValue: string
  },
): ApiReleaseSetScopedStatsRow {
  return buildStatsRow(
    'apiReleaseSet',
    dimension,
    metric,
    metricUnit,
    value,
    timestamp,
    grouping,
  )
}

function buildStatsRow(
  type: 'apiReleaseSet' | 'release',
  dimension: string,
  metric: string,
  metricUnit: string,
  value: number,
  timestamp: string,
  grouping?: {
    groupBy: string
    groupValue: string
  },
) {
  return {
    createdAt: timestamp,
    dimension,
    groupBy: grouping?.groupBy ?? null,
    groupValue: grouping?.groupValue ?? null,
    metric,
    metricUnit,
    type,
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
    const localeNonInferredCount = statsAccumulator.nonInferredCoverage.get(locale) ?? 0
    const localeAltCount = statsAccumulator.altCoverage.get(locale) ?? 0
    const total = statsAccumulator.total

    return [
      buildApiReleaseSetStatsRow(
        'locale_count',
        'completeness',
        'count',
        localeCount,
        createdAt,
        {
          groupBy: 'locale',
          groupValue: locale,
        },
      ),
      buildApiReleaseSetStatsRow(
        'locale_coverage',
        'completeness',
        'percentage',
        percentage(localeCount, total),
        createdAt,
        {
          groupBy: 'locale',
          groupValue: locale,
        },
      ),
      buildApiReleaseSetStatsRow(
        'locale_coverage_non_inferred',
        'completeness',
        'percentage',
        percentage(localeNonInferredCount, total),
        createdAt,
        {
          groupBy: 'locale',
          groupValue: locale,
        },
      ),
      buildApiReleaseSetStatsRow(
        'locale_alt_coverage',
        'completeness',
        'percentage',
        percentage(localeAltCount, total),
        createdAt,
        {
          groupBy: 'locale',
          groupValue: locale,
        },
      ),
    ]
  })
}

function buildGroupedCountRows(
  counts: Map<string, number> | Record<string, number> | undefined,
  dimension: string,
  createdAt: string,
  groupBy: string,
) {
  return mapEntries(counts).map(([groupValue, value]) =>
    buildApiReleaseSetStatsRow(dimension, 'count', 'count', value, createdAt, {
      groupBy,
      groupValue,
    }),
  )
}

function buildGroupedChurnRows(
  counts: Map<string, ChurnCounts> | Record<string, ChurnCounts> | undefined,
  createdAt: string,
  groupBy: string,
) {
  return mapEntries(counts).flatMap(([groupValue, churnCounts]) =>
    buildApiReleaseSetChurnMetricRows(churnCounts, createdAt, {
      groupBy,
      groupValue,
    }),
  )
}

function buildOptionalGroupedChurnRows(
  counts: ChurnCounts | undefined,
  createdAt: string,
  grouping: {
    groupBy: string
    groupValue: string
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
    groupBy: string
    groupValue: string
  } | null,
) {
  return churnMetricNames.map(dimension =>
    buildApiReleaseSetStatsRow(
      dimension,
      'churn',
      'count',
      counts[dimension],
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
    groupBy: string
    groupValue: string
  } | null,
) {
  return churnMetricNames.map(dimension =>
    buildReleaseStatsRow(
      dimension,
      'churn',
      'count',
      counts[dimension],
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
  isLocaleInferred: boolean
  name: string | null
  nameAlts: string | null
}) {
  return Boolean((!row.isLocaleInferred && row.name) || row.nameAlts)
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
