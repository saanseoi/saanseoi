import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'

import { timestamps } from '../shared'

/** Reviewed Division codes scoped by domain and level. */
export const metaDivisionCodes = sqliteTable(
  'divisionCodes',
  {
    domainCode: text('domainCode').notNull(),
    level: integer('level').notNull(),
    divisionCode: text('divisionCode').notNull(),
    canonicalId: text('canonicalId').notNull(),
    versionHash: text('versionHash').notNull(),
    ...timestamps,
  },
  table => [
    primaryKey({ columns: [table.domainCode, table.level, table.divisionCode] }),
    index('divisionCodes_canonical_idx').on(
      table.domainCode,
      table.level,
      table.canonicalId,
    ),
  ],
)
