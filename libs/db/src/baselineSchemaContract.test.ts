import { expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { getTableColumns, getTableName, is } from 'drizzle-orm'
import { SQLiteTable } from 'drizzle-orm/sqlite-core'
import * as meta from './schema/meta'
import * as current from './schema/current/migrationSchema'
import * as history from './schema/history'
import * as source from './schema/source'

for (const [family, schema] of Object.entries({ meta, current, history, source })) {
  test(`${family} baseline creates the declared tables and column contracts`, () => {
    const db = new Database(':memory:')
    try {
      const root = resolve(import.meta.dir, '../migrations', family)
      const migrations = readdirSync(root, { withFileTypes: true })
        .filter(entry => entry.isDirectory())
        .map(entry => entry.name)
        .sort()
      expect(migrations.length).toBeGreaterThan(0)
      for (const migration of migrations) {
        db.exec(readFileSync(resolve(root, migration, 'migration.sql'), 'utf8'))
      }
      const tables = Object.values(schema).filter(table => is(table, SQLiteTable))
      const created = db
        .query<{ name: string }, []>(
          "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
        )
        .all()
        .map(row => row.name)
      expect(created).toEqual(tables.map(getTableName).sort())
      for (const table of tables) {
        const columns = Object.values(getTableColumns(table))
        const actual = db
          .query<{ name: string; type: string; notnull: number }, []>(
            `PRAGMA table_info("${getTableName(table)}")`,
          )
          .all()
        expect(
          actual.map(({ name, type, notnull }) => ({ name, type, notnull })),
        ).toEqual(
          columns.map(column => ({
            name: column.name,
            type: column.getSQLType().toUpperCase(),
            notnull: Number(column.notNull),
          })),
        )
        if (family === 'source') {
          expect(actual.slice(-2).map(column => column.name)).toEqual([
            'createdAt',
            'updatedAt',
          ])
        }
      }
      expect(db.query('PRAGMA foreign_key_check').all()).toEqual([])
      expect(db.query('PRAGMA integrity_check').get()).toEqual({
        integrity_check: 'ok',
      })
    } finally {
      db.close()
    }
  })
}
