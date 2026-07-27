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

/**
 * Statistics are source-release observations, not assembled division
 * snapshots. They gain a snapshot-scoped current representation only when
 * the Stats API publishes a release set.
 */
export const historyStatisticVersioning = {
  versionHash: text('versionHash').notNull(),
  sourceReleaseId: text('sourceReleaseId').notNull(),
  isCurrent: integer('isCurrent', { mode: 'boolean' }).notNull(),
  ...timestamps,
}
