import { index, primaryKey, sqliteTable } from 'drizzle-orm/sqlite-core'

import { canonicalPlace, canonicalPlaceI18n } from '../shared'
import { historyI18nVersioning, historyVersioning } from './shared'

export const places = sqliteTable(
  'places',
  {
    ...canonicalPlace,
    ...historyVersioning,
  },
  table => [
    primaryKey({
      columns: [table.id, table.versionHash],
    }),
    index('places_current_lookup_idx').on(table.id, table.isCurrent),
    index('places_snapshot_validity_idx').on(
      table.validFromSnapshotId,
      table.validToSnapshotId,
    ),
    index('places_validity_idx').on(table.validFromCohortKey, table.validToCohortKey),
    index('places_sourceReleaseId_idx').on(table.sourceReleaseId),
    index('places_snapshotId_idx').on(table.snapshotId),
  ],
)

export const placesI18n = sqliteTable(
  'placesI18n',
  {
    ...canonicalPlaceI18n,
    ...historyI18nVersioning,
  },
  table => [
    primaryKey({
      columns: [table.placeId, table.versionHash, table.locale],
    }),
    index('placesI18n_locale_idx').on(table.locale),
    index('placesI18n_name_idx').on(table.locale, table.name),
    index('placesI18n_current_lookup_idx').on(
      table.placeId,
      table.locale,
      table.isCurrent,
    ),
  ],
)
