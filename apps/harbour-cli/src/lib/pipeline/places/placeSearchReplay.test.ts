import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

test('Places search indexes only the selected unit of an Address3D collection', () => {
  const db = new Database(':memory:')
  try {
    db.exec(`
      CREATE TABLE placeSearchScopes(scopeId TEXT PRIMARY KEY, snapshotId TEXT);
      INSERT INTO placeSearchScopes VALUES ('hk:overture:places', 'p');
      CREATE TABLE places(snapshotId, id, addressSnapshotId, address2dId, address3dId, address3dUnitId, basicCategory, taxonomyPrimary, taxonomyHierarchy);
      CREATE TABLE placesI18n(snapshotId, placeId, locale, name, nameAlts, brandName, brandNameAlts);
      CREATE TABLE address2dI18n(snapshotId, addressId, locale, formattedAddress);
      CREATE TABLE address3dI18n(snapshotId, address3dId, locale, units);
      CREATE TABLE streetsAddress(addressSnapshotId, addressId, streetSnapshotId, streetId);
      CREATE TABLE streetsI18n(snapshotId, streetId, locale, name);
      CREATE TABLE placesDivision(placeSnapshotId, placeId, divisionSnapshotId, divisionId);
      CREATE TABLE divisionsI18n(snapshotId, divisionId, locale, name);
      INSERT INTO places VALUES ('p', 'shop', 'a', 'building', 'collection', 'chosen', '', '', '');
      INSERT INTO placesI18n VALUES ('p', 'shop', 'en', 'Shop', '', '', '');
      INSERT INTO address2dI18n VALUES ('a', 'building', 'en', 'Main Street');
    `)
    db.query('INSERT INTO address3dI18n VALUES (?, ?, ?, ?)').run(
      'a',
      'collection',
      'en',
      JSON.stringify({
        chosen: { unitExpression: 'Unit 12', floorExpression: 'Floor 3' },
        neighbour: { unitExpression: 'Unit 99', floorExpression: 'Floor 8' },
      }),
    )
    const sql = readFileSync(
      resolve(
        import.meta.dir,
        '../../../../../../libs/db/scripts/sql/rebuild-places-fts.sql',
      ),
      'utf8',
    )
    db.exec(sql)
    expect(db.query('SELECT addressText FROM placeSearchFts').get()).toEqual({
      addressText: 'Main Street Unit 12 Floor 3',
    })
    db.exec('UPDATE places SET address3dUnitId = NULL')
    db.exec(sql)
    expect(db.query('SELECT addressText FROM placeSearchFts').get()).toEqual({
      addressText: 'Main Street',
    })
    db.exec("UPDATE places SET address3dUnitId = 'chosen'")
    db.query('UPDATE address3dI18n SET units = ?').run(
      JSON.stringify({
        chosen: {
          formattedAddressPart: 'Special suite',
          unitExpression: '',
          floorExpression: '',
        },
      }),
    )
    db.exec(sql)
    expect(db.query('SELECT addressText FROM placeSearchFts').get()).toEqual({
      addressText: 'Main Street Special suite',
    })
  } finally {
    db.close()
  }
})
