import { describe, expect, test } from 'bun:test'
import { Database, type SQLQueryBindings } from 'bun:sqlite'
import { resolve } from 'node:path'

import { loadMigrationSql } from '../../../../../../libs/core/src/testing/metaFixtures'
import type { AppBindings } from '../../../types'
import app from '../../../index'

const REPO_ROOT = resolve(import.meta.dir, '../../../../../../')
const MIGRATIONS_DIR = resolve(REPO_ROOT, 'libs/db/migrations')
const PUBLISHED_AT = '2026-08-20T00:00:00.000Z'
const DATASET_CODE =
  'ds-hk-hkgov-censtatd-division-statistic-population-households-district'
const RELEASE_ID = 'release-statistics-population-households-2021'
const STATISTIC_ID = 'statistic-population-households-2021-district-1'
const HISTORICAL_DATASET_CODE =
  'ds-hk-hkgov-censtatd-division-statistic-households-district'
const HISTORICAL_RELEASE_ID = 'release-statistics-households-2020'

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
      'official',
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
      'official',
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
      'official',
      '2021',
      1,
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
      'dataset-statistics-historical',
      'publisher-censtatd',
      HISTORICAL_DATASET_CODE,
      'hk',
      'static',
      'yearly',
      'stats',
      'official-statistics',
      'dataset-historical-hash',
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
      HISTORICAL_RELEASE_ID,
      'dataset-statistics-historical',
      'divisionStatistic',
      'dr-hk-hkgov-censtatd-division-statistic-households-district-2020',
      '2020',
      '2020',
      'published',
      PUBLISHED_AT,
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
      'snapshot-statistics-historical',
      'divisionStatistic',
      'ss-hk-division-statistic-households-2020',
      '2020',
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
    `INSERT INTO snapshotSources (
      snapshotId, datasetId, sourceReleaseId, role, createdAt
    ) VALUES (?, ?, ?, ?, ?)`,
    [
      'snapshot-statistics-historical',
      'dataset-statistics-historical',
      HISTORICAL_RELEASE_ID,
      'primary',
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
      'release-set-statistics-historical',
      'api-version-stats',
      'data-hk-stats-2020',
      'hk',
      'official',
      '2020',
      0,
      '2020-01-01T00:00:00.000Z',
      'sv-statistics-v1',
      'rs-division-statistic-merge-v1',
      'current',
      PUBLISHED_AT,
      'release-set-historical-hash',
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
      'release-set-statistics-historical',
      'snapshot-statistics-historical',
      HISTORICAL_DATASET_CODE,
      'primary',
      1,
      'exact_ref',
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
      'release-set-statistics-historical',
      'official',
      '2020',
      0,
      PUBLISHED_AT,
    ],
  )
}

