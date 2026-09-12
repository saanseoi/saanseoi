import { index, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'

import { binaryText, geoBbox, jsonText } from '../shared'
import {
  sourceAssertionColumns,
  sourceSpatialAssertionColumns,
  sourceVersionIndexes,
  sourceVersionedRecordColumns,
} from './shared'

/**
 * C&SD District Council source records. `sourceGeometry` remains as
 * a Brotli-compressed publisher-CRS BLOB. Current and history retain the
 * exact canonical geometry as a Brotli BLOB too, alongside the map-ready
 * EPSG:4326 display derivative.
 */
export const sourceHkgovCenstatdDivisionAreas = sqliteTable(
  'hkgovCenstatdDivisionAreas',
  {
    ...sourceAssertionColumns(),
    sourceGeometry: binaryText('sourceGeometry').notNull(),
    // Source cohort identity resolves version-linked geometry derivatives.
    censusYear: text('censusYear').notNull(),
  },
  table => [
    primaryKey({ columns: [table.sourceRecordId, table.versionHash] }),
    ...sourceVersionIndexes(table, 'hkgovCenstatdDivisionAreas'),
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
  },
  table => [
    primaryKey({ columns: [table.sourceRecordId, table.versionHash] }),
    ...sourceVersionIndexes(table, 'hkgovCenstatdDistrictLandAreaPopulationDensities'),
  ],
)

/**
 * Native CSDI feature records for C&SD's non-district-density statistical
 * releases. Their measures differ by publisher layer, so they remain a
 * complete, queryable publisher property set rather than losing fields to a
 * premature shared measure schema.
 */
export const sourceHkgovCenstatdStatistics = sqliteTable(
  'hkgovCenstatdStatistics',
  {
    ...sourceAssertionColumns(),
    sourceGeometry: jsonText('sourceGeometry'),
  },
  table => [
    primaryKey({ columns: [table.sourceRecordId, table.versionHash] }),
    ...sourceVersionIndexes(table, 'hkgovCenstatdStatistics'),
  ],
)

/**
 * Materialised geometry transforms of a C&SD district source record.
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
