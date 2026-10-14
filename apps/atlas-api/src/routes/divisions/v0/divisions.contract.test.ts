import { insertFixtureSnapshot } from '../../../../../../libs/core/src/testing/snapshotFixtures'
import { describe, expect, test } from 'bun:test'
import { Database, type SQLQueryBindings } from 'bun:sqlite'
import { resolve } from 'node:path'

import { loadMigrationSql } from '../../../../../../libs/core/src/testing/metaFixtures'
import type { AppBindings } from '../../../types'
import app from '../../../index'
import { createLocalHarbourDb } from '../../../../../../libs/core/src/testing/localDb'
import { finalisePublishedSearch } from '@repo/core/pipeline/services/search/finalise'

const REPO_ROOT = resolve(import.meta.dir, '../../../../../../')
const MIGRATIONS_DIR = resolve(REPO_ROOT, 'libs/db/migrations')
const CATALOG_REVISION = 'catalog-hk-divisions-v0.1-2026-08-14-r0'
const CATALOG_PUBLISHED_AT = '2026-08-14T00:00:00.000Z'
const OVERTURE_RELEASE_SET = 'data-hk-divisions-2025-09-24.0'

type SqliteD1Statement = {
  bind: (...values: SQLQueryBindings[]) => SqliteD1Statement
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

      const bound: SqliteD1Statement = {
        bind(...nextValues: SQLQueryBindings[]) {
          values = nextValues
          return bound
        },
        async all<T>() {
          return {
            results: statement.all(...values) as T[],
            success: true,
          }
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
          return {
            meta: { changes: result.changes },
            success: true,
          }
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
      'api-version-divisions-v0.1',
      'api-divisions-v0.1',
      'divisions',
      '0.1',
      'current',
      'test-api-version-hash',
      CATALOG_PUBLISHED_AT,
      CATALOG_PUBLISHED_AT,
    ],
  )

  const releases = [
    {
      id: 'api-release-set-overture-2025',
      code: OVERTURE_RELEASE_SET,
      domain: 'geographic',
      cohort: '2025-09-24.0',
      snapshot: 'snapshot-overture-2025',
      effectiveFrom: '2025-09-24T00:00:00.000Z',
    },
    {
      id: 'api-release-set-pland-pu-2021',
      code: 'data-hk-divisions-2021--hkgov-pland-pu',
      domain: 'hkgov-pland-pu',
      cohort: '2021',
      snapshot: 'snapshot-pland-pu-2021',
      effectiveFrom: '2021-01-01T00:00:00.000Z',
    },
    {
      id: 'api-release-set-pland-new-town-2021',
      code: 'data-hk-divisions-2021--hkgov-pland-new-town',
      domain: 'hkgov-pland-new-town',
      cohort: '2021',
      snapshot: 'snapshot-pland-new-town-2021',
      effectiveFrom: '2021-01-01T00:00:00.000Z',
    },
  ]

  const geometrySnapshots = [
    {
      id: 'snapshot-overture-2025-area-overture',
      resourceType: 'divisionArea',
      code: 'ss-hk-division-area-2025-09-24.0',
      variant: 'overture',
    },
    {
      id: 'snapshot-overture-2025-area-had',
      resourceType: 'divisionArea',
      code: 'ss-hk-division-area-had-2025-09-24.0',
      variant: 'hkgov-had',
    },
    {
      id: 'snapshot-overture-2025-area-censtatd',
      resourceType: 'divisionArea',
      code: 'ss-hk-division-area-censtatd-2021-simplified',
      variant: 'hkgov-censtatd:2021:simplified',
    },
    {
      id: 'snapshot-overture-2025-boundary-overture',
      resourceType: 'divisionBoundary',
      code: 'ss-hk-division-boundary-2025-09-24.0',
      variant: 'overture',
    },
  ]

  for (const release of releases) {
    insertFixtureSnapshot(sqlite, {
      id: release.snapshot,
      resourceType: 'division',
      code: `ss-hk-division-${release.domain}-${release.cohort}`,
      cohortKey: release.cohort,
      revision: 0,
      status: 'published',
      publishedAt: CATALOG_PUBLISHED_AT,
      validFrom: release.effectiveFrom,
      createdAt: CATALOG_PUBLISHED_AT,
      updatedAt: CATALOG_PUBLISHED_AT,
    })
    run(
      sqlite,
      `INSERT INTO apiReleaseSets
        (id, code, regionCode, domainCode, cohortKey, revision, effectiveFrom,
         schemaVersion, rulesetVersion, versionHash, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        release.id,
        release.code,
        'hk',
        release.domain,
        release.cohort,
        0,
        release.effectiveFrom,
        'sv-division-v1',
        'rs-division-merge-v1',
        `hash-${release.id}`,
        CATALOG_PUBLISHED_AT,
        CATALOG_PUBLISHED_AT,
      ],
    )
    run(
      sqlite,
      `INSERT INTO apiVersionReleaseSets
        (id, apiVersionId, apiReleaseSetId, status, publishedAt, validFrom, versionHash, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        `${release.id}-v01`,
        'api-version-divisions-v0.1',
        release.id,
        'current',
        CATALOG_PUBLISHED_AT,
        release.effectiveFrom,
        `hash-${release.id}-v01`,
        CATALOG_PUBLISHED_AT,
        CATALOG_PUBLISHED_AT,
      ],
    )
    run(
      sqlite,
      `INSERT INTO apiReleaseSetSnapshots
        (apiReleaseSetId, snapshotId, variant, role, isRequired, cohortMatchingMode, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        release.id,
        release.snapshot,
        release.domain,
        'primary',
        1,
        'exact_ref',
        CATALOG_PUBLISHED_AT,
      ],
    )
  }

  const historyShards = [
    ['data-shard-history-hk-before-preview', null, 'DB_HISTORY_HK_BEFORE'],
    ['data-shard-history-hk-2025-preview', '2025', 'DB_HISTORY_HK_2025'],
  ] as const
  for (const [id, year, bindingName] of historyShards) {
    run(
      sqlite,
      `INSERT INTO dataShards
        (id, shardType, regionCode, year, environment, databaseName, databaseId, bindingName, status, versionHash, createdAt, updatedAt)
        VALUES (?, 'history', 'hk', ?, 'preview', ?, ?, ?, 'active', ?, ?, ?)`,
      [
        id,
        year,
        `fixture-${bindingName}`,
        `fixture-${bindingName}`,
        bindingName,
        `hash-${bindingName}`,
        CATALOG_PUBLISHED_AT,
        CATALOG_PUBLISHED_AT,
      ],
    )
  }
  for (const release of releases) {
    run(
      sqlite,
      `INSERT INTO snapshotShardAssignments (snapshotId, dataShardId)
        VALUES (?, ?)`,
      [
        release.snapshot,
        release.cohort.startsWith('2025')
          ? 'data-shard-history-hk-2025-preview'
          : 'data-shard-history-hk-before-preview',
      ],
    )
  }

  for (const snapshot of geometrySnapshots) {
    insertFixtureSnapshot(sqlite, {
      id: snapshot.id,
      resourceType: snapshot.resourceType,
      code: snapshot.code,
      cohortKey: '2025-09-24.0',
      revision: 0,
      status: 'published',
      publishedAt: CATALOG_PUBLISHED_AT,
      validFrom: '2025-09-24T00:00:00.000Z',
      createdAt: CATALOG_PUBLISHED_AT,
      updatedAt: CATALOG_PUBLISHED_AT,
    })
    run(
      sqlite,
      `INSERT INTO apiReleaseSetSnapshots
        (apiReleaseSetId, snapshotId, variant, role, isRequired, cohortMatchingMode, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        'api-release-set-overture-2025',
        snapshot.id,
        snapshot.variant,
        'geometry',
        1,
        'exact_ref',
        CATALOG_PUBLISHED_AT,
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
      'catalog-revision-divisions-2026-08-14',
      'api-version-divisions-v0.1',
      CATALOG_REVISION,
      'hk',
      '2026-08-14',
      0,
      'overture',
      'current',
      CATALOG_PUBLISHED_AT,
      'test-catalog-revision-hash',
      CATALOG_PUBLISHED_AT,
      CATALOG_PUBLISHED_AT,
    ],
  )

  for (const release of releases) {
    run(
      sqlite,
      `INSERT INTO apiCatalogRevisionReleaseSets
        (apiCatalogRevisionId, apiVersionReleaseSetId, domainCode, cohortKey, isDefault, createdAt)
        VALUES (?, ?, ?, ?, ?, ?)`,
      [
        'catalog-revision-divisions-2026-08-14',
        `${release.id}-v01`,
        release.domain,
        release.cohort,
        release.domain === 'overture' ? 1 : 0,
        CATALOG_PUBLISHED_AT,
      ],
    )
  }
}

const divisionRows = [
  {
    id: 'division-country-cn',
    level: 0,
    type: 'country',
    hierarchy: [],
    names: { en: 'China', 'zh-hant': '中國' },
    point: [104.2, 35.8],
  },
  {
    id: 'division-hk-sar',
    level: 0,
    type: 'sar',
    hierarchy: [
      { division_id: 'division-country-cn', subtype: 'country', name: '中国' },
    ],
    names: { en: 'Hong Kong SAR', 'zh-hant': '香港特別行政區' },
    point: [114.17, 22.32],
  },
  {
    id: 'division-east',
    level: 2,
    type: 'district',
    hierarchy: [
      { division_id: 'division-country-cn', subtype: 'country', name: '中国' },
      { division_id: 'division-hk-sar', subtype: 'dependency', name: 'Hong Kong SAR' },
    ],
    names: { en: 'Eastern District', 'zh-hant': '東區' },
    point: [114.22, 22.28],
  },
  {
    id: 'division-a-kung-ngam',
    level: 3,
    type: 'locality',
    hierarchy: [
      { division_id: 'division-country-cn', subtype: 'country', name: '中国' },
      { division_id: 'division-hk-sar', subtype: 'dependency', name: 'Hong Kong SAR' },
      { division_id: 'division-east', subtype: 'region', name: 'Eastern District' },
    ],
    names: { en: 'A Kung Ngam', 'zh-hant': '阿公岩' },
    point: [114.2262, 22.2788],
  },
] as const

function seedCurrent(sqlite: Database) {
  for (const snapshotId of [
    'snapshot-overture-2025',
    'snapshot-pland-pu-2021',
    'snapshot-pland-new-town-2021',
  ]) {
    for (const division of divisionRows) {
      const sources = {
        overture: [
          {
            property: '/properties/id',
            dataset: 'overture',
            record_id: `ovt-${division.id}`,
          },
        ],
      }
      const timestamp = '2025-09-24T00:00:00.000Z'

      run(
        sqlite,
        `INSERT INTO divisions
          (scopeId, id, identifiers, level, category, class, geometry,
           hierarchies, cartography, sources, createdAt, updatedAt)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          `scope:${snapshotId}`,
          division.id,
          null,
          division.level,
          division.type === 'locality' ? 'locality' : 'administrative',
          division.type,
          json({ type: 'Point', coordinates: division.point }),
          json({
            administrative: division.hierarchy.length
              ? [
                  division.hierarchy.map(entry => ({
                    id: entry.division_id,
                    name: entry.name,
                    class:
                      entry.subtype === 'dependency'
                        ? 'sar'
                        : entry.subtype === 'region'
                          ? 'district'
                          : entry.subtype,
                  })),
                ]
              : [],
            locality: [],
            full: division.hierarchy.length
              ? [
                  division.hierarchy.map(entry => ({
                    id: entry.division_id,
                    name: entry.name,
                    class:
                      entry.subtype === 'dependency'
                        ? 'sar'
                        : entry.subtype === 'region'
                          ? 'district'
                          : entry.subtype,
                  })),
                ]
              : [],
          }),
          json({ kind: 'label-center' }),
          json(sources),
          timestamp,
          timestamp,
        ],
      )

      for (const [locale, name] of Object.entries(division.names)) {
        run(
          sqlite,
          `INSERT INTO divisionsI18n
            (scopeId, divisionId, locale, name, nameVariant, nameAlts, nameRules,meta, createdAt, updatedAt)
            VALUES (?, ?, ?, ?, ?, ?, ?,json_object('isLocaleInferred',json(CASE ? WHEN 1 THEN 'true' ELSE 'false' END)), ?, ?)`,
          [
            `scope:${snapshotId}`,
            division.id,
            locale,
            name,
            json([name]),
            null,
            null,
            0,
            timestamp,
            timestamp,
          ],
        )
      }
    }
  }

  const geometryRows = [
    {
      snapshotId: 'snapshot-overture-2025-area-overture',
      id: 'area-overture-division-east',
      variant: 'overture',
      divisionId: 'division-east',
      type: 'Polygon',
    },
    {
      snapshotId: 'snapshot-overture-2025-area-had',
      id: 'area-had-division-east',
      variant: 'hkgov-had',
      divisionId: 'division-east',
      type: 'Polygon',
    },
    {
      snapshotId: 'snapshot-overture-2025-area-censtatd',
      id: 'area-censtatd-division-east',
      variant: 'hkgov-censtatd:2021:simplified',
      divisionId: 'division-east',
      type: 'Polygon',
    },
  ]
  const timestamp = '2025-09-24T00:00:00.000Z'
  for (const row of geometryRows) {
    run(
      sqlite,
      `INSERT INTO divisionAreas
        (scopeId, id, variant, bbox, geometry, sources, type, isLand, isTerritorial,
         divisionId, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        `scope:${row.snapshotId}`,
        row.id,
        row.variant,
        json([114.18, 22.25, 114.3, 22.35]),
        json({ type: 'Polygon', coordinates: [] }),
        json({
          provider: [{ property: '/id', dataset: row.variant, record_id: row.id }],
        }),
        row.type,
        1,
        0,
        row.divisionId,
        timestamp,
        timestamp,
      ],
    )
  }
  run(
    sqlite,
    `INSERT INTO divisionBoundaries
      (scopeId, id, variant, bbox, geometry, sources, type, isLand, isTerritorial,
       leftDivisionId, rightDivisionId, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      'scope:snapshot-overture-2025-boundary-overture',
      'boundary-overture-division-east',
      'overture',
      json([114.18, 22.25, 114.3, 22.35]),
      json({
        type: 'LineString',
        coordinates: [
          [114.2, 22.25],
          [114.2, 22.35],
        ],
      }),
      json({
        overture: [
          { property: '/id', dataset: 'overture', record_id: 'boundary-east' },
        ],
      }),
      'LineString',
      1,
      0,
      'division-east',
      'division-hk-sar',
      timestamp,
      timestamp,
    ],
  )
}

function seedHistory(sqlite: Database, snapshotIds: string[]) {
  const timestamp = '2025-09-24T00:00:00.000Z'
  for (const snapshotId of snapshotIds) {
    for (const division of divisionRows) {
      const versionHash = `${snapshotId}-${division.id}`
      run(
        sqlite,
        `INSERT INTO divisions (id,identifiers,level,category,class,geometry,hierarchies,cartography,sources,versionHash,sourceReleaseId,snapshotId,isCurrent,createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          division.id,
          null,
          division.level,
          division.type === 'locality' ? 'locality' : 'administrative',
          division.type,
          json({ type: 'Point', coordinates: division.point }),
          json({
            administrative: division.hierarchy.length
              ? [
                  division.hierarchy.map(entry => ({
                    id: entry.division_id,
                    name: entry.name,
                    class:
                      entry.subtype === 'dependency'
                        ? 'sar'
                        : entry.subtype === 'region'
                          ? 'district'
                          : entry.subtype,
                  })),
                ]
              : [],
            locality: [],
            full: division.hierarchy.length
              ? [
                  division.hierarchy.map(entry => ({
                    id: entry.division_id,
                    name: entry.name,
                    class:
                      entry.subtype === 'dependency'
                        ? 'sar'
                        : entry.subtype === 'region'
                          ? 'district'
                          : entry.subtype,
                  })),
                ]
              : [],
          }),
          json({ kind: 'label-center' }),
          json({
            overture: [
              {
                property: '/properties/id',
                dataset: 'overture',
                record_id: `ovt-${division.id}`,
              },
            ],
          }),
          versionHash,
          'release-overture-2025',
          snapshotId,
          1,
          timestamp,
        ],
      )
      for (const [locale, name] of Object.entries(division.names)) {
        const i18nVersionHash = `${versionHash}-${locale}`
        run(
          sqlite,
          `INSERT INTO divisionsI18n (divisionId,locale,name,nameVariant,nameAlts,nameRules,meta,versionHash,sourceReleaseId,snapshotId,isCurrent,createdAt) VALUES (?, ?, ?, ?, ?, ?,json_object('isLocaleInferred',json(CASE ? WHEN 1 THEN 'true' ELSE 'false' END)), ?, ?, ?, ?, ?)`,
          [
            division.id,
            locale,
            name,
            json([name]),
            null,
            null,
            0,
            i18nVersionHash,
            'release-overture-2025',
            snapshotId,
            1,
            timestamp,
          ],
        )
      }
    }
  }
}

