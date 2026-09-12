import type { Json } from './types'
import { auditDivisionCode } from './divisionCodes'
import { auditSearchText, matchesAudit, matchesAuditText } from './auditSearch'
const representations = new WeakMap<object, Json[]>()
const stable = (value: Json): string =>
  JSON.stringify(value, (_key, child) =>
    child && typeof child === 'object' && !Array.isArray(child)
      ? Object.fromEntries(Object.entries(child).sort(([a], [b]) => a.localeCompare(b)))
      : child,
  )
export const rowKeys = ['fields', 'measures', 'mappings', 'entries'] as const
const object = (v: Json | undefined): Record<string, Json> =>
  v && typeof v === 'object' && !Array.isArray(v) ? v : {}
export function mergeAuditFixtures(documents: Json[]) {
  const merged: Record<string, Json> = {}
  for (const document of documents)
    for (const [key, value] of Object.entries(object(document))) {
      const previous = merged[key]
      merged[key] = Array.isArray(value)
        ? [...(Array.isArray(previous) ? previous : []), ...value]
        : value
    }
  for (const key of rowKeys) {
    const rows = merged[key]
    if (!Array.isArray(rows)) continue
    const unique = new Map<string, Json>()
    for (const value of rows) {
      const row = { ...object(value), ...object(object(value).metadata) }
      const identity =
        key === 'fields'
          ? stable([
              row.sourceField ?? null,
              row.fieldName ?? null,
              row.measureCode ?? null,
              row.unitCode ?? null,
              row.aggregation ?? null,
              row.dimensions ?? null,
            ])
          : stable(value)
      const previous = unique.get(identity)
      if (previous && typeof previous === 'object') {
        representations.set(previous, [
          ...(representations.get(previous) ?? [previous]),
          value,
        ])
      } else {
        const copy = value && typeof value === 'object' ? structuredClone(value) : value
        unique.set(identity, copy)
        if (copy && typeof copy === 'object') representations.set(copy, [value])
      }
    }
    merged[key] = [...unique.values()]
  }
  return merged
}
export function fixtureRowSearchText(value: Json) {
  const row = object(value)
  return auditSearchText(
    value && typeof value === 'object' ? (representations.get(value) ?? value) : value,
    row.divisionCode ?? auditDivisionCode(String(row.canonicalId)),
  )
}
export function matchesFixtureRow(query: string, value: Json) {
  return !query.trim() || matchesAuditText(query, fixtureRowSearchText(value))
}
export function filterAuditFixture(value: Json, query: string): Json {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value
  const result = { ...object(value) }
  for (const key of rowKeys) {
    const rows = result[key]
    if (Array.isArray(rows))
      result[key] = rows.filter(row => matchesFixtureRow(query, row))
  }
  return result
}
export function fixtureHasContents(value: Json, query: string) {
  const row = object(value)
  return rowKeys.some(key => Array.isArray(row[key]))
    ? auditFixtureRows(filterAuditFixture(value, query)).length > 0
    : matchesAudit(query, value)
}

/** Release-scoped loader: one request per fixture, shared by counters and tables. */
export async function loadAuditFixtures(
  bulk: Array<{ id: string; fixtures: Array<{ type: string }> }>,
  read: (bulkId: string, index: number) => PromiseLike<Json>,
  active = () => true,
) {
  const jobs = bulk.flatMap(item =>
    item.fixtures.map((fixture, index) => ({
      bulkId: item.id,
      type: fixture.type,
      index,
    })),
  )
  const documents = new Map<string, Map<string, Json[]>>()
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(4, jobs.length) }, async () => {
      while (active()) {
        const job = jobs[next++]
        if (!job) return
        const value = await read(job.bulkId, job.index)
        const groups = documents.get(job.bulkId) ?? new Map<string, Json[]>()
        const rows = groups.get(job.type) ?? []
        rows[job.index] = value
        groups.set(job.type, rows)
        documents.set(job.bulkId, groups)
      }
    }),
  )
  return Object.fromEntries(
    [...documents].map(([id, groups]) => [
      id,
      Object.fromEntries(
        [...groups].map(([type, rows]) => [
          type,
          mergeAuditFixtures(rows.filter(value => value !== undefined)),
        ]),
      ),
    ]),
  )
}
export function auditFixtureRows(value: Json | undefined): Json[] {
  const obj = object(value)
  return rowKeys.flatMap(key => (Array.isArray(obj[key]) ? obj[key] : []))
}
