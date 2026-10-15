import {
  getTableColumns,
  getTableName,
  historyEventDefinition,
  historySchema,
} from '@repo/db'
import type { SQLiteTable } from 'drizzle-orm/sqlite-core'
import type { HarbourWritableDb } from '../../lib/db/types'
import { chunkArray, getMaxRowsPerInsert } from '../utils'

/** Append branch-local deletion events; ancestors remain immutable. */
export async function recordHistoryDeletions(
  db: HarbourWritableDb,
  args: {
    snapshotId: string
    recordType: string
    operation: 'delete'
    changes: Array<{ recordId: string; locale?: string }>
  },
) {
  if (!args.changes.length) return
  const definition = historyEventDefinition(args.recordType)
  const table = Object.values(historySchema).find(
    value => getTableName(value as SQLiteTable) === definition.table,
  ) as SQLiteTable | undefined
  if (!table) throw new Error(`Missing HISTORY table ${definition.table}`)
  const columns = getTableColumns(table)
  const primary = [
    ...definition.keys,
    ...(definition.locale ? [definition.locale] : []),
    'snapshotId',
  ]
  const now = new Date().toISOString()
  for (const batch of chunkArray(
    args.changes,
    getMaxRowsPerInsert(Object.keys(columns).length),
  )) {
    await db
      .insert(table)
      .values(
        batch.map(change => {
          const values =
            definition.keys.length === 1
              ? [change.recordId]
              : JSON.parse(change.recordId)
          if (!Array.isArray(values) || values.length !== definition.keys.length)
            throw new Error(`Invalid ${args.recordType} identity`)
          return {
            ...Object.fromEntries(
              definition.keys.map((key, index) => [key, values[index]]),
            ),
            ...(definition.locale ? { [definition.locale]: change.locale ?? '' } : {}),
            snapshotId: args.snapshotId,
            operation: 'delete',
            versionHash: null,
            isCurrent: false,
            createdAt: now,
          }
        }),
      )
      .onConflictDoNothing({ target: primary.map(key => columns[key]) })
      .run()
  }
}
