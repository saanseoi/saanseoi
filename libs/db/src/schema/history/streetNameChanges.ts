import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import {
  jsonText,
  type StreetEvidenceAsset,
  streetChangelogKinds,
  streetNameChangeStatuses,
  streetNameChangeStreetRoles,
} from '../shared'
import { historyEventConstraints } from './constraints'
import { historyVersioning } from './shared'

/** Immutable versions of the current snapshot's directed name-change relation. */
export const streetNameChanges = sqliteTable(
  'streetNameChanges',
  {
    id: text('id').notNull(),
    noticeRef: text('noticeRef'),
    intentionNotificationDate: text('intentionNotificationDate'),
    nameChangeDate: text('nameChangeDate'),
    isPartialNameChange: integer('isPartialNameChange', {
      mode: 'boolean',
    }),
    status: text('status', { enum: streetNameChangeStatuses }),
    ...historyVersioning,
  },
  table => [
    ...historyEventConstraints(table, ['noticeRef', 'isPartialNameChange', 'status']),
    primaryKey({ columns: [table.id, table.snapshotId] }),
    index('streetNameChanges_noticeRef_idx').on(table.noticeRef),
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
    ...historyEventConstraints(table, []),
    primaryKey({
      columns: [table.nameChangeId, table.snapshotId, table.streetId, table.role],
    }),
    index('streetNameChangeStreets_streetId_idx').on(table.streetId, table.isCurrent),
  ],
)

/** Immutable, cross-shard source-event projection used by street replay. */
export const streetChangelog = sqliteTable(
  'streetChangelog',
  {
    streetId: text('streetId').notNull(),
    recordKey: text('recordKey').notNull(),
    /** SaanSeoi replay outcome, derived from the publisher notice kind. */
    kind: text('kind', { enum: streetChangelogKinds }),
    isPartialNameChange: integer('isPartialNameChange', { mode: 'boolean' }),
    gazetteDate: text('gazetteDate'),
    effectiveDate: text('effectiveDate'),
    sourceShardId: text('sourceShardId'),
    noticeRef: text('noticeRef'),
    evidenceAssets: jsonText<StreetEvidenceAsset[]>('evidenceAssets'),
    ...historyVersioning,
  },
  table => [
    ...historyEventConstraints(table, ['kind', 'isPartialNameChange']),
    primaryKey({ columns: [table.streetId, table.recordKey, table.snapshotId] }),
    index('streetChangelog_street_current_idx').on(table.streetId, table.isCurrent),
    index('streetChangelog_recordKey_idx').on(table.recordKey),
  ],
)