function createFixtureEnvironment() {
  const metaSqlite = initSqlite(['meta'])
  const currentSqlite = initSqlite(['current'])
  const historyBeforeSqlite = initSqlite(['history'])
  const history2025Sqlite = initSqlite(['history'])
  const history2026Sqlite = initSqlite(['history'])
  seedMeta(metaSqlite)
  seedCurrent(currentSqlite)
  for (const [family, dataTable] of [
    ['division', 'divisions'],
    ['divisionArea', 'divisionAreas'],
    ['divisionBoundary', 'divisionBoundaries'],
  ]) {
    currentSqlite.exec(`INSERT INTO ${family}PublicationState(snapshotId,scopeId,status,publicationToken,preparedAt)
      SELECT DISTINCT substr(scopeId,7),scopeId,'current','fixture','2026-01-01' FROM ${dataTable}`)
  }
  seedHistory(historyBeforeSqlite, [
    'snapshot-pland-pu-2021',
    'snapshot-pland-new-town-2021',
  ])
  seedHistory(history2025Sqlite, ['snapshot-overture-2025'])

  const metaDb = createMockD1(metaSqlite)
  const currentDb = createMockD1(currentSqlite)
  const env = {
    DB_META: metaDb,
    DB_CURRENT: currentDb,
    DB_HISTORY_HK_BEFORE: createMockD1(historyBeforeSqlite),
    DB_HISTORY_HK_2025: createMockD1(history2025Sqlite),
    DB_HISTORY_HK_2026: createMockD1(history2026Sqlite),
    DB_SOURCE_HK_BEFORE: currentDb,
    DB_SOURCE_HK_2025: currentDb,
    DB_SOURCE_HK_2026: currentDb,
    ATLAS_BASE_URL: 'http://localhost:8787',
    AUTH_MODE: 'disabled',
    ENVIRONMENT: 'test',
    API_RATE_LIMIT: { limit: async () => ({ success: true }) },
    API_USAGE: { writeDataPoint: () => {} },
    PRODUCT_USAGE_DATASET: 'test-product-usage',
  } as unknown as AppBindings

  return {
    env,
    metaSqlite,
    currentSqlite,
    close() {
      metaSqlite.close()
      currentSqlite.close()
      historyBeforeSqlite.close()
      history2025Sqlite.close()
      history2026Sqlite.close()
    },
  }
}

