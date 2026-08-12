import {
  foreignKey,
  index,
  primaryKey,
  sqliteTable,
  text,
} from 'drizzle-orm/sqlite-core'

import { canonicalDivision, canonicalDivisionI18n, timestamps } from '../shared'

export const divisions = sqliteTable(
  'divisions',
  {
    snapshotId: text('snapshotId').notNull(),
    ...canonicalDivision,
    ...timestamps,
  },
  table => [
    primaryKey({
      columns: [table.snapshotId, table.id],
    }),
    index('divisions_level_idx').on(table.level),
  ],
)

export const divisionsI18n = sqliteTable(
  'divisionsI18n',
  {
    snapshotId: text('snapshotId').notNull(),
    ...canonicalDivisionI18n,
    ...timestamps,
  },
  table => [
    primaryKey({
      columns: [table.snapshotId, table.divisionId, table.locale],
    }),
    foreignKey({
      columns: [table.snapshotId, table.divisionId],
      foreignColumns: [divisions.snapshotId, divisions.id],
      name: 'divisionsI18n_snapshotId_divisionId_divisions_fk',
    }).onDelete('cascade'),
    index('divisionsI18n_locale_idx').on(table.snapshotId, table.locale),
    index('divisionsI18n_name_idx').on(table.snapshotId, table.locale, table.name),
  ],
)
