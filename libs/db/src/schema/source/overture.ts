import { primaryKey, sqliteTable } from 'drizzle-orm/sqlite-core'

import { sourceAssertionColumns, sourceVersionIndexes } from './shared'

/** Publisher payloads live only in rawProperties; projections belong to canonical tables. */
function overtureSourceTable<TName extends string>(name: TName) {
  return sqliteTable(name, sourceAssertionColumns(), table => [
    primaryKey({ columns: [table.sourceRecordId, table.versionHash] }),
    ...sourceVersionIndexes(table, name),
  ])
}

export const sourceOvertureDivisions = overtureSourceTable('overtureDivisions')
export const sourceOvertureDivisionAreas = overtureSourceTable('overtureDivisionAreas')
export const sourceOvertureDivisionBoundaries = overtureSourceTable(
  'overtureDivisionBoundaries',
)
export const sourceOverturePlaces = overtureSourceTable('overturePlaces')
