import { Database } from 'bun:sqlite'
import { writeFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import { resolve, sep } from 'node:path'
import { remapAlsSourceProperties } from '../libs/core/src/pipeline/services/sources/alsSourcePayload'

const { values } = parseArgs({
  options: {
    database: { type: 'string' },
    output: { type: 'string' },
    'apply-local': { type: 'boolean' },
  },
})
if (!values.database || !values.output)
  throw new Error(
    'Requires --database and --output; --apply-local optionally applies guarded updates to a local development database.',
  )
const path = resolve(values.database)
if (values['apply-local'] && !path.startsWith(resolve('.local/d1') + sep))
  throw new Error('Application is restricted to .local/d1.')
const db = new Database(
  path,
  values['apply-local'] ? { readwrite: true } : { readonly: true },
)
const quote = (value: string) => "'" + value.replaceAll("'", "''") + "'"
const updates: { sql: string; rollback: string }[] = []
const counts: Record<string, number> = {}
try {
  for (const table of ['hkgovAlsAddresses2d', 'hkgovAlsAddresses3d']) {
    if (!db.query('SELECT name FROM sqlite_master WHERE name = ?').get(table)) continue
    for (const row of db
      .query(
        `SELECT sourceRecordId, versionHash, rawProperties FROM ${table} WHERE rawProperties LIKE '%"/%'`,
      )
      .iterate() as Iterable<{
      sourceRecordId: string
      versionHash: string
      rawProperties: string
    }>) {
      const mapped = JSON.stringify(
        remapAlsSourceProperties(JSON.parse(row.rawProperties)),
      )
      if (mapped === row.rawProperties) continue
      const identity = `sourceRecordId = ${quote(row.sourceRecordId)} AND versionHash = ${quote(row.versionHash)}`
      const update = (before: string, after: string) =>
        `UPDATE ${table} SET rawProperties = ${quote(after)} WHERE ${identity} AND rawProperties = ${quote(before)};`
      updates.push({
        sql: update(row.rawProperties, mapped),
        rollback: update(mapped, row.rawProperties),
      })
      counts[table] = (counts[table] ?? 0) + 1
    }
  }
  writeFileSync(values.output, updates.map(row => row.sql).join('\n'), { flag: 'wx' })
  writeFileSync(
    values.output + '.rollback.sql',
    updates.map(row => row.rollback).join('\n'),
    { flag: 'wx' },
  )
  if (values['apply-local'])
    db.transaction(() => {
      for (const row of updates) {
        if (db.query(row.sql).run().changes !== 1)
          throw new Error(
            'Retained row changed during preparation; transaction rolled back.',
          )
      }
    })()
  console.log(
    JSON.stringify({
      database: path,
      applied: !!values['apply-local'],
      counts,
      output: values.output,
    }),
  )
} finally {
  db.close()
}
