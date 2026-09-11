import type { StatisticsStatsData } from './statisticsApiReleaseSetStats'

type RecordRow = StatisticsStatsData['records'][number]
const entries = (value: Record<string, string>) =>
  Object.entries(value).sort(([a], [b]) => a.localeCompare(b))

/** Compare continuing analytical records across periods, preserving every source copy. */
export function buildStatisticsRecordChurn(
  current: RecordRow[],
  previous: RecordRow[] = [],
) {
  const inventory = (records: RecordRow[]) => {
    const groups = new Map<string, Map<string, number>>()
    for (const row of records) {
      // IDs and source references include publication/period-specific components.
      const identity = JSON.stringify([
        row.datasetCode,
        row.geography.kind,
        row.geography.code,
        row.geography.class ?? null,
        entries(row.dimensions),
      ])
      const payload = JSON.stringify([
        entries(row.values),
        row.divisionId ?? null,
        row.geography.areaCompanion?.domainCode ?? null,
        row.geography.areaCompanion?.variant ?? null,
      ])
      const values = groups.get(identity) ?? new Map<string, number>()
      values.set(payload, (values.get(payload) ?? 0) + 1)
      groups.set(identity, values)
    }
    return groups
  }
  const after = inventory(current)
  const before = inventory(previous)
  const counts = {
    count: current.length,
    added_count: 0,
    changed_count: 0,
    removed_count: 0,
    unchanged_count: 0,
  }
  const total = (values: Map<string, number>) =>
    [...values.values()].reduce((sum, count) => sum + count, 0)
  for (const identity of new Set([...after.keys(), ...before.keys()])) {
    const currentValues = after.get(identity) ?? new Map<string, number>()
    const previousValues = before.get(identity) ?? new Map<string, number>()
    let unchanged = 0
    for (const [payload, count] of currentValues)
      unchanged += Math.min(count, previousValues.get(payload) ?? 0)
    const remainingCurrent = total(currentValues) - unchanged
    const remainingPrevious = total(previousValues) - unchanged
    const changed = Math.min(remainingCurrent, remainingPrevious)
    counts.unchanged_count += unchanged
    counts.changed_count += changed
    counts.added_count += remainingCurrent - changed
    counts.removed_count += remainingPrevious - changed
  }
  return counts
}
