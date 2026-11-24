import { expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { getTableColumns, getTableName } from 'drizzle-orm'
import { currentSchema } from '@repo/db'
import { addressGeocodingCandidates } from './geocoding'
import { GeocodingQuerySchema } from '../schema/geocoding'
import { collectAddressCandidates } from '../services/addressGeocoding'

// Compare retrieval with exhaustive scoring, not just expected SQL construction.
test('indexed text candidates retain bilingual, infix, normalised and embedded-name matches', async () => {
  const sqlite = new Database(':memory:')
  try {
    for (const table of [
      currentSchema.address2d,
      currentSchema.address2dI18n,
      currentSchema.addressPublicationState,
      currentSchema.divisionPublicationState,
      currentSchema.addressSearchScopes,
    ]) {
      sqlite.exec(
        `CREATE TABLE "${getTableName(table)}" (${Object.values(getTableColumns(table))
          .map(c => `"${c.name}" TEXT`)
          .join(',')})`,
      )
    }
    sqlite.exec(
      `CREATE VIRTUAL TABLE addressSearchFts USING fts5(scopeId UNINDEXED,addressId UNINDEXED,locale UNINDEXED,formattedAddress,buildingName,buildingNumber,blockExpression,phaseExpression,premisesName,streetName)`,
    )
    sqlite.exec(
      `INSERT INTO addressPublicationState (scopeId,snapshotId,status,publicationToken,preparedAt) VALUES ('scope','release','current','token','ready')`,
    )
    sqlite.exec(`INSERT INTO addressSearchScopes VALUES ('index','release')`)
    const fixtures: Array<
      [string, string, string | null, string | null, string | null]
    > = [
      ['a', '29 Hollywood Road', null, null, 'Hollywood Road'],
      ['b', '31 Hollywood Rd', null, null, 'Hollywood Rd'],
      ['c', 'Queen’s Road Central', null, null, 'Queen’s Road Central'],
      ['d', '皇后大道中', null, null, '皇后大道中'],
      ['e', '香港荷李活道', null, null, '荷李活道'],
      ['f', '１ ＨＯＬＬＹＷＯＯＤ ＲＯＡＤ', null, null, null],
      ['g', '翠湖居第一期', '翠湖居第一期', null, null],
      ['h', 'Foo  Bar Rd', 'Foo  Bar Hse', null, null],
      ['i', 'Food St', null, null, 'Food St'],
      ['j', 'Different formatted address', 'Queen’s House', null, null],
      ['k', 'Different address', 'One International Finance Centre', null, null],
      ['l', 'Some Rd', null, null, 'Some Rd'],
      ['m', 'LEGO House', 'LEGO House', null, null],
    ]
    for (const [id, formatted, building, premises, street] of fixtures) {
      sqlite
        .query(
          'INSERT INTO address2d (scopeId,id,geometry,scope,createdAt) VALUES (?,?,?,?,?)',
        )
        .run(
          'scope',
          id!,
          JSON.stringify({ type: 'Point', coordinates: [114, 22] }),
          'building',
          'now',
        )
      sqlite
        .query(
          'INSERT INTO address2dI18n (scopeId,addressId,locale,formattedAddress,buildingName,premisesName,streetName) VALUES (?,?,?,?,?,?,?)',
        )
        .run('scope', id!, 'en', formatted!, building, premises, street)
      sqlite
        .query(
          'INSERT INTO addressSearchFts (scopeId,addressId,locale,formattedAddress,buildingName,premisesName,streetName) VALUES (?,?,?,?,?,?,?)',
        )
        .run('index', id!, 'en', formatted!, building, premises, street)
    }
    const db = drizzle({ client: sqlite }) as never
    for (const input of [
      'lego',
      'absentxyz',
      'Hollywood Rd',
      'wood road',
      'Hollywood',
      'Queens Road Central',
      "Queen's House",
      '皇后大道中',
      '荷李活道',
      '翠湖居第1期',
      'Foo Bar Road',
      'od street',
      'oa',
      'extra Foo Bar House listing',
      'extra One International Finance Centre listing',
      '" OR * (',
      'ＨＯＬＬＹＷＯＯＤ',
    ]) {
      const query = GeocodingQuerySchema.parse({ address: input, limit: '50' })
      const indexed = await collectAddressCandidates(
        addressGeocodingCandidates(db, ['release'], query),
        query,
      )
      const reference = await collectAddressCandidates(
        addressGeocodingCandidates(db, ['release'], query, true),
        query,
      )
      expect({
        input,
        ids: indexed.records.map(r => r.address.id),
        total: indexed.total,
      }).toEqual({
        input,
        ids: reference.records.map(r => r.address.id),
        total: reference.total,
      })
    }
    // An index for another release is not evidence of readiness for this release.
    sqlite.exec("UPDATE addressSearchScopes SET snapshotId='other'")
    const query = GeocodingQuerySchema.parse({ address: 'Hollywood Rd' })
    const result = await collectAddressCandidates(
      addressGeocodingCandidates(db, ['release'], query),
      query,
    )
    expect(result.total).toBe(3)
    sqlite.exec("UPDATE addressSearchScopes SET snapshotId='release'")
    // More than one candidate page must still find a late exact match and count
    // every identity, including the ambiguity witness hidden by limit=1.
    sqlite.exec(`WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<2050)
      INSERT INTO address2d (scopeId,id,geometry,scope,createdAt)
      SELECT 'scope', printf('page-%04d',x), '{"type":"Point","coordinates":[114,22]}', 'building','now' FROM n`)
    sqlite.exec(`INSERT INTO address2dI18n (scopeId,addressId,locale,formattedAddress)
      SELECT scopeId,id,'en','Page Match Extra' FROM address2d WHERE id LIKE 'page-%'`)
    sqlite.exec(`INSERT INTO address2d (scopeId,id,geometry,scope,createdAt)
      VALUES ('scope','zz-exact','{"type":"Point","coordinates":[114,22]}','building','now')`)
    sqlite.exec(`INSERT INTO address2dI18n (scopeId,addressId,locale,formattedAddress)
      VALUES ('scope','zz-exact','en','Page Match')`)
    sqlite.exec(`INSERT INTO addressSearchFts (scopeId,addressId,locale,formattedAddress)
      SELECT 'index',addressId,locale,formattedAddress FROM address2dI18n WHERE addressId LIKE 'page-%' OR addressId='zz-exact'`)
    const pagedQuery = GeocodingQuerySchema.parse({ address: 'Page Match', limit: '1' })
    const paged = await collectAddressCandidates(
      addressGeocodingCandidates(db, ['release'], pagedQuery),
      pagedQuery,
    )
    expect(paged.total).toBe(2051)
    expect(paged.records[0]!.address.id).toBe('zz-exact')
    expect(paged.records).toHaveLength(2)
    // Losing readiness while pages are being read must not return partial results.
    const iterator = addressGeocodingCandidates(db, ['release'], pagedQuery)
    await iterator.next()
    sqlite.exec("UPDATE addressSearchScopes SET snapshotId='other'")
    await expect(
      (async () => {
        for await (const _ of iterator) {
          /* Drain remaining pages. */
        }
      })(),
    ).rejects.toThrow('Address search index changed.')
  } finally {
    sqlite.close()
  }
})
