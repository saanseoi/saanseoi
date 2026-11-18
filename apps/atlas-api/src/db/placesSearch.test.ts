import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { createSearchFtsSql } from '@repo/core/pipeline/services/search/incrementalIndex'
import {
  placeSearchIndex,
  buildPlaceSearchTrigramUpgradeSql,
} from '@repo/core/pipeline/services/places/searchIndex'
import { searchPlacesFts, searchPlacesFtsPage } from './places'
import { withGeographicFilters } from '../lib/geographicFilterContext'

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
      INSERT INTO places VALUES ('physical-places','shop','latest-release'), ('physical-places','punctuated-shop','latest-release');
      INSERT INTO placeSearchScopes VALUES ('hk:overture:places','old');
    `)
    sqlite.exec(createSearchFtsSql({ ...placeSearchIndex, tokenizer: undefined }))
    await expect(searchPlacesFts(db, lookup)).rejects.toThrow(
      'Place search is not ready',
    )
    sqlite.exec('DROP TABLE placeSearchFts')
    sqlite.exec(createSearchFtsSql(placeSearchIndex))
    sqlite.exec(`
      INSERT INTO placeSearchFts(scopeId,placeId,locale,nameText) VALUES
        ('hk:overture:places','shop','en','Shop'),
        ('hk:overture:places','punctuated-shop','en','M.Art Cafe' || char(31) || 'mart cafe')
    `)
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
    expect(await searchPlacesFts(db, { ...lookup, query: 'M.Art' })).toEqual([
      {
        placeId: 'punctuated-shop',
        resourceReleaseId: 'latest-release',
        locale: 'en',
        nameText: 'M.Art Cafe',
        brandText: null,
      },
    ])
    // Excluded early hits must not consume the requested result limit.
    sqlite.exec(`ALTER TABLE places ADD COLUMN basicCategory TEXT;
      ALTER TABLE places ADD COLUMN taxonomyPrimary TEXT;
      ALTER TABLE places ADD COLUMN operatingStatus TEXT;
      UPDATE places SET basicCategory='cafe',taxonomyPrimary='cafe',operatingStatus='open';
      INSERT INTO places VALUES ('physical-places','late-shop','latest-release','restaurant','japanese_restaurant','temporarily_closed');
      INSERT INTO placeSearchFts(scopeId,placeId,locale,nameText) VALUES ('hk:overture:places','late-shop','en','Shop Japanese')`)
    expect(
      (
        await searchPlacesFts(db, {
          ...lookup,
          limit: 1,
          basicCategory: 'restaurant',
          taxonomyPrimary: 'japanese_restaurant',
          operatingStatus: 'temporarily_closed',
        })
      ).map(row => row.placeId),
    ).toEqual(['late-shop'])
    expect(
      await searchPlacesFts(db, {
        ...lookup,
        taxonomyPrimary: 'japanese_restaurant',
        operatingStatus: 'open',
      }),
    ).toEqual([])
    sqlite.exec(
      "DELETE FROM places WHERE id='late-shop'; DELETE FROM placeSearchFts WHERE placeId='late-shop'",
    )
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

test('Place search matches literal fragments, prioritises names and keeps filters before the cap', async () => {
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
      CREATE TABLE placePublicationState(scopeId TEXT PRIMARY KEY,snapshotId TEXT UNIQUE,divisionSnapshotId TEXT,addressSnapshotId TEXT,supplementaryAddressSnapshotId TEXT,status TEXT,publicationToken TEXT,preparedAt TEXT,updatedAt TEXT);
      INSERT INTO placePublicationState VALUES ('physical','latest','division','address',NULL,'current','token','ready','now');
      CREATE TABLE placeSearchScopes(scopeId TEXT PRIMARY KEY,snapshotId TEXT);
      INSERT INTO placeSearchScopes VALUES ('hk:places','latest');
      CREATE TABLE places(scopeId TEXT,id TEXT,resourceReleaseId TEXT,basicCategory TEXT,taxonomyPrimary TEXT,operatingStatus TEXT);
    `)
    sqlite.exec(createSearchFtsSql(placeSearchIndex))
    const insert = (
      id: string,
      name: string | null,
      brand: string | null,
      address: string,
      category = 'bakery',
      locale = 'en',
    ) => {
      sqlite
        .query(
          'INSERT INTO places(scopeId,id,resourceReleaseId,basicCategory,taxonomyPrimary,operatingStatus) VALUES (?, ?, ?, ?, ?, ?)',
        )
        .run('physical', id, 'release', category, category, 'open')
      sqlite
        .query(
          'INSERT INTO placeSearchFts(scopeId,placeId,locale,nameText,brandText,addressText,taxonomyText) VALUES (?, ?, ?, ?, ?, ?, ?)',
        )
        .run('hk:places', id, locale, name, brand, address, category)
    }
    // Earlier address-only hits cannot consume the name result budget.
    insert('context', 'Flora Cafe', null, 'Maxim Road')
    insert('maxim', "Maxim's Cakes\u001fmaxims cakes", null, 'Flora Plaza')
    insert('brand', null, 'LEGO', 'Times Square', 'toy_store')
    insert('chinese', '美心西餅', null, '花都廣場', 'bakery', 'zh-hant')
    const search = (query: string, options: Record<string, unknown> = {}) =>
      searchPlacesFts(db, {
        snapshotId: 'latest',
        query,
        locale: 'en',
        limit: 20,
        ...options,
      })
    for (const query of [
      'a',
      'ax',
      'axim',
      'cake',
      'AXIM',
      'ＡＸＩＭ',
      "maxim's",
      'maxim ca',
      'ca maxim',
    ]) {
      expect((await search(query)).map(row => row.placeId)).toContain('maxim')
    }
    expect((await search('maxim', { limit: 1 })).map(row => row.placeId)).toEqual([
      'maxim',
    ])
    expect((await search('maxim')).map(row => row.placeId)).toEqual([
      'maxim',
      'context',
    ])
    expect((await search('ego')).map(row => row.placeId)).toEqual(['brand'])
    expect((await search('bak')).map(row => row.placeId)).toContain('maxim')
    expect((await search('心', { locale: 'zh-hant' })).map(row => row.placeId)).toEqual(
      ['chinese'],
    )
    expect(await search('心')).toEqual([])
    expect(await search('maxim', { basicCategory: 'toy_store' })).toEqual([])
    expect(await search('maxim', { operatingStatus: 'permanently_closed' })).toEqual([])
    expect(await search('no-such-store')).toEqual([])
    expect(await search('"*%_()')).toEqual([])
    expect(await search('maxim OR lego')).toEqual([])
    const parameterCounts: number[] = []
    const parameterDb = drizzle({
      client: sqlite,
      logger: {
        logQuery(_query, params) {
          parameterCounts.push(params.length)
        },
      },
    }) as unknown as Parameters<typeof searchPlacesFts>[0]
    await searchPlacesFts(parameterDb, {
      snapshotId: 'latest',
      query: Array.from({ length: 80 }, (_, i) =>
        String.fromCodePoint(0x4e00 + i),
      ).join(' '),
    })
    expect(Math.max(...parameterCounts)).toBeLessThan(20)

    expect((await search('maxim'))[0]?.nameText).toBe("Maxim's Cakes")
    // Continuation crosses the name/context boundary without omitting earlier context rows.
    insert('maxim-two', 'Maxim Bakery', null, 'Market Street')
    insert('context-two', 'Other Cafe', null, 'Maxim Road')
    const lookup = { snapshotId: 'latest', query: 'maxim', locale: 'en', limit: 1 }
    const first = await searchPlacesFtsPage(db, lookup)
    expect(first.results.map(row => row.placeId)).toEqual(['maxim'])
    expect(first.nextCursor).not.toBeNull()
    const next = await searchPlacesFtsPage(db, { ...lookup, cursor: first.nextCursor! })
    expect(next.results.map(row => row.placeId)).toEqual(['maxim-two'])
    expect(
      await searchPlacesFtsPage(db, { ...lookup, cursor: first.nextCursor! }),
    ).toEqual(next)
    const context = await searchPlacesFtsPage(db, {
      ...lookup,
      cursor: next.nextCursor!,
      limit: 2,
    })
    expect(context.results.map(row => row.placeId)).toEqual(['context', 'context-two'])
    expect(context.nextCursor).toBeNull()
    await expect(
      searchPlacesFtsPage(db, {
        ...lookup,
        cursor: first.nextCursor!,
        taxonomyPrimary: 'cafe',
      }),
    ).rejects.toThrow('Place search changed')
    await expect(
      searchPlacesFtsPage(db, { ...lookup, cursor: 'invalid' }),
    ).rejects.toThrow('Place search changed')
    // Resolved geographic membership is part of the cursor, even when the text is unchanged.
    await expect(
      withGeographicFilters(
        { releaseSet: 'places-release', groups: [new Set(['district-central'])] },
        () => searchPlacesFtsPage(db, { ...lookup, cursor: first.nextCursor! }),
      ),
    ).rejects.toThrow('Place search changed')
    // Radius filtering precedes page limits, including matches after a full scan batch.
    sqlite.exec('ALTER TABLE places ADD COLUMN geometry TEXT')
    sqlite.exec(`UPDATE places SET geometry='{"type":"Point","coordinates":[115,22]}'`)
    for (let i = 0; i < 105; i++) insert(`far-${i}`, 'Maxim Far', null, 'Remote Street')
    sqlite.exec(
      `UPDATE places SET geometry='{"type":"Point","coordinates":[115,22.28]}' WHERE id LIKE 'far-%'`,
    )
    insert('near-late', 'Maxim Nearby', null, 'Nearby Street')
    sqlite.exec(
      `UPDATE places SET geometry='{"type":"Point","coordinates":[114.15,22.28]}' WHERE id IN ('maxim-two','near-late')`,
    )
    const nearby = { ...lookup, nearLat: 22.28, nearLng: 114.15, maxDistance: 300 }
    const nearFirst = await searchPlacesFtsPage(db, nearby)
    expect(nearFirst.results.map(row => row.placeId)).toEqual(['maxim-two'])
    const nearLast = await searchPlacesFtsPage(db, {
      ...nearby,
      cursor: nearFirst.nextCursor!,
    })
    expect(nearLast.results.map(row => row.placeId)).toEqual(['near-late'])
    expect(nearLast.nextCursor).toBeNull()
    await expect(
      searchPlacesFtsPage(db, {
        ...nearby,
        maxDistance: 500,
        cursor: nearFirst.nextCursor!,
      }),
    ).rejects.toThrow('Place search changed')
    sqlite.exec("UPDATE placePublicationState SET publicationToken='replacement'")
    await expect(
      searchPlacesFtsPage(db, { ...lookup, cursor: first.nextCursor! }),
    ).rejects.toThrow('Place search changed')
  } finally {
    sqlite.close()
  }
})

