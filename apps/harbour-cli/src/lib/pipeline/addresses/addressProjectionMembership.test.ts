import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import type { AlsMembership } from '../../sources/hkgov/dpo/hkgovAlsMembership.ts'
import { assertAddressProjectionMembership } from './addressProjectionMembership.ts'

test('the final canonical inventory must match reviewed identities, parents, owners and units', () => {
  const db = new Database(':memory:')
  const address = (id: string, parentId: string | null = null) => ({
    id,
    parentId,
    level: 'building',
    en: id,
    zhHant: null,
    coordinates: null,
    sourceIds: [],
    curations: [],
  })
  const membership: AlsMembership = {
    schemaVersion: 1,
    sourceVersion: '2026-01-01.0',
    sources: [],
    aliases: [],
    addresses: [address('a'), address('b'), address('section', 'a')],
    collections: [
      {
        id: 'inventory',
        ownerId: 'a',
        unresolvedSectionIds: ['section'],
        sourceIds: [],
        units: [['unit', '1', 'A', '1/F A', '']],
      },
    ],
  }
  try {
    db.exec(`CREATE TABLE address2d(snapshotId TEXT,id TEXT,parentAddressId TEXT,granularity TEXT);
      CREATE TABLE address3d(snapshotId TEXT,id TEXT,address2dId TEXT,units TEXT,unresolvedSectionIds TEXT);
      INSERT INTO address2d VALUES('scope','a',NULL,'building'),('scope','b',NULL,'building'),('scope','section','a','building'),('other','unrelated',NULL,'building');
      INSERT INTO address3d VALUES('scope','inventory','a','[{"id":"unit"}]','["section"]');`)
    expect(() =>
      assertAddressProjectionMembership(db, 'scope', membership),
    ).not.toThrow()
    for (const sql of [
      "UPDATE address2d SET id='unexpected' WHERE id='b'",
      "UPDATE address2d SET parentAddressId='b' WHERE id='section'",
      "UPDATE address2d SET granularity='site' WHERE id='a'",
      "UPDATE address3d SET address2dId='b'",
      `UPDATE address3d SET units='[{"id":"replacement"}]'`,
      `UPDATE address3d SET units='[{"id":"unit"},{"id":"unit"}]'`,
      `UPDATE address3d SET unresolvedSectionIds='[]'`,
    ]) {
      db.exec('BEGIN')
      try {
        db.exec(sql)
        expect(() =>
          assertAddressProjectionMembership(db, 'scope', membership),
        ).toThrow('reviewed canonical membership')
      } finally {
        db.exec('ROLLBACK')
      }
    }
  } finally {
    db.close()
  }
})
