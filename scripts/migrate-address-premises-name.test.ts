import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { planAddressPremisesMigration } from './migrate-address-premises-name'
import { buildAddressI18nHashInput } from '../libs/core/src/pipeline/services/addresses/normalisation'
import { createHash } from '../libs/core/src/pipeline/utils'

test('rename rehashes locale events in place, preserves identities and tombstones, and is repeatable', async () => {
  const db = new Database(':memory:')
  db.exec(`CREATE TABLE address2dI18n (addressId TEXT, snapshotId TEXT, locale TEXT, operation TEXT, versionHash TEXT, createdAt TEXT, formattedAddress TEXT, estateName TEXT, blockTypeBeforeNumber INTEGER);
    INSERT INTO address2dI18n VALUES ('a','s1','en','upsert','old','then','18 Road','Premises',0), ('b','s2','en','upsert','old2','then','Road',NULL,NULL), ('a','s3','en','delete',NULL,'later',NULL,NULL,NULL);`)
  const plan = await planAddressPremisesMigration(db)
  expect(plan.hashes).toBe(2)
  db.exec('ALTER TABLE address2dI18n RENAME COLUMN estateName TO premisesName')
  plan.statements.forEach(statement => {
    db.exec(statement)
  })
  const rows = db
    .query('SELECT * FROM address2dI18n ORDER BY snapshotId')
    .all() as Array<Record<string, unknown>>
  expect(
    rows.map(row => [row.addressId, row.snapshotId, row.createdAt, row.operation]),
  ).toEqual([
    ['a', 's1', 'then', 'upsert'],
    ['b', 's2', 'then', 'upsert'],
    ['a', 's3', 'later', 'delete'],
  ])
  expect(rows[0]!.versionHash).toBe(
    await createHash(
      buildAddressI18nHashInput({
        addressId: 'a',
        locale: 'en',
        formattedAddress: '18 Road',
        premisesName: 'Premises',
        blockTypeBeforeNumber: false,
      }),
    ),
  )
  expect(rows[2]!.versionHash).toBeNull()
  expect((await planAddressPremisesMigration(db)).hashes).toBe(0)
  db.close()
})

test('rebuilds the virtual search table without losing searchable rows', async () => {
  const db = new Database(':memory:')
  db.exec(`CREATE TABLE address2dI18n (premisesName TEXT);
    CREATE VIRTUAL TABLE addressSearchFts USING fts5(scopeId UNINDEXED,addressId UNINDEXED,locale UNINDEXED,formattedAddress,buildingName,buildingNumber,blockExpression,phaseExpression,estateName,streetName);
    INSERT INTO addressSearchFts VALUES ('scope','a','en','A',NULL,NULL,NULL,NULL,'Harbour Centre',NULL);`)
  const plan = await planAddressPremisesMigration(db)
  expect(plan.searchRows).toBe(1)
  plan.statements.forEach(statement => {
    db.exec(statement)
  })
  expect(
    db
      .query(
        "SELECT addressId FROM addressSearchFts WHERE addressSearchFts MATCH 'premisesName:Harbour'",
      )
      .all(),
  ).toEqual([{ addressId: 'a' }])
  expect((await planAddressPremisesMigration(db)).searchRows).toBe(0)
  db.close()
})

test('refuses to overwrite hashes changed after planning', async () => {
  const db = new Database(':memory:')
  db.exec(`CREATE TABLE address2dI18n (addressId TEXT,snapshotId TEXT,locale TEXT,operation TEXT,versionHash TEXT,formattedAddress TEXT,premisesName TEXT);
    INSERT INTO address2dI18n VALUES ('a','s','en','upsert','old','A',NULL);`)
  const plan = await planAddressPremisesMigration(db)
  db.exec("UPDATE address2dI18n SET versionHash='newer'")
  expect(() =>
    plan.statements.forEach(statement => {
      db.exec(statement)
    }),
  ).toThrow()
  db.exec('ROLLBACK')
  expect(db.query('SELECT versionHash FROM address2dI18n').get()).toEqual({
    versionHash: 'newer',
  })
  db.close()
})

test('renames translated-field provenance in CURRENT and hashes parsed HISTORY metadata', async () => {
  for (const history of [false, true]) {
    const db = new Database(':memory:')
    db.exec(
      `CREATE TABLE address2dI18n (addressId TEXT, ${history ? 'snapshotId TEXT, operation TEXT, versionHash TEXT' : 'scopeId TEXT'}, locale TEXT, formattedAddress TEXT, premisesName TEXT, meta TEXT)`,
    )
    const meta = JSON.stringify({ fields: { estateName: { origin: 'provided' } } })
    if (history)
      db.query('INSERT INTO address2dI18n VALUES (?,?,?,?,?,?,?,?)').run(
        'a',
        's',
        'upsert',
        'old',
        'en',
        'A',
        'Premises',
        meta,
      )
    else
      db.query('INSERT INTO address2dI18n VALUES (?,?,?,?,?,?)').run(
        'a',
        'scope',
        'en',
        'A',
        'Premises',
        meta,
      )
    const plan = await planAddressPremisesMigration(db)
    expect(plan.metadataRows).toBe(1)
    plan.statements.forEach(statement => {
      db.exec(statement)
    })
    expect(
      JSON.parse(
        (db.query('SELECT meta FROM address2dI18n').get() as { meta: string }).meta,
      ),
    ).toEqual({ fields: { premisesName: { origin: 'provided' } } })
    const rerun = await planAddressPremisesMigration(db)
    expect(rerun.hashes + rerun.metadataRows).toBe(0)
    db.close()
  }
})
