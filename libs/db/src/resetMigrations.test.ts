import { expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const migrationsRoot = resolve(import.meta.dir, '../migrations/meta')
const migrations = readdirSync(migrationsRoot, { withFileTypes: true })
  .filter(entry => entry.isDirectory())
  .map(entry => entry.name)
  .sort()
  .map(name => ({
    name,
    sql: readFileSync(resolve(migrationsRoot, name, 'migration.sql'), 'utf8'),
  }))

for (const family of ['meta', 'all']) {
  const dropSql = readFileSync(
    resolve(import.meta.dir, `../scripts/sql/drop-${family}-db.sql`),
    'utf8',
  )

  for (const [index, migration] of migrations.entries()) {
    test(`${family} reset permits Meta replay after ${migration.name}`, () => {
      const sqlite = new Database(':memory:')
      try {
        for (const previous of migrations.slice(0, index + 1)) {
          sqlite.exec(previous.sql)
        }
        sqlite.exec(dropSql)
        expect(
          sqlite
            .query(
              "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
            )
            .all(),
        ).toEqual([])
        for (const next of migrations) {
          sqlite.exec(next.sql)
        }
      } finally {
        sqlite.close()
      }
    })
  }
}
