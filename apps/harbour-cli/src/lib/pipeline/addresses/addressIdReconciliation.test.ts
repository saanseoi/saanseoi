import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import {
  planAddressIdReconciliation,
  reconcileAddressIdCopy,
} from './addressIdReconciliation'

test('reconciles canonical links and replay membership without changing publisher or audit assertions', () => {
  const db = new Database(':memory:')
  db.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE address2d(id TEXT PRIMARY KEY,parentAddressId TEXT REFERENCES address2d(id));
    CREATE TABLE address3d(id TEXT PRIMARY KEY,address2dId TEXT REFERENCES address2d(id));
    CREATE TABLE address2dI18n(addressId TEXT REFERENCES address2d(id),locale TEXT);
    CREATE TABLE places(id TEXT,address2dId TEXT,address3dId TEXT);
    CREATE VIEW historyEvents AS SELECT 'address2d' AS recordType,id AS recordId FROM address2d WHERE parentAddressId IS NOT NULL;
    CREATE TABLE sourceResolutions(resolutions TEXT);
    CREATE TABLE publisher(properties TEXT);
    INSERT INTO address2d VALUES('parent',NULL),('child','parent');
    INSERT INTO address3d VALUES('collection','child');
    INSERT INTO address2dI18n VALUES('child','en');
    INSERT INTO places VALUES('place','child','collection');
    INSERT INTO sourceResolutions VALUES('{"entities":{"address2d":["child"],"address3d":["collection"]},"decisions":[{"originalId":"child"}]}');
    INSERT INTO publisher VALUES('{"addressId":"child"}');`)
  try {
    const mapping = planAddressIdReconciliation([db])
    reconcileAddressIdCopy(db, mapping)
    expect(db.query('SELECT * FROM places').get()).toEqual({
      id: 'place',
      address2dId: 'ss-child',
      address3dId: 'ss-collection',
    })
    expect(db.query('SELECT * FROM address2d WHERE id=?').get('ss-child')).toEqual({
      id: 'ss-child',
      parentAddressId: 'ss-parent',
    })
    expect(db.query('SELECT recordId FROM historyEvents').get()).toEqual({
      recordId: 'ss-child',
    })
    expect(
      JSON.parse(
        (
          db.query('SELECT resolutions FROM sourceResolutions').get() as {
            resolutions: string
          }
        ).resolutions,
      ),
    ).toEqual({
      entities: { address2d: ['ss-child'], address3d: ['ss-collection'] },
      decisions: [{ originalId: 'child' }],
    })
    expect(db.query('SELECT properties FROM publisher').get()).toEqual({
      properties: '{"addressId":"child"}',
    })
    expect(planAddressIdReconciliation([db]).address2d.size).toBe(0)
    db.exec("INSERT INTO address2d VALUES('child',NULL)")
    expect(() => planAddressIdReconciliation([db])).toThrow('Ambiguous')
  } finally {
    db.close()
  }
})
