import { primaryKey, sqliteTable } from 'drizzle-orm/sqlite-core'
import { timestamps } from '../shared'
import { sourceAssertionColumns, sourceVersionIndexes } from './shared'

/** RVD list assertions; record keys are SaanSeoi locators, not publisher codes. */
export const sourceHkgovRvdAreas = sqliteTable(
  'hkgovRvdAreas',
  {
    ...sourceAssertionColumns(),
    ...timestamps,
  },
  table => [
    primaryKey({
      columns: [table.sourceRecordId, table.versionHash, table.validFromRelease],
    }),
    ...sourceVersionIndexes(table, 'hkgovRvdAreas'),
  ],
)
