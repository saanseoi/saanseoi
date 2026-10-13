import { readdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

/** SQLite must remove dependent views before altering the columns they reference. */
export function orderMigrationViewDrops(sql: string) {
  const statements = sql.split('--> statement-breakpoint')
  const drops = statements.filter(statement => /^\s*DROP VIEW\b/i.test(statement))
  if (!drops.length) return sql
  return [...drops, ...statements.filter(statement => !drops.includes(statement))]
    .map(statement => statement.trim())
    .join('--> statement-breakpoint\n')
}

if (import.meta.main) {
  const [directory, predecessor = ''] = process.argv.slice(2)
  if (!directory) throw new Error('Expected migration directory and predecessor.')
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name <= predecessor) continue
    const path = resolve(directory, entry.name, 'migration.sql')
    const sql = await readFile(path, 'utf8')
    const ordered = orderMigrationViewDrops(sql)
    if (ordered !== sql) await writeFile(path, ordered)
  }
}
