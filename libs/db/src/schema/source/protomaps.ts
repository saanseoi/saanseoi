import { primaryKey, sqliteTable } from 'drizzle-orm/sqlite-core'
import { timestamps } from '../shared'
import { sourceSpatialAssertionColumns, sourceVersionIndexes } from './shared'

/**
 * Native island assertions and shared full coastline polygons from the selected
 * Protomaps baseline. Island membership references these assertions without
 * storing another geometry copy.
 *
 * This is source evidence only.  Canonical division identity and the decision
 * to select an island polygon are retained by the SaanSeoi snapshot assembly.
 */
export const sourceProtomapsIslandFeatures = sqliteTable(
  'protomapsIslandFeatures',
  {
    ...sourceSpatialAssertionColumns(),
    ...timestamps,
  },
  table => [
    primaryKey({
      columns: [table.sourceRecordId, table.versionHash, table.validFromRelease],
    }),
    ...sourceVersionIndexes(table, 'protomapsIslandFeatures'),
  ],
)
