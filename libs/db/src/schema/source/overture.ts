import { primaryKey, sqliteTable } from 'drizzle-orm/sqlite-core'
import { binaryText, jsonText, timestamps } from '../shared'

import { sourceAssertionColumns, sourceVersionIndexes } from './shared'

/** Publisher payloads live only in properties; projections belong to canonical tables. */
function overtureSourceTable<TName extends string>(
  name: TName,
  compressedGeometry = false,
) {
  return sqliteTable(
    name,
    {
      ...sourceAssertionColumns(),
      sourceGeometry: compressedGeometry
        ? binaryText('sourceGeometry')
        : jsonText('sourceGeometry'),
      ...timestamps,
    },
    table => [
      primaryKey({
        columns: [table.sourceRecordId, table.versionHash, table.validFromRelease],
      }),
      ...sourceVersionIndexes(table, name),
    ],
  )
}

export const sourceOvertureDivisions = overtureSourceTable('overtureDivisions')
export const sourceOvertureDivisionAreas = overtureSourceTable(
  'overtureDivisionAreas',
  true,
)
export const sourceOvertureDivisionBoundaries = overtureSourceTable(
  'overtureDivisionBoundaries',
  true,
)
export const sourceOverturePlaces = overtureSourceTable('overturePlaces')
