import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { executeSqliteDump } from './sqliteDumpExecution.ts'

test('bounded dump execution preserves schema, escaped text, blobs and row counts', () => {
  const dump = `PRAGMA foreign_keys = OFF;
CREATE TABLE rows (id INTEGER PRIMARY KEY, text TEXT, data BLOB);
${Array.from({ length: 2000 }, (_, id) => `INSERT INTO rows VALUES (${id}, '山水; it''s 😀', X'00FF');`).join('\n')}
CREATE INDEX rows_text ON rows(text);`
  const reference = new Database(':memory:')
  const bounded = new Database(':memory:')
  try {
    reference.exec(dump)
    executeSqliteDump(bounded, dump)
    expect(bounded.query('SELECT * FROM rows ORDER BY id').all()).toEqual(
      reference.query('SELECT * FROM rows ORDER BY id').all(),
    )
    expect(
      bounded.query('SELECT name,sql FROM sqlite_master ORDER BY name').all(),
    ).toEqual(reference.query('SELECT name,sql FROM sqlite_master ORDER BY name').all())
  } finally {
    reference.close()
    bounded.close()
  }
})

test('a mid-dump error rolls back the entire caller transaction', () => {
  const db = new Database(':memory:')
  try {
    db.exec('CREATE TABLE rows (id INTEGER PRIMARY KEY)')
    expect(() =>
      db.transaction(() =>
        executeSqliteDump(
          db,
          'INSERT INTO rows VALUES (1); INSERT INTO rows VALUES (1); INSERT INTO rows VALUES (2);',
        ),
      )(),
    ).toThrow()
    expect(db.query('SELECT * FROM rows').all()).toEqual([])
  } finally {
    db.close()
  }
})

test('trigger bodies retain native SQL parsing', () => {
  const db = new Database(':memory:')
  try {
    executeSqliteDump(
      db,
      `CREATE TABLE rows (id INTEGER); CREATE TABLE audit (id INTEGER);
CREATE TRIGGER audit_insert AFTER INSERT ON rows BEGIN INSERT INTO audit VALUES (new.id); INSERT INTO audit VALUES (new.id + 1); END;
INSERT INTO rows VALUES (7);`,
    )
    expect(db.query('SELECT * FROM audit').all()).toEqual([{ id: 7 }, { id: 8 }])
  } finally {
    db.close()
  }
})
