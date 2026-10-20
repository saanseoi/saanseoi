import { expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { addressHash, repairGranularities } from './repair'
import type { Query, Row } from './database'

test('repairs current and history scope while preserving display/identity and recomputing ingestion hashes', async () => {
  for (const history of [false, true]) {
    const db = new Database(':memory:')
    db.exec(
      `CREATE TABLE address2d (id TEXT, granularity TEXT, geometry TEXT, identifiers TEXT, sources TEXT, createdAt TEXT${history ? ', snapshotId TEXT,operation TEXT,versionHash TEXT' : ',scopeId TEXT'});`,
    )
    const rows = history
      ? [
          ['a', 'room', '{}', '{}', '{}', 'original', 's', 'upsert', 'old'],
          ['b', 'room_part', '{}', '{}', '{}', 'original', 's', 'upsert', 'old'],
          ['c', null, null, null, null, 'original', 's', 'delete', null],
        ]
      : [
          ['a', 'room', '{}', '{}', '{}', 'original', 's'],
          ['b', 'room_part', '{}', '{}', '{}', 'original', 's'],
        ]
    for (const row of rows)
      db.query(`INSERT INTO address2d VALUES (${row.map(() => '?').join(',')})`).run(
        ...row,
      )
    const query: Query = async statements =>
      db.transaction(() =>
        statements.map(s =>
          db.query<Row, never[]>(s.sql).all(...((s.params ?? []) as never[])),
        ),
      )()
    expect(await repairGranularities(query, false)).toBe(2)
    expect(await repairGranularities(query, true)).toBe(2)
    expect(await repairGranularities(query, true)).toBe(0)
    const result = db.query('SELECT * FROM address2d ORDER BY id').all() as any[]
    expect(result.map(r => r.granularity)).toEqual(
      history ? ['unit', 'unit_portion', null] : ['unit', 'unit_portion'],
    )
    expect(result.every(r => r.createdAt === 'original')).toBe(true)
    if (history) {
      expect(result[0].versionHash).toBe(await addressHash(result[0]))
      expect(result[2].versionHash).toBeNull()
    }
    db.close()
  }
})
