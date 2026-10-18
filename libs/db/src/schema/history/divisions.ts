import { index, primaryKey, sqliteTable } from 'drizzle-orm/sqlite-core'
import { canonicalDivisionColumns, canonicalDivisionI18nColumns } from '../shared'
import { historyEventConstraints } from './constraints'
import { historyI18nVersioning, historyVersioning } from './shared'

export const divisions = sqliteTable(
  'divisions',
  {
    ...canonicalDivisionColumns(false),
    ...historyVersioning,
  },
  table => [
    ...historyEventConstraints(table, ['class', 'hierarchies']),
    primaryKey({
      columns: [table.id, table.snapshotId],
    }),
    index('divisions_divisionCode_idx').on(table.snapshotId, table.divisionCode),
  ],
)

export const divisionsI18n = sqliteTable(
  'divisionsI18n',
  {
    ...canonicalDivisionI18nColumns(false),
    ...historyI18nVersioning,
  },
  table => [
    ...historyEventConstraints(table, []),
    primaryKey({
      columns: [table.divisionId, table.snapshotId, table.locale],
    }),
  ],
)
