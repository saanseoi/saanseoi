import { formatReleaseStat } from './releaseStatsFormat'
import type {
  ReleaseStat,
  ReleaseStatsCopy,
  StatisticsProfilePresentation,
} from './releaseStats.types'

export function createStatisticsProfile(
  stats: ReleaseStat[],
  locale: string,
  copy: ReleaseStatsCopy,
) {
  const remaining = new Set(stats)
  const take = (predicate: (row: ReleaseStat) => boolean) => {
    const rows = stats.filter(predicate)
    rows.forEach(row => {
      remaining.delete(row)
    })
    return rows
  }
  const count = (category: string) =>
    take(
      row => row.category === category && row.measure === 'count' && !row.dimension,
    )[0]?.value
  const format = (value: number) => formatReleaseStat(locale, value)
  const records = count('records')
  const observations = count('observations')
  const fields = count('fields')
  const measures = count('measures')
  const datasets = count('datasets')
  const periods = count('reference_periods')
  const referencePeriods = take(
    row =>
      row.category === 'observations' &&
      row.measure === 'count' &&
      row.dimension === 'referencePeriod',
  )
  const fieldRows = take(
    row =>
      row.category === 'observations' &&
      row.measure === 'count' &&
      row.dimension === 'field' &&
      Boolean(row.dimensionValue),
  )
  const measureRows = take(
    row =>
      row.category === 'observations' &&
      row.measure === 'count' &&
      row.dimension === 'measure' &&
      Boolean(row.dimensionValue),
  )
  const coverageRows = fieldRows.length ? fieldRows : measureRows
  const frequencies = new Map<number, number>()
  coverageRows.forEach(row => {
    frequencies.set(row.value, (frequencies.get(row.value) ?? 0) + 1)
  })
  const baseline = [...frequencies].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]
  const profile: StatisticsProfilePresentation = {
    localeCoverage: [],
    metrics: [
      { label: 'Geographic records', value: records },
      {
        label: 'Statistical fields',
        value: fields ?? measures ?? (coverageRows.length || undefined),
      },
      { label: 'Statistical measures', value: measures },
      { label: 'Datasets', value: datasets },
      { label: 'Observations', value: observations },
      {
        label: 'Reference periods',
        value: periods ?? (referencePeriods.length || undefined),
      },
    ].flatMap(measure =>
      measure.value === undefined
        ? []
        : [{ label: measure.label, value: format(measure.value) }],
    ),
    distributions: [],
    availability: [],
    coverage: baseline
      ? {
          fieldCount: format(coverageRows.length),
          standardCount: format(baseline[1]),
          observations: format(baseline[0]),
          uniform: baseline[1] === coverageRows.length,
          exceptions: coverageRows
            .filter(row => row.value !== baseline[0])
            .sort((a, b) => a.value - b.value)
            .map(row => ({
              label: copy.statLabel(row.dimensionValue),
              value: format(row.value),
            })),
        }
      : undefined,
  }
  if (referencePeriods.length === 1) {
    const measure = profile.metrics.find(
      measure => measure.label === 'Reference periods',
    )
    if (measure) {
      measure.label = 'Reference period'
      measure.value = copy.statLabel(referencePeriods[0]?.dimensionValue)
    }
  }
  const statusRows = take(
    row =>
      row.category === 'observations' &&
      row.measure === 'count' &&
      row.dimension === 'observationStatus',
  )
  const statusTotal =
    observations ?? statusRows.reduce((sum, row) => sum + row.value, 0)
  for (const row of statusRows) {
    const tone =
      row.dimensionValue === 'published' ||
      row.dimensionValue === 'suppressed' ||
      row.dimensionValue === 'unavailable'
        ? row.dimensionValue
        : 'other'
    const percentage = statusTotal > 0 ? (row.value / statusTotal) * 100 : 0
    profile.availability.push({
      label:
        tone === 'published' ? 'Published values' : copy.statLabel(row.dimensionValue),
      value: format(row.value),
      percentage,
      percentageLabel: new Intl.NumberFormat(locale, {
        maximumFractionDigits: 2,
        style: 'percent',
      }).format(percentage / 100),
      description:
        tone === 'published'
          ? 'A value is provided.'
          : tone === 'suppressed'
            ? 'The publisher withholds the value (**).'
            : tone === 'unavailable'
              ? 'The publisher marks the value as unavailable (–, N.A. or NA).'
              : 'Publisher observation status.',
      tone,
    })
  }
  const order = ['published', 'suppressed', 'unavailable', 'other']
  profile.availability.sort((a, b) => order.indexOf(a.tone) - order.indexOf(b.tone))
  for (const [group, title, category, unit] of [
    ['sourceLayer', 'Geographic coverage', 'records', 'records'],
    ['geographyKind', 'Geography types', 'records', 'records'],
    ['divisionLinkage', 'Canonical division linkage', 'records', 'records'],
    ['valueKind', 'Value types', 'observations', 'observations'],
    ['referencePeriod', 'Reference periods', 'observations', 'observations'],
    ['statisticKind', 'Statistical kinds', 'fields', 'fields'],
    ['unitCode', 'Units', 'fields', 'fields'],
    ['aggregation', 'Aggregations', 'fields', 'fields'],
  ]) {
    const rows =
      group === 'referencePeriod'
        ? referencePeriods.length > 1
          ? referencePeriods
          : []
        : take(
            row =>
              row.dimension === group &&
              row.measure === 'count' &&
              (row.category === category ||
                (category === 'fields' && row.category === 'measures')),
          )
    if (!rows.length) continue
    const total = rows.reduce((sum, row) => sum + row.value, 0)
    profile.distributions.push({
      id: `stats-profile-${group}`,
      title,
      unit,
      rows: rows
        .sort((a, b) => b.value - a.value)
        .map(row => ({
          label:
            group === 'sourceLayer' &&
            /^BG[_ -]?\d{2}C$/i.test(row.dimensionValue ?? '')
              ? 'Building groups'
              : group === 'sourceLayer' &&
                  /^HMA[_ -]?\d{2}C$/i.test(row.dimensionValue ?? '')
                ? 'Housing market areas'
                : copy.statLabel(row.dimensionValue),
          value: format(row.value),
          percentage: total > 0 ? (row.value / total) * 100 : 0,
        })),
    })
  }
  const localeRows = take(
    row =>
      row.dimension === 'locale' &&
      ['field_labels', 'field_label_coverage', 'unverified_field_labels'].includes(
        row.category ?? '',
      ),
  )
  profile.localeCoverage = localeRows
    .filter(row => row.category === 'field_label_coverage')
    .map(row => ({
      label: copy.localeName(row.dimensionValue ?? ''),
      percentage: row.value,
      value: formatReleaseStat(locale, row.value, 'percentage'),
      count: format(
        localeRows.find(
          item =>
            item.dimensionValue === row.dimensionValue &&
            item.category === 'field_labels',
        )?.value ?? 0,
      ),
      unverified: format(
        localeRows.find(
          item =>
            item.dimensionValue === row.dimensionValue &&
            item.category === 'unverified_field_labels',
        )?.value ?? 0,
      ),
    }))
  return { profile, remainingStats: [...remaining] }
}
