import { seedSnapshotProducerFixtures } from '../../../../../../libs/core/src/testing/snapshotFixtures'
import { insertFixtureSnapshot } from '../../../../../../libs/core/src/testing/snapshotFixtures'
import { describe, expect, test } from 'bun:test'
import { Database, type SQLQueryBindings } from 'bun:sqlite'
import { resolve } from 'node:path'

import { loadMigrationSql } from '../../../../../../libs/core/src/testing/metaFixtures'
import type { AppBindings } from '../../../types'
import app from '../../../index'
import { PlaceIdentifiersSchema } from '../../../schema/places'

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
      (id, code, familyType, version, status, versionHash, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      'api-version-places-v0.1',
      'api-places-v0.1',
      'places',
      '0.1',
      'current',
      'api-version-hash',
      PUBLISHED_AT,
      PUBLISHED_AT,
    ],
  )
  const snapshots: Array<[string, string, string]> = [
    [PLACE_SNAPSHOT, 'place', 'ss-hk-place-2026-08-19.0'],
    [DIVISION_SNAPSHOT, 'division', 'ss-hk-division-overture-2026-08-19.0'],
    [ADDRESS_SNAPSHOT, 'address', 'ss-hk-address-hkgov-dpo-2026-08-19.0'],
  ]
  for (const [id, resourceType, code] of snapshots) {
    insertFixtureSnapshot(sqlite, {
      id: id,
      resourceType: resourceType,
      code: code,
      cohortKey: '2026-08-19.0',
      revision: 0,
      status: 'published',
      publishedAt: PUBLISHED_AT,
      validFrom: PUBLISHED_AT,
      createdAt: PUBLISHED_AT,
      updatedAt: PUBLISHED_AT,
    })
  }
  run(
    sqlite,
    `INSERT INTO apiReleaseSets
      (id, code, regionCode, domainCode, cohortKey, revision, effectiveFrom,
       schemaVersion, rulesetVersion, versionHash, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      'api-release-set-places',
      RELEASE_SET,
      'hk',
      'overture',
      '2026-08-19.0',
      0,
      PUBLISHED_AT,
      'sv-place-v1',
      'rs-place-v1',
      'release-set-hash',
      PUBLISHED_AT,
      PUBLISHED_AT,
    ],
  )
  run(
    sqlite,
    `INSERT INTO apiVersionReleaseSets
      (id, apiVersionId, apiReleaseSetId, status, publishedAt, validFrom, versionHash, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      'api-release-set-places-v01',
      'api-version-places-v0.1',
      'api-release-set-places',
      'current',
      PUBLISHED_AT,
      PUBLISHED_AT,
      'api-release-set-places-v01-hash',
      PUBLISHED_AT,
      PUBLISHED_AT,
    ],
  )
  const releaseSetSnapshots: Array<[string, string, string]> = [
    [PLACE_SNAPSHOT, 'overture', 'primary'],
    [DIVISION_SNAPSHOT, 'overture', 'lookup'],
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
      (apiCatalogRevisionId, apiVersionReleaseSetId, domainCode, cohortKey, isDefault, createdAt)
      VALUES (?, ?, ?, ?, ?, ?)`,
    [
      'catalog-places',
      'api-release-set-places-v01',
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
      (scopeId, id, level, class, createdAt, hierarchies)
      VALUES (?, ?, ?, ?, ?, '{"administrative":[],"locality":[],"landform":[],"full":[]}')`,
    [`scope:${DIVISION_SNAPSHOT}`, 'division-central', 2, 'district', PUBLISHED_AT],
  )
  run(
    sqlite,
    `INSERT INTO divisionsI18n
      (scopeId, divisionId, locale, name,meta, createdAt)
      VALUES (?, ?, ?, ?,json_object('isLocaleInferred',json(CASE ? WHEN 1 THEN 'true' ELSE 'false' END)), ?)`,
    [
      `scope:${DIVISION_SNAPSHOT}`,
      'division-central',
      'en',
      'Central and Western',
      0,
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
      'INSERT INTO places (scopeId,id,resourceReleaseId,geometry,bbox,operatingStatus,basicCategory,taxonomyPrimary,taxonomyHierarchy,taxonomyAlternates,websites,confidence,sources,firstSeenMonth,createdAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      [
        `scope:${PLACE_SNAPSHOT}`,
        place.id,
        'release-overture-2026-08-19',
        JSON.stringify({
          type: 'Point',
          coordinates: [place.point[0], place.point[1]],
        }),
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
        PUBLISHED_AT,
      ],
    )
    run(
      sqlite,
      `INSERT INTO placesI18n
        (scopeId, placeId, locale, name, brandName, freeformAddress, meta, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        `scope:${PLACE_SNAPSHOT}`,
        place.id,
        'en',
        place.name,
        null,
        'Central, Hong Kong',
        json({ isMachineTranslated: [], isHumanVerified: [], isLocaleInferred: false }),
        PUBLISHED_AT,
      ],
    )
    run(sqlite, 'UPDATE places SET districtId=? WHERE scopeId=? AND id=?', [
      'division-central',
      `scope:${PLACE_SNAPSHOT}`,
      place.id,
    ])
  }
}

function seedHistory(sqlite: Database) {
  run(
    sqlite,
    `INSERT INTO divisions (id,level,class,versionHash,snapshotId,isCurrent,createdAt,hierarchies) VALUES (?, ?, ?, ?, ?, ?, ?, '{"administrative":[],"locality":[],"landform":[],"full":[]}')`,
    [
      'division-central',
      2,
      'district',
      'division-central-v1',
      DIVISION_SNAPSHOT,
      1,
      PUBLISHED_AT,
    ],
  )
  run(
    sqlite,
    `INSERT INTO divisionsI18n (divisionId,locale,name,meta,versionHash,snapshotId,isCurrent,createdAt) VALUES (?, ?, ?,json_object('isLocaleInferred',json(CASE ? WHEN 1 THEN 'true' ELSE 'false' END)), ?, ?, ?, ?)`,
    [
      'division-central',
      'en',
      'Central and Western',
      0,
      'division-central-en-v1',
      DIVISION_SNAPSHOT,
      1,
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
      `INSERT INTO address2d (id,granularity,districtId,geometry,identifiers,sources,versionHash,snapshotId,isCurrent,createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        addressId,
        'building',
        'division-central',
        JSON.stringify({ type: 'Point', coordinates: point }),
        '{}',
        '{}',
        `${addressId}-v1`,
        ADDRESS_SNAPSHOT,
        1,
        PUBLISHED_AT,
      ],
    )
    run(
      sqlite,
      'INSERT INTO places (id,resourceReleaseId,addressSnapshotId,address2dId,geometry,bbox,operatingStatus,basicCategory,taxonomyPrimary,taxonomyHierarchy,taxonomyAlternates,websites,confidence,sources,firstSeenMonth,lastSeenMonth,versionHash,snapshotId,isCurrent,createdAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      [
        id,
        'release-overture-2026-08-19',
        ADDRESS_SNAPSHOT,
        addressId,
        JSON.stringify({ type: 'Point', coordinates: [point[0], point[1]] }),
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
        PLACE_SNAPSHOT,
        1,
        PUBLISHED_AT,
      ],
    )
    run(
      sqlite,
      `INSERT INTO placesI18n (placeId,locale,name,freeformAddress,meta,versionHash,snapshotId,isCurrent,createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        'en',
        name,
        'Central, Hong Kong',
        '{"isLocaleInferred":false}',
        i18nHash,
        PLACE_SNAPSHOT,
        1,
        PUBLISHED_AT,
      ],
    )
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
      (id,code,regionCode,domainCode,cohortKey,revision,effectiveFrom,schemaVersion,rulesetVersion,versionHash,createdAt,updatedAt)
      SELECT id || '-latest',code || '-latest',regionCode,domainCode,'2026-09-01',0,effectiveFrom,schemaVersion,rulesetVersion,versionHash,createdAt,updatedAt FROM apiReleaseSets;
      INSERT INTO apiVersionReleaseSets(id,apiVersionId,apiReleaseSetId,status,publishedAt,validFrom,versionHash,createdAt,updatedAt)
      SELECT id || '-latest',apiVersionId,apiReleaseSetId || '-latest',status,publishedAt,validFrom,versionHash,createdAt,updatedAt FROM apiVersionReleaseSets;
      INSERT INTO apiReleaseSetSnapshots(apiReleaseSetId,snapshotId,variant,role,isRequired,cohortMatchingMode,createdAt)
      SELECT apiReleaseSetId || '-latest',snapshotId,variant,role,isRequired,cohortMatchingMode,createdAt FROM apiReleaseSetSnapshots;
      UPDATE apiCatalogRevisionReleaseSets SET isDefault=0;
      INSERT INTO apiCatalogRevisionReleaseSets(apiCatalogRevisionId,apiVersionReleaseSetId,domainCode,cohortKey,isDefault,createdAt)
      SELECT apiCatalogRevisionId,apiVersionReleaseSetId || '-latest',domainCode,'2026-09-01',1,createdAt FROM apiCatalogRevisionReleaseSets;`)
  }
  seedHistory(historySqlite)
  const historyDb = options.rejectHistory
    ? ({
        prepare() {
          throw new Error('Current Places must not read history')
        },
      } as unknown as D1Database)
    : createMockD1(historySqlite)
  seedSnapshotProducerFixtures(metaSqlite)
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
        [
          '/places/v0.1/by-cell/9/89283470cdbffff?',
          {
            places: [],
            links: {
              self: 'http://localhost/places/v0.1/by-cell/9/89283470cdbffff?region=mo&limit=50&offset=0',
            },
            meta: { page: { limit: 50, offset: 0, hasMore: false } },
          },
        ],
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
        resourceReleaseId: 'release-overture-2026-08-19',
        sources: { overture: [expect.objectContaining({ dataset: 'overture' })] },
        geometry: { type: 'Point', coordinates: [114.155, 22.285] },
      })
      expect(body.meta.locales).toEqual(['*'])
    } finally {
      fixture.close()
    }
  })
})

