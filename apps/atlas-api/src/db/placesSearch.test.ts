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
      CREATE TABLE placeSearchScopes(scopeId TEXT PRIMARY KEY, snapshotId TEXT);
      CREATE TABLE places(snapshotId TEXT,id TEXT,releaseId TEXT);
      INSERT INTO places VALUES ('old','shop','old-release'),('latest','shop','latest-release');
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
    await expect(searchPlacesFts(db, { ...lookup, snapshotId: 'old' })).rejects.toThrow(
      'Place search is not ready',
    )
  } finally {
    sqlite.close()
  }
})
