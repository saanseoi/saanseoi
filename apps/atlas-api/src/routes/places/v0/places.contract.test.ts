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
const ADDRESS_SNAPSHOT = 'snapshot-address-2026-08-19'
const HISTORY_BINDING = 'DB_HISTORY_HK_2026'

type MockStatement = {
  bind: (...values: SQLQueryBindings[]) => MockStatement
  all: <T>() => Promise<{ results: T[]; success: true }>
  first: <T>() => Promise<T | null>
  raw: <T>() => Promise<T[][]>
  run: () => Promise<{ meta: { changes: number }; success: true }>
}

function createMockD1(
  sqlite: Database,
  beforeRead?: (query: string) => void,
): D1Database {
  return {
    prepare(query: string) {
      beforeRead?.(query)
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
    [ADDRESS_SNAPSHOT, 'address', 'ss-hk-address-2026-08-19.0'],
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
    `INSERT INTO dataShards
      (id, shardType, regionCode, year, environment, databaseName, databaseId,
       bindingName, status, versionHash, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      'history-shard-2026',
      'history',
      'hk',
      '2026',
      'preview',
      'history-shard-2026',
      'history-shard-2026-db',
      HISTORY_BINDING,
      'active',
      'history-shard-2026-hash',
      PUBLISHED_AT,
      PUBLISHED_AT,
    ],
  )
  for (const snapshotId of [PLACE_SNAPSHOT, DIVISION_SNAPSHOT, ADDRESS_SNAPSHOT]) {
    run(
      sqlite,
      `INSERT INTO snapshotShardAssignments (snapshotId, dataShardId) VALUES (?, ?)`,
      [snapshotId, 'history-shard-2026'],
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
      (snapshotId, id, level, class, createdAt, updatedAt, hierarchies)
      VALUES (?, ?, ?, ?, ?, ?, '{"administrative":[],"locality":[],"full":[]}')`,
    [
      `scope:${DIVISION_SNAPSHOT}`,
      'division-central',
      2,
      'district',
      PUBLISHED_AT,
      PUBLISHED_AT,
    ],
  )
  run(
    sqlite,
    `INSERT INTO divisionsI18n
      (snapshotId, divisionId, locale, name, isLocaleInferred, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      `scope:${DIVISION_SNAPSHOT}`,
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
        `scope:${PLACE_SNAPSHOT}`,
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
        json({ overture: [{ dataset: 'overture', record_id: place.id }] }),
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
        `scope:${PLACE_SNAPSHOT}`,
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
      [
        `scope:${PLACE_SNAPSHOT}`,
        place.id,
        `scope:${DIVISION_SNAPSHOT}`,
        'division-central',
      ],
    )
  }
}

function seedHistory(sqlite: Database) {
  run(
    sqlite,
    `INSERT INTO divisions
      (id, level, class, versionHash, sourceReleaseId, snapshotId, isCurrent, createdAt, updatedAt, hierarchies)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '{"administrative":[],"locality":[],"full":[]}')`,
    [
      'division-central',
      2,
      'district',
      'division-central-v1',
      'release-overture-2026-08-19',
      DIVISION_SNAPSHOT,
      1,
      PUBLISHED_AT,
      PUBLISHED_AT,
    ],
  )
  run(
    sqlite,
    `INSERT INTO divisionsI18n
      (divisionId, locale, name, isLocaleInferred, versionHash, sourceReleaseId,
       snapshotId, isCurrent, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      'division-central',
      'en',
      'Central and Western',
      0,
      'division-central-en-v1',
      'release-overture-2026-08-19',
      DIVISION_SNAPSHOT,
      1,
      PUBLISHED_AT,
      PUBLISHED_AT,
    ],
  )
  run(
    sqlite,
    `INSERT INTO snapshotVersionChanges
      (snapshotId, recordType, recordId, locale, versionHash, operation, sourceReleaseId, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      DIVISION_SNAPSHOT,
      'division',
      'division-central',
      '',
      'division-central-v1',
      'upsert',
      'release-overture-2026-08-19',
      PUBLISHED_AT,
      PUBLISHED_AT,
    ],
  )
  run(
    sqlite,
    `INSERT INTO snapshotVersionChanges
      (snapshotId, recordType, recordId, locale, versionHash, operation, sourceReleaseId, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      DIVISION_SNAPSHOT,
      'divisionI18n',
      'division-central',
      'en',
      'division-central-en-v1',
      'upsert',
      'release-overture-2026-08-19',
      PUBLISHED_AT,
      PUBLISHED_AT,
    ],
  )

  for (const [id, name, category, taxonomy, point] of [
    ['place-ramen', 'Ramen House', 'restaurant', 'ramen_restaurant', [114.155, 22.285]],
    ['place-cafe', 'Coffee House', 'cafe', 'cafe', [114.156, 22.286]],
  ] as const) {
    const addressId = `address-${id}`
    const placeHash = `${id}-v1`
    const i18nHash = `${id}-en-v1`
    run(
      sqlite,
      `INSERT INTO address2d
        (id, granularity, districtId, geometry, bbox, identifiers, sources,
         versionHash, sourceReleaseId, snapshotId, isCurrent, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        addressId,
        'building',
        'division-central',
        JSON.stringify({ type: 'Point', coordinates: point }),
        JSON.stringify([...point, ...point]),
        '{}',
        '{}',
        `${addressId}-v1`,
        'release-overture-2026-08-19',
        ADDRESS_SNAPSHOT,
        1,
        PUBLISHED_AT,
        PUBLISHED_AT,
      ],
    )
    run(
      sqlite,
      `INSERT INTO snapshotVersionChanges
        (snapshotId, recordType, recordId, locale, versionHash, operation, sourceReleaseId, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        ADDRESS_SNAPSHOT,
        'address2d',
        addressId,
        '',
        `${addressId}-v1`,
        'upsert',
        'release-overture-2026-08-19',
        PUBLISHED_AT,
        PUBLISHED_AT,
      ],
    )
    run(
      sqlite,
      `INSERT INTO places
        (id, releaseId, addressSnapshotId, address2dId, lng, lat, bbox,
         operatingStatus, basicCategory, taxonomyPrimary, taxonomyHierarchy,
         taxonomyAlternates, websites, confidence, sources, firstSeenMonth,
         lastSeenMonth, versionHash, sourceReleaseId, snapshotId, isCurrent,
         createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        'release-overture-2026-08-19',
        ADDRESS_SNAPSHOT,
        addressId,
        point[0],
        point[1],
        JSON.stringify([...point, ...point]),
        'open',
        category,
        taxonomy,
        JSON.stringify(['food_and_drink', taxonomy]),
        '[]',
        JSON.stringify(['https://example.com']),
        0.9,
        '{}',
        '2026-08',
        '2026-08',
        placeHash,
        'release-overture-2026-08-19',
        PLACE_SNAPSHOT,
        1,
        PUBLISHED_AT,
        PUBLISHED_AT,
      ],
    )
    run(
      sqlite,
      `INSERT INTO placesI18n
        (placeId, locale, name, freeformAddress, provenance, versionHash,
         sourceReleaseId, snapshotId, isCurrent, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        'en',
        name,
        'Central, Hong Kong',
        '{}',
        i18nHash,
        'release-overture-2026-08-19',
        PLACE_SNAPSHOT,
        1,
        PUBLISHED_AT,
        PUBLISHED_AT,
      ],
    )
    for (const [recordType, locale, versionHash] of [
      ['place', '', placeHash],
      ['placeI18n', 'en', i18nHash],
    ] as const) {
      run(
        sqlite,
        `INSERT INTO snapshotVersionChanges
          (snapshotId, recordType, recordId, locale, versionHash, operation, sourceReleaseId, createdAt, updatedAt)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          PLACE_SNAPSHOT,
          recordType,
          id,
          locale,
          versionHash,
          'upsert',
          'release-overture-2026-08-19',
          PUBLISHED_AT,
          PUBLISHED_AT,
        ],
      )
    }
  }
}

function createFixtureEnvironment(
  options: {
    historyOnly?: boolean
    rejectHistory?: boolean
    beforeCurrentRead?: (sqlite: Database, query: string) => void
  } = {},
) {
  const metaSqlite = initSqlite(['meta'])
  const currentSqlite = initSqlite(['current'])
  const historySqlite = initSqlite(['history'])
  seedMeta(metaSqlite)
  if (!options.historyOnly) {
    seedCurrent(currentSqlite)
    for (const [family, snapshotId] of [
      ['place', PLACE_SNAPSHOT],
      ['division', DIVISION_SNAPSHOT],
    ] as const) {
      run(
        currentSqlite,
        `INSERT INTO ${family}PublicationState(snapshotId,scopeId,status,publicationToken,preparedAt) VALUES (?,?, 'current','fixture',?)`,
        [snapshotId, `scope:${snapshotId}`, PUBLISHED_AT],
      )
    }
  } else {
    metaSqlite.exec(`INSERT INTO apiReleaseSets
      (id,apiVersionId,code,regionCode,domainCode,cohortKey,revision,effectiveFrom,schemaVersion,rulesetVersion,status,publishedAt,versionHash,createdAt,updatedAt)
      SELECT id || '-latest',apiVersionId,code || '-latest',regionCode,domainCode,'2026-09-01',0,effectiveFrom,schemaVersion,rulesetVersion,status,publishedAt,versionHash,createdAt,updatedAt FROM apiReleaseSets;
      INSERT INTO apiReleaseSetSnapshots(apiReleaseSetId,snapshotId,variant,role,isRequired,cohortMatchingMode,createdAt)
      SELECT apiReleaseSetId || '-latest',snapshotId,variant,role,isRequired,cohortMatchingMode,createdAt FROM apiReleaseSetSnapshots;
      UPDATE apiCatalogRevisionReleaseSets SET isDefault=0;
      INSERT INTO apiCatalogRevisionReleaseSets(apiCatalogRevisionId,apiReleaseSetId,domainCode,cohortKey,isDefault,createdAt)
      SELECT apiCatalogRevisionId,apiReleaseSetId || '-latest',domainCode,'2026-09-01',1,createdAt FROM apiCatalogRevisionReleaseSets;`)
  }
  seedHistory(historySqlite)
  const historyDb = options.rejectHistory
    ? ({
        prepare() {
          throw new Error('Current Places must not read history')
        },
      } as unknown as D1Database)
    : createMockD1(historySqlite)
  return {
    currentSqlite,
    env: {
      DB_META: createMockD1(metaSqlite),
      DB_CURRENT: createMockD1(currentSqlite, query =>
        options.beforeCurrentRead?.(currentSqlite, query),
      ),
      DB_HISTORY_HK_BEFORE: historyDb,
      DB_HISTORY_HK_2025: historyDb,
      DB_HISTORY_HK_2026: historyDb,
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
      historySqlite.close()
    },
  }
}

describe('Places collection through the Worker route', () => {
  for (const historyOnly of [false, true]) {
    test(`paginates with historyOnly=${historyOnly}, including empty filtered pages`, async () => {
      const fixture = createFixtureEnvironment({
        historyOnly,
        rejectHistory: !historyOnly,
      })
      try {
        for (const offset of [0, 1]) {
          const response = await app.fetch(
            new Request(
              `http://localhost/places/v0.1?releaseSet=${RELEASE_SET}&include=divisions&filter[basicCategory]=restaurant&filter[taxonomyPrimary]=ramen_restaurant&filter[operatingStatus]=open&page[limit]=1&page[offset]=${offset}`,
            ),
            fixture.env,
          )
          const body = (await response.json()) as {
            data: Array<{ id: string }>
            meta: { page: { total?: number; hasMore?: boolean } }
          }
          expect(response.status).toBe(200)
          if (historyOnly) {
            expect(body.meta.page.total).toBeUndefined()
            expect(body.meta.page.hasMore).toBe(false)
          } else expect(body.meta.page.total).toBe(1)
          expect(body.data.map(row => row.id)).toEqual(
            offset === 0 ? ['place-ramen'] : [],
          )
        }
      } finally {
        fixture.close()
      }
    })
  }
  test('defaults to HK, resolves GBA to HK, and keeps MO outside HK publications', async () => {
    const fixture = createFixtureEnvironment()
    try {
      const documents = []
      for (const region of ['', '&region=hk', '&region=gba']) {
        const response = await app.fetch(
          new Request(
            `http://localhost/places/v0.1?releaseSet=${RELEASE_SET}&page[limit]=1${region}`,
          ),
          fixture.env,
        )
        expect(response.status).toBe(200)
        const body = (await response.json()) as {
          data: unknown[]
          links: { next: string; permalink: string }
          meta: { region: string }
        }
        expect(body.meta.region).toBe('hk')
        expect(new URL(body.links.permalink).pathname).toBe('/places/v0.1')
        if (region)
          expect(new URL(body.links.next).searchParams.get('region')).toBe(
            region.slice(8),
          )
        const pinned = await app.fetch(new Request(body.links.permalink), fixture.env)
        expect(pinned.status).toBe(200)
        expect(((await pinned.json()) as { data: unknown[] }).data).toEqual(body.data)
        documents.push(body.data)
      }
      expect(documents[1]).toEqual(documents[0])
      expect(documents[2]).toEqual(documents[0])
      const mo = await app.fetch(
        new Request(`http://localhost/places/v0.1?region=mo&releaseSet=${RELEASE_SET}`),
        fixture.env,
      )
      expect(mo.status).toBe(200)
      expect(await mo.json()).toMatchObject({
        data: [],
        meta: { region: 'mo', page: { total: 0 } },
      })
    } finally {
      fixture.close()
    }
  })

  test('MO has empty collections and missing records across every family', async () => {
    const fixture = createFixtureEnvironment()
    try {
      for (const path of [
        '/addresses/v0.1',
        '/addresses/v0.1/search?q=central&match=full-text',
        '/divisions/v0.1',
        '/stats/v0.1',
        '/stats/v0.1/geographies?filter[field]=population&filter[referencePeriod]=2021',
        '/stats/v0.1/series?filter[field]=population',
        '/stats/v0.1/registry',
        '/stats/v0.1/registry/fields',
        '/streets/v0.1/changelog',
        '/places/v0.1',
        '/places/v0',
      ]) {
        const response = await app.fetch(
          new Request(
            `http://localhost${path}${path.includes('?') ? '&' : '?'}region=mo`,
          ),
          fixture.env,
        )
        expect(response.status, `${path}: ${await response.clone().text()}`).toBe(200)
        expect(await response.json()).toMatchObject({
          data: [],
          meta: { region: 'mo' },
        })
      }
      for (const path of [
        '/addresses/v0.1/a',
        '/addresses/v0.1/a/units',
        '/divisions/v0.1/division-central',
        '/stats/v0.1/a',
        '/streets/v0.1/a',
        '/streets/v0.1/a/versions',
        '/streets/v0.1/a/versions/1',
        '/places/v0.1/place-ramen',
      ]) {
        const response = await app.fetch(
          new Request(`http://localhost${path}?region=mo`),
          fixture.env,
        )
        expect(response.status).toBe(404)
      }
      for (const [path, expected] of [
        ['/places/v0.1/search?q=sushi', { results: [] }],
        ['/places/v0.1/by-cell/9/89283470cdbffff?', { places: [] }],
        ['/addresses/v0.1/source-releases?', { sourceReleases: [] }],
        ['/divisions/v0.1/source-releases?', { sourceReleases: [] }],
        ['/stats/v0.1/source-releases?', { sourceReleases: [] }],
      ] as const) {
        const response = await app.fetch(
          new Request(`http://localhost${path}&region=mo`),
          fixture.env,
        )
        expect(response.status).toBe(200)
        expect((await response.json()) as Record<string, unknown>).toEqual(expected)
      }
      for (const format of ['json', 'ndjson']) {
        const response = await app.fetch(
          new Request(
            `http://localhost/divisions/v0.1/sources?sourceRelease=dr-hk-overture-division-2026-08-19.0&region=mo&format=${format}`,
          ),
          fixture.env,
        )
        expect(response.status).toBe(404)
      }
    } finally {
      fixture.close()
    }
  })

  test('paginates filtered compact records and pins the selected release set', async () => {
    const fixture = createFixtureEnvironment()
    try {
      const response = await app.fetch(
        new Request(
          `http://localhost/places/v0.1?releaseSet=${RELEASE_SET}&filter[basicCategory]=restaurant&filter[taxonomyPrimary]=ramen_restaurant&filter[operatingStatus]=open&page[limit]=1`,
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
          `http://localhost/places/v0?releaseSet=${RELEASE_SET}&profile=map&filter[division]=division-central&include=divisions`,
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
          `http://localhost/places/v0.1?releaseSet=${RELEASE_SET}&profile=full`,
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
        sources: { overture: [expect.objectContaining({ dataset: 'overture' })] },
        geometry: { type: 'Point', coordinates: [114.155, 22.285] },
      })
      expect(body.meta.locales).toEqual(['*'])
    } finally {
      fixture.close()
    }
  })
})

