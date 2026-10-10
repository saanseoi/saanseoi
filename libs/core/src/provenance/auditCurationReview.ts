import type { Json } from './types'
const object = (value: Json | undefined): Record<string, Json> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value : {}
/** Project retained review evidence into typed instructions, without inventing manual decisions. */
export function organiseCurationReview(
  entries: Json[],
  updates: Json[],
  release?: string,
): {
  entries: Json[]
  outcomes: Record<string, number>
  outcomeRecords: Record<string, Json[]>
} {
  const edition = release?.match(/\d{4}-\d{2}-\d{2}\.\d+$/)?.[0]
  const compare = (a: string, b: string) => a.localeCompare(b, 'en', { numeric: true })
  const rows = entries
    .filter(entry => {
      const row = object(entry)
      if (row.section === 'updatePolicy') return false
      const definition = object(row.definition)
      if (edition) {
        if (
          typeof definition.appliesFrom === 'string' &&
          compare(edition, definition.appliesFrom) < 0
        )
          return false
        if (
          typeof definition.appliesUntil === 'string' &&
          compare(edition, definition.appliesUntil) >= 0
        )
          return false
      }
      return true
    })
    .map(entry => {
      const row = object(entry)
      return row.collection === 'releaseEntries'
        ? { ...row, collection: 'entries' }
        : row
    })
  // Read historical frozen lists as one scoped instruction per identity.
  const exclusions = new Map<string, number>()
  for (let index = 0; index < rows.length; index++) {
    const row = object(rows[index])
    if (
      row.section !== 'exclusions' ||
      !['entries', 'overture', 'landsd'].includes(String(row.collection))
    )
      continue
    const definition = object(row.definition)
    if (definition.review) continue
    const scopes = Array.isArray(definition.scopes)
      ? definition.scopes
      : [row.collection === 'entries' ? 'result' : row.collection!]
    const id = String(definition.divisionId ?? definition.sourceRecordId)
    const previous = exclusions.get(id)
    if (previous !== undefined) {
      const existing = object(rows[previous])
      const prior = object(existing.definition)
      rows[previous] = {
        ...existing,
        definition: {
          ...prior,
          scopes: [...new Set([...(prior.scopes as Json[]), ...scopes])],
        },
      }
      rows.splice(index--, 1)
    } else {
      exclusions.set(id, index)
      rows[index] = {
        ...row,
        collection: 'entries',
        definition: { ...definition, scopes },
      }
    }
  }
  const outcomes: Record<string, number> = {}
  const outcomeRecords: Record<string, Json[]> = {}
  for (const update of updates) {
    const event = object(update)
    const status = String(event.status)
    if (status === 'added') continue
    if (!['keep', 'delete', 'accept'].includes(status)) {
      outcomes[status] = (outcomes[status] ?? 0) + 1
      outcomeRecords[status] ??= []
      outcomeRecords[status].push(update)
      continue
    }
    const section =
      event.field !== '$record'
        ? 'names'
        : ['keep', 'accept'].includes(status)
          ? 'additions'
          : 'exclusions'
    const matching = rows.findIndex(entry => {
      const row = object(entry)
      const definition = object(row.definition)
      return (
        row.section === section &&
        (definition.id ?? definition.divisionId) === event.divisionId &&
        (section !== 'names' || object(definition.review).field === event.field)
      )
    })
    const previous = matching >= 0 ? object(rows[matching]) : {}
    const definition = object(previous.definition)
    const before = object(event.before ?? event.proposed)
    const review: Record<string, Json> = {
      kind: 'curation',
      guard: {
        id: 'division-source-updates',
        summary: 'Upstream division deletions and name changes require manual review.',
        consequence: 'block-ingestion',
      },
      fingerprint: event.fingerprint ?? null,
      field: event.field ?? null,
      before: event.before ?? null,
      proposed: event.proposed ?? null,
    }
    const entry = {
      section,
      collection: 'entries',
      definition: {
        ...definition,
        divisionId: event.divisionId ?? null,
        ...(section === 'additions'
          ? {
              names: before.names ?? {},
              class: before.class ?? null,
              point: before.point ?? null,
            }
          : {}),
        ...(section === 'names' ? { decision: status } : {}),
        ...(release && !definition.appliesFrom ? { recordedIn: release } : {}),
        reason: event.reason ?? null,
        review,
      },
    }
    if (matching >= 0) rows[matching] = entry
    else rows.push(entry)
  }
  return { entries: rows, outcomes, outcomeRecords }
}
