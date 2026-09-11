import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { missingSourceMembershipPredicates } from './sourceMembershipSql.ts'

test('membership ranges preserve quoted and Unicode IDs and close only omissions once', () => {
  const db = new Database(':memory:')
  try {
    db.exec('CREATE TABLE records (sourceRecordId TEXT PRIMARY KEY, isCurrent INTEGER)')
    const ids = [
      ...Array.from({ length: 240 }, (_, i) => `id-${i}`),
      "'quoted",
      '香港',
      '\ue000',
      '😀',
    ]
    for (const id of [...ids, '', 'removed', '香港-old'])
      db.query('INSERT INTO records VALUES (?,1)').run(id)
    const before = db.query('SELECT total_changes() AS n').get() as { n: number }
    for (let replay = 0; replay < 2; replay++)
      for (const predicate of missingSourceMembershipPredicates(ids))
        db.exec(`UPDATE records SET isCurrent=0 WHERE isCurrent=1 AND ${predicate}`)
    expect(db.query('SELECT total_changes() AS n').get()).toEqual({ n: before.n + 3 })
    expect(
      db.query('SELECT count(*) AS n FROM records WHERE isCurrent=1').get(),
    ).toEqual({ n: ids.length })
    for (const predicate of missingSourceMembershipPredicates([]))
      db.exec(`UPDATE records SET isCurrent=0 WHERE isCurrent=1 AND ${predicate}`)
    expect(
      db.query('SELECT count(*) AS n FROM records WHERE isCurrent=1').get(),
    ).toEqual({ n: 0 })
  } finally {
    db.close()
  }
})