const requestCases = [
  {
    name: 'default list through app.fetch',
    path: `/divisions/v0.1?releaseSet=${OVERTURE_RELEASE_SET}`,
  },
  {
    name: 'current alias and map profile through app.fetch',
    path: `/divisions/v0?releaseSet=${OVERTURE_RELEASE_SET}&profile=map`,
  },
  {
    name: 'areas and boundaries through app.fetch',
    path: `/divisions/v0.1?releaseSet=${OVERTURE_RELEASE_SET}&include=areas:overture,boundaries`,
  },
  {
    name: 'detail and hierarchy through app.fetch',
    path: `/divisions/v0.1/division-a-kung-ngam?releaseSet=${OVERTURE_RELEASE_SET}&profile=full&include=hierarchy`,
  },
  {
    name: 'planning domain through app.fetch',
    path: '/divisions/v0.1?domain=hkgov-pland-pu&cohort=2021',
  },
  {
    name: 'filters and pagination through app.fetch',
    path: `/divisions/v0.1?releaseSet=${OVERTURE_RELEASE_SET}&filter[level]=3&filter[class]=locality&filter[parent]=division-east&page[limit]=1&page[offset]=0`,
  },
  {
    name: 'invalid request through app.fetch',
    path: '/divisions/v0.1?include=areas:not-a-provider',
  },
] as const

