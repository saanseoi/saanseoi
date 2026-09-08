import { expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { readFileSync, readdirSync } from 'node:fs'

test('nullable sources migration preserves source rows and permits SQL NULL', () => {
  const root = new URL('../../../migrations/source/', import.meta.url)
  const name = '20260908041314_purple_bucky'
  const db = new Database(':memory:')
  try {
    for (const entry of readdirSync(root)
      .filter(entry => entry < name)
      .sort()) {
      db.exec(readFileSync(new URL(`${entry}/migration.sql`, root), 'utf8'))
    }
    const migration = readFileSync(new URL(`${name}/migration.sql`, root), 'utf8')
    const tables = [...migration.matchAll(/CREATE TABLE `__new_([^`]+)`/g)].map(
      match => match[1]!,
    )
    const before = new Map<string, unknown[]>()
    for (const table of tables) {
      const columns = db.query(`PRAGMA table_info("${table}")`).all() as {
        name: string
        type: string
      }[]
      for (let version = 0; version < 2; version++) {
        db.query(
          `INSERT INTO "${table}" (${columns.map(column => `"${column.name}"`).join(',')}) VALUES (${columns.map(() => '?').join(',')})`,
        ).run(
          ...columns.map(column => {
            if (column.name === 'sourceRecordId') return 'publisher-record'
            if (column.type === 'INTEGER' || column.type === 'REAL') return version
            return JSON.stringify({
              field: column.name,
              version,
              publisher: '原始資料',
            })
          }),
        )
      }
      before.set(table, db.query(`SELECT * FROM "${table}" ORDER BY versionHash`).all())
    }
    db.exec(migration)
    for (const table of tables) {
      expect(db.query(`SELECT * FROM "${table}" ORDER BY versionHash`).all()).toEqual(
        before.get(table),
      )
      db.exec(`UPDATE "${table}" SET sources = NULL`)
      expect(db.query(`SELECT sources FROM "${table}"`).all()).toEqual([
        { sources: null },
        { sources: null },
      ])
    }
    expect(tables.length).toBeGreaterThan(10)
  } finally {
    db.close()
  }
})
