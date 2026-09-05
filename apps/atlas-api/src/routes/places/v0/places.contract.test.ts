import { describe, expect, test } from 'bun:test'
import { Database, type SQLQueryBindings } from 'bun:sqlite'
import { resolve } from 'node:path'

import { loadMigrationSql } from '../../../../../../libs/core/src/testing/metaFixtures'
import type { AppBindings } from '../../../types'
import app from '../../../index'

const REPO_ROOT = resolve(import.meta.dir, '../../../../../../')
const MIGRATIONS_DIR = resolve(REPO_ROOT, 'libs/db/migrations')
const PUBLISHED_AT = '2026-09-05T00:00:00.000Z'
const RELEASE_SET = 'data-hk-places-2026-08-19.0'
const PLACE_SNAPSHOT = 'snapshot-places-2026-08-19'
const DIVISION_SNAPSHOT = 'snapshot-divisions-2026-08-19'

type MockStatement = {
  bind: (...values: SQLQueryBindings[]) => MockStatement
  all: <T>() => Promise<{ results: T[]; success: true }>
  first: <T>() => Promise<T | null>
  raw: <T>() => Promise<T[][]>
  run: () => Promise<{ meta: { changes: number }; success: true }>
}

function createMockD1(sqlite: Database): D1Database {
  return {
    prepare(query: string) {
      const statement = sqlite.query(query)
      let values: SQLQueryBindings[] = []
      const bound: MockStatement = {
        bind(...nextValues) {
          values = nextValues
          return bound
        },
        async all<T>() {
          return { results: statement.all(...values) as T[], success: true }
        },
        async first<T>() {
          return (statement.get(...values) as T | null) ?? null
        },
        async raw<T>() {
          return (statement.all(...values) as Array<Record<string, unknown>>).map(row =>
            Object.values(row),
          ) as T[][]
        },
        async run() {
          const result = statement.run(...values)
          return { meta: { changes: result.changes }, success: true }
        },
      }
      return bound
    },
  } as unknown as D1Database
}

function initSqlite(families: string[]) {
  const sqlite = new Database(':memory:')
  sqlite.exec('PRAGMA foreign_keys = ON;')
  sqlite.exec(
    loadMigrationSql(MIGRATIONS_DIR, families).replaceAll(
      '--> statement-breakpoint',
      '',
    ),
  )
  return sqlite
}

function run(sqlite: Database, query: string, values: SQLQueryBindings[] = []) {
  sqlite.query(query).run(...values)
}

function json(value: unknown) {
  return JSON.stringify(value)
}

