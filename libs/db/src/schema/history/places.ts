import { primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { canonicalPlaceColumns, canonicalPlaceI18nColumns } from '../shared'
import { historyEventConstraints } from './constraints'
import { historyI18nVersioning, historyVersioning } from './shared'

export const places = sqliteTable(
  'places',
  {
    ...canonicalPlaceColumns(false),
    /** Observation month captured by this immutable content version. */
    lastSeenMonth: text('lastSeenMonth'),
    ...historyVersioning,
  },
  table => [
    ...historyEventConstraints(table, [
      'resourceReleaseId',
      'geometry',
      'firstSeenMonth',
      'lastSeenMonth',
    ]),
    primaryKey({
      columns: [table.id, table.snapshotId],
    }),
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
  ],
)
