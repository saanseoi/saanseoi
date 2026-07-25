import { index, primaryKey, sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'

import { jsonText } from '../shared'
import { historyVersioning } from './shared'

export const streetNameChangeStatuses = ['intended', 'effective', 'withdrawn'] as const
export const streetNameChangeStreetRoles = ['old', 'new'] as const

/** Immutable versions of the current snapshot's directed name-change relation. */
export const streetNameChanges = sqliteTable(
  'streetNameChanges',
  {
    id: text('id').notNull(),
    sourceEventId: text('sourceEventId').notNull(),
    intentionNotificationDate: text('intentionNotificationDate'),
    nameChangeDate: text('nameChangeDate'),
    isPartialNameChange: integer('isPartialNameChange', {
      mode: 'boolean',
    }).notNull(),
    status: text('status', { enum: streetNameChangeStatuses }).notNull(),
    references: jsonText('references'),
    ...historyVersioning,
  },
  table => [
    primaryKey({ columns: [table.id, table.versionHash] }),
    index('streetNameChanges_current_lookup_idx').on(table.id, table.isCurrent),
    index('streetNameChanges_sourceEventId_idx').on(table.sourceEventId),
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
