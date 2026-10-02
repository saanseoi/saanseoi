import { primaryKey, sqliteTable } from 'drizzle-orm/sqlite-core'
import { jsonText, timestamps } from '../shared'

import { sourceSpatialAssertionColumns, sourceVersionIndexes } from './shared'

/** Native CSDI TPU/subunit features with unchanged publisher geometry. */
export const sourceHkgovPlandPlanningCells = sqliteTable(
  'hkgovPlandPlanningCells',
  {
    ...sourceSpatialAssertionColumns(),
    sourceLocator: jsonText<Record<string, unknown>>('sourceLocator'),
    ...timestamps,
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
    ...timestamps,
  },
  table => [
    primaryKey({ columns: [table.sourceRecordId, table.versionHash] }),
    ...sourceVersionIndexes(table, 'hkgovPlandNewTowns'),
  ],
)
