import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { createSearchFtsSql } from '@repo/core/pipeline/services/search/incrementalIndex'
import { placeSearchIndex } from '@repo/core/pipeline/services/places/searchIndex'
import { searchPlacesFts } from './places'

test('Place search follows scope promotion and refuses an unindexed snapshot', async () => {
  const sqlite = new Database(':memory:')
  try {
    const db = drizzle({ client: sqlite }) as unknown as Parameters<
      typeof searchPlacesFts
    >[0]
    const lookup = { snapshotId: 'latest', query: 'Shop', locale: 'en' as const }
    await expect(searchPlacesFts(db, lookup)).rejects.toThrow(
      'Place search is not ready',
    )
    sqlite.exec(`
      CREATE TABLE placePublicationState(scopeId TEXT PRIMARY KEY,snapshotId TEXT UNIQUE,status TEXT,publicationToken TEXT,preparedAt TEXT,updatedAt TEXT);
      INSERT INTO placePublicationState VALUES ('physical-places','latest','current','token','2026-01-01','2026-01-01');
      CREATE TABLE placeSearchScopes(scopeId TEXT PRIMARY KEY, snapshotId TEXT);
      CREATE TABLE places(snapshotId TEXT,id TEXT,releaseId TEXT);
      INSERT INTO places VALUES ('physical-places','shop','latest-release');
      INSERT INTO placeSearchScopes VALUES ('hk:overture:places','old');
    `)
    sqlite.exec(createSearchFtsSql(placeSearchIndex))
    sqlite.exec(
      "INSERT INTO placeSearchFts(scopeId,placeId,locale,nameText) VALUES ('hk:overture:places','shop','en','Shop')",
    )
    await expect(searchPlacesFts(db, lookup)).rejects.toThrow(
      'Place search is not ready',
    )
    sqlite.exec("UPDATE placeSearchScopes SET snapshotId='latest'")
    expect(await searchPlacesFts(db, lookup)).toEqual([
      {
        placeId: 'shop',
        releaseId: 'latest-release',
        locale: 'en',
        nameText: 'Shop',
        brandText: null,
      },
    ])
    const physicalRows = sqlite.query('SELECT rowid,* FROM places').all()
    const searchRows = sqlite.query('SELECT rowid,* FROM placeSearchFts').all()
    sqlite.exec(
      "UPDATE placePublicationState SET snapshotId='next',publicationToken='next-token'",
    )
    await expect(searchPlacesFts(db, lookup)).rejects.toThrow(
      'Place search is not ready',
    )
    await expect(
      searchPlacesFts(db, { ...lookup, snapshotId: 'next' }),
    ).rejects.toThrow('Place search is not ready')
    sqlite.exec("UPDATE placeSearchScopes SET snapshotId='next'")
    expect(await searchPlacesFts(db, { ...lookup, snapshotId: 'next' })).toHaveLength(1)
    expect(sqlite.query('SELECT rowid,* FROM places').all()).toEqual(physicalRows)
    expect(sqlite.query('SELECT rowid,* FROM placeSearchFts').all()).toEqual(searchRows)
    sqlite.exec(
      "UPDATE placePublicationState SET snapshotId='latest'; UPDATE placeSearchScopes SET snapshotId='latest'",
    )
    let switched = false
    const interruptedDb = drizzle({
      client: sqlite,
      logger: {
        logQuery(query) {
          if (!switched && query.includes('from "placeSearchFts"')) {
            switched = true
            sqlite.exec("UPDATE placeSearchScopes SET snapshotId='old'")
          }
        },
      },
    })
    await expect(searchPlacesFts(interruptedDb as never, lookup)).rejects.toThrow(
      'Place search is not ready',
    )
    expect(switched).toBe(true)
    sqlite.exec("UPDATE placeSearchScopes SET snapshotId='latest'")
    sqlite.exec("UPDATE placePublicationState SET status='publishing'")
    await expect(searchPlacesFts(db, lookup)).rejects.toThrow(
      'Place search is not ready',
    )
    await expect(searchPlacesFts(db, { ...lookup, snapshotId: 'old' })).rejects.toThrow(
      'Place search is not ready',
    )
  } finally {
    sqlite.close()
  }
})
