import type { NewSourceResolution } from '@repo/db/historySchema'

/** Resolve every contributing publisher feature to its packed statistic. */
export function statisticSourceResolutions(
  records: Array<{
    id: string
    fieldSources: Record<string, { sourceFeatureRef: string; sourceReleaseId: string }>
    divisionId?: string | null
    referencePeriodEndYear: string
  }>,
  sources: ReadonlyMap<string, { sourceRecordId: string; versionHash: string }>,
  sourceReleaseId: string,
) {
  const groups = new Map<string, { shardYear: string; row: NewSourceResolution }>()
  for (const record of records) {
    const sourceFeatureRefs = new Set(
      Object.values(record.fieldSources)
        .filter(source => source.sourceReleaseId === sourceReleaseId)
        .map(source => source.sourceFeatureRef),
    )
    for (const sourceFeatureRef of sourceFeatureRefs) {
      const source = sources.get(sourceFeatureRef)
      if (!source)
        throw new Error(`Missing publisher assertion for statistic ${sourceFeatureRef}`)
      const key = JSON.stringify([
        record.referencePeriodEndYear,
        source.sourceRecordId,
        source.versionHash,
      ])
      let group = groups.get(key)
      if (!group) {
        group = {
          shardYear: record.referencePeriodEndYear,
          row: {
            snapshotId: null,
            sourceReleaseId,
            sourceRecordId: source.sourceRecordId,
            sourceVersionHash: source.versionHash,
            resolutions: { entities: {} },
          },
        }
        groups.set(key, group)
      }
      const entities = group.row.resolutions.entities
      entities.statistic = [
        ...new Set([...(entities.statistic ?? []), record.id]),
      ].sort()
      if (record.divisionId)
        entities.division = [
          ...new Set([...(entities.division ?? []), record.divisionId]),
        ].sort()
    }
  }
  return [...groups.values()]
}
