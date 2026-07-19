import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'

import { geoBbox, jsonText, sourceProvenance } from '../shared'
import { sourceVersionIndexes, sourceVersioning } from './shared'

/**
 * C&SD District Council district assertions. `sourceGeometry` is retained in
 * the publisher's CRS; the inherited `geometry` column is its EPSG:4326
 * canonical projection. The display derivative simplifies that canonical
 * geometry while retaining this source assertion for audit.
 */
export const sourceHkgovCenstatdDivisionAreas = sqliteTable(
  'hkgovCenstatdDivisionAreas',
  {
    sourceRecordId: text('sourceRecordId').notNull(),
    districtClass: text('districtClass').notNull(),
    districtCode: integer('districtCode').notNull(),
    censusYear: text('censusYear').notNull(),
    sourceCrs: text('sourceCrs').notNull(),
    sourceGeometry: jsonText('sourceGeometry').notNull(),
    derivation: jsonText('derivation'),
    ...geoBbox,
    ...sourceProvenance,
    ...sourceVersioning,
  },
  table => [
    primaryKey({ columns: [table.sourceRecordId, table.versionHash] }),
    ...sourceVersionIndexes(table, 'hkgovCenstatdDivisionAreas'),
    index('hkgovCenstatdDivisionAreas_districtClass_idx').on(table.districtClass),
    index('hkgovCenstatdDivisionAreas_districtCode_idx').on(table.districtCode),
    index('hkgovCenstatdDivisionAreas_censusYear_idx').on(table.censusYear),
  ],
)

/** Localized C&SD district labels attached to source geometry assertions. */
export const sourceHkgovCenstatdDivisionAreaI18n = sqliteTable(
  'hkgovCenstatdDivisionAreaI18n',
  {
    sourceRecordId: text('sourceRecordId').notNull(),
    locale: text('locale').notNull(),
    name: text('name').notNull(),
    isLocaleInferred: integer('isLocaleInferred', { mode: 'boolean' })
      .notNull()
      .default(false),
    ...sourceVersioning,
  },
  table => [
    primaryKey({
      columns: [table.sourceRecordId, table.versionHash, table.locale],
    }),
    ...sourceVersionIndexes(table, 'hkgovCenstatdDivisionAreaI18n'),
    index('hkgovCenstatdDivisionAreaI18n_locale_idx').on(table.locale),
  ],
)
