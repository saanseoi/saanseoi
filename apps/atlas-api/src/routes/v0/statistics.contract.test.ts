import { describe, expect, test } from 'bun:test'
import { Database, type SQLQueryBindings } from 'bun:sqlite'
import { resolve } from 'node:path'

import { loadMigrationSql } from '../../../../../libs/core/src/testing/metaFixtures'
import type { AppBindings } from '../../types'
import app from '../../index'

const REPO_ROOT = resolve(import.meta.dir, '../../../../../')
const MIGRATIONS_DIR = resolve(REPO_ROOT, 'libs/db/migrations')
const PUBLISHED_AT = '2026-08-20T00:00:00.000Z'
const DATASET_CODE =
  'ds-hk-hkgov-censtatd-division-statistic-population-households-district'
const RELEASE_ID = 'release-statistics-population-households-2021'
const STATISTIC_ID = 'statistic-population-households-2021-district-1'

type MockStatement = {
  bind: (...values: SQLQueryBindings[]) => MockStatement
  all: <T>() => Promise<{ results: T[]; success: true }>
  first: <T>() => Promise<T | null>
  raw: <T>() => Promise<T[][]>
  run: () => Promise<{ meta: { changes: number }; success: true }>
}

type StatisticsListDocument = {
  data: unknown[]
  links: { permalink: string }
  meta: Record<string, unknown>
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

function seedMeta(sqlite: Database) {
  run(
    sqlite,
    `INSERT INTO publishers (id, code, versionHash, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?)`,
    [
      'publisher-censtatd',
      'hkgov-censtatd',
      'publisher-hash',
      PUBLISHED_AT,
      PUBLISHED_AT,
    ],
  )
  run(
    sqlite,
    `INSERT INTO datasets (
      id, publisherId, code, regionCode, releaseType, releaseFrequency,
      theme, sourceVariant, versionHash, createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      'dataset-statistics',
      'publisher-censtatd',
      DATASET_CODE,
      'hk',
      'static',
      'yearly',
      'stats',
      'official-statistics',
      'dataset-hash',
      PUBLISHED_AT,
      PUBLISHED_AT,
    ],
  )
  run(
    sqlite,
    `INSERT INTO apiVersions (
      id, code, familyType, version, status, publishedAt,
      versionHash, createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      'api-version-stats',
      'api-stats-v0.1',
      'stats',
      '0.1',
      'current',
      PUBLISHED_AT,
      'api-version-hash',
      PUBLISHED_AT,
      PUBLISHED_AT,
    ],
  )
  run(
    sqlite,
    `INSERT INTO snapshots (
      id, resourceType, code, cohortKey, revision, status,
      publishedAt, validFrom, createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      'snapshot-statistics',
      'divisionStatistic',
      'ss-hk-division-statistic-population-households-2021',
      '2021',
      0,
      'published',
      PUBLISHED_AT,
      PUBLISHED_AT,
      PUBLISHED_AT,
      PUBLISHED_AT,
    ],
  )
  run(
    sqlite,
    `INSERT INTO releases (
      id, datasetId, resourceType, code, sourceVersion, cohortKey,
      status, ingestedAt, createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      RELEASE_ID,
      'dataset-statistics',
      'divisionStatistic',
      'dr-hk-hkgov-censtatd-division-statistic-population-households-district-2021',
      '2021',
      '2021',
      'published',
      PUBLISHED_AT,
      PUBLISHED_AT,
      PUBLISHED_AT,
    ],
  )
  run(
    sqlite,
    `INSERT INTO snapshotSources (
      snapshotId, datasetId, sourceReleaseId, role, createdAt
    ) VALUES (?, ?, ?, ?, ?)`,
    ['snapshot-statistics', 'dataset-statistics', RELEASE_ID, 'primary', PUBLISHED_AT],
  )
  run(
    sqlite,
    `INSERT INTO apiReleaseSets (
      id, apiVersionId, code, regionCode, domainCode, cohortKey, revision,
      effectiveFrom, schemaVersion, rulesetVersion, status, publishedAt,
      versionHash, createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      'release-set-statistics',
      'api-version-stats',
      'data-hk-stats-2021',
      'hk',
      'default',
      '2021',
      0,
      PUBLISHED_AT,
      'sv-statistics-v1',
      'rs-division-statistic-merge-v1',
      'current',
      PUBLISHED_AT,
      'release-set-hash',
      PUBLISHED_AT,
      PUBLISHED_AT,
    ],
  )
  run(
    sqlite,
    `INSERT INTO apiReleaseSetSnapshots (
      apiReleaseSetId, snapshotId, variant, role, isRequired,
      cohortMatchingMode, createdAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      'release-set-statistics',
      'snapshot-statistics',
      DATASET_CODE,
      'primary',
      1,
      'exact_ref',
      PUBLISHED_AT,
    ],
  )
  run(
    sqlite,
    `INSERT INTO apiCatalogRevisions (
      id, apiVersionId, code, regionCode, publicationDate, revision,
      defaultDomainCode, status, publishedAt, versionHash, createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      'catalog-statistics',
      'api-version-stats',
      'catalog-hk-stats-v0.1-2026-08-20-r0',
      'hk',
      '2026-08-20',
      0,
      'default',
      'current',
      PUBLISHED_AT,
      'catalog-hash',
      PUBLISHED_AT,
      PUBLISHED_AT,
    ],
  )
  run(
    sqlite,
    `INSERT INTO apiCatalogRevisionReleaseSets (
      apiCatalogRevisionId, apiReleaseSetId, domainCode, cohortKey,
      isDefault, createdAt
    ) VALUES (?, ?, ?, ?, ?, ?)`,
    [
      'catalog-statistics',
      'release-set-statistics',
      'default',
      '2021',
      1,
      PUBLISHED_AT,
    ],
  )
}

function seedHistory(sqlite: Database) {
  run(
    sqlite,
    `INSERT INTO statsRecords (
      id, datasetCode, sourceReleaseId, sourceFeatureRef, divisionId,
      referencePeriodCode, referencePeriodStart, referencePeriodEnd,
      referencePeriodGranularity, referencePeriodEndYear, geography,
      dimensions, "values",
      versionHash, isCurrent, createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      STATISTIC_ID,
      DATASET_CODE,
      RELEASE_ID,
      'hkgov-censtatd/ds-hk-hkgov-censtatd-division-statistic-population-households-district/2021/District:1',
      'division-central-western',
      '2021',
      null,
      null,
      'year',
      '2021',
      JSON.stringify({ kind: 'district', code: '11', class: 'A' }),
      JSON.stringify({ sex: 'all' }),
      JSON.stringify({ totalPopulation: '235953' }),
      'record-version-hash',
      1,
      PUBLISHED_AT,
      PUBLISHED_AT,
    ],
  )
  run(
    sqlite,
    `INSERT INTO statsFields (
      datasetCode, fieldName, sourceField, dimensions, sourceNullOption, statisticKind,
      aggregation, denominatorFieldName, valueKind, unitCode, versionHash,
      sourceReleaseId, isCurrent, createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      DATASET_CODE,
      'totalPopulation',
      'T_POP',
      JSON.stringify({ sex: 'all' }),
      null,
      'count',
      'total',
      null,
      'numeric',
      'person',
      'field-version-hash',
      RELEASE_ID,
      1,
      PUBLISHED_AT,
      PUBLISHED_AT,
    ],
  )
  run(
    sqlite,
    `INSERT INTO statsRecords (
      id, datasetCode, sourceReleaseId, sourceFeatureRef, divisionId,
      referencePeriodCode, referencePeriodStart, referencePeriodEnd,
      referencePeriodGranularity, referencePeriodEndYear, geography,
      dimensions, "values", versionHash, isCurrent, createdAt, updatedAt
    )
    SELECT
      id, datasetCode, sourceReleaseId, sourceFeatureRef, divisionId,
      referencePeriodCode, referencePeriodStart, referencePeriodEnd,
      referencePeriodGranularity, referencePeriodEndYear, geography,
      dimensions, '{"totalPopulation":"230000"}', 'record-version-hash-superseded', 0,
      createdAt, updatedAt
    FROM statsRecords
    WHERE id = ? AND isCurrent = 1`,
    [STATISTIC_ID],
  )
  run(
    sqlite,
    `INSERT INTO statsRecords (
      id, datasetCode, sourceReleaseId, sourceFeatureRef, divisionId,
      referencePeriodCode, referencePeriodStart, referencePeriodEnd,
      referencePeriodGranularity, referencePeriodEndYear, geography,
      dimensions, "values", versionHash, isCurrent, createdAt, updatedAt
    )
    SELECT
      'statistic-population-households-2020-district-1', datasetCode,
      sourceReleaseId, sourceFeatureRef, divisionId, '2020', NULL, NULL,
      'year', '2020', geography, dimensions, "values",
      'record-version-hash-2020', isCurrent, createdAt, updatedAt
    FROM statsRecords
    WHERE id = ? AND isCurrent = 1`,
    [STATISTIC_ID],
  )
  run(
    sqlite,
    `INSERT INTO statsFieldsI18n (
      datasetCode, fieldName, locale, name, description,
      isTranslationVerified, versionHash, sourceReleaseId,
      isCurrent, createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      DATASET_CODE,
      'totalPopulation',
      'en',
      'Total population',
      'Number of people.',
      1,
      'field-i18n-version-hash',
      RELEASE_ID,
      1,
      PUBLISHED_AT,
      PUBLISHED_AT,
    ],
  )
  const translations = [
    { locale: 'zh-Hant', name: '總人口', description: '人口數目。' },
    { locale: 'zh-Hans', name: '总人口', description: '人口数目。' },
  ] as const
  for (const translation of translations) {
    run(
      sqlite,
      `INSERT INTO statsFieldsI18n (
        datasetCode, fieldName, locale, name, description,
        isTranslationVerified, versionHash, sourceReleaseId,
        isCurrent, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        DATASET_CODE,
        'totalPopulation',
        translation.locale,
        translation.name,
        translation.description,
        1,
        `field-i18n-${translation.locale}`,
        RELEASE_ID,
        1,
        PUBLISHED_AT,
        PUBLISHED_AT,
      ],
    )
  }
}

function seedSelectedDivision(sqlite: Database) {
  run(
    sqlite,
    `INSERT INTO apiVersions (
      id, code, familyType, version, status, publishedAt,
      versionHash, createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      'api-version-divisions',
      'api-divisions-v0.1',
      'divisions',
      '0.1',
      'current',
      PUBLISHED_AT,
      'api-version-divisions-hash',
      PUBLISHED_AT,
      PUBLISHED_AT,
    ],
  )
  run(
    sqlite,
    `INSERT INTO snapshots (
      id, resourceType, code, cohortKey, revision, status,
      publishedAt, validFrom, createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      'snapshot-divisions',
      'division',
      'ss-hk-division-overture-2021',
      '2021',
      0,
      'published',
      PUBLISHED_AT,
      PUBLISHED_AT,
      PUBLISHED_AT,
      PUBLISHED_AT,
    ],
  )
  run(
    sqlite,
    `INSERT INTO apiReleaseSets (
      id, apiVersionId, code, regionCode, domainCode, cohortKey, revision,
      effectiveFrom, schemaVersion, rulesetVersion, status, publishedAt,
      versionHash, createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      'release-set-divisions',
      'api-version-divisions',
      'data-hk-divisions-2021',
      'hk',
      'geographic',
      '2021',
      0,
      PUBLISHED_AT,
      'sv-division-v1',
      'rs-division-merge-v1',
      'current',
      PUBLISHED_AT,
      'release-set-divisions-hash',
      PUBLISHED_AT,
      PUBLISHED_AT,
    ],
  )
  run(
    sqlite,
    `INSERT INTO apiReleaseSetSnapshots (
      apiReleaseSetId, snapshotId, variant, role, isRequired,
      cohortMatchingMode, createdAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      'release-set-divisions',
      'snapshot-divisions',
      'overture',
      'primary',
      1,
      'exact_ref',
      PUBLISHED_AT,
    ],
  )
  run(
    sqlite,
    `INSERT INTO apiCatalogRevisions (
      id, apiVersionId, code, regionCode, publicationDate, revision,
      defaultDomainCode, status, publishedAt, versionHash, createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      'catalog-divisions',
      'api-version-divisions',
      'catalog-hk-divisions-v0.1-2026-08-20-r0',
      'hk',
      '2026-08-20',
      0,
      'geographic',
      'current',
      PUBLISHED_AT,
      'catalog-divisions-hash',
      PUBLISHED_AT,
      PUBLISHED_AT,
    ],
  )
  run(
    sqlite,
    `INSERT INTO apiCatalogRevisionReleaseSets (
      apiCatalogRevisionId, apiReleaseSetId, domainCode, cohortKey,
      isDefault, createdAt
    ) VALUES (?, ?, ?, ?, ?, ?)`,
    [
      'catalog-divisions',
      'release-set-divisions',
      'geographic',
      '2021',
      1,
      PUBLISHED_AT,
    ],
  )
}

function seedCurrentDivision(sqlite: Database) {
  run(
    sqlite,
    `INSERT INTO divisions (
      snapshotId, id, divisionCode, level, type, createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      'snapshot-divisions',
      'division-central-western',
      'CW',
      2,
      'district',
      PUBLISHED_AT,
      PUBLISHED_AT,
    ],
  )
}

function fixtureEnv() {
  const meta = initSqlite(['meta'])
  const current = initSqlite(['current'])
  const history = initSqlite(['history'])
  const emptyHistory = initSqlite(['history'])
  seedMeta(meta)
  seedSelectedDivision(meta)
  seedHistory(history)
  seedCurrentDivision(current)
  const env = {
    DB_META: createMockD1(meta),
    DB_CURRENT: createMockD1(current),
    DB_HISTORY_HK_BEFORE: createMockD1(history),
    DB_HISTORY_HK_2025: createMockD1(emptyHistory),
    DB_HISTORY_HK_2026: createMockD1(emptyHistory),
    AUTH_MODE: 'disabled',
    ATLAS_BASE_URL: 'http://localhost:8787',
    ENVIRONMENT: 'test',
    API_RATE_LIMIT: { limit: async () => ({ success: true }) },
    API_USAGE: { writeDataPoint: () => {} },
  } as unknown as AppBindings
  return {
    env,
    close: () =>
      [meta, current, history, emptyHistory].forEach(db => {
        db.close()
      }),
  }
}

describe('Statistics API responses through the Worker route', () => {
  test('list, filters, profiles, detail, and version aliases', async () => {
    const fixture = fixtureEnv()
    try {
      const list = await app.fetch(
        new Request(
          'http://localhost/v0/stats?profile=full&filter[field]=totalPopulation&page[limit]=10',
        ),
        fixture.env,
      )
      const listBody = (await list.json()) as StatisticsListDocument
      expect(list.status).toBe(200)
      expect(listBody.data).toHaveLength(1)
      expect(listBody.data[0]).toMatchObject({
        type: 'statistics',
        id: STATISTIC_ID,
        attributes: {
          referencePeriod: {
            code: '2021',
            endYear: '2021',
            granularity: 'year',
          },
          sourceReleaseId: RELEASE_ID,
          values: {
            totalPopulation: '235953',
          },
        },
      })
      expect(listBody.meta).toMatchObject({
        requestedApiFamily: 'stats',
        requestedApiVersion: '0.1',
        resolvedApiVersion: 'api-stats-v0.1',
        apiReleaseSet: 'data-hk-stats-2021',
        page: { limit: 10, offset: 0, total: 1 },
      })
      expect(listBody.links.permalink).toContain('/v0.1/stats?')

      const crossPeriod = await app.fetch(
        new Request(
          'http://localhost/v0.1/stats?cohort=2021&filter[referencePeriod]=2020',
        ),
        fixture.env,
      )
      const crossPeriodBody = (await crossPeriod.json()) as StatisticsListDocument
      expect(crossPeriod.status).toBe(200)
      expect(crossPeriodBody.data).toEqual([])

      const detail = await app.fetch(
        new Request(`http://localhost/v0.1/stats/${STATISTIC_ID}`),
        fixture.env,
      )
      expect(detail.status).toBe(200)
      expect(await detail.json()).toMatchObject({
        data: { id: STATISTIC_ID, type: 'statistics' },
      })

      const fields = await app.fetch(
        new Request(
          `http://localhost/v0.1/stats/${STATISTIC_ID}?include=fields&locales=en,zh-hant,zh-hans`,
        ),
        fixture.env,
      )
      expect(fields.status).toBe(200)
      expect(await fields.json()).toMatchObject({
        data: { id: STATISTIC_ID, type: 'statistics' },
        included: [
          {
            type: 'statistic-fields',
            id: `${DATASET_CODE}:totalPopulation`,
            attributes: {
              fieldName: 'totalPopulation',
              i18n: {
                en: { name: 'Total population', description: 'Number of people.' },
                'zh-hant': { name: '總人口', description: '人口數目。' },
                'zh-hans': { name: '总人口', description: '人口数目。' },
              },
            },
          },
        ],
      })
    } finally {
      fixture.close()
    }
  })

  test('rejects generic and unsupported include names', async () => {
    const fixture = fixtureEnv()
    try {
      const response = await app.fetch(
        new Request('http://localhost/v0.1/stats?include=geometry'),
        fixture.env,
      )
      expect(response.status).toBe(422)
    } finally {
      fixture.close()
    }
  })

  test('returns direct curated-code maps and explicit multi-period series', async () => {
    const fixture = fixtureEnv()
    try {
      const geographies = await app.fetch(
        new Request(
          'http://localhost/v0.1/stats/geographies?filter[field]=totalPopulation&filter[referencePeriod]=2021',
        ),
        fixture.env,
      )
      expect(geographies.status).toBe(200)
      expect(await geographies.json()).toMatchObject({
        meta: {
          referencePeriod: '2021',
          geography: {
            kind: 'division',
            codeAttribute: 'divisionCode',
            domainCode: 'geographic',
            level: 2,
          },
        },
        values: { CW: '235953' },
      })

      const series = await app.fetch(
        new Request('http://localhost/v0.1/stats/series?filter[field]=totalPopulation'),
        fixture.env,
      )
      expect(series.status).toBe(200)
      const seriesBody = (await series.json()) as {
        valuesByReferencePeriod: Record<string, Record<string, string>>
      }
      expect(seriesBody.valuesByReferencePeriod).toEqual({
        '2020': { CW: '235953' },
        '2021': { CW: '235953' },
      })
      expect(
        Object.keys(seriesBody.valuesByReferencePeriod['2021'] ?? {}),
      ).not.toContain('division-central-western')
    } finally {
      fixture.close()
    }
  })
})
