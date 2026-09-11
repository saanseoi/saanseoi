import { buildChurnStatsRows } from '@repo/core/pipeline/services/metrics/releaseStats'
import { createHash } from 'node:crypto'

/** Division attributes only; geometry is reported by the companion Areas release. */
export function planningDivisionContentHash(row: Record<string, unknown>) {
  const canonical = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(canonical)
    if (value && typeof value === 'object')
      return Object.fromEntries(
        Object.entries(value)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, item]) => [key, canonical(item)]),
      )
    return value
  }
  const fields = [
    'id',
    'divisionCode',
    'identifiers',
    'level',
    'class',
    'wikidata',
    'hierarchies',
    'cartography',
  ]
  const content = Object.fromEntries(
    fields.map(field => {
      let value = row[field] ?? null
      if (
        ['identifiers', 'hierarchies', 'cartography'].includes(field) &&
        typeof value === 'string'
      )
        value = JSON.parse(value)
      return [field, canonical(value)]
    }),
  )
  return createHash('sha256').update(JSON.stringify(content)).digest('hex')
}

export function planningDivisionChurn(
  previous: Array<{ id: string; versionHash: string }>,
  incoming: Array<{ id: string; versionHash: string }>,
) {
  const before = new Map(previous.map(row => [row.id, row.versionHash]))
  const after = new Map(incoming.map(row => [row.id, row.versionHash]))
  let added = 0
  let changed = 0
  let unchanged = 0
  for (const [id, hash] of after) {
    if (!before.has(id)) added++
    else if (before.get(id) !== hash) changed++
    else unchanged++
  }
  const removed = [...before.keys()].filter(id => !after.has(id)).length
  return buildChurnStatsRows({
    totals: {
      count: after.size,
      added_count: added,
      changed_count: changed,
      unchanged_count: unchanged,
      removed_count: removed,
    },
    byType: new Map(),
  })
}
