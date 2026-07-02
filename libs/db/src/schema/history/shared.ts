import { integer, text } from 'drizzle-orm/sqlite-core'
import { timestamps } from '../shared'

const commonVersioning = {
  versionHash: text('versionHash').notNull(),
  sourceReleaseId: text('sourceReleaseId').notNull(),
  snapshotId: text('snapshotId').notNull(),
  isCurrent: integer('isCurrent', { mode: 'boolean' }).notNull(),
  validFromSnapshotId: text('validFromSnapshotId').notNull(),
  validToSnapshotId: text('validToSnapshotId'),
}

export const historyI18nVersioning = {
  ...commonVersioning,
  ...timestamps,
}

export const historyVersioning = {
  ...historyI18nVersioning,
  validFromCohortKey: text('validFromCohortKey').notNull(),
  validToCohortKey: text('validToCohortKey'),
  ...timestamps,
}
