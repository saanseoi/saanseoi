import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'

import { jsonText } from '../shared'
import { sourceAssertionColumns, sourceVersionIndexes } from './shared'

/** Raw Home Affairs Department district polygons, retained separately from Overture. */
export const sourceHkgovHadDivisionAreas = sqliteTable(
  'hkgovHadDivisionAreas',
  {
    ...sourceAssertionColumns(),
    objectId: integer('objectId'),
    cdsiAdminAreaId: integer('cdsiAdminAreaId'),
    areaType: text('areaType'),
    areaId: text('areaId'),
    divisionId: text('divisionId'),
    areaCode: text('areaCode'),
    sourceGeometry: jsonText('sourceGeometry'),
  },
  table => [
    primaryKey({ columns: [table.sourceRecordId, table.versionHash] }),
    ...sourceVersionIndexes(table, 'hkgovHadDivisionAreas'),
    index('hkgovHadDivisionAreas_areaId_idx').on(table.areaId),
    index('hkgovHadDivisionAreas_areaCode_idx').on(table.areaCode),
    index('hkgovHadDivisionAreas_divisionId_idx').on(table.divisionId),
  ],
)
