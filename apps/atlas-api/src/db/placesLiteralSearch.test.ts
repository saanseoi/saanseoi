import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { createSearchFtsSql } from '@repo/core/pipeline/services/search/incrementalIndex'
import { placeSearchIndex } from '@repo/core/pipeline/services/places/searchIndex'
import { searchPlacesFts } from './places'

test('Place search treats punctuation and FTS operators as literal user input', async () => {
  const sqlite = new Database(':memory:')
  const db = drizzle({ client: sqlite }) as unknown as Parameters<
    typeof searchPlacesFts
  >[0]
  try {
    sqlite.exec(`
      CREATE TABLE divisionPublicationState(scopeId TEXT PRIMARY KEY,snapshotId TEXT,status TEXT,publicationToken TEXT,preparedAt TEXT,updatedAt TEXT);
      INSERT INTO divisionPublicationState VALUES ('division','division','current','token','ready','now');
      CREATE TABLE addressPublicationState(scopeId TEXT PRIMARY KEY,snapshotId TEXT,divisionSnapshotId TEXT,status TEXT,publicationToken TEXT,preparedAt TEXT,updatedAt TEXT);
      INSERT INTO addressPublicationState VALUES ('address','address','division','current','token','ready','now');

      CREATE TABLE placePublicationState(scopeId TEXT PRIMARY KEY,snapshotId TEXT UNIQUE,divisionSnapshotId TEXT DEFAULT 'division',addressSnapshotId TEXT DEFAULT 'address',supplementaryAddressSnapshotId TEXT,status TEXT,publicationToken TEXT,preparedAt TEXT,updatedAt TEXT);
      INSERT INTO placePublicationState(scopeId,snapshotId,status,publicationToken,preparedAt,updatedAt) VALUES ('physical-places','latest','current','token','2026-01-01','2026-01-01');
      CREATE TABLE placeSearchScopes(scopeId TEXT PRIMARY KEY, snapshotId TEXT);
      CREATE TABLE places(scopeId TEXT,id TEXT,resourceReleaseId TEXT);
      INSERT INTO places VALUES ('physical-places','shop','latest-release');
      INSERT INTO placeSearchScopes VALUES ('hk:overture:places','latest');
    `)
    sqlite.exec(createSearchFtsSql(placeSearchIndex))
    sqlite
      .query(
        'INSERT INTO placeSearchFts(scopeId,placeId,locale,nameText) VALUES (?,?,?,?)',
      )
      .run('hk:overture:places', 'shop', 'en', '7-Eleven\u001f7eleven')
    const search = (query: string) =>
      searchPlacesFts(db, {
        snapshotId: 'latest',
        query,
        locale: 'en',
        limit: 20,
      })
    for (const query of ['7-Eleven', '7 Eleven', '"7-Eleven"', '  7-Eleven  ']) {
      expect((await search(query)).map(row => row.placeId)).toEqual(['shop'])
    }
    // Operators must neither broaden the query nor cause parser exceptions.
    for (const query of [
      '7-Eleven OR missing',
      'nameText:missing',
      'NEAR(missing)',
      '"',
      '*',
      '()',
      '',
    ]) {
      expect(await search(query)).toEqual([])
    }
    sqlite.query('UPDATE placeSearchFts SET nameText=?').run('Say "Hello"')
    expect((await search('Say "Hello"')).map(row => row.placeId)).toEqual(['shop'])
  } finally {
    sqlite.close()
  }
})
