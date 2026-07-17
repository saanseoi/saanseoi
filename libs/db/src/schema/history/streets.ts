import { index, primaryKey, sqliteTable } from 'drizzle-orm/sqlite-core'

import { canonicalStreet, canonicalStreetI18n } from '../shared'
import { historyI18nVersioning, historyVersioning } from './shared'

export const streets = sqliteTable(
  'streets',
  {
    ...canonicalStreet,
    ...historyVersioning,
  },
  table => [
    primaryKey({
      columns: [table.id, table.versionHash],
    }),
    index('streets_current_lookup_idx').on(table.id, table.isCurrent),
    index('streets_sourceReleaseId_idx').on(table.sourceReleaseId),
    index('streets_snapshotId_idx').on(table.snapshotId),
  ],
)

export const streetsI18n = sqliteTable(
  'streetsI18n',
  {
    ...canonicalStreetI18n,
    ...historyI18nVersioning,
  },
  table => [
    primaryKey({
      columns: [table.streetId, table.versionHash, table.locale],
    }),
    index('streetsI18n_locale_idx').on(table.locale),
    index('streetsI18n_name_idx').on(table.locale, table.name),
    index('streetsI18n_current_lookup_idx').on(
      table.streetId,
      table.locale,
      table.isCurrent,
    ),
  ],
)
