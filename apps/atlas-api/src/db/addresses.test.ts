import { describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { buildAddressSearchSyncSql } from '@repo/core/pipeline/services/addresses/searchIndex'

import {
  buildAddressFtsQuery,
  listAddressRecordsCurrent,
  normaliseAddressSearchNumber,
  searchAddressIdsCurrent,
} from './addresses'

test('current address reads project every dedicated division ID as a relationship', async () => {
  const sqlite = new Database(':memory:')
  try {
    sqlite.exec(`
      CREATE TABLE addressPublicationState (
        scopeId TEXT PRIMARY KEY, snapshotId TEXT, status TEXT,
        publicationToken TEXT, preparedAt TEXT, updatedAt TEXT
      );
      CREATE TABLE divisionPublicationState (
        scopeId TEXT PRIMARY KEY, snapshotId TEXT, status TEXT,
        publicationToken TEXT, preparedAt TEXT, updatedAt TEXT
      );
      CREATE TABLE address2d (
        scopeId TEXT, divisionSnapshotId TEXT, id TEXT, geometry TEXT,
        identifiers TEXT, sources TEXT, parentAddressId TEXT, granularity TEXT,
        countryId TEXT, islandId TEXT, areaId TEXT,
        districtId TEXT, townId TEXT, ruralAreaId TEXT, macrohoodId TEXT, neighbourhoodId TEXT,
        microhoodId TEXT, villageId TEXT, hamletId TEXT, createdAt TEXT, updatedAt TEXT
      );
      INSERT INTO addressPublicationState
        VALUES ('address-scope', 'address-snapshot', 'current', 'token', 'ready', 'now');
      INSERT INTO divisionPublicationState
        VALUES ('division-scope', 'division-snapshot', 'current', 'token', 'ready', 'now');
      INSERT INTO address2d (
        scopeId, divisionSnapshotId, id, granularity, countryId, islandId,
        areaId, districtId, townId, ruralAreaId, macrohoodId, neighbourhoodId, microhoodId,
        villageId, hamletId, createdAt) VALUES (
        'address-scope', 'division-scope', 'address-1', 'building', 'country-1',
        'island-1', 'area-1', 'district-1', 'town-1', 'rural-area-1', 'macrohood-1',
        'neighbourhood-1', 'microhood-1', 'village-1', 'hamlet-1', 'now');
    `)

    const records = await listAddressRecordsCurrent(
      drizzle({ client: sqlite }) as never,
      {
        snapshotIds: ['address-snapshot'],
        localeSelection: { mode: 'none', locales: [] },
      },
    )

    expect(records[0]?.address.divisionRelationships).toEqual([
      { role: 'country', divisionId: 'country-1' },
      { role: 'landform', divisionId: 'island-1' },
      { role: 'area', divisionId: 'area-1' },
      { role: 'district', divisionId: 'district-1' },
      { role: 'town', divisionId: 'town-1' },
      { role: 'rural_area', divisionId: 'rural-area-1' },
      { role: 'macrohood', divisionId: 'macrohood-1' },
      { role: 'neighbourhood', divisionId: 'neighbourhood-1' },
      { role: 'microhood', divisionId: 'microhood-1' },
      { role: 'village', divisionId: 'village-1' },
      { role: 'hamlet', divisionId: 'hamlet-1' },
    ])
  } finally {
    sqlite.close()
  }
})

test('search joins stable document scopes to the promoted snapshot and rejects an unindexed selection', async () => {
  const sqlite = new Database(':memory:')
  try {
    sqlite.exec(`CREATE TABLE divisionPublicationState(scopeId TEXT PRIMARY KEY,snapshotId TEXT UNIQUE,status TEXT,publicationToken TEXT,preparedAt TEXT,updatedAt TEXT);
      INSERT INTO divisionPublicationState VALUES ('division','division','current','token','ready','now');
      CREATE TABLE addressPublicationState(scopeId TEXT PRIMARY KEY,divisionSnapshotId TEXT DEFAULT 'division',snapshotId TEXT UNIQUE,status TEXT,publicationToken TEXT,preparedAt TEXT,updatedAt TEXT);
      INSERT INTO addressPublicationState(scopeId,snapshotId,status,publicationToken,preparedAt,updatedAt) VALUES ('scope:old','old','current','old','2026-01-01','2026-01-01'),('scope:new','new','current','new','2026-01-01','2026-01-01');
      CREATE TABLE addressSearchScopes(scopeId TEXT PRIMARY KEY, snapshotId TEXT);
      CREATE TABLE address2d(scopeId TEXT, id TEXT, countryId TEXT, areaId TEXT, districtId TEXT, islandId TEXT, townId TEXT, ruralAreaId TEXT, macrohoodId TEXT, neighbourhoodId TEXT, microhoodId TEXT, villageId TEXT, hamletId TEXT);
      CREATE TABLE address2dI18n(scopeId TEXT,addressId TEXT,locale TEXT,formattedAddress TEXT,
        buildingName TEXT,buildingNumberExpression TEXT,buildingNumberFrom TEXT,buildingNumberTo TEXT,
        blockExpression TEXT,phaseExpression TEXT,estateName TEXT,streetName TEXT);
      INSERT INTO address2d (scopeId,id,countryId,areaId,districtId,islandId,townId,ruralAreaId, macrohoodId,neighbourhoodId,microhoodId,villageId,hamletId)
        VALUES('scope:old','a','hk',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),('scope:new','a','hk',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL);
      INSERT INTO address2dI18n(scopeId,addressId,locale,formattedAddress) VALUES
        ('scope:old','a','en','Harbour Road'),('scope:new','a','en','Harbour Road');`)
    sqlite.exec("UPDATE address2d SET islandId='island', townId='town'")
    const db = drizzle({ client: sqlite }) as never
    const search = (snapshot: string) =>
      searchAddressIdsCurrent(db, {
        snapshotIds: [snapshot],
        mode: 'full-text',
        query: 'Harbour',
        limit: 10,
        offset: 0,
      })
    for (const snapshotId of ['old', 'new']) {
      sqlite.transaction(() => {
        for (const sql of buildAddressSearchSyncSql([{ scopeId: 'als', snapshotId }]))
          sqlite.exec(sql)
      })()
      expect(await search(snapshotId)).toEqual({ addressIds: ['a'], total: 1 })
      for (const divisionId of ['hk', 'island', 'town', 'unlinked']) {
        const result = await searchAddressIdsCurrent(db, {
          snapshotIds: [snapshotId],
          mode: 'full-text',
          query: 'Harbour',
          limit: 10,
          offset: 0,
          divisionId,
        })
        const matchesDedicatedColumn = ['hk', 'island', 'town'].includes(divisionId)
        expect(result.addressIds).toEqual(matchesDedicatedColumn ? ['a'] : [])
      }
    }
    await expect(search('old')).rejects.toThrow('FTS index is not initialised')
  } finally {
    sqlite.close()
  }
})

describe('address search query preparation', () => {
  test('keeps a bare stem distinct from a suffixed building number', () => {
    expect(normaliseAddressSearchNumber('5')).toBe('5')
    expect(normaliseAddressSearchNumber('5a')).toBe('5A')
    expect(normaliseAddressSearchNumber('5A-5C')).toBeNull()
  })

  test('uses the requested component and never exposes FTS syntax from input', () => {
    expect(
      buildAddressFtsQuery({
        mode: 'component',
        component: 'street',
        query: "King's Road OR *",
      }),
    ).toBe('streetName : (kings AND road AND or)')
  })

  test('makes prefix matching explicit', () => {
    expect(buildAddressFtsQuery({ mode: 'full-text', query: 'Harbour View' })).toBe(
      'harbour AND view',
    )
    expect(buildAddressFtsQuery({ mode: 'prefix', query: 'Harbour View' })).toBe(
      'harbour* AND view*',
    )
  })

  test('expands canonical block abbreviations and their long forms symmetrically', () => {
    expect(buildAddressFtsQuery({ mode: 'full-text', query: 'Tower 1' })).toBe(
      '(twr OR tower OR towers) AND 1',
    )
    expect(buildAddressFtsQuery({ mode: 'prefix', query: 'apt' })).toBe(
      '(apt* OR apts* OR apartment* OR apartments*)',
    )
    expect(
      buildAddressFtsQuery({
        mode: 'component',
        component: 'block',
        query: 'Houses A',
      }),
    ).toBe('blockExpression : ((hse OR hses OR house OR houses) AND a)')
  })
})
