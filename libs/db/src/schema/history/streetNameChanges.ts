import { index, primaryKey, sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'

import {
  jsonText,
  streetChangelogKinds,
  streetNameChangeStatuses,
  streetNameChangeStreetRoles,
  type StreetEvidenceAsset,
} from '../shared'
import { historyVersioning } from './shared'

/** Immutable versions of the current snapshot's directed name-change relation. */
export const streetNameChanges = sqliteTable(
  'streetNameChanges',
  {
    id: text('id').notNull(),
    noticeRef: text('noticeRef').notNull(),
    intentionNotificationDate: text('intentionNotificationDate'),
    nameChangeDate: text('nameChangeDate'),
    isPartialNameChange: integer('isPartialNameChange', {
      mode: 'boolean',
    }).notNull(),
    status: text('status', { enum: streetNameChangeStatuses }).notNull(),
    ...historyVersioning,
  },
  table => [
    primaryKey({ columns: [table.id, table.versionHash] }),
    index('streetNameChanges_current_lookup_idx').on(table.id, table.isCurrent),
    index('streetNameChanges_noticeRef_idx').on(table.noticeRef),
    index('streetNameChanges_snapshotId_idx').on(table.snapshotId),
  ],
)

export const streetNameChangeStreets = sqliteTable(
  'streetNameChangeStreets',
  {
    nameChangeId: text('nameChangeId').notNull(),
    streetId: text('streetId').notNull(),
    role: text('role', { enum: streetNameChangeStreetRoles }).notNull(),
    ...historyVersioning,
  },
  table => [
    primaryKey({
      columns: [table.nameChangeId, table.versionHash, table.streetId, table.role],
    }),
    index('streetNameChangeStreets_streetId_idx').on(table.streetId, table.isCurrent),
    index('streetNameChangeStreets_snapshotId_idx').on(table.snapshotId),
  ],
)

/** Immutable, cross-shard source-event projection used by street replay. */
export const streetChangelog = sqliteTable(
  'streetChangelog',
  {
    streetId: text('streetId').notNull(),
    recordKey: text('recordKey').notNull(),
    /** SaanSeoi replay outcome, derived from the publisher notice kind. */
    kind: text('kind', { enum: streetChangelogKinds }).notNull(),
    isPartialNameChange: integer('isPartialNameChange', { mode: 'boolean' }).notNull(),
    gazetteDate: text('gazetteDate'),
    effectiveDate: text('effectiveDate'),
    sourceShardId: text('sourceShardId'),
    noticeRef: text('noticeRef'),
    evidenceAssets: jsonText<StreetEvidenceAsset[]>('evidenceAssets'),
    ...historyVersioning,
  },
  table => [
    primaryKey({ columns: [table.streetId, table.recordKey, table.versionHash] }),
    index('streetChangelog_street_current_idx').on(table.streetId, table.isCurrent),
    index('streetChangelog_recordKey_idx').on(table.recordKey),
    index('streetChangelog_snapshot_idx').on(table.snapshotId),
  ],
)
