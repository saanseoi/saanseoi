/** Group status uses all retained rows, independently of the visible search results. */
export function ruleGroupStatus(rows: Array<{ matched?: number; changed?: number }>) {
  if (rows.some(row => (row.matched ?? 0) > 0 || (row.changed ?? 0) > 0))
    return 'applied'
  if (
    !rows.length ||
    rows.some(row => row.matched === undefined || row.changed === undefined)
  )
    return 'not-recorded'
  return 'no-matches'
}
