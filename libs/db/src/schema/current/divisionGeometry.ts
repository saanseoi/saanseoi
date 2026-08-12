import { index, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'

import { canonicalDivisionGeometry, timestamps } from '../shared'

export const divisionAreas = sqliteTable(
  'divisionAreas',
  {
    snapshotId: text('snapshotId').notNull(),
    ...canonicalDivisionGeometry,
    divisionId: text('divisionId').notNull(),
    ...timestamps,
  },
  table => [
    primaryKey({ columns: [table.snapshotId, table.id] }),
    index('divisionAreas_divisionId_idx').on(table.snapshotId, table.divisionId),
    index('divisionAreas_type_idx').on(table.snapshotId, table.type),
  ],
)

export const divisionBoundaries = sqliteTable(
  'divisionBoundaries',
  {
    snapshotId: text('snapshotId').notNull(),
    ...canonicalDivisionGeometry,
    leftDivisionId: text('leftDivisionId').notNull(),
    rightDivisionId: text('rightDivisionId').notNull(),
    ...timestamps,
  },
  table => [
    primaryKey({ columns: [table.snapshotId, table.id] }),
    index('divisionBoundaries_leftDivisionId_idx').on(
      table.snapshotId,
      table.leftDivisionId,
    ),
    index('divisionBoundaries_rightDivisionId_idx').on(
      table.snapshotId,
      table.rightDivisionId,
    ),
    index('divisionBoundaries_type_idx').on(table.snapshotId, table.type),
  ],
)
