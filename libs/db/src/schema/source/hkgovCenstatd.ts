import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
} from 'drizzle-orm/sqlite-core'

import { geoBbox, jsonText } from '../shared'
import {
  sourceAssertionColumns,
  sourceSpatialAssertionColumns,
  sourceVersionIndexes,
  sourceVersionedRecordColumns,
} from './shared'

/**
 * C&SD District Council district assertions. `sourceGeometry` is retained in
 * the publisher's CRS. Canonical EPSG:4326 geometry belongs to history and
 * current; the display derivative retains its named transform for audit.
 */
export const sourceHkgovCenstatdDivisionAreas = sqliteTable(
  'hkgovCenstatdDivisionAreas',
  {
    ...sourceSpatialAssertionColumns(),
    districtClass: text('districtClass').notNull(),
    districtCode: integer('districtCode').notNull(),
    censusYear: text('censusYear').notNull(),
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
    ...sourceSpatialAssertionColumns(),
    // C&SD's numeric `DC` value; canonical district resolution occurs in history.
    districtCode: integer('districtCode').notNull(),
    referenceYear: text('referenceYear').notNull(),
    landAreaSqKm: real('landAreaSqKm').notNull(),
    midYearPopulation: integer('midYearPopulation').notNull(),
    midYearPopulationDensityPerSqKm: integer(
      'midYearPopulationDensityPerSqKm',
    ).notNull(),
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
    ...sourceVersionedRecordColumns(),
    locale: text('locale').notNull(),
    name: text('name').notNull(),
    isLocaleInferred: integer('isLocaleInferred', { mode: 'boolean' })
      .notNull()
      .default(false),
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
 * Native CSDI feature assertions for C&SD's non-district-density statistical
 * releases. Their measures differ by publisher layer, so they remain a
 * complete, queryable publisher property set rather than losing fields to a
 * premature shared measure schema.
 */
export const sourceHkgovCenstatdStatistics = sqliteTable(
  'hkgovCenstatdStatistics',
  {
    ...sourceAssertionColumns(),
    datasetCode: text('datasetCode').notNull(),
    layerName: text('layerName').notNull(),
    referenceYear: text('referenceYear').notNull(),
    featureId: text('featureId').notNull(),
    properties: jsonText('properties').notNull(),
    sourceFeature: jsonText('sourceFeature').notNull(),
    sourceGeometry: jsonText('sourceGeometry'),
  },
  table => [
    primaryKey({ columns: [table.sourceRecordId, table.versionHash] }),
    ...sourceVersionIndexes(table, 'hkgovCenstatdStatistics'),
    index('hkgovCenstatdStatistics_dataset_layer_idx').on(
      table.datasetCode,
      table.layerName,
    ),
    index('hkgovCenstatdStatistics_referenceYear_idx').on(table.referenceYear),
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
    ...sourceVersionedRecordColumns(),
    inputVersionHash: text('inputVersionHash').notNull(),
    transform: text('transform').notNull(),
    derivation: jsonText('derivation').notNull(),
    ...geoBbox,
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
    ...sourceVersionedRecordColumns(),
    locale: text('locale').notNull(),
    name: text('name').notNull(),
    isLocaleInferred: integer('isLocaleInferred', { mode: 'boolean' })
      .notNull()
      .default(false),
  },
  table => [
    primaryKey({
      columns: [table.sourceRecordId, table.versionHash, table.locale],
    }),
    ...sourceVersionIndexes(table, 'hkgovCenstatdDivisionAreaI18n'),
    index('hkgovCenstatdDivisionAreaI18n_locale_idx').on(table.locale),
  ],
)
