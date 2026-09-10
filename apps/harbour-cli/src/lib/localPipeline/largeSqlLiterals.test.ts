import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { splitLargeInsertLiterals } from './largeSqlLiterals.ts'
import { buildInsertStatements } from '../divisionSql/processLocalDivisionSqlUploadRows.ts'

test('large Division text preserves insert and conflict semantics without partial values', () => {
  const payload = JSON.stringify({ name: "山水'😀", geometry: 'x'.repeat(520_000) })
  const statements = buildInsertStatements(
    'divisions',
    ['id', 'geometry', 'updatedAt'],
    [
      { id: 'before', geometry: '{}', updatedAt: 'now' },
      { id: 'large', geometry: payload, updatedAt: 'now' },
      { id: 'after', geometry: '{}', updatedAt: 'now' },
    ],
    { suffix: 'ON CONFLICT(id) DO UPDATE SET updatedAt = excluded.updatedAt' },
  )
  expect(statements.every(sql => Buffer.byteLength(sql) <= 99_000)).toBe(true)
  const db = new Database(':memory:')
  try {
    db.exec(
      'CREATE TABLE divisions (id TEXT PRIMARY KEY, geometry TEXT CHECK(json_valid(geometry)), updatedAt TEXT)',
    )
    db.transaction(() => {
      statements.forEach(sql => {
        db.exec(sql)
      })
    })()
    expect(
      db.query('SELECT geometry FROM divisions WHERE id = ?').get('large'),
    ).toEqual({ geometry: payload })
    db.exec(`UPDATE divisions SET geometry = '{}' WHERE id = 'large'`)
    db.transaction(() => {
      statements.forEach(sql => {
        db.exec(sql)
      })
    })()
    expect(
      db.query('SELECT geometry FROM divisions WHERE id = ?').get('large'),
    ).toEqual({ geometry: '{}' })
    expect(
      db
        .query("SELECT name FROM sqlite_master WHERE name LIKE 'harbourSqlLiteral_%'")
        .all(),
    ).toEqual([])
  } finally {
    db.close()
  }
})

test('staged literals round-trip escaped Unicode, multiple columns and small budgets', () => {
  const value = "a'😀山".repeat(2000)
  const quote = (text: string) => `'${text.replaceAll("'", "''")}'`
  const sql = `INSERT INTO data (id, a, b) VALUES (1, ${quote(value)}, ${quote(value)});`
  const statements = splitLargeInsertLiterals(sql, 1000)
  expect(statements.every(sql => Buffer.byteLength(sql) <= 1000)).toBe(true)
  const db = new Database(':memory:')
  try {
    db.exec('CREATE TABLE data (id INTEGER PRIMARY KEY, a TEXT, b TEXT)')
    db.transaction(() => {
      statements.forEach(sql => {
        db.exec(sql)
      })
    })()
    expect(db.query('SELECT a, b FROM data').get()).toEqual({ a: value, b: value })
  } finally {
    db.close()
  }
})

test('small statements are unchanged and unsupported oversized SQL fails closed', () => {
  expect(splitLargeInsertLiterals('SELECT 1;')).toEqual(['SELECT 1;'])
  expect(() =>
    splitLargeInsertLiterals(`UPDATE x SET v = '${'x'.repeat(1000)}'`, 500),
  ).toThrow('Only generated INSERT')
  expect(() =>
    splitLargeInsertLiterals(`INSERT INTO x(v) VALUES ('${'x'.repeat(1000)})`, 500),
  ).toThrow('Unterminated')
})
