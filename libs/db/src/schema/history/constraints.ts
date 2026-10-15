import { getColumnTable, getTableName, sql } from 'drizzle-orm'
import { check, index, type SQLiteColumn } from 'drizzle-orm/sqlite-core'

/** A deleted record needs identity only; live events retain the canonical payload contract. */
export function historyEventConstraints(
  columns: Record<string, SQLiteColumn>,
  requiredPayload: string[] = [],
) {
  const name = getTableName(getColumnTable(columns.snapshotId!))
  const required = ['versionHash', ...requiredPayload].map(key => {
    if (!columns[key]) throw new Error(`Unknown required HISTORY column ${name}.${key}`)
    return sql`${columns[key]} is not null`
  })
  return [
    check(
      `${name}_history_event_check`,
      sql`(${columns.operation} = 'delete' and ${columns.versionHash} is null) or (${columns.operation} = 'upsert' and ${sql.join(required, sql` and `)})`,
    ),
    index(`${name}_history_event_snapshot_idx`).on(columns.snapshotId!),
  ]
}
