import type { ReleaseStat, ReleaseStatsCopy } from './releaseStats.types'
import { formatReleaseStat } from './releaseStatsFormat'

export function createPlaceProfile(
  stats: ReleaseStat[],
  locale: string,
  copy: ReleaseStatsCopy,
) {
  const claimed = new Set<ReleaseStat>()
  const format = (row?: ReleaseStat) =>
    row ? formatReleaseStat(locale, row.value, row.metricUnit ?? row.metric) : '—'
  const take = (dimension: string, groupBy?: string, groupValue?: string) => {
    const row = stats.find(
      row =>
        row.dimension === dimension &&
        (row.groupBy ?? undefined) === groupBy &&
        (row.groupValue ?? undefined) === groupValue,
    )
    if (row) claimed.add(row)
    return row
  }
  const metrics = [
    ['reference_name_count', 'reference_name_coverage', 'Reference names'],
    [
      'bilingual_reference_name_count',
      'bilingual_reference_name_coverage',
      'Bilingual reference names',
    ],
    ['localised_records', '', 'Places with localisation'],
    ['address_links', '', 'Places with linked addresses'],
    ['division_links', '', 'Division links'],
    ['localised_rows', '', 'Localised entries'],
  ].flatMap(([dimension, coverage, label]) => {
    const count = take(dimension)
    const percentage = coverage ? take(coverage, 'field', 'referenceName') : undefined
    return count || percentage
      ? [
          {
            label,
            value: format(count),
            coverage: percentage ? format(percentage) : undefined,
          },
        ]
      : []
  })
  const fields = [
    ...new Set(
      stats
        .filter(row => row.groupBy === 'field_locale' && row.groupValue?.includes(':'))
        .map(row => row.groupValue!.split(':')[0]),
    ),
  ]
    .sort((a, b) => (a === 'name' ? -1 : b === 'name' ? 1 : a.localeCompare(b)))
    .map(field => ({
      code: field,
      label: copy.statLabel(field),
      any: (() => {
        // A reference name exists exactly when at least one non-empty name exists.
        // Other fields cannot be deduplicated from per-locale marginal counts.
        const count =
          field === 'name'
            ? stats.find(
                row => row.dimension === 'reference_name_count' && !row.groupBy,
              )
            : undefined
        const coverage =
          field === 'name'
            ? stats.find(
                row =>
                  row.dimension === 'reference_name_coverage' &&
                  row.groupBy === 'field',
              )
            : undefined
        return {
          code: `${field}:any`,
          label: 'Any',
          coverage: coverage?.value ?? 0,
          coverageLabel: format(coverage),
          count: format(count),
          available: Boolean(coverage),
        }
      })(),
      rows: [
        ...new Set(
          stats
            .filter(
              row =>
                row.groupBy === 'field_locale' &&
                row.groupValue?.startsWith(`${field}:`),
            )
            .map(row => row.groupValue!),
        ),
      ]
        .map(key => {
          const get = (suffix: string) =>
            take(`localisation_${suffix}`, 'field_locale', key)
          const coverage = get('coverage')
          return {
            code: key,
            locale: key.slice(field.length + 1).toLowerCase(),
            label: key.endsWith(':ja')
              ? 'Japanese'
              : key.endsWith(':und')
                ? 'Undetermined'
                : copy.localeName(key.slice(field.length + 1)),
            coverage: coverage?.value ?? 0,
            coverageLabel: format(coverage),
            count: format(get('value_count')),
            provided: format(get('provided_coverage')),
            inferred: format(get('inferred_coverage')),
            ai: format(get('ai_translated_coverage')),
            human: format(get('human_translated_coverage')),
            missing: format(get('missing_value_count')),
            conflicts: format(get('conflict_count')),
          }
        })
        .sort((a, b) => b.coverage - a.coverage || a.label.localeCompare(b.label)),
    }))
  const locales = stats
    .filter(
      row =>
        fields.length > 0 &&
        row.groupBy === 'locale' &&
        row.dimension === 'localised_records' &&
        row.metric === 'count',
    )
    .map(row => {
      claimed.add(row)
      return { label: copy.localeName(row.groupValue ?? ''), value: format(row) }
    })
  return {
    profile: { metrics, fields, locales },
    remainingStats: stats.filter(row => !claimed.has(row)),
  }
}
export type PlaceProfile = ReturnType<typeof createPlaceProfile>['profile']
