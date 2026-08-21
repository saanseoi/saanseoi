import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
} from 'drizzle-orm/sqlite-core'

import { binaryText, geoBbox, jsonText, statisticsReferencePeriod } from '../shared'
import {
  sourceAssertionColumns,
  sourceSpatialAssertionColumns,
  sourceVersionIndexes,
  sourceVersionedRecordColumns,
} from './shared'

/**
 * C&SD District Council district assertions. `sourceGeometry` is retained as
 * a Brotli-compressed publisher-CRS BLOB. Current and history retain the
 * exact canonical geometry as a Brotli BLOB too, alongside the map-ready
 * EPSG:4326 display derivative.
 */
export const sourceHkgovCenstatdDivisionAreas = sqliteTable(
  'hkgovCenstatdDivisionAreas',
  {
    ...sourceAssertionColumns(),
    sourceGeometry: binaryText('sourceGeometry').notNull(),
    districtClass: text('districtClass').notNull(),
    districtCode: integer('districtCode').notNull(),
    districtEn: text('districtEn').notNull(),
    districtZhHant: text('districtZhHant').notNull(),
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
    districtEn: text('districtEn').notNull(),
    districtZhHant: text('districtZhHant').notNull(),
    ...statisticsReferencePeriod,
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
    index('hkgovCenstatdDistrictLandAreaPopulationDensities_referencePeriod_idx').on(
      table.referencePeriodEndYear,
      table.referencePeriodCode,
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
    ...statisticsReferencePeriod,
    featureId: text('featureId').notNull(),
    sourceGeometry: jsonText('sourceGeometry'),
  },
  table => [
    primaryKey({ columns: [table.sourceRecordId, table.versionHash] }),
    ...sourceVersionIndexes(table, 'hkgovCenstatdStatistics'),
    index('hkgovCenstatdStatistics_dataset_layer_idx').on(
      table.datasetCode,
      table.layerName,
    ),
    index('hkgovCenstatdStatistics_referencePeriod_idx').on(
      table.referencePeriodEndYear,
      table.referencePeriodCode,
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
