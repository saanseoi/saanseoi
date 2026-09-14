import { primaryKey, sqliteTable } from 'drizzle-orm/sqlite-core'
import { sourceSpatialAssertionColumns, sourceVersionIndexes } from './shared'

/**
 * Native polygon assertions extracted from the selected Protomaps baseline.
 *
 * This is source evidence only.  Canonical division identity and the decision
 * to select an island polygon are retained by the SaanSeoi snapshot assembly.
 */
export const sourceProtomapsIslandFeatures = sqliteTable(
  'protomapsIslandFeatures',
  {
    ...sourceSpatialAssertionColumns(),
  },
  table => [
    primaryKey({ columns: [table.sourceRecordId, table.versionHash] }),
    ...sourceVersionIndexes(table, 'protomapsIslandFeatures'),
  ],
)
