import { integer, text } from 'drizzle-orm/sqlite-core'
import { timestamps } from '../shared'

const commonVersioning = {
  versionHash: text('versionHash').notNull(),
  sourceReleaseId: text('sourceReleaseId').notNull(),
  // Mutable ingestion cache metadata. Snapshot replay is driven by
  // snapshotVersionChanges, never by these columns.
  snapshotId: text('snapshotId').notNull(),
  isCurrent: integer('isCurrent', { mode: 'boolean' }).notNull(),
}

export const historyI18nVersioning = {
  ...commonVersioning,
  ...timestamps,
}

export const historyVersioning = {
  ...historyI18nVersioning,
}
