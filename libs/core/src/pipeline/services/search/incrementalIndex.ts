import { eq, metaSnapshots } from '@repo/db'
import type { HarbourReadableDb } from '../../../lib/db/types'
import { resolveApiReleaseSetSnapshotsForRequest } from '../../../lib/db/metaRegistry'

export type SearchScope = { scopeId: string; snapshotId: string }
export type SearchIndexDefinition = {
  label: string
  resourceType: 'address' | 'place' | 'division'
  domainCode: string
  domainCodes?: readonly string[]
  table: string
  scopesTable: string
  retiredTable?: string
  tokenizer?: 'trigram'
  fields: readonly string[]
  unindexed: readonly string[]
  /** SELECT from the `selected` CTE; return exactly the declared fields. */
  selectSql: string
}
export type SearchD1Database = {
  prepare(sql: string): D1PreparedStatement
  batch(statements: D1PreparedStatement[]): Promise<unknown>
}
const literal = (value: string) => `'${value.replaceAll("'", "''")}'`

export async function resolvePublishedSearchScopes(
  db: HarbourReadableDb,
  definition: SearchIndexDefinition,
  request: { regionCode?: 'hk' | 'mo'; domainCode?: string } = {},
) {
  const scopes: SearchScope[] = []
  for (const regionCode of request.regionCode
    ? [request.regionCode]
    : (['hk', 'mo'] as const)) {
    for (const domainCode of request.domainCode
      ? [request.domainCode]
      : (definition.domainCodes ?? [definition.domainCode])) {
      const selection = await resolveApiReleaseSetSnapshotsForRequest(
        db,
        definition.resourceType,
        {
          regionCode,
          domainCode,
        },
      )
      for (const snapshot of selection?.snapshots ?? []) {
        if (snapshot.snapshotResourceType !== definition.resourceType) continue
        const row = await db
          .select({ lineage: metaSnapshots.snapshotLineageId })
          .from(metaSnapshots)
          .where(eq(metaSnapshots.id, snapshot.snapshotId))
          .get()
        if (!row) throw new Error(`Missing search snapshot ${snapshot.snapshotId}.`)
        scopes.push({
          scopeId: `${regionCode}:${domainCode}:${row.lineage}`,
          snapshotId: snapshot.snapshotId,
        })
      }
    }
  }
  return scopes
}

export function createSearchFtsSql(definition: SearchIndexDefinition) {
  return `CREATE VIRTUAL TABLE IF NOT EXISTS ${definition.table} USING fts5(
    ${definition.fields.map(field => `${field}${definition.unindexed.includes(field) ? ' UNINDEXED' : ''}`).join(', ')}${definition.tokenizer ? ", tokenize='trigram'" : ''}
  )`
}

/** Repair/reset helpers use only the existing published selection. */
export function buildSearchContentSql(
  definition: SearchIndexDefinition,
  selection = `SELECT scopeId, snapshotId FROM ${definition.scopesTable}`,
) {
  const { table, fields } = definition
  const desired = `WITH selected AS (${selection}), desired AS (${definition.selectSql})`
  const columns = fields.join(', ')
  // EXCEPT treats NULLs as equal; unchanged nullable fields cause no writes.
  return [
    createSearchFtsSql(definition),
    `${desired}, removed AS (
      SELECT ${columns} FROM ${table} EXCEPT SELECT ${columns} FROM desired
    ) DELETE FROM ${table} WHERE rowid IN (
      SELECT f.rowid FROM ${table} f JOIN removed r ON
      ${fields.map(field => `f.${field} IS r.${field}`).join(' AND ')}
    )`,
    `${desired} INSERT INTO ${table} (${columns})
      SELECT ${columns} FROM desired EXCEPT SELECT ${columns} FROM ${table}`,
  ]
}

/** All returned statements MUST execute together in one transaction/D1 batch. */
export function buildSearchSyncSql(
  definition: SearchIndexDefinition,
  input: readonly SearchScope[],
) {
  const scopes = new Map<string, string>()
  for (const { scopeId, snapshotId } of input) {
    if (scopes.has(scopeId) && scopes.get(scopeId) !== snapshotId)
      throw new Error(
        `Conflicting latest ${definition.label} snapshots for ${scopeId}.`,
      )
    scopes.set(scopeId, snapshotId)
  }
  // No published selection is not authority to erase the existing index.
  if (!scopes.size) return []
  const values = literal(
    JSON.stringify(
      [...scopes].map(([scopeId, snapshotId]) => ({ scopeId, snapshotId })),
    ),
  )
  // One JSON value avoids both variable-count and compound-SELECT limits.
  const selection = `SELECT json_extract(value, '$.scopeId') AS scopeId,
    json_extract(value, '$.snapshotId') AS snapshotId FROM json_each(${values})`
  const { scopesTable, retiredTable } = definition
  return [
    ...buildSearchContentSql(definition, selection),
    `DELETE FROM ${scopesTable} WHERE scopeId NOT IN (SELECT scopeId FROM (${selection}))`,
    `INSERT INTO ${scopesTable} (scopeId, snapshotId) ${selection}
      WHERE true ON CONFLICT(scopeId) DO UPDATE SET snapshotId = excluded.snapshotId
      WHERE ${scopesTable}.snapshotId IS NOT excluded.snapshotId`,
    ...(retiredTable ? [`DROP TABLE IF EXISTS ${retiredTable}`] : []),
  ]
}

export async function synchroniseSearchIndexes(
  db: HarbourReadableDb,
  current: SearchD1Database,
  definitions: readonly SearchIndexDefinition[],
) {
  const statements: string[] = []
  for (const definition of definitions) {
    const scopes = await resolvePublishedSearchScopes(db, definition)
    if (scopes.length) {
      const selected = literal(JSON.stringify(scopes))
      // The guard and FTS replacement share one D1 transaction. A concurrent
      // importer therefore cannot leave a ready search marker over partial data.
      statements.push(`SELECT CASE WHEN NOT EXISTS (
        SELECT 1 FROM json_each(${selected}) selected WHERE NOT EXISTS (
          SELECT 1 FROM ${definition.resourceType}PublicationState publication
          WHERE publication.snapshotId = json_extract(selected.value, '$.snapshotId')
            AND publication.status = 'current' AND publication.preparedAt IS NOT NULL
            AND publication.publicationToken <> ''
        )
      ) THEN 1 ELSE abs(-9223372036854775808) END`)
    }
    statements.push(...buildSearchSyncSql(definition, scopes))
  }
  if (statements.length)
    await current.batch(statements.map(sql => current.prepare(sql)))
}
