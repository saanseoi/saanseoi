import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
} from 'drizzle-orm/sqlite-core'

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
    sourceGeometry: jsonText('sourceGeometry').notNull(),
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

/**
 * District-level land area, mid-year population, and population-density
 * assertions supplied by C&SD. Geometry remains publisher evidence: these
 * statistics are not a replacement district-boundary release.
 */
export const sourceHkgovCenstatdDistrictLandAreaPopulationDensities = sqliteTable(
  'hkgovCenstatdDistrictLandAreaPopulationDensities',
  {
    sourceRecordId: text('sourceRecordId').notNull(),
    districtCode: integer('districtCode').notNull(),
    referenceYear: text('referenceYear').notNull(),
    landAreaSqKm: real('landAreaSqKm').notNull(),
    midYearPopulationThousands: real('midYearPopulationThousands').notNull(),
    midYearPopulationDensityPerSqKm: integer(
      'midYearPopulationDensityPerSqKm',
    ).notNull(),
    sourceGeometry: jsonText('sourceGeometry').notNull(),
    ...sourceProvenance,
    ...sourceVersioning,
  },
  table => [
    primaryKey({ columns: [table.sourceRecordId, table.versionHash] }),
    ...sourceVersionIndexes(table, 'hkgovCenstatdDistrictLandAreaPopulationDensities'),
    index('hkgovCenstatdDistrictLandAreaPopulationDensities_districtCode_idx').on(
      table.districtCode,
    ),
    index('hkgovCenstatdDistrictLandAreaPopulationDensities_referenceYear_idx').on(
      table.referenceYear,
    ),
  ],
)

/** Localised publisher labels attached to C&SD district statistic assertions. */
export const sourceHkgovCenstatdDistrictLandAreaPopulationDensityI18n = sqliteTable(
  'hkgovCenstatdDistrictLandAreaPopulationDensityI18n',
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
    ...sourceVersionIndexes(
      table,
      'hkgovCenstatdDistrictLandAreaPopulationDensityI18n',
    ),
    index('hkgovCenstatdDistrictLandAreaPopulationDensityI18n_locale_idx').on(
      table.locale,
    ),
  ],
)

/**
 * Materialised geometry transforms of a C&SD district source assertion.
 *
 * A transform is deliberately not a second source record: `sourceRecordId`
 * and `inputVersionHash` identify the exact C&SD assertion it was derived
 * from. Its own `versionHash` versions the materialised transform output.
 */
export const sourceHkgovCenstatdDivisionAreaDerivatives = sqliteTable(
  'hkgovCenstatdDivisionAreaDerivatives',
  {
    sourceRecordId: text('sourceRecordId').notNull(),
    inputVersionHash: text('inputVersionHash').notNull(),
    transform: text('transform').notNull(),
    derivation: jsonText('derivation').notNull(),
    ...geoBbox,
    ...sourceVersioning,
  },
  table => [
    primaryKey({
      columns: [
        table.sourceRecordId,
        table.inputVersionHash,
        table.transform,
        table.versionHash,
      ],
    }),
    ...sourceVersionIndexes(table, 'hkgovCenstatdDivisionAreaDerivatives'),
    index('hkgovCenstatdDivisionAreaDerivatives_input_idx').on(
      table.sourceRecordId,
      table.inputVersionHash,
      table.transform,
    ),
  ],
)

/** Localised C&SD district labels attached to source geometry assertions. */
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
