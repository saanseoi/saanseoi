import { primaryKey, sqliteTable } from 'drizzle-orm/sqlite-core'

import { jsonText } from '../shared'
import { sourceAssertionColumns, sourceVersionIndexes } from './shared'

/** Raw Home Affairs Department district polygons, retained separately from Overture. */
export const sourceHkgovHadDivisionAreas = sqliteTable(
  'hkgovHadDivisionAreas',
  {
    ...sourceAssertionColumns(),
    sourceGeometry: jsonText('sourceGeometry'),
  },
  table => [
    primaryKey({ columns: [table.sourceRecordId, table.versionHash] }),
    ...sourceVersionIndexes(table, 'hkgovHadDivisionAreas'),
  ],
)
