import { primaryKey, sqliteTable } from 'drizzle-orm/sqlite-core'

import { sourceSpatialAssertionColumns, sourceVersionIndexes } from './shared'

/** Native CSDI TPU/subunit features with unchanged publisher geometry. */
export const sourceHkgovPlandPlanningCells = sqliteTable(
  'hkgovPlandPlanningCells',
  {
    ...sourceSpatialAssertionColumns(),
  },
  table => [
    primaryKey({ columns: [table.sourceRecordId, table.versionHash] }),
    ...sourceVersionIndexes(table, 'hkgovPlandPlanningCells'),
  ],
)

/** Native New Town features with publisher labels retained in properties. */
export const sourceHkgovPlandNewTowns = sqliteTable(
  'hkgovPlandNewTowns',
  {
    ...sourceSpatialAssertionColumns(),
  },
  table => [
    primaryKey({ columns: [table.sourceRecordId, table.versionHash] }),
    ...sourceVersionIndexes(table, 'hkgovPlandNewTowns'),
  ],
)
