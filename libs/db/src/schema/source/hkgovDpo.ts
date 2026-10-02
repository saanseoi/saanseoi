import { primaryKey, sqliteTable } from 'drizzle-orm/sqlite-core'

import { jsonText, timestamps } from '../shared'
import { sourceAssertionColumns, sourceVersionIndexes } from './shared'

/** Every publisher 3D occurrence is retained, even when its inventory is shared. */
export const sourceHkgovAlsAddresses3d = sqliteTable(
  'hkgovAlsAddresses3d',
  {
    ...sourceAssertionColumns(),
    sourceLocator: jsonText<Record<string, unknown>>('sourceLocator'),
    properties: jsonText('properties').notNull(),
    sourceGeometry: jsonText('sourceGeometry'),
    ...timestamps,
  },
  table => [
    primaryKey({ columns: [table.sourceRecordId, table.versionHash] }),
    ...sourceVersionIndexes(table, 'hkgovAlsAddresses3d'),
  ],
)

/** Publisher payload and its provenance; derived addresses belong to snapshots. */
export const sourceHkgovAlsAddresses2d = sqliteTable(
  'hkgovAlsAddresses2d',
  {
    ...sourceAssertionColumns(),
    sourceLocator: jsonText<Record<string, unknown>>('sourceLocator'),
    sourceGeometry: jsonText('sourceGeometry'),
    ...timestamps,
  },
  table => [
    primaryKey({
      columns: [table.sourceRecordId, table.versionHash],
    }),
    ...sourceVersionIndexes(table, 'hkgovAlsAddresses2d'),
  ],
)