function seedMeta(sqlite: Database) {
  run(
    sqlite,
    `INSERT INTO apiVersions
      (id, code, familyType, version, status, publishedAt, versionHash, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      'api-version-places-v0.1',
      'api-places-v0.1',
      'places',
      '0.1',
      'current',
      PUBLISHED_AT,
      'api-version-hash',
      PUBLISHED_AT,
      PUBLISHED_AT,
    ],
  )
  const snapshots: Array<[string, string, string]> = [
    [PLACE_SNAPSHOT, 'place', 'ss-hk-place-2026-08-19.0'],
    [DIVISION_SNAPSHOT, 'division', 'ss-hk-division-overture-2026-08-19.0'],
  ]
  for (const [id, resourceType, code] of snapshots) {
    run(
      sqlite,
      `INSERT INTO snapshots
        (id, resourceType, code, cohortKey, revision, status, publishedAt, validFrom, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        resourceType,
        code,
        '2026-08-19.0',
        0,
        'published',
        PUBLISHED_AT,
        PUBLISHED_AT,
        PUBLISHED_AT,
        PUBLISHED_AT,
      ],
    )
  }
  run(
    sqlite,
    `INSERT INTO apiReleaseSets
      (id, apiVersionId, code, regionCode, domainCode, cohortKey, revision, effectiveFrom,
       schemaVersion, rulesetVersion, status, publishedAt, versionHash, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      'api-release-set-places',
      'api-version-places-v0.1',
      RELEASE_SET,
      'hk',
      'overture',
      '2026-08-19.0',
      0,
      PUBLISHED_AT,
      'sv-place-v1',
      'rs-place-v1',
      'current',
      PUBLISHED_AT,
      'release-set-hash',
      PUBLISHED_AT,
      PUBLISHED_AT,
    ],
  )
  const releaseSetSnapshots: Array<[string, string, string]> = [
    [PLACE_SNAPSHOT, 'default', 'primary'],
    [DIVISION_SNAPSHOT, 'overture', 'supporting'],
  ]
  for (const [snapshotId, variant, role] of releaseSetSnapshots) {
    run(
      sqlite,
      `INSERT INTO apiReleaseSetSnapshots
        (apiReleaseSetId, snapshotId, variant, role, isRequired, cohortMatchingMode, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        'api-release-set-places',
        snapshotId,
        variant,
        role,
        1,
        'exact_ref',
        PUBLISHED_AT,
      ],
    )
  }
  run(
    sqlite,
    `INSERT INTO apiCatalogRevisions
      (id, apiVersionId, code, regionCode, publicationDate, revision, defaultDomainCode,
       status, publishedAt, versionHash, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      'catalog-places',
      'api-version-places-v0.1',
      'catalog-hk-places-v0.1-r0',
      'hk',
      '2026-09-05',
      0,
      'overture',
      'current',
      PUBLISHED_AT,
      'catalog-hash',
      PUBLISHED_AT,
      PUBLISHED_AT,
    ],
  )
  run(
    sqlite,
    `INSERT INTO apiCatalogRevisionReleaseSets
      (apiCatalogRevisionId, apiReleaseSetId, domainCode, cohortKey, isDefault, createdAt)
      VALUES (?, ?, ?, ?, ?, ?)`,
    [
      'catalog-places',
      'api-release-set-places',
      'overture',
      '2026-08-19.0',
      1,
      PUBLISHED_AT,
    ],
  )
}

function seedCurrent(sqlite: Database) {
  run(
    sqlite,
    `INSERT INTO divisions
      (snapshotId, id, level, type, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?)`,
    [DIVISION_SNAPSHOT, 'division-central', 2, 'district', PUBLISHED_AT, PUBLISHED_AT],
  )
  run(
    sqlite,
    `INSERT INTO divisionsI18n
      (snapshotId, divisionId, locale, name, isLocaleInferred, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      DIVISION_SNAPSHOT,
      'division-central',
      'en',
      'Central and Western',
      0,
      PUBLISHED_AT,
      PUBLISHED_AT,
    ],
  )
  const places: Array<{
    id: string
    category: string
    taxonomy: string
    status: string
    point: [number, number]
    name: string
  }> = [
    {
      id: 'place-ramen',
      category: 'restaurant',
      taxonomy: 'ramen_restaurant',
      status: 'open',
      point: [114.155, 22.285],
      name: 'Ramen House',
    },
    {
      id: 'place-cafe',
      category: 'cafe',
      taxonomy: 'cafe',
      status: 'open',
      point: [114.156, 22.286],
      name: 'Coffee House',
    },
  ]
  for (const place of places) {
    run(
      sqlite,
      `INSERT INTO places
        (snapshotId, id, releaseId, lng, lat, bbox, operatingStatus, basicCategory,
         taxonomyPrimary, taxonomyHierarchy, taxonomyAlternates, websites, confidence,
         sources, firstSeenMonth, lastSeenMonth, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        PLACE_SNAPSHOT,
        place.id,
        'release-overture-2026-08-19',
        place.point[0],
        place.point[1],
        json([place.point[0], place.point[1], place.point[0], place.point[1]]),
        place.status,
        place.category,
        place.taxonomy,
        json(['food_and_drink', place.taxonomy]),
        json([]),
        json(['https://example.com']),
        0.9,
        json([{ dataset: 'overture', record_id: place.id }]),
        '2026-08',
        '2026-08',
        PUBLISHED_AT,
        PUBLISHED_AT,
      ],
    )
    run(
      sqlite,
      `INSERT INTO placesI18n
        (snapshotId, placeId, locale, name, brandName, freeformAddress, provenance, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        PLACE_SNAPSHOT,
        place.id,
        'en',
        place.name,
        null,
        'Central, Hong Kong',
        json({ isMachineTranslated: [], isHumanVerified: [], isLocaleInferred: false }),
        PUBLISHED_AT,
        PUBLISHED_AT,
      ],
    )
    run(
      sqlite,
      `INSERT INTO placesDivision
        (placeSnapshotId, placeId, divisionSnapshotId, divisionId)
        VALUES (?, ?, ?, ?)`,
      [PLACE_SNAPSHOT, place.id, DIVISION_SNAPSHOT, 'division-central'],
    )
  }
}

