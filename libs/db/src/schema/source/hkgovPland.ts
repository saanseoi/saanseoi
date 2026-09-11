import { integer, primaryKey, sqliteTable } from 'drizzle-orm/sqlite-core'

import { jsonText } from '../shared'
import { sourceSpatialAssertionColumns, sourceVersionIndexes } from './shared'

/**
 * Native CSDI TPU/subunit features. `repairedGeometry` records the explicitly
 * approved buffer(0) repair, keyed to this exact publisher feature version.
 */
export const sourceHkgovPlandPlanningCells = sqliteTable(
  'hkgovPlandPlanningCells',
  {
    ...sourceSpatialAssertionColumns(),
    wasGeometryRepaired: integer('wasGeometryRepaired', { mode: 'boolean' })
      .notNull()
      .default(false),
    repairedGeometry: jsonText('repairedGeometry'),
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
    wasGeometryRepaired: integer('wasGeometryRepaired', { mode: 'boolean' })
      .notNull()
      .default(false),
    repairedGeometry: jsonText('repairedGeometry'),
  },
  table => [
    primaryKey({ columns: [table.sourceRecordId, table.versionHash] }),
    ...sourceVersionIndexes(table, 'hkgovPlandNewTowns'),
  ],
)