describe('Divisions API responses through the Worker route', () => {
  test('search finalises across domains, honours opt-in ancestors and serves both API versions', async () => {
    const f = createFixtureEnvironment()
    try {
      f.metaSqlite.exec("UPDATE apiCatalogRevisions SET defaultDomainCode='geographic'")
      f.metaSqlite.exec('UPDATE apiCatalogRevisionReleaseSets SET isDefault=1')
      const db = createLocalHarbourDb(f.metaSqlite)
      const current = {
        prepare: (sql: string) => ({ sql }) as unknown as D1PreparedStatement,
        batch: async (statements: D1PreparedStatement[]) =>
          f.currentSqlite.transaction(() => {
            for (const statement of statements)
              f.currentSqlite.exec((statement as unknown as { sql: string }).sql)
          })(),
      }
      const request = (path: string) =>
        app.fetch(new Request(`http://localhost${path}`), f.env)
      await finalisePublishedSearch(db, current, {
        deferred: true,
        publishedFamilies: ['divisions'],
      })
      expect((await request('/divisions/v0/search?q=Eastern')).status).toBe(503)
      await finalisePublishedSearch(db, current, {
        pendingReleaseSetCodes: ['pending'],
        publishedFamilies: ['divisions'],
      })
      expect((await request('/divisions/v0/search?q=Eastern')).status).toBe(200)
      await finalisePublishedSearch(db, current, { publishedFamilies: ['divisions'] })
      for (const version of ['v0', 'v0.1']) {
        const response = await request(`/divisions/${version}/search?q=Eastern`)
        expect(response.status).toBe(200)
        const body = (await response.json()) as {
          results: { domain: string; divisionId: string; match: string }[]
        }
        expect(new Set(body.results.map(r => r.domain)).size).toBe(3)
        expect(body.results.every(r => r.match === 'self')).toBe(true)
        const ancestors = await request(
          `/divisions/${version}/search?q=Eastern&ancestors=true`,
        )
        const expanded = (await ancestors.json()) as typeof body
        expect(expanded.results.some(r => r.match === 'ancestor')).toBe(true)
        const filtered = await request(
          `/divisions/${version}/search?q=Eastern&domain=hkgov-pland-pu`,
        )
        expect(
          ((await filtered.json()) as typeof body).results.map(r => r.domain),
        ).toEqual(['hkgov-pland-pu'])
      }
      expect(
        (await request('/divisions/v0/search?q=Eastern&releaseSet=old')).status,
      ).toBe(422)
      expect(
        (await request('/divisions/v0/search?q=Eastern&ancestors=yes')).status,
      ).toBe(422)
      expect(
        (await (await request('/divisions/v0/search?q=Eastern&region=mo')).json()) as {
          results: unknown[]
        },
      ).toEqual({ results: [] })
      expect(
        (await request('/divisions/v0/search?q=Eastern&access_token=pk.fixture'))
          .status,
      ).toBe(200)
      const before = f.currentSqlite.query('SELECT total_changes() AS n').get()
      // Reconciliation retries finalisation even when nothing newly publishes.
      await finalisePublishedSearch(db, current)
      expect(f.currentSqlite.query('SELECT total_changes() AS n').get()).toEqual(before)
    } finally {
      f.close()
    }
  })
  test('HK is the default and GBA selects the same published records', async () => {
    const fixture = createFixtureEnvironment()
    try {
      const records = []
      for (const region of ['', '&region=hk', '&region=gba']) {
        const response = await app.fetch(
          new Request(
            `http://localhost/divisions/v0.1?releaseSet=${OVERTURE_RELEASE_SET}${region}`,
          ),
          fixture.env,
        )
        expect(response.status).toBe(200)
        records.push(((await response.json()) as { data: unknown[] }).data)
      }
      expect(records[0]?.length).toBeGreaterThan(0)
      expect(records[1]).toEqual(records[0])
      expect(records[2]).toEqual(records[0])
      const mo = await app.fetch(
        new Request(
          `http://localhost/divisions/v0.1?releaseSet=${OVERTURE_RELEASE_SET}&region=mo`,
        ),
        fixture.env,
      )
      expect(mo.status).toBe(200)
      expect(await mo.json()).toMatchObject({ data: [], meta: { region: 'mo' } })
    } finally {
      fixture.close()
    }
  })

  for (const requestCase of requestCases) {
    test(requestCase.name, async () => {
      const fixture = createFixtureEnvironment()

      try {
        const response = await app.fetch(
          new Request(`http://localhost${requestCase.path}`),
          fixture.env,
        )

        expect({
          status: response.status,
          response: await response.json(),
        }).toMatchSnapshot(requestCase.name)
      } finally {
        fixture.close()
      }
    })
  }
})

