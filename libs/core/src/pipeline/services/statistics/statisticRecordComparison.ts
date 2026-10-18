import type { RetainedStatisticRecord } from './statisticSnapshotRecords'

export type ComparableStatisticRecord = Pick<
  RetainedStatisticRecord,
  'id' | 'datasetCode' | 'geography' | 'values' | 'fieldDefinitionHashes' | 'divisionId'
>
const entries = (value: Record<string, string>) =>
  Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)))

/** Cross-period content, excluding observation identity, period and provenance. */
export function statisticComparisonContent(row: ComparableStatisticRecord) {
  return {
    datasetCode: row.datasetCode,
    geography: {
      kind: row.geography.kind,
      code: row.geography.code,
      class: row.geography.class ?? null,
      namespace: row.geography.namespace ?? null,
      areaCompanion: {
        domainCode: row.geography.areaCompanion?.domainCode ?? null,
        variant: row.geography.areaCompanion?.variant ?? null,
      },
    },
    values: entries(row.values),
    fieldDefinitionHashes: entries(row.fieldDefinitionHashes),
    divisionId: row.divisionId ?? null,
  }
}

/** Geography continuity is a comparison convention, not observation identity. */
export function pairStatisticRecords<T extends ComparableStatisticRecord>(
  current: T[],
  previous: T[] = [],
) {
  const inventory = (records: T[]) => {
    const groups = new Map<string, Map<string, T[]>>()
    for (const row of [...records].sort((a, b) => a.id.localeCompare(b.id))) {
      const identity = JSON.stringify([
        row.datasetCode,
        row.geography.kind,
        row.geography.code,
        row.geography.class ?? null,
        row.geography.namespace ?? null,
      ])
      const payload = JSON.stringify(statisticComparisonContent(row))
      const values = groups.get(identity) ?? new Map<string, T[]>()
      const matches = values.get(payload) ?? []
      matches.push(row)
      values.set(payload, matches)
      groups.set(identity, values)
    }
    return groups
  }
  const after = inventory(current),
    before = inventory(previous)
  const pairs: Array<{
    type: 'added' | 'changed' | 'removed' | 'unchanged'
    before?: T
    after?: T
  }> = []
  for (const identity of [...new Set([...after.keys(), ...before.keys()])].sort()) {
    const currentValues = after.get(identity) ?? new Map<string, T[]>()
    const previousValues = before.get(identity) ?? new Map<string, T[]>()
    const remainingCurrent: T[] = [],
      remainingPrevious: T[] = []
    for (const payload of [
      ...new Set([...currentValues.keys(), ...previousValues.keys()]),
    ].sort()) {
      const next = currentValues.get(payload) ?? [],
        old = previousValues.get(payload) ?? []
      const unchanged = Math.min(next.length, old.length)
      for (let i = 0; i < unchanged; i++)
        pairs.push({ type: 'unchanged', before: old[i]!, after: next[i]! })
      remainingCurrent.push(...next.slice(unchanged))
      remainingPrevious.push(...old.slice(unchanged))
    }
    const changed = Math.min(remainingCurrent.length, remainingPrevious.length)
    for (let i = 0; i < changed; i++)
      pairs.push({
        type: 'changed',
        before: remainingPrevious[i]!,
        after: remainingCurrent[i]!,
      })
    for (const row of remainingCurrent.slice(changed))
      pairs.push({ type: 'added', after: row })
    for (const row of remainingPrevious.slice(changed))
      pairs.push({ type: 'removed', before: row })
  }
  return pairs
}
