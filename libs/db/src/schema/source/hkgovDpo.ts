import { primaryKey, sqliteTable } from 'drizzle-orm/sqlite-core'

import { jsonText } from '../shared'
import {
  sourceAssertionColumns,
  sourceVersionIndexes,
  sourceReleaseRevisionAssertionColumns,
  sourceReleaseRevisionIndexes,
} from './shared'

/** Every publisher 3D occurrence is retained, even when its inventory is shared. */
export const sourceHkgovAlsAddresses3d = sqliteTable(
  'hkgovAlsAddresses3d',
  {
    ...sourceReleaseRevisionAssertionColumns(),
    rawProperties: jsonText('rawProperties').notNull(),
  },
  table => [
    primaryKey({ columns: [table.releaseId, table.sourceRecordId] }),
    ...sourceReleaseRevisionIndexes(table, 'hkgovAlsAddresses3d'),
  ],
)

/** Publisher payload and its provenance; derived addresses belong to snapshots. */
export const sourceHkgovAlsAddresses2d = sqliteTable(
  'hkgovAlsAddresses2d',
  {
    ...sourceAssertionColumns(),
  },
  table => [
    primaryKey({
      columns: [table.sourceRecordId, table.versionHash],
    }),
    ...sourceVersionIndexes(table, 'hkgovAlsAddresses2d'),
  ],
)
