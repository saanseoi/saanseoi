type Stat = {
  category?: string | null
  measure?: string | null
  unit?: string | null
  value: number
  dimension?: string | null
  dimensionValue?: string | null
}

/** Published release-set churn is authoritative; source-release churn has a different baseline. */
export function selectSnapshotChangeStats(
  stats: readonly Stat[],
  resourceType: string,
  primary: boolean,
) {
  // The address table breakdown belongs to the primary variant, not supplementary
  // address snapshots (for example Overture Places).
  if (resourceType === 'address' && !primary) return []
  const table = resourceType === 'address' ? 'address2d' : resourceType
  const changes = stats.filter(row => row.category === 'changes')
  const tableRows = changes.filter(
    row => row.dimension === 'table' && row.dimensionValue === table,
  )
  const selected = tableRows.length
    ? tableRows
    : primary
      ? changes.filter(row => !row.dimension)
      : []
  const measures = [
    'count',
    'added_count',
    'changed_count',
    'removed_count',
    'unchanged_count',
  ]
  if (
    !measures.every(measure =>
      selected.some(
        row =>
          row.measure === measure && row.unit === 'count' && Number.isFinite(row.value),
      ),
    )
  )
    return []
  return [
    {
      category: 'records',
      measure: 'count',
      unit: 'count',
      value: selected.find(row => row.measure === 'count')!.value,
    },
    ...measures.map(measure => ({
      category: 'changes',
      measure,
      unit: 'count',
      value: selected.find(row => row.measure === measure)!.value,
    })),
  ]
}
