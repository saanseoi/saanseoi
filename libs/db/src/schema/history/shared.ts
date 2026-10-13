import { integer, text } from 'drizzle-orm/sqlite-core'
import { defaultIsoTimestamp } from '../shared'

/** A row is a change introduced by this snapshot, inherited by its descendants. */
export const historyVersioning = {
  snapshotId: text('snapshotId').notNull(),
  operation: text('operation', { enum: ['upsert', 'delete'] })
    .notNull()
    .default('upsert'),
  versionHash: text('versionHash'),
  sourceReleaseId: text('sourceReleaseId'),
  // Operational hint only. Membership always follows snapshot ancestry.
  isCurrent: integer('isCurrent', { mode: 'boolean' }).notNull().default(true),
  createdAt: defaultIsoTimestamp('createdAt').notNull(),
}

export const historyI18nVersioning = historyVersioning
export const historyStatisticVersioning = historyVersioning
