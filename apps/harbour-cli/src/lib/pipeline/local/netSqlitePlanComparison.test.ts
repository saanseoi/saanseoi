import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { netTablesDiffer } from './netSqlitePlanSchema.ts'

test('indexed replay comparison agrees with exact set comparison for keys, binary data and edits', () => {
  const db = new Database(':memory:')
  try {
    db.exec(`ATTACH ':memory:' AS candidate;
      CREATE TABLE main.rows(id TEXT COLLATE NOCASE NOT NULL, version INTEGER NOT NULL, value BLOB, PRIMARY KEY(id,version));
      CREATE TABLE candidate.rows(id TEXT COLLATE NOCASE NOT NULL, version INTEGER NOT NULL, value BLOB, PRIMARY KEY(id,version));`)
    const reference = () =>
      !!db
        .query(`SELECT 1 FROM (SELECT id COLLATE BINARY,version,value FROM main.rows EXCEPT SELECT id COLLATE BINARY,version,value FROM candidate.rows)
      UNION ALL SELECT 1 FROM (SELECT id COLLATE BINARY,version,value FROM candidate.rows EXCEPT SELECT id COLLATE BINARY,version,value FROM main.rows) LIMIT 1`)
        .get()
    const check = () =>
      expect(
        netTablesDiffer(
          db,
          'rows',
          ['id', 'version', 'value'],
          ['id', 'version'],
          'main',
          'candidate',
        ),
      ).toBe(reference())
    check()
    for (const sql of [
      "INSERT INTO main.rows VALUES('A',9223372036854775806,x'0100')",
      'INSERT INTO candidate.rows SELECT * FROM main.rows',
      "UPDATE candidate.rows SET id='a'",
      "UPDATE candidate.rows SET id='A',value=x'0101'",
      "UPDATE candidate.rows SET value=x'0100'",
      "INSERT INTO candidate.rows VALUES('B',2,NULL)",
      "INSERT INTO main.rows VALUES('B',2,NULL)",
      "UPDATE main.rows SET value='text' WHERE id='B'",
      "DELETE FROM main.rows WHERE id='A'",
    ]) {
      db.exec(sql)
      check()
    }
  } finally {
    db.close()
  }
})
