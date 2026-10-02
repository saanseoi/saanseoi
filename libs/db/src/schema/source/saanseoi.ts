import { primaryKey, sqliteTable } from 'drizzle-orm/sqlite-core'
import { jsonText, timestamps } from '../shared'
import {
  sourceAssertionColumns,
  sourceSpatialAssertionColumns,
  sourceVersionIndexes,
} from './shared'

/** SaanSeoi publishes curated records as its own versioned source assertions. */
export const sourceSsDivision = sqliteTable(
  'ssDivision',
  {
    ...sourceAssertionColumns(),
    sourceGeometry: jsonText('sourceGeometry'),
    ...timestamps,
  },
  table => [
    primaryKey({ columns: [table.sourceRecordId, table.versionHash] }),
    ...sourceVersionIndexes(table, 'ssDivision'),
  ],
)

export const sourceSsDivisionArea = sqliteTable(
  'ssDivisionArea',
  {
    ...sourceSpatialAssertionColumns(),
    ...timestamps,
  },
  table => [
    primaryKey({ columns: [table.sourceRecordId, table.versionHash] }),
    ...sourceVersionIndexes(table, 'ssDivisionArea'),
  ],
)
