import type { IndividualAudit } from './auditTypes'
import { MAX_OBJECT_BYTES, serialise } from './objects'

/** Column dictionaries retain repeated rule, review and context values once per page. */
export function packAuditActions(actions: IndividualAudit[]) {
  const fields = [...new Set(actions.flatMap(action => Object.keys(action)))].sort()
  const columns = fields.map(field => {
    const values: unknown[] = []
    const indices = new Map<string, number>()
    const rows = actions.map(action => {
      if (!Object.hasOwn(action, field)) return -1
      const value = (action as unknown as Record<string, unknown>)[field]
      const key = serialise(value)
      let index = indices.get(key)
      if (index === undefined) {
        index = values.length
        indices.set(key, index)
        values.push(value)
      }
      return index
    })
    return { field, values, rows }
  })
  return {
    kind: 'individual-actions',
    schemaVersion: 2,
    count: actions.length,
    columns,
  }
}

/** Expand storage columns at the read boundary; consumers receive complete actions. */
export function unpackAuditActions(value: unknown): {
  kind: 'individual-actions'
  schemaVersion: 1
  actions: IndividualAudit[]
} {
  const chunk = value as ReturnType<typeof packAuditActions>
  if (chunk?.kind !== 'individual-actions') throw new Error('Invalid individual chunk.')
  // Immutable registered evidence remains readable in its original representation.
  if (chunk.schemaVersion === 1) return value as ReturnType<typeof unpackAuditActions>
  if (
    chunk.schemaVersion !== 2 ||
    !Number.isSafeInteger(chunk.count) ||
    chunk.count < 1 ||
    chunk.count > 256 ||
    !Array.isArray(chunk.columns) ||
    chunk.columns.length > 32 ||
    Object.keys(chunk).some(
      key => !['kind', 'schemaVersion', 'count', 'columns'].includes(key),
    )
  )
    throw new Error('Invalid packed individual chunk.')
  const actions: Record<string, unknown>[] = Array.from(
    { length: chunk.count },
    () => ({}),
  )
  const fields = new Set<string>()
  for (const column of chunk.columns) {
    if (
      !column ||
      typeof column.field !== 'string' ||
      ['__proto__', 'constructor', 'prototype'].includes(column.field) ||
      fields.has(column.field) ||
      !Array.isArray(column.values) ||
      column.values.length > chunk.count ||
      !Array.isArray(column.rows) ||
      column.rows.length !== chunk.count ||
      Object.keys(column).some(key => !['field', 'values', 'rows'].includes(key))
    )
      throw new Error('Invalid audit column.')
    fields.add(column.field)
    for (const [row, index] of column.rows.entries()) {
      if (!Number.isSafeInteger(index) || index < -1 || index >= column.values.length)
        throw new Error('Invalid audit column reference.')
      if (index !== -1) actions[row]![column.field] = column.values[index]
    }
  }
  // Bound expansion as well as stored bytes, including adversarial shared values.
  let expandedBytes = 0
  for (const action of actions) {
    expandedBytes += new TextEncoder().encode(serialise(action)).byteLength
    if (expandedBytes > MAX_OBJECT_BYTES)
      throw new Error('Expanded audit chunk exceeds byte limit.')
  }
  return {
    kind: 'individual-actions',
    schemaVersion: 1,
    actions: actions as unknown as IndividualAudit[],
  }
}
