import { index, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'

import { canonicalDivisionGeometry, timestamps } from '../shared'

export const divisionAreas = sqliteTable(
  'divisionAreas',
  {
    scopeId: text('scopeId').notNull(),
    ...canonicalDivisionGeometry,
    divisionId: text('divisionId').notNull(),
    ...timestamps,
  },
  table => [
    primaryKey({ columns: [table.scopeId, table.id] }),
    index('divisionAreas_divisionId_idx').on(table.scopeId, table.divisionId),
    index('divisionAreas_type_idx').on(table.scopeId, table.type),
  ],
)

export const divisionBoundaries = sqliteTable(
  'divisionBoundaries',
  {
    scopeId: text('scopeId').notNull(),
    ...canonicalDivisionGeometry,
    leftDivisionId: text('leftDivisionId').notNull(),
    rightDivisionId: text('rightDivisionId').notNull(),
    ...timestamps,
  },
  table => [
    primaryKey({ columns: [table.scopeId, table.id] }),
    index('divisionBoundaries_leftDivisionId_idx').on(
      table.scopeId,
      table.leftDivisionId,
    ),
    index('divisionBoundaries_rightDivisionId_idx').on(
      table.scopeId,
      table.rightDivisionId,
    ),
    index('divisionBoundaries_type_idx').on(table.scopeId, table.type),
  ],
)
