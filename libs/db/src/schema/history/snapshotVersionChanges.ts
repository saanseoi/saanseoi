import { index, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'

import { timestamps } from '../shared'

export const snapshotVersionChangeOperations = ['upsert', 'delete'] as const

export const snapshotVersionChanges = sqliteTable(
  'snapshotVersionChanges',
  {
    snapshotId: text('snapshotId').notNull(),
    recordType: text('recordType').notNull(),
    recordId: text('recordId').notNull(),
    locale: text('locale').notNull().default(''),
    versionHash: text('versionHash'),
    operation: text('operation', {
      enum: snapshotVersionChangeOperations,
    }).notNull(),
    sourceReleaseId: text('sourceReleaseId'),
    ...timestamps,
  },
  table => [
    primaryKey({
      columns: [table.snapshotId, table.recordType, table.recordId, table.locale],
    }),
    index('snapshotVersionChanges_record_lookup_idx').on(
      table.recordType,
      table.recordId,
      table.locale,
      table.snapshotId,
    ),
    index('snapshotVersionChanges_snapshot_idx').on(table.snapshotId),
  ],
)

export type SnapshotVersionChange = typeof snapshotVersionChanges.$inferSelect
export type NewSnapshotVersionChange = typeof snapshotVersionChanges.$inferInsert