test('Place current endpoints reject incomplete publications while preserving empty ready selections', async () => {
  const fixture = createFixtureEnvironment({ rejectHistory: true })
  try {
    const paths = [
      '/places/v0.1',
      '/places/v0.1/place-ramen',
      '/places/v0.1/by-cell/9/891f1d48803ffff',
      '/places/v0.1/search?q=Shop',
    ]
    fixture.currentSqlite.exec("UPDATE placePublicationState SET status='publishing'")
    for (const path of paths) {
      const response = await app.fetch(
        new Request(`http://localhost${path}`),
        fixture.env,
      )
      expect(response.status).toBe(503)
      expect(await response.json()).toMatchObject({ error: 'snapshot_not_ready' })
    }
    fixture.currentSqlite.exec(
      "UPDATE placePublicationState SET status='current'; DELETE FROM placesDivision; DELETE FROM placesI18n; DELETE FROM places",
    )
    const empty = await app.fetch(
      new Request('http://localhost/places/v0.1'),
      fixture.env,
    )
    expect(empty.status).toBe(200)
    expect(await empty.json()).toMatchObject({ data: [], meta: { page: { total: 0 } } })
    const absent = await app.fetch(
      new Request('http://localhost/places/v0.1/place-ramen'),
      fixture.env,
    )
    expect(absent.status).toBe(404)
  } finally {
    fixture.close()
  }
})

test('Place routes discard reads interrupted by publication', async () => {
  let interrupted = false
  const fixture = createFixtureEnvironment({
    rejectHistory: true,
    beforeCurrentRead(sqlite, query) {
      if (!interrupted && query.includes('from "places"')) {
        interrupted = true
        sqlite.exec("UPDATE placePublicationState SET publicationToken='replacement'")
      }
    },
  })
  try {
    const result = await app.fetch(
      new Request('http://localhost/places/v0.1'),
      fixture.env,
    )
    expect(interrupted).toBe(true)
    expect(result.status).toBe(503)
    expect(await result.json()).toMatchObject({ error: 'snapshot_not_ready' })
  } finally {
    fixture.close()
  }
})
