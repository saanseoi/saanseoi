import { equalJson } from '../../../jsonFieldDiff'
import type { ChurnCounts } from '../metrics/releaseStats'
import { recordContent } from './recordContent'

export type SourceChurnRecord = {
  properties: unknown
  sourceGeometry?: unknown
}

function content(row: SourceChurnRecord) {
  const parse = (value: unknown) =>
    typeof value === 'string' ? JSON.parse(value) : value
  return recordContent({
    properties: parse(row.properties),
    geometry: parse(row.sourceGeometry) ?? null,
  })
}

/** Compare retained publisher payloads, independent of canonical exclusions and hash migrations. */
export function buildSourceChurnCounts(
  previous: ReadonlyMap<string, SourceChurnRecord>,
  current: ReadonlyMap<string, SourceChurnRecord>,
) {
  const empty = (): ChurnCounts => ({
    count: 0,
    added_count: 0,
    changed_count: 0,
    removed_count: 0,
    unchanged_count: 0,
  })
  const totals = empty()
  const byType = new Map<string, ChurnCounts>()
  const group = (row: SourceChurnRecord) => {
    const properties = content(row).properties as Record<string, unknown> | null
    const type = String(properties?.subtype ?? properties?.type ?? 'unknown')
    if (!byType.has(type)) byType.set(type, empty())
    return byType.get(type)!
  }
  for (const [id, row] of current) {
    const before = previous.get(id)
    const type = group(row)
    totals.count++
    type.count++
    const measure = !before
      ? 'added_count'
      : equalJson(content(before), content(row))
        ? 'unchanged_count'
        : 'changed_count'
    totals[measure]++
    type[measure]++
  }
  for (const [id, row] of previous) {
    if (current.has(id)) continue
    totals.removed_count++
    group(row).removed_count++
  }
  return { totals, byType }
}
