import { sql } from 'drizzle-orm'
import { buildDeterministicUuidV5 } from './versioning'

/** Content identity of a field-to-definition selection, independent of JSON key order. */
export function statisticDefinitionSet(hashes: Record<string, string>) {
  const fieldDefinitionHashes = Object.fromEntries(
    Object.entries(hashes).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
  )
  return {
    id: buildDeterministicUuidV5(
      '28148c84-453c-5b41-9f3f-cf7b7e8e11c9',
      JSON.stringify(fieldDefinitionHashes),
    ),
    fieldDefinitionHashes,
  }
}

/** Correlated lookups preserve each retained record's exact definition selection. */
export function statisticDefinitionHashesSql(recordAlias = 'statsRecords') {
  return `(SELECT fieldDefinitionHashes FROM statsDefinitionSets WHERE id = "${recordAlias.replaceAll('"', '""')}".definitionSetId)`
}

export const statisticDefinitionHashes = sql
  .raw(statisticDefinitionHashesSql())
  .mapWith(value => (typeof value === 'string' ? JSON.parse(value) : value))