test('0.2 resolves its own catalogue, exposes inventories and rejects absent choices', async () => {
  const fixture = createFixtureEnvironment()
  const clone = (table: string, where: string, overrides: Record<string, unknown>) => {
    const row = fixture.metaSqlite
      .query(`SELECT * FROM ${table} WHERE ${where}`)
      .get() as Record<string, SQLQueryBindings>
    const value = { ...row, ...overrides }
    const keys = Object.keys(value)
    fixture.metaSqlite
      .query(
        `INSERT INTO ${table} (${keys.map(k => `"${k}"`).join(',')}) VALUES (${keys.map(() => '?').join(',')})`,
      )
      .run(...(Object.values(value) as SQLQueryBindings[]))
  }
  try {
    clone('apiVersions', "code='api-divisions-v0.1'", {
      id: 'api-v02',
      code: 'api-divisions-v0.2',
      version: '0.2',
    })
    clone('apiReleaseSets', "id='api-release-set-overture-2025'", {
      id: 'release-v02',
      schemaVersion: 'sv-division-v2',
      rulesetVersion: 'rs-division-merge-v2',
      versionHash: 'release-v02-hash',
    })
    clone('apiVersionReleaseSets', "id='api-release-set-overture-2025-v01'", {
      id: 'release-v02-association',
      apiVersionId: 'api-v02',
      apiReleaseSetId: 'release-v02',
      versionHash: 'release-v02-association-hash',
    })
    clone('apiCatalogRevisions', `code='${CATALOG_REVISION}'`, {
      id: 'catalog-v02',
      code: 'catalog-v02',
      apiVersionId: 'api-v02',
    })
    clone(
      'apiCatalogRevisionReleaseSets',
      "apiVersionReleaseSetId='api-release-set-overture-2025-v01'",
      {
        apiCatalogRevisionId: 'catalog-v02',
        apiVersionReleaseSetId: 'release-v02-association',
        isDefault: 1,
      },
    )
    const members = fixture.metaSqlite
      .query(
        "SELECT * FROM apiReleaseSetSnapshots WHERE apiReleaseSetId='api-release-set-overture-2025'",
      )
      .all() as Array<Record<string, SQLQueryBindings>>
    for (const member of members) {
      const values = {
        ...member,
        apiReleaseSetId: 'release-v02',
        variant: member.role === 'primary' ? 'saanseoi' : member.variant,
      }
      const keys = Object.keys(values)
      fixture.metaSqlite
        .query(
          `INSERT INTO apiReleaseSetSnapshots (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`,
        )
        .run(...(Object.values(values) as SQLQueryBindings[]))
    }
    const response = await app.fetch(
      new Request('http://localhost/divisions/v0.2?inventory=saanseoi'),
      fixture.env,
    )
    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      meta: { inventory: string; apiReleaseSet: string }
      links: { permalink: string }
    }
    expect(body.meta.inventory).toBe('saanseoi')
    expect(body.links.permalink).toContain('inventory=saanseoi')
    expect(body.links.permalink).toContain(`releaseSet=${OVERTURE_RELEASE_SET}`)
    const unavailable = await app.fetch(
      new Request('http://localhost/divisions/v0.2?inventory=overture'),
      fixture.env,
    )
    expect(unavailable.status).toBe(409)
    const discovery = await app.fetch(
      new Request('http://localhost/divisions/v0.2/inventories'),
      fixture.env,
    )
    expect(discovery.status).toBe(200)
    expect(await discovery.json()).toMatchObject({
      defaultInventory: 'saanseoi',
      primaryResourceType: 'division',
      releaseSet: OVERTURE_RELEASE_SET,
      inventories: [
        {
          code: 'saanseoi',
          defaultAreaVariant: null,
          areaVariants: expect.arrayContaining([
            { code: 'overture', snapshotId: 'snapshot-overture-2025-area-overture' },
            { code: 'hkgov-had', snapshotId: 'snapshot-overture-2025-area-had' },
            {
              code: 'hkgov-censtatd:2021:simplified',
              snapshotId: 'snapshot-overture-2025-area-censtatd',
            },
          ]),
          defaultBoundaryVariant: 'overture',
          boundaryVariants: [
            {
              code: 'overture',
              snapshotId: 'snapshot-overture-2025-boundary-overture',
            },
          ],
        },
      ],
    })
    const historical = await app.fetch(
      new Request(`http://localhost/divisions/v0.1?releaseSet=${OVERTURE_RELEASE_SET}`),
      fixture.env,
    )
    expect(
      ((await historical.json()) as { links: { permalink: string } }).links.permalink,
    ).toContain(OVERTURE_RELEASE_SET)
  } finally {
    fixture.close()
  }
})

