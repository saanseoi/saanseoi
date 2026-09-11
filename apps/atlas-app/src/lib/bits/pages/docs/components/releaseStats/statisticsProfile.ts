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
  const count = (dimension: string) =>
    take(
      row => row.dimension === dimension && row.metric === 'count' && !row.groupBy,
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
      row.dimension === 'observations' &&
      row.metric === 'count' &&
      row.groupBy === 'referencePeriod',
  )
  const fieldRows = take(
    row =>
      row.dimension === 'observations' &&
      row.metric === 'count' &&
      row.groupBy === 'field' &&
      Boolean(row.groupValue),
  )
  const measureRows = take(
    row =>
      row.dimension === 'observations' &&
      row.metric === 'count' &&
      row.groupBy === 'measure' &&
      Boolean(row.groupValue),
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
    ].flatMap(metric =>
      metric.value === undefined
        ? []
        : [{ label: metric.label, value: format(metric.value) }],
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
              label: copy.statLabel(row.groupValue),
              value: format(row.value),
            })),
        }
      : undefined,
  }
  if (referencePeriods.length === 1) {
    const metric = profile.metrics.find(metric => metric.label === 'Reference periods')
    if (metric) {
      metric.label = 'Reference period'
      metric.value = copy.statLabel(referencePeriods[0]?.groupValue)
    }
  }
  const statusRows = take(
    row =>
      row.dimension === 'observations' &&
      row.metric === 'count' &&
      row.groupBy === 'observationStatus',
  )
  const statusTotal =
    observations ?? statusRows.reduce((sum, row) => sum + row.value, 0)
  for (const row of statusRows) {
    const tone =
      row.groupValue === 'published' ||
      row.groupValue === 'suppressed' ||
      row.groupValue === 'unavailable'
        ? row.groupValue
        : 'other'
    const percentage = statusTotal > 0 ? (row.value / statusTotal) * 100 : 0
    profile.availability.push({
      label: tone === 'published' ? 'Published values' : copy.statLabel(row.groupValue),
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
  for (const [group, title, dimension, unit] of [
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
              row.groupBy === group &&
              row.metric === 'count' &&
              (row.dimension === dimension ||
                (dimension === 'fields' && row.dimension === 'measures')),
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
            group === 'sourceLayer' && /^BG[_ -]?\d{2}C$/i.test(row.groupValue ?? '')
              ? 'Building groups'
              : group === 'sourceLayer' &&
                  /^HMA[_ -]?\d{2}C$/i.test(row.groupValue ?? '')
                ? 'Housing market areas'
                : copy.statLabel(row.groupValue),
          value: format(row.value),
          percentage: total > 0 ? (row.value / total) * 100 : 0,
        })),
    })
  }
  const localeRows = take(
    row =>
      row.groupBy === 'locale' &&
      ['field_labels', 'field_label_coverage', 'unverified_field_labels'].includes(
        row.dimension ?? '',
      ),
  )
  profile.localeCoverage = localeRows
    .filter(row => row.dimension === 'field_label_coverage')
    .map(row => ({
      label: copy.localeName(row.groupValue ?? ''),
      percentage: row.value,
      value: formatReleaseStat(locale, row.value, 'percentage'),
      count: format(
        localeRows.find(
          item =>
            item.groupValue === row.groupValue && item.dimension === 'field_labels',
        )?.value ?? 0,
      ),
      unverified: format(
        localeRows.find(
          item =>
            item.groupValue === row.groupValue &&
            item.dimension === 'unverified_field_labels',
        )?.value ?? 0,
      ),
    }))
  return { profile, remainingStats: [...remaining] }
}
