import {
  foreignKey,
  index,
  primaryKey,
  sqliteTable,
  text,
} from 'drizzle-orm/sqlite-core'

import { canonicalDivision, canonicalDivisionI18n, timestamps } from '../shared'

/** Latest published snapshot per region/domain/lineage search scope. */
export const divisionSearchScopes = sqliteTable('divisionSearchScopes', {
  scopeId: text('scopeId').primaryKey(),
  snapshotId: text('snapshotId').notNull(),
})

export const divisions = sqliteTable(
  'divisions',
  {
    scopeId: text('scopeId').notNull(),
    ...canonicalDivision,
    ...timestamps,
  },
  table => [
    primaryKey({
      columns: [table.scopeId, table.id],
    }),
    index('divisions_divisionCode_idx').on(table.scopeId, table.divisionCode),
    index('divisions_scope_order_idx').on(
      table.scopeId,
      table.level,
      table.class,
      table.id,
    ),
  ],
)

export const divisionsI18n = sqliteTable(
  'divisionsI18n',
  {
    scopeId: text('scopeId').notNull(),
    ...canonicalDivisionI18n,
    ...timestamps,
  },
  table => [
    primaryKey({
      columns: [table.scopeId, table.divisionId, table.locale],
    }),
    foreignKey({
      columns: [table.scopeId, table.divisionId],
      foreignColumns: [divisions.scopeId, divisions.id],
      name: 'divisionsI18n_scopeId_divisionId_divisions_fk',
    }).onDelete('cascade'),
    index('divisionsI18n_name_idx').on(table.scopeId, table.locale, table.name),
  ],
)