function seedHistory(sqlite: Database) {
  run(
    sqlite,
    `INSERT INTO statsFields (
      datasetCode, measureCode, fieldName, sourceField, dimensions, sourceNullOption, statisticKind,
      aggregation, denominatorFieldName, valueKind, unitCode, versionHash,
      sourceReleaseId, isCurrent, createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      HISTORICAL_DATASET_CODE,
      'households',
      'households',
      'HOUSEHOLDS',
      JSON.stringify({ sex: 'all' }),
      null,
      'count',
      'total',
      null,
      'numeric',
      'household',
      'historical-field-version-hash',
      HISTORICAL_RELEASE_ID,
      1,
      PUBLISHED_AT,
      PUBLISHED_AT,
    ],
  )
  run(
    sqlite,
    `INSERT INTO statsMeasures (
      datasetCode, measureCode, versionHash, sourceReleaseId, isCurrent, createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      HISTORICAL_DATASET_CODE,
      'households',
      'historical-measure-version-hash',
      HISTORICAL_RELEASE_ID,
      1,
      PUBLISHED_AT,
      PUBLISHED_AT,
    ],
  )
  run(
    sqlite,
    `INSERT INTO statsMeasuresI18n (
      datasetCode, measureCode, locale, name, description,
      isTranslationVerified, versionHash, sourceReleaseId,
      isCurrent, createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      HISTORICAL_DATASET_CODE,
      'households',
      'en',
      'Households',
      'Number of households.',
      1,
      'historical-measure-i18n-version-hash',
      HISTORICAL_RELEASE_ID,
      1,
      PUBLISHED_AT,
      PUBLISHED_AT,
    ],
  )
  run(
    sqlite,
    `INSERT INTO statsFieldsI18n (
      datasetCode, fieldName, locale, name, description,
      isTranslationVerified, versionHash, sourceReleaseId,
      isCurrent, createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      HISTORICAL_DATASET_CODE,
      'households',
      'en',
      'Households',
      'Number of households.',
      1,
      'historical-field-i18n-version-hash',
      HISTORICAL_RELEASE_ID,
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
      datasetCode, measureCode, fieldName, sourceField, dimensions, sourceNullOption, statisticKind,
      aggregation, denominatorFieldName, valueKind, unitCode, versionHash,
      sourceReleaseId, isCurrent, createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      DATASET_CODE,
      'totalPopulation',
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
    `INSERT INTO statsMeasures (
      datasetCode, measureCode, versionHash, sourceReleaseId, isCurrent, createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      DATASET_CODE,
      'totalPopulation',
      'measure-version-hash',
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
    `INSERT INTO statsMeasuresI18n (
      datasetCode, measureCode, locale, name, description,
      isTranslationVerified, versionHash, sourceReleaseId,
      isCurrent, createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      DATASET_CODE,
      'totalPopulation',
      'en',
      'Population',
      'Number of people.',
      1,
      'measure-i18n-version-hash',
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
  test('list, filters, profiles, detail, and product version', async () => {
    const fixture = fixtureEnv()
    try {
      const list = await app.fetch(
        new Request(
          'http://localhost/stats/v0.1?profile=full&filter[field]=totalPopulation&page[limit]=10',
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
      expect(listBody.links.permalink).toContain('/stats/v0.1?')

      const crossPeriod = await app.fetch(
        new Request(
          'http://localhost/stats/v0.1?cohort=2021&filter[referencePeriod]=2020',
        ),
        fixture.env,
      )
      const crossPeriodBody = (await crossPeriod.json()) as StatisticsListDocument
      expect(crossPeriod.status).toBe(200)
      expect(crossPeriodBody.data).toEqual([])

      const detail = await app.fetch(
        new Request(`http://localhost/stats/v0.1/${STATISTIC_ID}`),
        fixture.env,
      )
      expect(detail.status).toBe(200)
      expect(await detail.json()).toMatchObject({
        data: { id: STATISTIC_ID, type: 'statistics' },
      })

      const fields = await app.fetch(
        new Request(
          `http://localhost/stats/v0.1/${STATISTIC_ID}?include=fields&locales=en,zh-hant,zh-hans`,
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

      const registry = await app.fetch(
        new Request('http://localhost/stats/v0.1/registry'),
        fixture.env,
      )
      expect(registry.status).toBe(200)
      const registryBody = (await registry.json()) as {
        data: { id: string; type: string; attributes: Record<string, unknown> }
        meta: Record<string, unknown>
      }
      expect(registryBody).toMatchObject({
        data: {
          type: 'statistic-registry',
          id: 'catalog-hk-stats-v0.1-2026-08-20-r0',
          attributes: { datasets: 2, fields: 2, measures: 2 },
        },
        meta: {
          apiReleaseSets: ['data-hk-stats-2021', 'data-hk-stats-2020'],
          cohorts: ['2021', '2020'],
        },
      })
      expect(registryBody.meta.apiReleaseSet).toBeUndefined()

      const historicalRegistryFields = await app.fetch(
        new Request(
          `http://localhost/stats/v0.1/registry/fields?filter[dataset]=${HISTORICAL_DATASET_CODE}`,
        ),
        fixture.env,
      )
      expect(historicalRegistryFields.status).toBe(200)
      expect(await historicalRegistryFields.json()).toMatchObject({
        data: [
          {
            type: 'statistic-fields',
            attributes: {
              datasetCode: HISTORICAL_DATASET_CODE,
              fieldName: 'households',
            },
          },
        ],
      })

      const cohortRegistryFields = await app.fetch(
        new Request(
          `http://localhost/stats/v0.1/registry/fields?cohort=2021&filter[dataset]=${HISTORICAL_DATASET_CODE}`,
        ),
        fixture.env,
      )
      expect(cohortRegistryFields.status).toBe(200)
      expect(await cohortRegistryFields.json()).toMatchObject({ data: [] })

      const registryFields = await app.fetch(
        new Request(
          'http://localhost/stats/v0.1/registry/fields?filter[measure]=totalPopulation&filter[dimension]=sex:all',
        ),
        fixture.env,
      )
      expect(registryFields.status).toBe(200)
      expect(await registryFields.json()).toMatchObject({
        data: [
          {
            type: 'statistic-fields',
            attributes: {
              datasetCode: DATASET_CODE,
              fieldName: 'totalPopulation',
              measureCode: 'totalPopulation',
            },
          },
        ],
      })

      for (const version of ['v0', 'v0.1']) {
        const registryMeasure = await app.fetch(
          new Request(
            `http://localhost/stats/${version}/registry/measures/${DATASET_CODE}/totalPopulation`,
          ),
          fixture.env,
        )
        expect(registryMeasure.status).toBe(200)
        expect(await registryMeasure.json()).toMatchObject({
          data: {
            type: 'statistic-measures',
            attributes: {
              datasetCode: DATASET_CODE,
              measureCode: 'totalPopulation',
            },
            links: {
              self: `/stats/v0.1/registry/measures/${DATASET_CODE}/totalPopulation`,
            },
          },
        })
      }

      const registryField = await app.fetch(
        new Request(
          `http://localhost/stats/v0.1/registry/fields/${DATASET_CODE}/totalPopulation`,
        ),
        fixture.env,
      )
      expect(registryField.status).toBe(200)
      expect(await registryField.json()).toMatchObject({
        data: {
          type: 'statistic-fields',
          attributes: { measureCode: 'totalPopulation' },
          links: { availability: expect.stringContaining('/availability') },
        },
      })

      const availability = await app.fetch(
        new Request(
          `http://localhost/stats/v0.1/registry/fields/${DATASET_CODE}/totalPopulation/availability`,
        ),
        fixture.env,
      )
      expect(availability.status).toBe(200)
      expect(await availability.json()).toMatchObject({
        data: {
          type: 'statistic-field-availability',
          attributes: {
            referencePeriods: expect.arrayContaining([
              expect.objectContaining({
                code: '2021',
                geographies: [
                  expect.objectContaining({ kind: 'district', recordCount: 1 }),
                ],
                map: expect.stringContaining('/stats/v0.1/geographies?filter%5B'),
              }),
            ]),
          },
        },
      })

      const registryDimensions = await app.fetch(
        new Request('http://localhost/stats/v0.1/registry/dimensions'),
        fixture.env,
      )
      expect(registryDimensions.status).toBe(200)
      expect(await registryDimensions.json()).toMatchObject({
        data: [
          {
            type: 'statistic-dimensions',
            attributes: { code: 'sex', fieldCount: 2, value: 'all' },
          },
        ],
      })

      const registryDatasets = await app.fetch(
        new Request('http://localhost/stats/v0.1/registry/datasets'),
        fixture.env,
      )
      expect(registryDatasets.status).toBe(200)
      expect(await registryDatasets.json()).toMatchObject({
        data: [
          {
            type: 'statistic-datasets',
            id: HISTORICAL_DATASET_CODE,
            attributes: { fieldCount: 1, measureCount: 1 },
          },
          {
            type: 'statistic-datasets',
            id: DATASET_CODE,
            attributes: { fieldCount: 1, measureCount: 1 },
          },
        ],
      })

      const registrySearch = await app.fetch(
        new Request('http://localhost/stats/v0.1/registry/search?q=population'),
        fixture.env,
      )
      expect(registrySearch.status).toBe(200)
      expect(await registrySearch.json()).toMatchObject({
        data: expect.arrayContaining([
          expect.objectContaining({ type: 'statistic-measures' }),
          expect.objectContaining({ type: 'statistic-fields' }),
        ]),
      })
    } finally {
      fixture.close()
    }
  })

  test('rejects generic and unsupported include names', async () => {
    const fixture = fixtureEnv()
    try {
      const response = await app.fetch(
        new Request('http://localhost/stats/v0.1?include=geometry'),
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
          'http://localhost/stats/v0.1/geographies?filter[field]=totalPopulation&filter[referencePeriod]=2021',
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
        new Request('http://localhost/stats/v0.1/series?filter[field]=totalPopulation'),
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
