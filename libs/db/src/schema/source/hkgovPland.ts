import { primaryKey, sqliteTable } from 'drizzle-orm/sqlite-core'
import { timestamps } from '../shared'

import { sourceSpatialAssertionColumns, sourceVersionIndexes } from './shared'

/** Native CSDI TPU/subunit features with unchanged publisher geometry. */
export const sourceHkgovPlandPlanningCells = sqliteTable(
  'hkgovPlandPlanningCells',
  {
    ...sourceSpatialAssertionColumns(),
    ...timestamps,
  },
  table => [
    primaryKey({
      columns: [table.sourceRecordId, table.versionHash, table.validFromRelease],
    }),
    ...sourceVersionIndexes(table, 'hkgovPlandPlanningCells'),
  ],
)

/** Native New Town features with publisher labels retained in properties. */
export const sourceHkgovPlandNewTowns = sqliteTable(
  'hkgovPlandNewTowns',
  {
    ...sourceSpatialAssertionColumns(),
    ...timestamps,
  },
  table => [
    primaryKey({
      columns: [table.sourceRecordId, table.versionHash, table.validFromRelease],
    }),
    ...sourceVersionIndexes(table, 'hkgovPlandNewTowns'),
  ],
)
