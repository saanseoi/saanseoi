import { describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { buildAddressSearchSyncSql } from '@repo/core/pipeline/services/addresses/searchIndex'

import {
  buildAddressFtsQuery,
  normaliseAddressSearchNumber,
  searchAddressIdsCurrent,
} from './addresses'

test('search joins stable document scopes to the promoted snapshot and rejects an unindexed selection', async () => {
  const sqlite = new Database(':memory:')
  try {
    sqlite.exec(`CREATE TABLE addressSearchScopes(scopeId TEXT PRIMARY KEY, snapshotId TEXT);
      CREATE TABLE address2d(snapshotId TEXT, id TEXT, countryId TEXT, areaId TEXT, districtId TEXT);
      CREATE TABLE address2dI18n(snapshotId TEXT,addressId TEXT,locale TEXT,formattedAddress TEXT,
        buildingName TEXT,buildingNumberExpression TEXT,buildingNumberFrom TEXT,buildingNumberTo TEXT,
        blockExpression TEXT,phaseExpression TEXT,estateName TEXT,streetName TEXT);
      INSERT INTO address2d VALUES('old','a','hk',NULL,NULL),('new','a','hk',NULL,NULL);
      INSERT INTO address2dI18n(snapshotId,addressId,locale,formattedAddress) VALUES
        ('old','a','en','Harbour Road'),('new','a','en','Harbour Road');`)
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
