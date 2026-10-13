import { index, primaryKey, sqliteTable } from 'drizzle-orm/sqlite-core'
import { canonicalPlaceColumns, canonicalPlaceI18nColumns } from '../shared'
import { historyEventConstraints } from './constraints'
import { historyI18nVersioning, historyVersioning } from './shared'

export const places = sqliteTable(
  'places',
  {
    ...canonicalPlaceColumns(false),
    ...historyVersioning,
  },
  table => [
    ...historyEventConstraints(table, [
      'resourceReleaseId',
      'lng',
      'lat',
      'firstSeenMonth',
      'lastSeenMonth',
    ]),
    primaryKey({
      columns: [table.id, table.snapshotId],
    }),
    index('places_current_lookup_idx').on(table.id, table.isCurrent),
    index('places_sourceReleaseId_idx').on(table.sourceReleaseId),
    index('places_snapshotId_idx').on(table.snapshotId),
  ],
)

export const placesI18n = sqliteTable(
  'placesI18n',
  {
    ...canonicalPlaceI18nColumns(false),
    ...historyI18nVersioning,
  },
  table => [
    ...historyEventConstraints(table, []),
    primaryKey({
      columns: [table.placeId, table.snapshotId, table.locale],
    }),
    index('placesI18n_current_lookup_idx').on(
      table.placeId,
      table.locale,
      table.isCurrent,
    ),
  ],
)
