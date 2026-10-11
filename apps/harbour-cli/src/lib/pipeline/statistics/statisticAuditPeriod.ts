import type {
  CanonicalStatsRows,
  HkgovCenstatdStatisticSourceRow,
} from './normaliseHkgovCenstatdStatistics'

/** Count only records and observations materialised into this period's snapshot. */
export function statisticAuditPeriod(
  canonical: CanonicalStatsRows,
  source: HkgovCenstatdStatisticSourceRow[],
  period: string,
) {
  const records = canonical.records.filter(
    record => record.referencePeriodCode === period,
  )
  const series = new Set(records.map(record => record.id))
  const references = new Set(
    records.flatMap(record => [
      record.sourceFeatureRef,
      ...Object.values(record.fieldSources).map(value => value.sourceFeatureRef),
    ]),
  )
  return {
    canonical: {
      ...canonical,
      records,
      observations: canonical.observations.filter(observation =>
        series.has(observation.seriesId),
      ),
    },
    source: source.filter(row => references.has(row.sourceFeatureRef)),
  }
}