test('Place trigram upgrade preserves search evidence and rolls back atomically', () => {
  const sqlite = new Database(':memory:')
  try {
    sqlite.exec(createSearchFtsSql({ ...placeSearchIndex, tokenizer: undefined }))
    sqlite.exec(`INSERT INTO placeSearchFts(scopeId,placeId,locale,nameText,addressText) VALUES
      ('scope','maxim','en','Maxim''s Cakes','Flora Plaza'),
      ('scope','punctuation','en','M.Art Cafe' || char(31) || 'mart cafe','Main Street')`)
    const original = sqlite.query('select rowid,* from placeSearchFts').all()
    const upgrade = () => {
      for (const statement of buildPlaceSearchTrigramUpgradeSql())
        sqlite.exec(statement)
    }
    expect(() =>
      sqlite.transaction(() => {
        upgrade()
        throw Error('rollback')
      })(),
    ).toThrow('rollback')
    expect(sqlite.query('select rowid,* from placeSearchFts').all()).toEqual(original)
    sqlite.transaction(upgrade)()
    expect(
      sqlite
        .query("select placeId from placeSearchFts where placeSearchFts match 'axim'")
        .all(),
    ).toEqual([{ placeId: 'maxim' }])
    expect(
      sqlite
        .query("select placeId from placeSearchFts where placeSearchFts match 'maxims'")
        .all(),
    ).toEqual([{ placeId: 'maxim' }])
    expect(
      sqlite.query('select rowid,placeId,addressText from placeSearchFts').all(),
    ).toEqual([
      { rowid: 1, placeId: 'maxim', addressText: 'Flora Plaza' },
      { rowid: 2, placeId: 'punctuation', addressText: 'Main Street' },
    ])
    const upgraded = sqlite.query('select rowid,* from placeSearchFts').all()
    sqlite.transaction(upgrade)()
    expect(sqlite.query('select rowid,* from placeSearchFts').all()).toEqual(upgraded)
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
    ).toHaveLength(2)
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
