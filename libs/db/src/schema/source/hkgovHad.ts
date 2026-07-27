import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'

import { geoBbox, jsonText, sourceProvenance } from '../shared'
import { sourceVersionIndexes, sourceVersioning } from './shared'

/** Raw Home Affairs Department district polygons, retained separately from Overture. */
export const sourceHkgovHadDivisionAreas = sqliteTable(
  'hkgovHadDivisionAreas',
  {
    sourceRecordId: text('sourceRecordId').notNull(),
    objectId: integer('objectId'),
    cdsiAdminAreaId: integer('cdsiAdminAreaId'),
    areaType: text('areaType'),
    areaId: text('areaId'),
    divisionId: text('divisionId'),
    areaCode: text('areaCode'),
    ...geoBbox,
    ...sourceProvenance,
    sourceGeometry: jsonText('sourceGeometry'),
    ...sourceVersioning,
  },
  table => [
    primaryKey({ columns: [table.sourceRecordId, table.versionHash] }),
    ...sourceVersionIndexes(table, 'hkgovHadDivisionAreas'),
    index('hkgovHadDivisionAreas_areaId_idx').on(table.areaId),
    index('hkgovHadDivisionAreas_areaCode_idx').on(table.areaCode),
    index('hkgovHadDivisionAreas_divisionId_idx').on(table.divisionId),
  ],
)
