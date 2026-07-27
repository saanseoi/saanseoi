import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'

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
    ppuCode: text('ppuCode').notNull(),
    spuCode: text('spuCode').notNull(),
    tpuCode: text('tpuCode').notNull(),
    subunitCode: text('subunitCode').notNull(),
    wasGeometryRepaired: integer('wasGeometryRepaired', { mode: 'boolean' })
      .notNull()
      .default(false),
    repairedGeometry: jsonText('repairedGeometry'),
  },
  table => [
    primaryKey({ columns: [table.sourceRecordId, table.versionHash] }),
    ...sourceVersionIndexes(table, 'hkgovPlandPlanningCells'),
    index('hkgovPlandPlanningCells_tpuCode_idx').on(table.tpuCode),
    index('hkgovPlandPlanningCells_spuCode_idx').on(table.spuCode),
    index('hkgovPlandPlanningCells_ppuCode_idx').on(table.ppuCode),
  ],
)

/** Native New Town features with publisher labels retained as paired fields. */
export const sourceHkgovPlandNewTowns = sqliteTable(
  'hkgovPlandNewTowns',
  {
    ...sourceSpatialAssertionColumns(),
    newTownId: text('newTownId').notNull(),
    nameEn: text('nameEn').notNull(),
    nameZhHant: text('nameZhHant').notNull(),
    nameZhHans: text('nameZhHans').notNull(),
    wasGeometryRepaired: integer('wasGeometryRepaired', { mode: 'boolean' })
      .notNull()
      .default(false),
    repairedGeometry: jsonText('repairedGeometry'),
  },
  table => [
    primaryKey({ columns: [table.sourceRecordId, table.versionHash] }),
    ...sourceVersionIndexes(table, 'hkgovPlandNewTowns'),
    index('hkgovPlandNewTowns_newTownId_idx').on(table.newTownId),
  ],
)
