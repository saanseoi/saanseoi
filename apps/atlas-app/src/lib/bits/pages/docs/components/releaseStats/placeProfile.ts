import type { ReleaseStat, ReleaseStatsCopy } from './releaseStats.types'
import { formatReleaseStat } from './releaseStatsFormat'

export function createPlaceProfile(
  stats: ReleaseStat[],
  locale: string,
  copy: ReleaseStatsCopy,
) {
  const claimed = new Set<ReleaseStat>()
  const percentageLabel = (value: number) =>
    value > 0 && value < 0.1
      ? `<${formatReleaseStat(locale, 0.1, 'percentage')}`
      : formatReleaseStat(locale, value, 'percentage')
  const format = (row?: ReleaseStat) =>
    row
      ? (row.unit ?? row.measure) === 'percentage'
        ? percentageLabel(row.value)
        : formatReleaseStat(locale, row.value, row.unit ?? row.measure)
      : '—'
  const take = (category: string, dimension?: string, dimensionValue?: string) => {
    const row = stats.find(
      row =>
        row.category === category &&
        (row.dimension ?? undefined) === dimension &&
        (row.dimensionValue ?? undefined) === dimensionValue,
    )
    if (row) claimed.add(row)
    return row
  }
  const total = stats.find(
    row => row.category === 'records' && row.measure === 'count' && !row.dimension,
  )?.value
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
  ].flatMap(([category, coverage, label]) => {
    const count = take(category)
    const percentage = coverage
      ? (take(coverage) ?? take(coverage, 'field', 'referenceName'))
      : undefined
    const coverageValue =
      percentage?.value ??
      (count && total && ['localised_records', 'address_links'].includes(category)
        ? (count.value / total) * 100
        : undefined)
    return count || percentage
      ? [
          {
            label,
            value: format(count),
            coverage:
              coverageValue === undefined ? undefined : percentageLabel(coverageValue),
            coverageValue,
          },
        ]
      : []
  })
  const fields = [
    ...new Set(
      stats
        .filter(
          row => row.dimension === 'field_locale' && row.dimensionValue?.includes(':'),
        )
        .map(row => row.dimensionValue!.split(':')[0]),
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
                row => row.category === 'reference_name_count' && !row.dimension,
              )
            : undefined
        const coverage =
          field === 'name'
            ? stats.find(
                row =>
                  row.category === 'reference_name_coverage' &&
                  (!row.dimension || row.dimension === 'field'),
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
                row.dimension === 'field_locale' &&
                row.dimensionValue?.startsWith(`${field}:`),
            )
            .map(row => row.dimensionValue!),
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
            segments: (
              [
                ['provided', 'provided_coverage'],
                ['inferred', 'inferred_coverage'],
                ['ai-translated', 'ai_translated_coverage'],
                ['human-translated', 'human_translated_coverage'],
              ] as const
            ).map(([tone, suffix]) => ({ tone, value: get(suffix)?.value ?? 0 })),
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
        row.dimension === 'locale' &&
        row.category === 'localised_records' &&
        row.measure === 'count',
    )
    .map(row => {
      claimed.add(row)
      return { label: copy.localeName(row.dimensionValue ?? ''), value: format(row) }
    })
  const coverageLabels: Record<string, string> = {
    basicCategory: 'Basic category',
    taxonomyPrimary: 'Detailed category',
    operatingStatus: 'Operating status',
    website: 'Website',
    social: 'Social profile',
    email: 'Email',
    phone: 'Phone',
    anyContact: 'Any contact detail',
    brandIdentity: 'Brand Wikidata identity',
    publisherAddress: 'Publisher address text',
    linkedAddress: 'Linked address',
    linkedAddress3d: 'Linked 3D address',
    division: 'Any Division link',
    area: 'Area assignment',
    district: 'District assignment',
    confidence: 'Publisher confidence',
  }
  const availability = [
    ...new Set(
      stats
        .filter(
          row => row.category === 'completeness' && row.dimension === 'placeField',
        )
        .map(row => row.dimensionValue),
    ),
  ]
    .filter((field): field is string => Boolean(field))
    .map(field => {
      const get = (measure: string) => {
        const row = stats.find(
          row =>
            row.category === 'completeness' &&
            row.dimension === 'placeField' &&
            row.dimensionValue === field &&
            row.measure === measure,
        )
        if (row) claimed.add(row)
        return row
      }
      const coverage = get('coverage')
      return {
        code: field,
        label: coverageLabels[field] ?? copy.statLabel(field),
        coverage: coverage?.value ?? 0,
        coverageLabel: format(coverage),
        count: format(get('count')),
        missing: format(get('missing_count')),
      }
    })
  return {
    profile: { metrics, fields, locales, availability },
    remainingStats: stats.filter(row => !claimed.has(row)),
  }
}
export type PlaceProfile = ReturnType<typeof createPlaceProfile>['profile']
