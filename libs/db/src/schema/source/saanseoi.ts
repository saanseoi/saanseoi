import { primaryKey, sqliteTable } from 'drizzle-orm/sqlite-core'
import { jsonText } from '../shared'
import { sourceAssertionColumns, sourceVersionIndexes } from './shared'

/** SaanSeoi publishes curated records as its own versioned source assertions. */
function curatedSourceTable<TName extends string>(name: TName) {
  return sqliteTable(
    name,
    {
      ...sourceAssertionColumns(),
      sourceGeometry: jsonText('sourceGeometry'),
    },
    table => [
      primaryKey({ columns: [table.sourceRecordId, table.versionHash] }),
      ...sourceVersionIndexes(table, name),
    ],
  )
}

export const sourceSsDivision = curatedSourceTable('ssDivision')
export const sourceSsDivisionArea = curatedSourceTable('ssDivisionArea')
