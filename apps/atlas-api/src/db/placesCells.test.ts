import { expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { resolve } from 'node:path'
import type { CurrentDatabase } from '@repo/db'
import { loadMigrationSql } from '../../../../libs/core/src/testing/metaFixtures'
import { withGeographicFilters } from '../lib/geographicFilterContext'
import { listPlacesByH3Cell } from './places'

test('cell pagination crosses the maximum page size and filters before selecting pages', async () => {
  const sqlite = new Database(':memory:')
  sqlite.exec('PRAGMA foreign_keys=ON')
  sqlite.exec(
    loadMigrationSql(resolve(import.meta.dir, '../../../../libs/db/migrations'), [
      'current',
    ]).replaceAll('--> statement-breakpoint', ''),
  )
  const db = drizzle({ client: sqlite }) as unknown as CurrentDatabase
  try {
    sqlite.exec(`INSERT INTO placePublicationState(snapshotId,scopeId,status,publicationToken,preparedAt)
      VALUES ('snapshot','scope','current','ready','2026-10-15T00:00:00.000Z')`)
    for (let i = 101; i >= 0; i--) {
      const id = `place-${String(i).padStart(3, '0')}`
      sqlite
        .query(`INSERT INTO places(scopeId,id,resourceReleaseId,geometry,firstSeenMonth,createdAt,districtId)
        VALUES ('scope',?,'release','{"type":"Point","coordinates":[114,22]}','2026-10','2026-10-15T00:00:00.000Z',?)`)
        .run(id, i === 0 ? null : 'district')
      sqlite
        .query(
          `INSERT INTO placesCells(scopeId,id,h3Level,h3Cell) VALUES ('scope',?,9,?)`,
        )
        .run(id, i === 101 ? 'other-cell' : 'cell')
    }
    const lookup = { snapshotId: 'snapshot', h3Level: 9, h3Cell: 'cell', limit: 100 }
    const first = await listPlacesByH3Cell(db, lookup)
    expect(first.places).toHaveLength(100)
    expect(first.places[0]?.placeId).toBe('place-000')
    expect(first.places[99]?.placeId).toBe('place-099')
    expect(first.hasMore).toBe(true)
    const last = await listPlacesByH3Cell(db, { ...lookup, offset: 100 })
    expect(last.places.map(place => place.placeId)).toEqual(['place-100'])
    expect(last.hasMore).toBe(false)
    expect((await listPlacesByH3Cell(db, { ...lookup, h3Level: 7 })).places).toEqual([])
    await withGeographicFilters(
      { releaseSet: 'geo', groups: [new Set(['district'])] },
      async () => {
        const filtered = await listPlacesByH3Cell(db, lookup)
        expect(filtered.places).toHaveLength(100)
        expect(filtered.places[0]?.placeId).toBe('place-001')
        expect(filtered.places[99]?.placeId).toBe('place-100')
        expect(filtered.hasMore).toBe(false)
      },
    )
  } finally {
    sqlite.close()
  }
})
