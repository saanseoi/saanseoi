import { expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { getTableColumns, getTableName } from 'drizzle-orm'
import { currentSchema } from '@repo/db'
import { synchroniseAddressSubstringSearch } from '@repo/core/pipeline/services/addresses/substringIndex'
import { withGeographicFilters } from '../lib/geographicFilterContext'
import { GeocodingQuerySchema } from '../schema/geocoding'
import { loadGeocodingAddressPage } from './geocodingAddressPage'
import {
  AddressSearchExpiredError,
  type AddressSearchSession,
} from './geocodingSearchCache'
import type { GeocodingDatabases, GeocodingRelease } from './geocodingData'

// Use real SQL and publication guards so continuations cannot hide a repeat text query.
test('address pages count usable filtered identities and hydrate cached slices without reranking', async () => {
  const sqlite = new Database(':memory:')
  try {
    for (const table of [
      currentSchema.address2d,
      currentSchema.address2dI18n,
      currentSchema.addressPublicationState,
      currentSchema.divisionPublicationState,
    ]) {
      sqlite.exec(
        `CREATE TABLE "${getTableName(table)}" (${Object.values(getTableColumns(table))
          .map(column => `"${column.name}" TEXT`)
          .join(',')})`,
      )
    }
    sqlite.exec(`INSERT INTO divisionPublicationState(scopeId,snapshotId,status,publicationToken,preparedAt) VALUES('div-scope','division','current','div-token','ready');
      INSERT INTO addressPublicationState(scopeId,snapshotId,divisionSnapshotId,status,publicationToken,preparedAt) VALUES('scope','release','division','current','token','ready')`)
    for (const [id, district, located] of [
      ['a', 'inside', true],
      ['b', 'outside', true],
      ['c', 'inside', false],
      ['d', 'inside', true],
      ['e', 'inside', true],
    ] as const) {
      sqlite
        .query(
          'INSERT INTO address2d(scopeId,id,geometry,divisionSnapshotId,districtId,scope,createdAt) VALUES(?,?,?,?,?,?,?)',
        )
        .run(
          'scope',
          id,
          located ? JSON.stringify({ type: 'Point', coordinates: [114, 22] }) : null,
          'div-scope',
          district,
          'building',
          'now',
        )
      sqlite
        .query(
          'INSERT INTO address2dI18n(scopeId,addressId,locale,formattedAddress,streetName) VALUES(?,?,?,?,?)',
        )
        .run('scope', id, 'en', '1 Hollywood Road', 'Hollywood Road')
    }
    const prepare = (statement: string, values: unknown[] = []) => ({
      bind: (...args: unknown[]) => prepare(statement, args),
      all: async () => ({
        results: sqlite.query(statement).all(...(values as never[])),
      }),
      run: async () => {
        sqlite.query(statement).run(...(values as never[]))
        return { success: true }
      },
    })
    await synchroniseAddressSubstringSearch({
      prepare,
      batch: async (statements: ReturnType<typeof prepare>[]) => {
        sqlite.exec('BEGIN')
        try {
          for (const statement of statements) await statement.run()
          sqlite.exec('COMMIT')
        } catch (error) {
          sqlite.exec('ROLLBACK')
          throw error
        }
      },
    } as never)
    const statements: string[] = []
    const db = {
      currentDb: drizzle({
        client: sqlite,
        logger: {
          logQuery(query) {
            statements.push(query)
          },
        },
      }),
    } as unknown as GeocodingDatabases
    const release = {
      code: 'r1',
      snapshots: [
        { snapshotResourceType: 'address', snapshotId: 'release' },
        {
          snapshotResourceType: 'division',
          snapshotId: 'division',
          variant: 'overture',
        },
      ],
    } as GeocodingRelease
    const sessions = new Map<string, AddressSearchSession>()
    let mutatePublication = false
    const store = {
      read: async (key: string) => sessions.get(key) ?? null,
      write: async (key: string, value: AddressSearchSession) => {
        sessions.set(key, value)
        if (mutatePublication)
          sqlite.exec(
            "UPDATE addressPublicationState SET publicationToken='during-read'",
          )
      },
    }
    const query = GeocodingQuerySchema.parse({
      address: 'hollywood',
      paginate: 'true',
      locatedOnly: 'true',
      limit: 2,
    })
    const run = (q = query) =>
      withGeographicFilters(
        {
          releaseSet: 'geo-r1',
          groups: [new Set(['inside'])],
          targetClasses: ['district'],
        },
        () => loadGeocodingAddressPage(db, release, q, store),
      )
    const first = await run()
    expect(first.total).toBe(3)
    expect(first.records.map(row => row.address.id)).toEqual(['a', 'd'])
    expect(first.records[0]!.address.divisionSnapshotId).toBe('division')
    expect(statements.some(sql => sql.includes('addressGeocodingFts'))).toBe(true)
    statements.length = 0
    const last = await run({ ...query, cursor: first.nextCursor! })
    expect(last).toMatchObject({ total: 3, offset: 2, nextCursor: null })
    expect(last.records.map(row => row.address.id)).toEqual(['e'])
    expect(statements.some(sql => /addressGeocodingFts|NOT INDEXED/i.test(sql))).toBe(
      false,
    )
    // Resolved geographic membership is part of the session identity too.
    await expect(
      withGeographicFilters(
        {
          releaseSet: 'geo-r2',
          groups: [new Set(['outside'])],
          targetClasses: ['district'],
        },
        () =>
          loadGeocodingAddressPage(
            db,
            release,
            { ...query, cursor: first.nextCursor! },
            store,
          ),
      ),
    ).rejects.toBeInstanceOf(AddressSearchExpiredError)
    // Text matches outside the circle must not consume the first page or its total.
    sqlite.exec(
      `UPDATE address2d SET geometry='{"type":"Point","coordinates":[115,23]}' WHERE id='a'`,
    )
    const nearQuery = { ...query, nearLat: 22, nearLng: 114, maxDistance: 300 }
    const nearPage = await run(nearQuery)
    expect(nearPage.total).toBe(2)
    expect(nearPage.records.map(row => row.address.id)).toEqual(['d', 'e'])
    expect(nearPage.nextCursor).toBeNull()
    await expect(
      run({ ...nearQuery, cursor: first.nextCursor! }),
    ).rejects.toBeInstanceOf(AddressSearchExpiredError)
    const unlocated = await run({ ...query, locatedOnly: undefined })
    expect(unlocated.total).toBe(4)
    sqlite.exec("UPDATE addressPublicationState SET publicationToken='changed'")
    await expect(run({ ...query, cursor: first.nextCursor! })).rejects.toBeInstanceOf(
      AddressSearchExpiredError,
    )
    statements.length = 0
    await expect(run()).rejects.toThrow('publication changed')
    expect(statements.some(sql => /NOT INDEXED/i.test(sql))).toBe(false)
    sqlite.exec("UPDATE addressPublicationState SET publicationToken='token'")
    sessions.clear()
    mutatePublication = true
    await expect(run()).rejects.toThrow('publication changed')
  } finally {
    sqlite.close()
  }
})