function createFixtureEnvironment() {
  const metaSqlite = initSqlite(['meta'])
  const currentSqlite = initSqlite(['current'])
  seedMeta(metaSqlite)
  seedCurrent(currentSqlite)
  return {
    env: {
      DB_META: createMockD1(metaSqlite),
      DB_CURRENT: createMockD1(currentSqlite),
      DB_HISTORY_HK_BEFORE: createMockD1(currentSqlite),
      DB_HISTORY_HK_2025: createMockD1(currentSqlite),
      DB_HISTORY_HK_2026: createMockD1(currentSqlite),
      DB_SOURCE_HK_BEFORE: createMockD1(currentSqlite),
      DB_SOURCE_HK_2025: createMockD1(currentSqlite),
      DB_SOURCE_HK_2026: createMockD1(currentSqlite),
      ATLAS_BASE_URL: 'http://localhost:8787',
      AUTH_MODE: 'disabled',
      ENVIRONMENT: 'test',
      API_RATE_LIMIT: { limit: async () => ({ success: true }) },
      API_USAGE: { writeDataPoint: () => {} },
      PRODUCT_USAGE_DATASET: 'test-product-usage',
    } as unknown as AppBindings,
    close() {
      metaSqlite.close()
      currentSqlite.close()
    },
  }
}

describe('Places collection through the Worker route', () => {
  test('paginates filtered compact records and pins the selected release set', async () => {
    const fixture = createFixtureEnvironment()
    try {
      const response = await app.fetch(
        new Request(
          `http://localhost/places/v0.1/hk?releaseSet=${RELEASE_SET}&filter[basicCategory]=restaurant&filter[taxonomyPrimary]=ramen_restaurant&filter[operatingStatus]=open&page[limit]=1`,
        ),
        fixture.env,
      )
      const body = (await response.json()) as {
        data: Array<{ id: string; attributes: Record<string, unknown> }>
        links: { permalink: string }
        meta: {
          filters: {
            basicCategory?: string
            taxonomyPrimary?: string
            operatingStatus?: string
          }
          page: { total: number }
        }
      }

      expect(response.status).toBe(200)
      expect(body.data).toHaveLength(1)
      expect(body.data[0]?.id).toBe('place-ramen')
      expect(body.data[0]?.attributes).not.toHaveProperty('geometry')
      expect(body.meta.filters).toEqual({
        basicCategory: 'restaurant',
        taxonomyPrimary: 'ramen_restaurant',
        operatingStatus: 'open',
      })
      expect(body.meta.page.total).toBe(1)
      expect(body.links.permalink).toContain(`releaseSet=${RELEASE_SET}`)
    } finally {
      fixture.close()
    }
  })

  test('uses the v0 alias for map records and includes selected Division resources', async () => {
    const fixture = createFixtureEnvironment()
    try {
      const response = await app.fetch(
        new Request(
          `http://localhost/places/v0/hk?releaseSet=${RELEASE_SET}&profile=map&filter[division]=division-central&include=divisions`,
        ),
        fixture.env,
      )
      const body = (await response.json()) as {
        data: Array<{ attributes: Record<string, unknown> }>
        included: Array<{ type: string; id: string }>
      }

      expect(response.status).toBe(200)
      expect(body.data).toHaveLength(2)
      expect(body.data[0]?.attributes.geometry).toEqual({
        type: 'Point',
        coordinates: [114.156, 22.286],
      })
      expect(body.included).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: 'divisions', id: 'division-central' }),
        ]),
      )
    } finally {
      fixture.close()
    }
  })

  test('adds audit and localisation fields only to the full profile', async () => {
    const fixture = createFixtureEnvironment()
    try {
      const response = await app.fetch(
        new Request(
          `http://localhost/places/v0.1/hk?releaseSet=${RELEASE_SET}&profile=full`,
        ),
        fixture.env,
      )
      const body = (await response.json()) as {
        data: Array<{ attributes: Record<string, unknown> }>
        meta: { locales: string[] }
      }
      const attributes = body.data.find(
        item => item.attributes.referenceName === 'Ramen House',
      )?.attributes

      expect(response.status).toBe(200)
      expect(attributes).toMatchObject({
        snapshotId: PLACE_SNAPSHOT,
        releaseId: 'release-overture-2026-08-19',
        geometry: { type: 'Point', coordinates: [114.155, 22.285] },
      })
      expect(body.meta.locales).toEqual(['*'])
    } finally {
      fixture.close()
    }
  })
})
