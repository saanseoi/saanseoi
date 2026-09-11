import { expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { buildAddressSearchSyncSql } from './searchIndex'

function fixture() {
  const db = new Database(':memory:')
  db.exec(`CREATE TABLE addressSearchScopes(scopeId TEXT PRIMARY KEY, snapshotId TEXT NOT NULL);
    CREATE TABLE address2dI18n(snapshotId TEXT, addressId TEXT, locale TEXT,
      formattedAddress TEXT, buildingName TEXT, buildingNumberExpression TEXT,
      buildingNumberFrom TEXT, buildingNumberTo TEXT, blockExpression TEXT,
      phaseExpression TEXT, estateName TEXT, streetName TEXT,
      PRIMARY KEY(snapshotId,addressId,locale));`)
  const add = (snapshot: string, id: string, text: string) =>
    db
      .query(
        'INSERT INTO address2dI18n(snapshotId,addressId,locale,formattedAddress) VALUES(?,?,?,?)',
      )
      .run(snapshot, id, 'en', text)
  const sync = (snapshot: string, fail = false) =>
    db.transaction(() => {
      for (const sql of buildAddressSearchSyncSql([
        { scopeId: 'hk:als', snapshotId: snapshot },
      ]))
        db.exec(sql)
      if (fail) throw new Error('injected failure')
    })()
  const rows = () =>
    db
      .query(
        'SELECT rowid,addressId,formattedAddress FROM addressSearchFts ORDER BY addressId',
      )
      .all()
  return { db, add, sync, rows }
}

test('snapshot promotion preserves unchanged FTS rowids; repeated sync writes nothing', () => {
  const { db, add, sync, rows } = fixture()
  try {
    add('old', 'a', 'Harbour Road')
    add('latest', 'a', 'Harbour Road')
    sync('old')
    const before = rows()
    sync('latest')
    expect(rows()).toEqual(before)
    expect(db.query('SELECT snapshotId FROM addressSearchScopes').get()).toEqual({
      snapshotId: 'latest',
    })
    const changes = () => db.query('SELECT total_changes() AS n').get()
    const baseline = changes()
    sync('latest')
    expect(changes()).toEqual(baseline)
  } finally {
    db.close()
  }
})

test('only selected content survives, changes and additions are indexed, rollback preserves old search', () => {
  const { db, add, sync, rows } = fixture()
  try {
    add('old', 'a', 'Old Road')
    add('old', 'b', 'Removed Road')
    add('latest', 'a', 'New Road')
    add('latest', 'c', 'Added Road')
    add('future-draft', 'd', 'Unpublished Road')
    sync('old')
    const before = rows()
    expect(() => sync('latest', true)).toThrow('injected failure')
    expect(rows()).toEqual(before)
    expect(db.query('SELECT snapshotId FROM addressSearchScopes').get()).toEqual({
      snapshotId: 'old',
    })
    sync('latest')
    expect(rows().map(row => (row as { addressId: string }).addressId)).toEqual([
      'a',
      'c',
    ])
    expect(
      db
        .query(
          "SELECT addressId FROM addressSearchFts WHERE addressSearchFts MATCH 'New'",
        )
        .all(),
    ).toEqual([{ addressId: 'a' }])
  } finally {
    db.close()
  }
})

test('scope conflicts fail before SQL generation', () => {
  expect(() =>
    buildAddressSearchSyncSql([
      { scopeId: 'als', snapshotId: 'one' },
      { scopeId: 'als', snapshotId: 'two' },
    ]),
  ).toThrow('Conflicting')
  expect(buildAddressSearchSyncSql([])).toEqual([])
})

test('first finalisation retires the snapshot index only on a successful commit', () => {
  const { db, add, sync } = fixture()
  try {
    db.exec(
      "CREATE VIRTUAL TABLE addressesFts USING fts5(text); INSERT INTO addressesFts VALUES('Retained search')",
    )
    add('new', 'a', 'New Road')
    expect(() => sync('new', true)).toThrow('injected failure')
    expect(db.query('SELECT text FROM addressesFts').all()).toEqual([
      { text: 'Retained search' },
    ])
    sync('new')
    expect(
      db.query("SELECT name FROM sqlite_master WHERE name='addressesFts'").all(),
    ).toEqual([])
  } finally {
    db.close()
  }
})

test('independent scopes retain distinct content and removing a scope deletes only its documents', () => {
  const { db, add } = fixture()
  try {
    add('als-snapshot', 'shared-id', 'Official Road')
    add('other-snapshot', 'shared-id', 'Supplementary Road')
    const apply = (scopes: Parameters<typeof buildAddressSearchSyncSql>[0]) =>
      db.transaction(() => {
        for (const sql of buildAddressSearchSyncSql(scopes)) db.exec(sql)
      })()
    apply([
      { scopeId: 'als', snapshotId: 'als-snapshot' },
      { scopeId: 'other', snapshotId: 'other-snapshot' },
    ])
    expect(db.query('SELECT count(*) AS n FROM addressSearchFts').get()).toEqual({
      n: 2,
    })
    const before = db
      .query("SELECT rowid FROM addressSearchFts WHERE scopeId='als'")
      .get()
    apply([{ scopeId: 'als', snapshotId: 'als-snapshot' }])
    expect(db.query('SELECT rowid FROM addressSearchFts').get()).toEqual(before)
    expect(db.query('SELECT scopeId FROM addressSearchScopes').all()).toEqual([
      { scopeId: 'als' },
    ])
  } finally {
    db.close()
  }
})
