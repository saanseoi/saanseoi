import type { DatasetStatsRow } from '@repo/db/metaSchema'

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

export type LocalizedStatsRow = {
  hasAltName: boolean
  hasName: boolean
  isLocaleInferred: boolean
  locale: string
}

export type StatsSnapshot<TLocalizedRow> = {
  churnHash: string
  id: string
  localizedRows: TLocalizedRow[]
  parentId: string | null
  geometry: unknown
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
 * Folds one division's localized rows into the locale completeness counters.
 */
export function updateLocaleStatsAccumulator(
  statsAccumulator: LocaleStatsAccumulator,
  rows: LocalizedStatsRow[],
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
 * Converts accumulated locale completeness counters into dataset stats rows.
 */
export function buildLocaleStatsRows(statsAccumulator: LocaleStatsAccumulator) {
  const createdAt = new Date().toISOString()
  const locales: StatsLocaleGroup[] = ['en', 'zh-hant', 'zh-hans']

  return locales.flatMap(locale => {
    const localeCount = statsAccumulator.count.get(locale) ?? 0
    const localeNonInferredCount = statsAccumulator.nonInferredCoverage.get(locale) ?? 0
    const localeAltCount = statsAccumulator.altCoverage.get(locale) ?? 0
    const total = statsAccumulator.total

    return [
      buildDatasetStatsRow(
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
      buildDatasetStatsRow(
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
      buildDatasetStatsRow(
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
      buildDatasetStatsRow(
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
export function buildChurnCounts<TLocalizedRow>(
  previousRows: Map<string, StatsSnapshot<TLocalizedRow>>,
  currentRows: Map<string, StatsSnapshot<TLocalizedRow>>,
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
export function buildQualityCounts<TLocalizedRow>(
  previousRows: Map<string, StatsSnapshot<TLocalizedRow>>,
  currentRows: Map<string, StatsSnapshot<TLocalizedRow>>,
  options: {
    hasLocaleRegression: (
      previous: TLocalizedRow[],
      current: TLocalizedRow[],
    ) => boolean
    hasNameRegression: (previous: TLocalizedRow[], current: TLocalizedRow[]) => boolean
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

    if (options.hasLocaleRegression(previous.localizedRows, current.localizedRows)) {
      counts.locale_regression_count += 1
    }

    if (options.hasNameRegression(previous.localizedRows, current.localizedRows)) {
      counts.name_regression_count += 1
    }
  }

  return counts
}

/**
 * Converts churn counts into dataset stats rows for totals and per-type breakdowns.
 */
export function buildChurnStatsRows(churn: {
  totals: ChurnCounts
  byType: Map<string, ChurnCounts>
}) {
  const createdAt = new Date().toISOString()
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
 * Converts quality counters into dataset stats rows.
 */
export function buildQualityStatsRows(counts: QualityCounts) {
  const createdAt = new Date().toISOString()

  return [
    buildDatasetStatsRow(
      'parent_changed_count',
      'quality',
      'count',
      counts.parent_changed_count,
      createdAt,
    ),
    buildDatasetStatsRow(
      'locale_regression_count',
      'quality',
      'count',
      counts.locale_regression_count,
      createdAt,
    ),
    buildDatasetStatsRow(
      'name_regression_count',
      'quality',
      'count',
      counts.name_regression_count,
      createdAt,
    ),
    buildDatasetStatsRow(
      'geometry_changed_count',
      'quality',
      'count',
      counts.geometry_changed_count,
      createdAt,
    ),
  ]
}

/**
 * Reports whether any previously available locale disappeared in the current rows.
 */
export function hasLocaleRegression<TLocalizedRow extends { locale: string }>(
  previousRows: TLocalizedRow[],
  currentRows: TLocalizedRow[],
) {
  const currentLocales = new Set(currentRows.map(row => row.locale))
  return previousRows.some(row => !currentLocales.has(row.locale))
}

/**
 * Reports whether previously tracked primary or alternate names are missing from the current rows.
 */
export function hasNameRegression<
  TLocalizedRow extends {
    isLocaleInferred: boolean
    locale: string
    otName: string | null
    otNameAlts: string | null
  },
>(previousRows: TLocalizedRow[], currentRows: TLocalizedRow[]) {
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
    const previousPrimaryName = !previous.isLocaleInferred ? previous.otName : null

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

function buildDatasetStatsRow(
  dimension: string,
  metric: string,
  metricUnit: string,
  value: number,
  timestamp: string,
  grouping?: {
    groupBy: string
    groupValue: string
  },
): DatasetStatsRow {
  return {
    createdAt: timestamp,
    dimension,
    groupBy: grouping?.groupBy ?? null,
    groupValue: grouping?.groupValue ?? null,
    metric,
    metricUnit,
    type: 'dataset',
    updatedAt: timestamp,
    value,
  }
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
  const metrics: ChurnMetricName[] = [
    'count',
    'unchanged_count',
    'changed_count',
    'added_count',
    'removed_count',
  ]

  return metrics.map(dimension =>
    buildDatasetStatsRow(
      dimension,
      'churn',
      'count',
      counts[dimension],
      timestamp,
      grouping ?? undefined,
    ),
  )
}

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
  otName: string | null
  otNameAlts: string | null
}) {
  return Boolean((!row.isLocaleInferred && row.otName) || row.otNameAlts)
}

function getNameSet(row: { otName: string | null; otNameAlts: string | null }) {
  const names = new Set<string>()

  if (row.otName) {
    names.add(row.otName)
  }

  for (const altName of getAltNames(row)) {
    names.add(altName)
  }

  return names
}

function getAltNames(row: { otNameAlts: string | null }) {
  if (!row.otNameAlts) {
    return []
  }

  return row.otNameAlts
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
