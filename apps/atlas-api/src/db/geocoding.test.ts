import { expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { getTableColumns, getTableName } from 'drizzle-orm'
import { currentSchema } from '@repo/db'
import { addressGeocodingCandidates } from './geocoding'
import { GeocodingQuerySchema } from '../schema/geocoding'
import { collectAddressCandidates } from '../services/addressGeocoding'

// Real SQLite verifies the prefilter and hydration together, including scope joins.
test('numeric index and spherical prefilter preserve scoped candidates', async () => {
  const sqlite = new Database(':memory:')
  try {
    for (const table of [
      currentSchema.address2d,
      currentSchema.address2dI18n,
      currentSchema.address2dBuildingNumberLookup,
      currentSchema.addressPublicationState,
      currentSchema.divisionPublicationState,
    ]) {
      sqlite.exec(
        `CREATE TABLE "${getTableName(table)}" (${Object.values(getTableColumns(table))
          .map(column => `"${column.name}" TEXT`)
          .join(',')})`,
      )
    }
    sqlite.exec(
      `INSERT INTO addressPublicationState (scopeId,snapshotId,status,publicationToken,preparedAt) VALUES ('scope','release','current','token','ready')`,
    )
    const add = (
      id: string,
      number: string,
      lng: number,
      lat: number,
      scope = 'scope',
    ) => {
      sqlite
        .query(
          'INSERT INTO address2d (scopeId,id,geometry,granularity,createdAt) VALUES (?,?,?,?,?)',
        )
        .run(
          scope,
          id,
          JSON.stringify({ type: 'Point', coordinates: [lng, lat] }),
          'building',
          'now',
        )
      sqlite
        .query(
          'INSERT INTO address2dI18n (scopeId,addressId,locale,formattedAddress,buildingNumberFrom,streetName) VALUES (?,?,?,?,?,?)',
        )
        .run(scope, id, 'en', `${number} Hollywood Road`, number, 'Hollywood Road')
      sqlite
        .query(
          'INSERT INTO address2dBuildingNumberLookup (scopeId,addressId,buildingNumber,numericStem) VALUES (?,?,?,?)',
        )
        .run(scope, id, number, number.replace(/[A-Z]$/, ''))
    }
    add('exact', '29', 179.999, 0)
    add('substring', '229', 0, 0)
    add('suffix', '29A', -179.999, 0)
    add('other-release', '29', 179.999, 0, 'other')
    add('north', '29', 179.999, 1)
    const db = drizzle({ client: sqlite }) as never
    const forward = GeocodingQuerySchema.parse({ address: '29 Hollywood Rd' })
    const result = await collectAddressCandidates(
      addressGeocodingCandidates(db, ['release'], forward),
      forward,
    )
    expect(result.records.map(r => r.address.id).sort()).toEqual([
      'exact',
      'north',
      'suffix',
    ])
    const reverse = GeocodingQuerySchema.parse({
      lng: '179.999',
      lat: '0',
      maxDistance: '500',
    })
    const nearby = await collectAddressCandidates(
      addressGeocodingCandidates(db, ['release'], reverse),
      reverse,
    )
    expect(nearby.records.map(r => r.address.id)).toEqual(['exact', 'suffix'])
    const constrained = GeocodingQuerySchema.parse({
      lng: '179.998',
      lat: '0',
      maxDistance: '0',
      footprint: JSON.stringify({
        type: 'Polygon',
        coordinates: [
          [
            [179.997, -0.001],
            [180, -0.001],
            [180, 0.001],
            [179.997, 0.001],
            [179.997, -0.001],
          ],
        ],
      }),
    })
    const contained = await collectAddressCandidates(
      addressGeocodingCandidates(db, ['release'], constrained),
      constrained,
    )
    expect(contained.records.map(r => r.address.id)).toEqual(['exact'])
    expect(contained.total).toBe(1)
  } finally {
    sqlite.close()
  }
})
