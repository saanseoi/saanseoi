import { sql } from 'drizzle-orm'
import { sqliteView, text } from 'drizzle-orm/sqlite-core'
import { historyEventsSql } from '../../historyEvents'

/** Query projection only: each change is stored in its canonical HISTORY table. */
export const historyEvents = sqliteView('historyEvents', {
  snapshotId: text('snapshotId').notNull(),
  recordType: text('recordType').notNull(),
  recordId: text('recordId').notNull(),
  locale: text('locale').notNull(),
  versionHash: text('versionHash'),
  operation: text('operation', { enum: ['upsert', 'delete'] }).notNull(),
  sourceReleaseId: text('sourceReleaseId'),
  createdAt: text('createdAt').notNull(),
  updatedAt: text('updatedAt').notNull(),
}).as(sql.raw(historyEventsSql))