test('Place cell pagination visits every Place in stable order on both API paths', async () => {
  const fixture = createFixtureEnvironment({ rejectHistory: true })
  try {
    fixture.currentSqlite.exec(`INSERT INTO placesCells(scopeId,id,h3Level,h3Cell)
      SELECT scopeId,id,9,'891f1d48803ffff' FROM places;
      INSERT INTO placesCells(scopeId,id,h3Level,h3Cell)
      SELECT scopeId,id,7,'871f1d488ffffff' FROM places;`)
    for (const version of ['v0', 'v0.1']) {
      const first = await app.fetch(
        new Request(
          `http://localhost/places/${version}/by-cell/9/891f1d48803ffff?region=hk&limit=1`,
        ),
        fixture.env,
      )
      expect(first.status).toBe(200)
      const page = (await first.json()) as {
        places: { placeId: string; geometry: unknown }[]
        links: { self: string; next?: string }
        meta: { page: { limit: number; offset: number; hasMore: boolean } }
      }
      expect(page.places.map(place => place.placeId)).toEqual(['place-cafe'])
      expect(page.places[0]?.geometry).toEqual({
        type: 'Point',
        coordinates: [114.156, 22.286],
      })
      expect(page.meta.page).toEqual({ limit: 1, offset: 0, hasMore: true })
      expect(page.links.next).toBe(
        `http://localhost/places/v0.1/by-cell/9/891f1d48803ffff?region=hk&limit=1&offset=1`,
      )
      const second = await app.fetch(new Request(page.links.next!), fixture.env)
      expect(second.status).toBe(200)
      const final = (await second.json()) as { links: { next?: string } }
      expect(final).toMatchObject({
        places: [{ placeId: 'place-ramen' }],
        meta: { page: { limit: 1, offset: 1, hasMore: false } },
      })
      expect(final.links.next).toBeUndefined()
      const empty = await app.fetch(
        new Request(
          `http://localhost/places/${version}/by-cell/9/891f1d48803ffff?limit=1&offset=2`,
        ),
        fixture.env,
      )
      const emptyPage = (await empty.json()) as {
        places: unknown[]
        links: { next?: string }
        meta: unknown
      }
      expect(emptyPage.places).toEqual([])
      expect(emptyPage.links.next).toBeUndefined()
      expect(emptyPage.meta).toEqual({ page: { limit: 1, offset: 2, hasMore: false } })
    }
    for (const offset of ['-1', '0.5', 'no', '9007199254740992']) {
      const response = await app.fetch(
        new Request(
          `http://localhost/places/v0.1/by-cell/9/891f1d48803ffff?offset=${offset}`,
        ),
        fixture.env,
      )
      expect(response.status).toBe(422)
    }
  } finally {
    fixture.close()
  }
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
      "UPDATE placePublicationState SET status='current'; DELETE FROM placesI18n; DELETE FROM places",
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

test('Place current responses derive last seen month from publication without rewriting the stored record', async () => {
  const fixture = createFixtureEnvironment({ rejectHistory: true })
  try {
    expect(
      fixture.currentSqlite
        .query('PRAGMA table_info(places)')
        .all()
        .map(row => (row as { name: string }).name),
    ).not.toContain('lastSeenMonth')
    const stored = fixture.currentSqlite
      .query('SELECT rowid,* FROM places ORDER BY id')
      .all()
    const list = await app.fetch(
      new Request('http://localhost/places/v0.1?profile=full'),
      fixture.env,
    )
    expect(list.status).toBe(200)
    expect(
      (
        (await list.json()) as {
          data: Array<{ attributes: { lastSeenMonth: string } }>
        }
      ).data.map(row => row.attributes.lastSeenMonth),
    ).toEqual(['2026-08', '2026-08'])
    const detail = await app.fetch(
      new Request('http://localhost/places/v0.1/place-ramen'),
      fixture.env,
    )
    expect(detail.status).toBe(200)
    expect(await detail.json()).toMatchObject({
      place: { lastSeenMonth: '2026-08', snapshotId: PLACE_SNAPSHOT },
    })
    expect(
      fixture.currentSqlite.query('SELECT rowid,* FROM places ORDER BY id').all(),
    ).toEqual(stored)
  } finally {
    fixture.close()
  }
})

test('Place API returns a scalar Wikidata brand identifier', async () => {
  const fixture = createFixtureEnvironment({ rejectHistory: true })
  try {
    fixture.currentSqlite
      .query('UPDATE places SET identifiers=? WHERE id=?')
      .run(JSON.stringify({ wikidata: { brandId: 'Q123' } }), 'place-ramen')
    const response = await app.fetch(
      new Request('http://localhost/places/v0.1?profile=full'),
      fixture.env,
    )
    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      data: Array<{ id: string; attributes: { identifiers: unknown } }>
    }
    const identifiers = body.data.find(row => row.id === 'place-ramen')?.attributes
      .identifiers
    expect(PlaceIdentifiersSchema.parse(identifiers)).toEqual({
      wikidata: { brandId: 'Q123' },
    })
  } finally {
    fixture.close()
  }
})
