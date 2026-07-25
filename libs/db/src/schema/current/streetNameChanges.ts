import {
  foreignKey,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
} from 'drizzle-orm/sqlite-core'

import { jsonText, timestamps } from '../shared'
import { streets } from './streets'

export const streetNameChangeStatuses = ['intended', 'effective', 'withdrawn'] as const
export const streetNameChangeStreetRoles = ['old', 'new'] as const

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
    sourceEventId: text('sourceEventId').notNull(),
    intentionNotificationDate: text('intentionNotificationDate'),
    nameChangeDate: text('nameChangeDate'),
    isPartialNameChange: integer('isPartialNameChange', {
      mode: 'boolean',
    }).notNull(),
    status: text('status', { enum: streetNameChangeStatuses }).notNull(),
    references: jsonText('references'),
    ...timestamps,
  },
  table => [
    primaryKey({ columns: [table.snapshotId, table.id] }),
    index('streetNameChanges_sourceEventId_idx').on(table.sourceEventId),
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
