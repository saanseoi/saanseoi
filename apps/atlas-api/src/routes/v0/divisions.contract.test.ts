import { describe, expect, test } from 'bun:test'
import { Database, type SQLQueryBindings } from 'bun:sqlite'
import { resolve } from 'node:path'

import { loadMigrationSql } from '../../../../../libs/core/src/testing/metaFixtures'
import type { AppBindings } from '../../types'
import app from '../../index'

const REPO_ROOT = resolve(import.meta.dir, '../../../../../')
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
      (id, code, familyType, version, status, publishedAt, versionHash, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      'api-version-divisions-v0.1',
      'api-divisions-v0.1',
      'divisions',
      '0.1',
      'current',
      CATALOG_PUBLISHED_AT,
      'test-api-version-hash',
      CATALOG_PUBLISHED_AT,
      CATALOG_PUBLISHED_AT,
    ],
  )

  const releases = [
    {
      id: 'api-release-set-overture-2025',
      code: OVERTURE_RELEASE_SET,
      domain: 'overture',
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
    run(
      sqlite,
      `INSERT INTO snapshots
        (id, resourceType, code, cohortKey, revision, status, publishedAt, validFrom, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        release.snapshot,
        'division',
        `ss-hk-division-${release.domain}-${release.cohort}`,
        release.cohort,
        0,
        'published',
        CATALOG_PUBLISHED_AT,
        release.effectiveFrom,
        CATALOG_PUBLISHED_AT,
        CATALOG_PUBLISHED_AT,
      ],
    )
    run(
      sqlite,
      `INSERT INTO apiReleaseSets
        (id, apiVersionId, code, regionCode, domainCode, cohortKey, revision, effectiveFrom,
         schemaVersion, rulesetVersion, status, publishedAt, versionHash, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        release.id,
        'api-version-divisions-v0.1',
        release.code,
        'hk',
        release.domain,
        release.cohort,
        0,
        release.effectiveFrom,
        'sv-division-v1',
        'rs-division-merge-v1',
        'current',
        CATALOG_PUBLISHED_AT,
        `hash-${release.id}`,
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

  for (const snapshot of geometrySnapshots) {
    run(
      sqlite,
      `INSERT INTO snapshots
        (id, resourceType, code, cohortKey, revision, status, publishedAt, validFrom, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        snapshot.id,
        snapshot.resourceType,
        snapshot.code,
        '2025-09-24.0',
        0,
        'published',
        CATALOG_PUBLISHED_AT,
        '2025-09-24T00:00:00.000Z',
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
        (apiCatalogRevisionId, apiReleaseSetId, domainCode, cohortKey, isDefault, createdAt)
        VALUES (?, ?, ?, ?, ?, ?)`,
      [
        'catalog-revision-divisions-2026-08-14',
        release.id,
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
      const sourceKeys = {
        overture: {
          subtype: division.type,
          class: division.type,
          version: 1,
          hierarchies: division.hierarchy,
        },
      }
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
          (snapshotId, id, identifiers, level, type, geometry, bbox, sourceKeys, wikidata,
           hierarchy, cartography, sources, createdAt, updatedAt)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          snapshotId,
          division.id,
          null,
          division.level,
          division.type,
          json({ type: 'Point', coordinates: division.point }),
          json([
            division.point[0] - 0.01,
            division.point[1] - 0.01,
            division.point[0] + 0.01,
            division.point[1] + 0.01,
          ]),
          json(sourceKeys),
          null,
          json(division.hierarchy),
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
            (snapshotId, divisionId, locale, name, nameVariant, nameAlts, nameRules, isLocaleInferred, createdAt, updatedAt)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            snapshotId,
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
        (snapshotId, id, variant, bbox, geometry, sourceKeys, sources, type, isLand, isTerritorial,
         divisionId, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        row.snapshotId,
        row.id,
        row.variant,
        json([114.18, 22.25, 114.3, 22.35]),
        json({ type: 'Polygon', coordinates: [] }),
        json({ provider: row.variant }),
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
      (snapshotId, id, variant, bbox, geometry, sourceKeys, sources, type, isLand, isTerritorial,
       leftDivisionId, rightDivisionId, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      'snapshot-overture-2025-boundary-overture',
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
      json({ provider: 'overture' }),
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

function createFixtureEnvironment() {
  const metaSqlite = initSqlite(['meta'])
  const currentSqlite = initSqlite(['current'])
  seedMeta(metaSqlite)
  seedCurrent(currentSqlite)

  const metaDb = createMockD1(metaSqlite)
  const currentDb = createMockD1(currentSqlite)
  const env = {
    DB_META: metaDb,
    DB_CURRENT: currentDb,
    DB_HISTORY_HK_BEFORE: currentDb,
    DB_HISTORY_HK_2025: currentDb,
    DB_HISTORY_HK_2026: currentDb,
    DB_SOURCE_HK_BEFORE: currentDb,
    DB_SOURCE_HK_2025: currentDb,
    DB_SOURCE_HK_2026: currentDb,
    ATLAS_BASE_URL: 'http://localhost:8787',
    AUTH_MODE: 'disabled',
    ENVIRONMENT: 'test',
    API_RATE_LIMIT: { limit: async () => ({ success: true }) },
    API_USAGE: { writeDataPoint: () => {} },
  } as unknown as AppBindings

  return {
    env,
    close() {
      metaSqlite.close()
      currentSqlite.close()
    },
  }
}

const requestCases = [
  {
    name: 'default list through app.fetch',
    path: `/v0.1/divisions?releaseSet=${OVERTURE_RELEASE_SET}`,
  },
  {
    name: 'v0 alias and map profile through app.fetch',
    path: `/v0/divisions?releaseSet=${OVERTURE_RELEASE_SET}&profile=map`,
  },
  {
    name: 'areas and boundaries through app.fetch',
    path: `/v0.1/divisions?releaseSet=${OVERTURE_RELEASE_SET}&include=areas,boundaries`,
  },
  {
    name: 'detail and hierarchy through app.fetch',
    path: `/v0.1/divisions/division-a-kung-ngam?releaseSet=${OVERTURE_RELEASE_SET}&profile=full&include=hierarchy`,
  },
  {
    name: 'planning domain through app.fetch',
    path: '/v0.1/divisions?domain=hkgov-pland-pu&cohort=2021',
  },
  {
    name: 'filters and pagination through app.fetch',
    path: `/v0.1/divisions?releaseSet=${OVERTURE_RELEASE_SET}&filter[level]=3&filter[divisionType]=locality&filter[parent]=division-east&page[limit]=1&page[offset]=0`,
  },
  {
    name: 'invalid request through app.fetch',
    path: '/v0.1/divisions?include=areas:not-a-provider',
  },
] as const

describe('Divisions API responses through the Worker route', () => {
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
