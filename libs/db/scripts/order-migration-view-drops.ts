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

/** Drizzle does not emit unchanged views when their underlying tables are rebuilt. */
export function protectRebuiltTableViews(
  sql: string,
  views: Array<{ name: string; definition: string; isExisting?: boolean }>,
) {
  const rebuilt = [...sql.matchAll(/DROP TABLE [`"]([^`"]+)[`"]/gi)].map(
    match => match[1]!,
  )
  const affected = views.filter(
    view =>
      !view.isExisting &&
      rebuilt.some(table => view.definition.includes(`"${table}"`)) &&
      !sql.includes(`CREATE VIEW \`${view.name}\``) &&
      !sql.includes(`CREATE VIEW "${view.name}"`),
  )
  if (!affected.length) return orderMigrationViewDrops(sql)
  const quote = (name: string) => `"${name.replaceAll('"', '""')}"`
  return orderMigrationViewDrops(
    [
      ...affected.map(view => `DROP VIEW IF EXISTS ${quote(view.name)};`),
      sql,
      ...affected.map(view => `CREATE VIEW ${quote(view.name)} AS ${view.definition};`),
    ].join('--> statement-breakpoint\n'),
  )
}

if (import.meta.main) {
  const [directory, predecessor = ''] = process.argv.slice(2)
  if (!directory) throw new Error('Expected migration directory and predecessor.')
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name <= predecessor) continue
    const path = resolve(directory, entry.name, 'migration.sql')
    const sql = await readFile(path, 'utf8')
    const snapshot = JSON.parse(
      await readFile(resolve(directory, entry.name, 'snapshot.json'), 'utf8'),
    ) as {
      ddl: Array<{
        entityType: string
        name: string
        definition: string
        isExisting?: boolean
      }>
    }
    const ordered = protectRebuiltTableViews(
      sql,
      snapshot.ddl.filter(entity => entity.entityType === 'views'),
    )
    if (ordered !== sql) await writeFile(path, ordered)
  }
}
