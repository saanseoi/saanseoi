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
    index('divisions_current_lookup_idx').on(table.id, table.isCurrent),
    index('divisions_divisionCode_idx').on(table.snapshotId, table.divisionCode),
    index('divisions_sourceReleaseId_idx').on(table.sourceReleaseId),
    index('divisions_snapshotId_idx').on(table.snapshotId),
  ],
)

export const divisionsI18n = sqliteTable(
  'divisionsI18n',
  {
    ...canonicalDivisionI18nColumns(false),
    ...historyI18nVersioning,
  },
  table => [
    ...historyEventConstraints(table, ['meta']),
    primaryKey({
      columns: [table.divisionId, table.snapshotId, table.locale],
    }),
    index('divisionsI18n_current_lookup_idx').on(
      table.divisionId,
      table.locale,
      table.isCurrent,
    ),
  ],
)
