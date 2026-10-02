import { primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'

import { binaryText, geoBbox, jsonText, timestamps } from '../shared'
import {
  sourceSpatialAssertionColumns,
  sourceVersionIndexes,
  sourceRecordColumns,
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
    ...sourceSpatialAssertionColumns(),
    sourceGeometry: binaryText('sourceGeometry').notNull(),
    // Source cohort identity resolves version-linked geometry derivatives.
    censusYear: text('censusYear').notNull(),
    ...timestamps,
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
    sourceLocator: jsonText<Record<string, unknown>>('sourceLocator'),
    ...timestamps,
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
    ...sourceSpatialAssertionColumns(),
    sourceLocator: jsonText<Record<string, unknown>>('sourceLocator'),
    ...timestamps,
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
    ...sourceRecordColumns(),
    inputVersionHash: text('inputVersionHash').notNull(),
    transform: text('transform').notNull(),
    derivation: jsonText('derivation').notNull(),
    ...geoBbox,
    ...timestamps,
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
  ],
)