test('geographic code requests filter before pagination and pin the selected geography', async () => {
  const fixture = createFixtureEnvironment()
  try {
    fixture.currentSqlite.run(
      "UPDATE divisions SET divisionCode='EST', class='district' WHERE id='division-east'",
    )
    const path = `/divisions/v0.1?releaseSet=${OVERTURE_RELEASE_SET}&filter[adminCode]=EST&page[limit]=1`
    const response = await app.fetch(
      new Request(`http://localhost${path}`),
      fixture.env,
    )
    expect(response.status).toBe(200)
    const body = (await response.json()) as any
    expect(body.meta.page.total).toBe(2)
    expect(body.data).toHaveLength(1)
    expect(new URL(body.links.next).searchParams.get('geographicReleaseSet')).toBe(
      OVERTURE_RELEASE_SET,
    )
    expect(response.headers.get('X-Geographic-Release-Set')).toBe(OVERTURE_RELEASE_SET)
    const excluded = await app.fetch(
      new Request(
        `http://localhost/divisions/v0.1/division-country-cn?releaseSet=${OVERTURE_RELEASE_SET}&filter[adminCode]=EST`,
      ),
      fixture.env,
    )
    expect(excluded.status).toBe(404)
    for (const alias of ['areaCode', 'districtCode', 'villageCode']) {
      const unsupported = await app.fetch(
        new Request(`http://localhost${path.replace('adminCode', alias)}`),
        fixture.env,
      )
      expect(unsupported.status).toBe(422)
    }
    const invalid = await app.fetch(
      new Request(`http://localhost${path.replace('adminCode', 'hoodCode')}`),
      fixture.env,
    )
    expect(invalid.status).toBe(422)
  } finally {
    fixture.close()
  }
})
