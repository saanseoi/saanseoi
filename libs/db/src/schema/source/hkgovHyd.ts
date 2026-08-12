import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'

import { sourceSpatialAssertionColumns, sourceVersionIndexes } from './shared'

/** Street Name Plate (`SNP`) point assertions maintained by the Highways Department. */
export const sourceHkgovHydStreetNamePlates = sqliteTable(
  'hkgovHydStreetNamePlates',
  {
    ...sourceSpatialAssertionColumns(),
    // SNP_ID
    snpId: text('snpId').notNull(),
    // LVL
    level: integer('level'),
    // ROAD_NAME
    roadName: text('roadName'),
  },
  table => [
    primaryKey({ columns: [table.sourceRecordId, table.versionHash] }),
    ...sourceVersionIndexes(table, 'hkgovHydStreetNamePlates'),
    index('hkgovHydStreetNamePlates_snpId_idx').on(table.snpId),
    index('hkgovHydStreetNamePlates_roadName_idx').on(table.roadName),
  ],
)

/** Sensitive Street polygon assertions maintained by the Highways Department. */
export const sourceHkgovHydSensitiveStreets = sqliteTable(
  'hkgovHydSensitiveStreets',
  {
    ...sourceSpatialAssertionColumns(),
    // LVL
    level: integer('level'),
    // SECT_BTWN
    sectionBetween: text('sectionBetween'),
    // ST_ENGNM
    streetName: text('streetName'),
  },
  table => [
    primaryKey({ columns: [table.sourceRecordId, table.versionHash] }),
    ...sourceVersionIndexes(table, 'hkgovHydSensitiveStreets'),
    index('hkgovHydSensitiveStreets_streetName_idx').on(table.streetName),
  ],
)

/** Strategic Street polygon assertions maintained by the Highways Department. */
export const sourceHkgovHydStrategicStreets = sqliteTable(
  'hkgovHydStrategicStreets',
  {
    ...sourceSpatialAssertionColumns(),
    // LVL
    level: integer('level'),
    // SECT_BTWN
    sectionBetween: text('sectionBetween'),
    // ST_ENGNM
    streetName: text('streetName'),
  },
  table => [
    primaryKey({ columns: [table.sourceRecordId, table.versionHash] }),
    ...sourceVersionIndexes(table, 'hkgovHydStrategicStreets'),
    index('hkgovHydStrategicStreets_streetName_idx').on(table.streetName),
  ],
)
