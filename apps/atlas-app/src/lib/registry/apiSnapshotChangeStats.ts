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
  variant?: string | string[],
): Array<{ category: string; measure: string; unit: string; value: number }> {
  if (Array.isArray(variant)) {
    if (!variant.length) return []
    // Only the first (primary) variant can inherit aggregate churn. Other variants
    // contribute saved resource counts without repeating table/group totals.
    const scoped = stats.filter(row => row.dimension === 'resource')
    if (
      resourceType !== 'address' &&
      !scoped.some(
        row =>
          row.category === 'changes' &&
          variant.some(value => row.dimensionValue === `${resourceType}:${value}`),
      )
    )
      return selectSnapshotChangeStats(stats, resourceType, primary)
    const selections = [...new Set(variant)]
      .map((value, index) =>
        selectSnapshotChangeStats(
          primary && index === 0 ? stats : scoped,
          resourceType,
          primary && index === 0,
          value,
        ),
      )
      .filter(rows => rows.length)
    if (!selections.length) return []
    return selections[0]!.map((row, index) => ({
      ...row,
      value: selections.reduce((total, rows) => total + rows[index]!.value, 0),
    }))
  }
  // The address table breakdown belongs to the primary variant, not supplementary
  // address snapshots (for example Overture Places).
  const table = resourceType === 'address' ? 'address2d' : resourceType
  const changes = stats.filter(row => row.category === 'changes')
  const tableRows = changes.filter(
    row => row.dimension === 'table' && row.dimensionValue === table,
  )
  const resourceRows = changes.filter(
    row =>
      row.dimension === 'resource' &&
      row.dimensionValue === `${resourceType}:${variant}`,
  )
  if (resourceType === 'address' && !primary && !resourceRows.length) return []
  const selected = resourceRows.length
    ? resourceRows
    : tableRows.length
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
