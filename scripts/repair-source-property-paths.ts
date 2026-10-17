import { Database } from 'bun:sqlite'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { sourcePropertyPathFromPointer } from '../libs/db/src/sourceAttribution'

// Local canonical attribution only. Native SOURCE payloads and snapshot/version identities
// are retained. Backups contain the original sources JSON keyed by table and rowid.
const { values } = parseArgs({
  options: {
    database: { type: 'string' },
    backup: { type: 'string' },
    apply: { type: 'boolean', default: false },
  },
})
if (!values.database || !existsSync(values.database))
  throw new Error('--database must name an existing local SQLite database.')
if (values.apply && (!values.backup || existsSync(values.backup)))
  throw new Error('--apply requires a new --backup SQLite path.')
const db = new Database(
  values.database,
  values.apply ? { readwrite: true } : { readonly: true },
)
db.exec('PRAGMA busy_timeout=5000')
const report: Record<string, number> = {}
let backup: Database | undefined
try {
  if (values.apply) {
    backup = new Database(values.backup!, { create: true })
    backup.exec(
      `CREATE TABLE originalSources (tableName TEXT, rowId INTEGER, sources TEXT, PRIMARY KEY(tableName,rowId)); CREATE TABLE metadata (databasePath TEXT)`,
    )
    backup.query('INSERT INTO metadata VALUES (?)').run(resolve(values.database))
    db.exec('BEGIN IMMEDIATE')
    backup.exec('BEGIN IMMEDIATE')
  }
  for (const { name: table } of db
    .query("SELECT name FROM sqlite_master WHERE type='table'")
    .all() as { name: string }[]) {
    const identifier = `"${table.replaceAll('"', '""')}"`
    const columns = db.query(`PRAGMA table_info(${identifier})`).all() as {
      name: string
    }[]
    if (!columns.some(column => column.name === 'sources')) continue
    const update = values.apply
      ? db.query(`UPDATE ${identifier} SET sources=? WHERE rowid=? AND sources=?`)
      : null
    let count = 0
    for (const row of db
      .query(
        `SELECT rowid AS rowId, sources FROM ${identifier} WHERE sources LIKE '%/%'`,
      )
      .iterate() as Iterable<{ rowId: number; sources: string }>) {
      const sources = JSON.parse(row.sources)
      if (!Array.isArray(sources)) continue
      let changed = false
      for (const item of sources) {
        if (
          !item ||
          typeof item.property !== 'string' ||
          !item.property.startsWith('/')
        )
          continue
        if (typeof item.publisher !== 'string' || typeof item.dataset !== 'string')
          throw new Error(
            `${table}/${row.rowId}: non-canonical attribution; refusing to modify native source data.`,
          )
        item.property = sourcePropertyPathFromPointer(item.property)
        changed = true
      }
      if (!changed) continue
      count++
      if (update) {
        backup!
          .query('INSERT INTO originalSources VALUES (?,?,?)')
          .run(table, row.rowId, row.sources)
        if (update.run(JSON.stringify(sources), row.rowId, row.sources).changes !== 1)
          throw new Error('Concurrent attribution change.')
      }
    }
    if (count) report[table] = count
  }
  // Persist recovery evidence before committing any source changes.
  if (values.apply) {
    backup!.exec('COMMIT')
    db.exec('COMMIT')
  }
  console.log(
    JSON.stringify({ database: values.database, applied: values.apply, rows: report }),
  )
} catch (error) {
  if (values.apply) {
    try {
      db.exec('ROLLBACK')
    } catch {}
    try {
      backup?.exec('ROLLBACK')
    } catch {}
  }
  throw error
} finally {
  backup?.close()
  db.close()
}
