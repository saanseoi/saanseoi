import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import {
  lock,
  lockName,
  locales,
  migrate,
  search,
  unlock,
  type Query,
  type Statement,
  type Row,
} from './data'

function fixture(history = true) {
  const db = new Database(':memory:')
  db.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE address2d(id TEXT PRIMARY KEY);
    INSERT INTO address2d VALUES ('a');
    CREATE TABLE address2dI18n(addressId TEXT, ${history ? 'snapshotId TEXT,operation TEXT,versionHash TEXT' : 'scopeId TEXT'},locale TEXT,meta TEXT,formattedAddress TEXT,estateName TEXT,blockTypeBeforeNumber INTEGER,createdAt TEXT);
    CREATE TABLE unrelated(id TEXT);
    INSERT INTO unrelated VALUES ('keep');`)
  const insert = db.query(
    `INSERT INTO address2dI18n VALUES (${Array(history ? 10 : 8)
      .fill('?')
      .join(',')})`,
  )
  for (let i = 0; i < 600; i++) {
    const deleted = history && i % 17 === 0
    insert.run(
      'a',
      `scope-${i}`,
      ...(history ? [deleted ? 'delete' : 'upsert', deleted ? null : `old-${i}`] : []),
      'en',
      JSON.stringify({ fields: { estateName: { origin: 'provided' } } }),
      deleted ? null : 'Main Street',
      deleted ? null : `Premises ${i}`,
      i % 2,
      'original-time',
    )
  }
  const query: Query = async statements =>
    db.transaction(() =>
      statements.map(
        statement =>
          db
            .query(statement.sql)
            .all(
              ...((statement.params ?? []) as Array<string | number | null>),
            ) as Row[],
      ),
    )()
  return { db, query }
}

test('populated CURRENT and HISTORY retain data, reject external writes, rehash every page and resume idempotently', async () => {
  for (const history of [false, true]) {
    const { db, query } = fixture(history)
    const tombstones = history
      ? db.query("SELECT * FROM address2dI18n WHERE operation='delete'").all()
      : []
    await lock(query)
    expect(() => db.exec('DELETE FROM unrelated')).toThrow('writes paused')
    expect(() => db.exec("UPDATE address2dI18n SET estateName='wrong'")).toThrow(
      'writes paused',
    )
    db.exec('ALTER TABLE address2dI18n RENAME COLUMN estateName TO premisesName')
    const result = await migrate(query, history)
    expect(result.count).toBe(600)
    expect(result.changed).toBe(history ? 564 : 600)
    expect((await migrate(query, history)).changed).toBe(0)
    expect(
      db
        .query(
          "SELECT count(*) AS n FROM address2dI18n WHERE createdAt='original-time'",
        )
        .get(),
    ).toEqual({ n: 600 })
    if (history) {
      const after = db
        .query("SELECT * FROM address2dI18n WHERE operation='delete'")
        .all()
      expect(after).toEqual(
        tombstones.map(raw => {
          const { estateName, ...rest } = raw as Record<string, unknown>
          return { ...rest, premisesName: estateName }
        }),
      )
    }
    expect(() => db.exec('DELETE FROM address2d')).toThrow('writes paused')
    await unlock(query)
    db.exec("UPDATE unrelated SET id='unlocked'")
    expect(
      db.query("SELECT name FROM sqlite_master WHERE type='trigger'").all(),
    ).toHaveLength(0)
    db.close()
  }
})

test('a failed D1 batch rolls back changes and restores the UPDATE lock; retry completes', async () => {
  const { db, query } = fixture()
  await lock(query)
  db.exec('ALTER TABLE address2dI18n RENAME COLUMN estateName TO premisesName')
  let failed = false
  const failing: Query = async statements => {
    if (!failed && statements[0]?.sql.startsWith('DROP TRIGGER')) {
      failed = true
      return query([
        ...statements.slice(0, -1),
        { sql: "SELECT json('injected failure')" },
        statements.at(-1)!,
      ])
    }
    return query(statements)
  }
  await expect(migrate(failing, true)).rejects.toThrow()
  expect(db.query('SELECT versionHash FROM address2dI18n WHERE rowid=2').get()).toEqual(
    { versionHash: 'old-1' },
  )
  expect(() =>
    db.exec("UPDATE address2dI18n SET versionHash='bad' WHERE rowid=2"),
  ).toThrow('writes paused')
  expect((await migrate(query, true)).changed).toBe(564)
  db.close()
})

test('stale page detection aborts the entire update batch', async () => {
  const { db, query } = fixture()
  await lock(query)
  db.exec('ALTER TABLE address2dI18n RENAME COLUMN estateName TO premisesName')
  const stale: Query = async statements => {
    if (statements[0]?.sql.startsWith('DROP TRIGGER')) {
      // Simulate an unexpected mutation inside the write batch, before its guard.
      const injected: Statement = {
        sql: "UPDATE address2dI18n SET meta='{}' WHERE rowid=2",
      }
      return query([statements[0], injected, ...statements.slice(1)])
    }
    return query(statements)
  }
  await expect(locales(stale, true, true)).rejects.toThrow()
  expect(db.query('SELECT versionHash FROM address2dI18n WHERE rowid=2').get()).toEqual(
    { versionHash: 'old-1' },
  )
  expect(
    db
      .query('SELECT name FROM sqlite_master WHERE name=?')
      .get(lockName('address2dI18n', 'UPDATE')),
  ).not.toBeNull()
  db.close()
})

test('FTS staging preserves duplicates and rowids, and a failed swap retains the old searchable index', async () => {
  const { db, query } = fixture(false)
  db.exec(`CREATE VIRTUAL TABLE addressSearchFts USING fts5(scopeId UNINDEXED,addressId UNINDEXED,locale UNINDEXED,formattedAddress,buildingName,buildingNumber,blockExpression,phaseExpression,estateName,streetName);
    INSERT INTO addressSearchFts(rowid,scopeId,addressId,locale,estateName) VALUES (5,'s','a','en','Harbour Centre'),(8,'s','a','en','Harbour Centre');`)
  const failing: Query = async statements => {
    if (statements.some(s => s.sql === 'DROP TABLE addressSearchFts'))
      return query([...statements, { sql: "SELECT json('injected failure')" }])
    return query(statements)
  }
  await expect(search(failing)).rejects.toThrow()
  expect(
    db
      .query(
        "SELECT rowid FROM addressSearchFts WHERE addressSearchFts MATCH 'estateName:Harbour'",
      )
      .all(),
  ).toEqual([{ rowid: 5 }, { rowid: 8 }])
  await search(query)
  await search(query)
  expect(
    db
      .query(
        "SELECT rowid FROM addressSearchFts WHERE addressSearchFts MATCH 'premisesName:Harbour'",
      )
      .all(),
  ).toEqual([{ rowid: 5 }, { rowid: 8 }])
  db.close()
})
