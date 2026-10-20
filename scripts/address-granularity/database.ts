// NODE
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
// SQLITE
import { Database } from 'bun:sqlite'

export type Row = Record<string, unknown>
export type Statement = { sql: string; params?: unknown[] }
export type Query = (statements: Statement[]) => Promise<Row[][]>

/** Open an explicitly selected local database, backing it up before mutation.
 * @param path Existing SQLite database. @param apply Whether writes are enabled.
 * @returns Transactional query adapter and close function.
 */
export function localDatabase(
  path: string,
  apply: boolean,
): { query: Query; close: () => void } {
  const db = new Database(path, { readonly: !apply, strict: true })
  if (apply) {
    const backup = `${path}.before-granularity-${Date.now()}.sqlite`
    mkdirSync(dirname(backup), { recursive: true })
    db.exec(`VACUUM INTO '${backup.replaceAll("'", "''")}'`)
  }
  const query: Query = async statements =>
    db.transaction(() =>
      statements.map(({ sql, params = [] }) =>
        db.query<Row, never[]>(sql).all(...(params as never[])),
      ),
    )()
  return { query, close: () => db.close() }
}

/** Use D1's atomic batch API for an explicit deployment target.
 * @param account Cloudflare account. @param id D1 database ID. @param token API token.
 * @returns Query adapter; failed batches roll back including trigger changes.
 */
export function remoteDatabase(account: string, id: string, token: string): Query {
  if (!account || !id || !token)
    throw new Error('Explicit account, database and token required')
  return async statements => {
    if (statements.some(s => (s.params?.length ?? 0) > 100))
      throw new Error('D1 parameter limit exceeded before migration')
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${account}/d1/database/${id}/query`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          batch: statements.map(s => ({ sql: s.sql, params: s.params ?? [] })),
        }),
      },
    )
    const body = (await response.json()) as {
      success: boolean
      result: { success: boolean; results: Row[] }[]
    }
    if (!response.ok || !body.success || body.result.some(r => !r.success))
      throw new Error(`D1 granularity migration failed (${response.status})`)
    return body.result.map(r => r.results)
  }
}

/** Quote a schema identifier. @param name Identifier. @returns SQLite identifier. */
export function identifier(name: string): string {
  return `"${name.replaceAll('"', '""')}"`
}

/** Repair one row atomically, fencing every original value and restoring all triggers.
 * @param query Database adapter. @param table Table name. @param row Original complete row.
 * @param changes Changed columns. @returns Nothing; conflicts abort the entire batch.
 * @remarks Trigger suppression exists only within this atomic maintenance batch.
 */
export async function repairRow(
  query: Query,
  table: string,
  row: Row,
  changes: Row,
): Promise<void> {
  return repairRows(query, [{ table, row, changes }])
}

/** Atomically repair related rows and restore triggers; conflicts roll back every change.
 * @param query Database adapter. @param repairs Fenced changes. @returns Nothing.
 */
export async function repairRows(
  query: Query,
  repairs: { table: string; row: Row; changes: Row }[],
): Promise<void> {
  if (!repairs.length) return
  const triggers: Row[] = []
  for (const table of new Set(repairs.map(r => r.table))) {
    const [rows] = await query([
      {
        sql: "SELECT name,sql FROM sqlite_schema WHERE type='trigger' AND tbl_name=?",
        params: [table],
      },
    ])
    triggers.push(...rows)
  }
  const statements: Statement[] = [
    { sql: 'CREATE TABLE _address_granularity_guard (ok INTEGER CHECK(ok=1))' },
  ]
  // Validate the complete original rows before temporarily removing immutable-row guards.
  for (const { table, row } of repairs) {
    const keys = Object.keys(row)
    statements.push({
      sql: `INSERT INTO _address_granularity_guard SELECT count(*)=1 FROM ${identifier(table)} WHERE ${keys.map(k => `${identifier(k)} IS ?`).join(' AND ')}`,
      params: keys.map(k => row[k]),
    })
  }
  statements.push(
    ...triggers.map(t => ({ sql: `DROP TRIGGER ${identifier(String(t.name))}` })),
  )
  for (const { table, row, changes } of repairs) {
    const keys = Object.keys(row),
      entries = Object.entries(changes)
    statements.push({
      sql: `UPDATE ${identifier(table)} SET ${entries.map(([k]) => `${identifier(k)}=?`).join(',')} WHERE ${keys.map(k => `${identifier(k)} IS ?`).join(' AND ')}`,
      params: [...entries.map(([, v]) => v), ...keys.map(k => row[k])],
    })
  }
  statements.push(...triggers.map(t => ({ sql: String(t.sql) })), {
    sql: 'DROP TABLE _address_granularity_guard',
  })
  await query(statements)
}
