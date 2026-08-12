import { index, primaryKey, sqliteTable } from 'drizzle-orm/sqlite-core'

import { canonicalDivision, canonicalDivisionI18n } from '../shared'
import { historyI18nVersioning, historyVersioning } from './shared'

export const divisions = sqliteTable(
  'divisions',
  {
    ...canonicalDivision,
    ...historyVersioning,
  },
  table => [
    primaryKey({
      columns: [table.id, table.versionHash],
    }),
    index('divisions_current_lookup_idx').on(table.id, table.isCurrent),
    index('divisions_sourceReleaseId_idx').on(table.sourceReleaseId),
    index('divisions_snapshotId_idx').on(table.snapshotId),
  ],
)

export const divisionsI18n = sqliteTable(
  'divisionsI18n',
  {
    ...canonicalDivisionI18n,
    ...historyI18nVersioning,
  },
  table => [
    primaryKey({
      columns: [table.divisionId, table.versionHash, table.locale],
    }),
    index('divisionsI18n_locale_idx').on(table.locale),
    index('divisionsI18n_name_idx').on(table.locale, table.name),
    index('divisionsI18n_current_lookup_idx').on(
      table.divisionId,
      table.locale,
      table.isCurrent,
    ),
  ],
)
