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
    sqlite.exec(`
      CREATE TABLE divisionPublicationState(scopeId TEXT PRIMARY KEY,snapshotId TEXT,status TEXT,publicationToken TEXT,preparedAt TEXT,updatedAt TEXT);
      INSERT INTO divisionPublicationState VALUES ('division','division','current','token','ready','now');
      CREATE TABLE addressPublicationState(scopeId TEXT PRIMARY KEY,snapshotId TEXT,divisionSnapshotId TEXT,status TEXT,publicationToken TEXT,preparedAt TEXT,updatedAt TEXT);
      INSERT INTO addressPublicationState VALUES ('address','address','division','current','token','ready','now');
    `)
    const lookup = { snapshotId: 'latest', query: 'Shop', locale: 'en' as const }
    await expect(searchPlacesFts(db, lookup)).rejects.toThrow(
      'Place search is not ready',
    )
    sqlite.exec(`
      CREATE TABLE placePublicationState(scopeId TEXT PRIMARY KEY,snapshotId TEXT UNIQUE,divisionSnapshotId TEXT DEFAULT 'division',addressSnapshotId TEXT DEFAULT 'address',supplementaryAddressSnapshotId TEXT,status TEXT,publicationToken TEXT,preparedAt TEXT,updatedAt TEXT);
      INSERT INTO placePublicationState(scopeId,snapshotId,status,publicationToken,preparedAt,updatedAt) VALUES ('physical-places','latest','current','token','2026-01-01','2026-01-01');
      CREATE TABLE placeSearchScopes(scopeId TEXT PRIMARY KEY, snapshotId TEXT);
      CREATE TABLE places(scopeId TEXT,id TEXT,resourceReleaseId TEXT);
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
        resourceReleaseId: 'latest-release',
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

test('filtered search fills pages before limiting and includes previews without detail reads', async () => {
  const sqlite = new Database(':memory:')
  const queries: { query: string; count: number }[] = []
  const db = drizzle({
    client: sqlite,
    logger: {
      logQuery(query, params) {
        queries.push({ query, count: params.length })
      },
    },
  }) as unknown as Parameters<typeof searchPlacesFts>[0]
  try {
    sqlite.exec(`
      CREATE TABLE divisionPublicationState(scopeId TEXT PRIMARY KEY,snapshotId TEXT,status TEXT,publicationToken TEXT,preparedAt TEXT,updatedAt TEXT);
      INSERT INTO divisionPublicationState VALUES ('division','division','current','token','ready','now');
      CREATE TABLE addressPublicationState(scopeId TEXT PRIMARY KEY,snapshotId TEXT,divisionSnapshotId TEXT,status TEXT,publicationToken TEXT,preparedAt TEXT,updatedAt TEXT);
      INSERT INTO addressPublicationState VALUES ('address','address','division','current','token','ready','now');
      CREATE TABLE placePublicationState(scopeId TEXT PRIMARY KEY,snapshotId TEXT UNIQUE,divisionSnapshotId TEXT,addressSnapshotId TEXT,supplementaryAddressSnapshotId TEXT,status TEXT,publicationToken TEXT,preparedAt TEXT,updatedAt TEXT);
      INSERT INTO placePublicationState VALUES ('physical','latest','division','address',NULL,'current','token','ready','now');
      CREATE TABLE placeSearchScopes(scopeId TEXT PRIMARY KEY,snapshotId TEXT);
      INSERT INTO placeSearchScopes VALUES ('search','latest');
      CREATE TABLE places(scopeId TEXT,id TEXT,resourceReleaseId TEXT,geometry TEXT,phones TEXT,basicCategory TEXT,taxonomyPrimary TEXT,taxonomyHierarchy TEXT,taxonomyAlternates TEXT,operatingStatus TEXT, PRIMARY KEY(scopeId,id));
      CREATE TABLE placesI18n(scopeId TEXT,placeId TEXT,locale TEXT,name TEXT,brandName TEXT,freeformAddress TEXT,PRIMARY KEY(scopeId,placeId,locale));
    `)
    sqlite.exec(createSearchFtsSql(placeSearchIndex))
    for (let i = 0; i < 85; i++) {
      const id = `place-${i}`
      const category = i < 40 ? 'bookstore' : 'bakery'
      const status =
        i < 50
          ? 'permanently_closed'
          : i % 3 === 0
            ? null
            : i % 3 === 1
              ? 'unknown'
              : 'open'
      sqlite
        .query('INSERT INTO places VALUES (?,?,?,?,?,?,?,?,?,?)')
        .run(
          'physical',
          id,
          'release',
          JSON.stringify({ type: 'Point', coordinates: [114.15, 22.28] }),
          '["+85223456789"]',
          category,
          category,
          JSON.stringify([
            category === 'bakery' ? 'food_and_drink' : 'shopping',
            category,
          ]),
          '[]',
          status,
        )
      for (const locale of ['en', 'zh-hant']) {
        sqlite
          .query(
            'INSERT INTO placeSearchFts(scopeId,placeId,locale,nameText,addressText) VALUES (?,?,?,?,?)',
          )
          .run('search', id, locale, `Shop ${i}`, 'Sheung Wan')
        sqlite
          .query('INSERT INTO placesI18n VALUES (?,?,?,?,?,?)')
          .run('physical', id, locale, `Shop ${i}`, null, 'Sheung Wan')
      }
    }
    const { searchPlacesFtsPage } = await import('./places')
    const lookup = {
      snapshotId: 'latest',
      query: 'sheung wan',
      locale: 'en',
      limit: 20,
      taxonomyCategory: 'food_and_drink',
      operatingStatus: 'open_or_unknown',
      includePreview: true,
    }
    queries.length = 0
    const first = await searchPlacesFtsPage(db, lookup)
    expect(first.results).toHaveLength(20)
    expect(first.results[0]?.placeId).toBe('place-50')
    expect(
      first.results.every(row => row.preview?.place.taxonomy.primary === 'bakery'),
    ).toBe(true)
    expect(first.results[0]?.preview).toMatchObject({
      place: {
        geometry: { type: 'Point', coordinates: [114.15, 22.28] },
        phones: ['+85223456789'],
      },
      i18n: { en: { freeformAddress: 'Sheung Wan' }, 'zh-hant': { name: 'Shop 50' } },
    })
    expect(
      queries.filter(row => row.query.includes('from "placeSearchFts"')),
    ).toHaveLength(1)
    expect(queries.every(row => row.count < 100)).toBe(true)
    const second = await searchPlacesFtsPage(db, {
      ...lookup,
      cursor: first.nextCursor!,
    })
    expect(second.results).toHaveLength(15)
    expect(second.nextCursor).toBeNull()
    expect(
      new Set([...first.results, ...second.results].map(row => row.placeId)).size,
    ).toBe(35)
    expect(
      await searchPlacesFtsPage(db, { ...lookup, cursor: first.nextCursor! }),
    ).toEqual(second)
    const allLocales = await searchPlacesFtsPage(db, { ...lookup, locale: undefined })
    expect(allLocales.results).toHaveLength(20)
    const remainingLocales = await searchPlacesFtsPage(db, {
      ...lookup,
      locale: undefined,
      cursor: allLocales.nextCursor!,
    })
    expect(remainingLocales.results).toHaveLength(15)
    expect(
      new Set(
        [...allLocales.results, ...remainingLocales.results].map(row => row.placeId),
      ).size,
    ).toBe(35)
    const exact = await searchPlacesFtsPage(db, { ...lookup, operatingStatus: 'open' })
    expect(
      exact.results.every(row => row.preview?.place.operatingStatus === 'open'),
    ).toBe(true)
    expect(
      (await searchPlacesFtsPage(db, { ...lookup, taxonomyPrimary: 'cafe' })).results,
    ).toEqual([])
    expect(
      (await searchPlacesFtsPage(db, { ...lookup, taxonomyCategory: 'bakery' }))
        .results,
    ).toHaveLength(20)
    const noPreview = await searchPlacesFtsPage(db, {
      ...lookup,
      includePreview: false,
    })
    expect(noPreview.results[0]).not.toHaveProperty('preview')
    await expect(
      searchPlacesFtsPage(db, {
        ...lookup,
        cursor: first.nextCursor!,
        taxonomyCategory: 'shopping',
      }),
    ).rejects.toThrow('Place search changed')
    await expect(
      searchPlacesFtsPage(db, { ...lookup, cursor: 'invalid' }),
    ).rejects.toThrow('Place search changed')
    sqlite.exec("UPDATE placePublicationState SET publicationToken='replacement'")
    await expect(
      searchPlacesFtsPage(db, { ...lookup, cursor: first.nextCursor! }),
    ).rejects.toThrow('Place search changed')
  } finally {
    sqlite.close()
  }
})
