import { primaryKey, sqliteTable } from 'drizzle-orm/sqlite-core'
import { timestamps } from '../shared'

import { streetSourceSpatialAssertionColumns, sourceVersionIndexes } from './shared'

/** Street Name Plate (`SNP`) point assertions maintained by the Highways Department. */
export const sourceHkgovHydStreetNamePlates = sqliteTable(
  'hkgovHydStreetNamePlates',
  {
    ...streetSourceSpatialAssertionColumns(),
    ...timestamps,
  },
  table => [
    primaryKey({ columns: [table.sourceRecordId, table.versionHash] }),
    ...sourceVersionIndexes(table, 'hkgovHydStreetNamePlates'),
  ],
)

/** Sensitive Street polygon assertions maintained by the Highways Department. */
export const sourceHkgovHydSensitiveStreets = sqliteTable(
  'hkgovHydSensitiveStreets',
  {
    ...streetSourceSpatialAssertionColumns(),
    ...timestamps,
  },
  table => [
    primaryKey({ columns: [table.sourceRecordId, table.versionHash] }),
    ...sourceVersionIndexes(table, 'hkgovHydSensitiveStreets'),
  ],
)

/** Strategic Street polygon assertions maintained by the Highways Department. */
export const sourceHkgovHydStrategicStreets = sqliteTable(
  'hkgovHydStrategicStreets',
  {
    ...streetSourceSpatialAssertionColumns(),
    ...timestamps,
  },
  table => [
    primaryKey({ columns: [table.sourceRecordId, table.versionHash] }),
    ...sourceVersionIndexes(table, 'hkgovHydStrategicStreets'),
  ],
)
