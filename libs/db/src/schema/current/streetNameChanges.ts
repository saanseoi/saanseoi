import {
  foreignKey,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
} from 'drizzle-orm/sqlite-core'

import {
  jsonText,
  streetChangelogKinds,
  streetNameChangeStatuses,
  streetNameChangeStreetRoles,
  timestamps,
  type StreetEvidenceAsset,
} from '../shared'
import { streets } from './streets'

/**
 * A directed legal street-name change. It may connect multiple old and new
 * logical streets, so a split or merge does not need to overload `streets`.
 * Publisher evidence remains on the referenced LandsD source event.
 */
export const streetNameChanges = sqliteTable(
  'streetNameChanges',
  {
    snapshotId: text('snapshotId').notNull(),
    id: text('id').notNull(),
    noticeRef: text('noticeRef').notNull(),
    intentionNotificationDate: text('intentionNotificationDate'),
    nameChangeDate: text('nameChangeDate'),
    isPartialNameChange: integer('isPartialNameChange', {
      mode: 'boolean',
    }).notNull(),
    status: text('status', { enum: streetNameChangeStatuses }).notNull(),
    ...timestamps,
  },
  table => [
    primaryKey({ columns: [table.snapshotId, table.id] }),
    index('streetNameChanges_noticeRef_idx').on(table.noticeRef),
    index('streetNameChanges_status_idx').on(table.status),
  ],
)

export const streetNameChangeStreets = sqliteTable(
  'streetNameChangeStreets',
  {
    snapshotId: text('snapshotId').notNull(),
    nameChangeId: text('nameChangeId').notNull(),
    streetId: text('streetId').notNull(),
    role: text('role', { enum: streetNameChangeStreetRoles }).notNull(),
  },
  table => [
    primaryKey({
      columns: [table.snapshotId, table.nameChangeId, table.streetId, table.role],
    }),
    foreignKey({
      columns: [table.snapshotId, table.nameChangeId],
      foreignColumns: [streetNameChanges.snapshotId, streetNameChanges.id],
      name: 'streetNameChangeStreets_change_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.snapshotId, table.streetId],
      foreignColumns: [streets.snapshotId, streets.id],
      name: 'streetNameChangeStreets_street_fk',
    }).onDelete('cascade'),
    index('streetNameChangeStreets_streetId_idx').on(table.snapshotId, table.streetId),
  ],
)

/**
 * Materialised publisher-event replay for one street snapshot. This is
 * deliberately a provenance relation rather than a foreign-key relation:
 * the event is stored in a source shard which may be different from the
 * current database and the street may be absent after deletion.
 */
export const streetChangelog = sqliteTable(
  'streetChangelog',
  {
    snapshotId: text('snapshotId').notNull(),
    recordKey: text('recordKey').notNull(),
    streetId: text('streetId').notNull(),
    /** SaanSeoi replay outcome, derived from the publisher notice kind. */
    kind: text('kind', { enum: streetChangelogKinds }).notNull(),
    isPartialNameChange: integer('isPartialNameChange', { mode: 'boolean' }).notNull(),
    gazetteDate: text('gazetteDate'),
    effectiveDate: text('effectiveDate'),
    sourceShardId: text('sourceShardId'),
    sourceReleaseId: text('sourceReleaseId'),
    noticeRef: text('noticeRef'),
    evidenceAssets: jsonText<StreetEvidenceAsset[]>('evidenceAssets'),
    ...timestamps,
  },
  table => [
    primaryKey({ columns: [table.snapshotId, table.recordKey, table.streetId] }),
    index('streetChangelog_street_idx').on(table.snapshotId, table.streetId),
    index('streetChangelog_recordKey_idx').on(table.recordKey),
  ],
)
