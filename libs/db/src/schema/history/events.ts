import { sql } from 'drizzle-orm'
import { sqliteView, text } from 'drizzle-orm/sqlite-core'
import { historyEventsSql } from '../../historyEvents'

/** Query projection only: each change is stored in its canonical HISTORY table. */
export const historyEvents = sqliteView('historyEvents', {
  snapshotId: text('snapshotId').notNull(),
  producerDatasetCode: text('producerDatasetCode'),
  recordType: text('recordType').notNull(),
  recordId: text('recordId').notNull(),
  locale: text('locale').notNull(),
  versionHash: text('versionHash'),
  operation: text('operation', { enum: ['upsert', 'delete'] }).notNull(),
  createdAt: text('createdAt').notNull(),
}).as(sql.raw(historyEventsSql))
