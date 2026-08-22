import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'

import { timestamps } from '../shared'

/** Reviewed source Division codes scoped by domain. */
export const metaDivisionCodes = sqliteTable(
  'divisionCodes',
  {
    domainCode: text('domainCode').notNull(),
    divisionCode: text('divisionCode').notNull(),
    canonicalId: text('canonicalId').notNull(),
    versionHash: text('versionHash').notNull(),
    ...timestamps,
  },
  table => [
    primaryKey({ columns: [table.domainCode, table.divisionCode] }),
    index('divisionCodes_canonical_idx').on(table.domainCode, table.canonicalId),
  ],
)
