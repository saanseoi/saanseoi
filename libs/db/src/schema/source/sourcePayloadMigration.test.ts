import { expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { readFileSync } from 'node:fs'

test('source payload migration preserves every retained value and version row', () => {
  const db = new Database(':memory:')
  const migrationRoot = new URL('../../../migrations/source/', import.meta.url)
  db.exec(
    readFileSync(
      new URL('20260907083011_blue_jack_flag/migration.sql', migrationRoot),
      'utf8',
    ),
  )
  const migration = readFileSync(
    new URL('20260907151522_huge_kree/migration.sql', migrationRoot),
    'utf8',
  )
  const tables = [
    ...new Set(
      [...migration.matchAll(/ALTER TABLE `([^`]+)`/g)].map(match => match[1]!),
    ),
  ]
  const before = new Map<string, Record<string, unknown>[]>()
  for (const table of tables) {
    const columns = db.query(`PRAGMA table_info("${table}")`).all() as {
      name: string
      type: string
    }[]
    const names = columns.map(column => `"${column.name}"`).join(', ')
    for (let version = 0; version < 2; version++) {
      const values = columns.map(column => {
        if (column.name === 'sourceRecordId') return 'publisher-record'
        if (column.name === 'isCurrent') return version
        if (column.type === 'INTEGER' || column.type === 'REAL') return version + 1
        if (column.type === 'BLOB') return new Uint8Array([1, 2, version])
        return JSON.stringify({ field: column.name, version, publisher: '原始資料' })
      })
      db.query(
        `INSERT INTO "${table}" (${names}) VALUES (${columns.map(() => '?').join(', ')})`,
      ).run(...values)
    }
    before.set(
      table,
      db.query(`SELECT * FROM "${table}" ORDER BY versionHash`).all() as Record<
        string,
        unknown
      >[],
    )
  }
  db.exec(migration)
  for (const table of tables) {
    const after = db
      .prepare(`SELECT * FROM "${table}" ORDER BY versionHash`)
      .all() as Record<string, unknown>[]
    expect(after).toHaveLength(2)
    for (const [index, row] of after.entries()) {
      for (const [key, value] of Object.entries(row))
        expect(value).toEqual(before.get(table)![index]![key])
      expect(row.rawProperties).toBe(before.get(table)![index]!.rawProperties)
    }
  }
  expect(tables.length).toBeGreaterThan(10)
  db.close()
})
