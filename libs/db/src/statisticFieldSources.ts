/** Provenance of the last value or definition change, independent of snapshot ownership. */
export type StatisticSource = { sourceReleaseId: string; sourceFeatureRef: string }
export type StatisticFieldSources = Array<StatisticSource & { property: string }>

export const statisticFieldProperty = (field: string) =>
  `/values/${field.replaceAll('~', '~0').replaceAll('/', '~1')}`

/** Empty property applies to all values; an exact field pointer overrides it. */
export function statisticFieldSource(
  sources: StatisticFieldSources,
  field: string,
): StatisticSource | undefined {
  const source =
    sources.find(s => s.property === statisticFieldProperty(field)) ??
    sources.find(s => s.property === '')
  return (
    source && {
      sourceReleaseId: source.sourceReleaseId,
      sourceFeatureRef: source.sourceFeatureRef,
    }
  )
}

/** Resolve every value explicitly; malformed or uncovered provenance must not be published. */
export function expandStatisticFieldSources(
  sources: StatisticFieldSources,
  fields: string[],
): Record<string, StatisticSource> {
  if (!Array.isArray(sources))
    throw new Error('Statistic field sources must be an array.')
  const paths = new Set<string>()
  const allowed = new Set(['', ...fields.map(statisticFieldProperty)])
  for (const source of sources) {
    if (
      !source ||
      typeof source !== 'object' ||
      typeof source.property !== 'string' ||
      !allowed.has(source.property) ||
      paths.has(source.property) ||
      typeof source.sourceReleaseId !== 'string' ||
      !source.sourceReleaseId ||
      typeof source.sourceFeatureRef !== 'string' ||
      !source.sourceFeatureRef
    )
      throw new Error('Invalid or ambiguous statistic field source.')
    paths.add(source.property)
  }
  return Object.fromEntries(
    fields.map(field => {
      const source = statisticFieldSource(sources, field)
      if (!source) throw new Error(`Missing statistic field source: ${field}`)
      return [field, source]
    }),
  )
}

/** Most frequent source is the default; stable tie-breaking makes serialisation deterministic. */
export function compactStatisticFieldSources(
  fields: Record<string, StatisticSource>,
): StatisticFieldSources {
  const entries = Object.entries(fields).sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0,
  )
  if (!entries.length) return []
  const key = (source: StatisticSource) =>
    JSON.stringify([source.sourceReleaseId, source.sourceFeatureRef])
  const counts = new Map<string, number>()
  for (const [, source] of entries) {
    if (
      !source ||
      typeof source.sourceReleaseId !== 'string' ||
      !source.sourceReleaseId ||
      typeof source.sourceFeatureRef !== 'string' ||
      !source.sourceFeatureRef
    )
      throw new Error('Invalid statistic source.')
    const identity = key(source)
    counts.set(identity, (counts.get(identity) ?? 0) + 1)
  }
  const defaultKey = [...counts.keys()].sort(
    (a, b) => counts.get(b)! - counts.get(a)! || (a < b ? -1 : a > b ? 1 : 0),
  )[0]!
  const [sourceReleaseId, sourceFeatureRef] = JSON.parse(defaultKey) as [string, string]
  return [
    { property: '', sourceReleaseId, sourceFeatureRef },
    ...entries
      .filter(([, source]) => key(source) !== defaultKey)
      .map(([field, source]) => ({
        property: statisticFieldProperty(field),
        sourceReleaseId: source.sourceReleaseId,
        sourceFeatureRef: source.sourceFeatureRef,
      })),
  ]
}
