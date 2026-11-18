import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { missingPlaceMembershipPredicates } from './processLocalPlaceSqlUploadRows'

test('bounded membership deletion preserves exact SQLite UTF-8 ordering across partition boundaries', () => {
  const db = new Database(':memory:')
  try {
    db.exec('CREATE TABLE records(id TEXT PRIMARY KEY)')
    const retained = Array.from(
      { length: 310 },
      (_, i) => `${i % 3 === 0 ? '香港' : i % 3 === 1 ? '\uE000' : '😀'}-${i}`,
    )
    retained.push("quote'identity", 'a')
    const removed = [
      '0',
      'zz',
      '香港-missing',
      '\uE000-missing',
      '😀-missing',
      'a-after',
    ]
    const insert = db.query('INSERT INTO records VALUES (?)')
    for (const id of [...retained, ...removed]) insert.run(id)
    for (const predicate of missingPlaceMembershipPredicates([...retained, '香港-0']))
      db.exec(`DELETE FROM records WHERE ${predicate}`)
    expect(
      new Set(
        db
          .query<{ id: string }, []>('SELECT id FROM records')
          .all()
          .map(r => r.id),
      ),
    ).toEqual(new Set(retained))
    for (const predicate of missingPlaceMembershipPredicates([]))
      db.exec(`DELETE FROM records WHERE ${predicate}`)
    expect(db.query('SELECT count(*) AS n FROM records').get()).toEqual({ n: 0 })
  } finally {
    db.close()
  }
})
