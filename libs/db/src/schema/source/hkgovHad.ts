import { primaryKey, sqliteTable } from 'drizzle-orm/sqlite-core'

import { timestamps } from '../shared'
import { sourceSpatialAssertionColumns, sourceVersionIndexes } from './shared'

/** Raw Home Affairs Department district polygons, retained separately from Overture. */
export const sourceHkgovHadDivisionAreas = sqliteTable(
  'hkgovHadDivisionAreas',
  {
    ...sourceSpatialAssertionColumns(),
    ...timestamps,
  },
  table => [
    primaryKey({ columns: [table.sourceRecordId, table.versionHash] }),
    ...sourceVersionIndexes(table, 'hkgovHadDivisionAreas'),
  ],
)
