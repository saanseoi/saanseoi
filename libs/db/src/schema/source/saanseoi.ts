import { primaryKey, sqliteTable } from 'drizzle-orm/sqlite-core'
import { timestamps } from '../shared'
import { sourceSpatialAssertionColumns, sourceVersionIndexes } from './shared'

/** SaanSeoi publishes curated records as its own versioned source assertions. */
function curatedSourceTable<TName extends string>(name: TName) {
  return sqliteTable(
    name,
    {
      ...sourceSpatialAssertionColumns(),
      ...timestamps,
    },
    table => [
      primaryKey({ columns: [table.sourceRecordId, table.versionHash] }),
      ...sourceVersionIndexes(table, name),
    ],
  )
}

export const sourceSsDivision = curatedSourceTable('ssDivision')
export const sourceSsDivisionArea = curatedSourceTable('ssDivisionArea')
