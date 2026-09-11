import { Database, type SQLQueryBindings } from 'bun:sqlite'
import { resolve } from 'node:path'

import { loadMigrationSql } from '../../../../../../libs/core/src/testing/metaFixtures'
import type { AppBindings } from '../../../types'

const REPO_ROOT = resolve(import.meta.dir, '../../../../../../')
const MIGRATIONS_DIR = resolve(REPO_ROOT, 'libs/db/migrations')
export const PUBLISHED_AT = '2026-08-20T00:00:00.000Z'
export const DATASET_CODE =
  'ds-hk-hkgov-censtatd-division-statistic-population-households-district'
export const RELEASE_ID = 'release-statistics-population-households-2021'
export const STATISTIC_ID = 'statistic-population-households-2021-district-1'
export const HISTORICAL_DATASET_CODE =
  'ds-hk-hkgov-censtatd-division-statistic-households-district'
export const HISTORICAL_RELEASE_ID = 'release-statistics-households-2020'

type MockStatement = {
  bind: (...values: SQLQueryBindings[]) => MockStatement
  all: <T>() => Promise<{ results: T[]; success: true }>
  first: <T>() => Promise<T | null>
  raw: <T>() => Promise<T[][]>
  run: () => Promise<{ meta: { changes: number }; success: true }>
}

export function createMockD1(sqlite: Database): D1Database {
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

export function run(sqlite: Database, query: string, values: SQLQueryBindings[] = []) {
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
    `INSERT INTO sourceReleases (
      id, datasetId, code, sourceVersion, cohortKey, status,
      ingestedAt, createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      RELEASE_ID,
      'dataset-statistics',
      'sr-hk-hkgov-censtatd-population-households-district-2021',
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
    `INSERT INTO releases (
      id, sourceReleaseId, datasetId, resourceType, code, sourceVersion, cohortKey,
      status, ingestedAt, createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      RELEASE_ID,
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
      snapshotId, datasetId, resourceReleaseId, role, createdAt
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
      'government',
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
      'government',
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
      'government',
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
    `INSERT INTO sourceReleases (
      id, datasetId, code, sourceVersion, cohortKey, status,
      ingestedAt, createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      HISTORICAL_RELEASE_ID,
      'dataset-statistics-historical',
      'sr-hk-hkgov-censtatd-households-district-2020',
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
    `INSERT INTO releases (
      id, sourceReleaseId, datasetId, resourceType, code, sourceVersion, cohortKey,
      status, ingestedAt, createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      HISTORICAL_RELEASE_ID,
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
      snapshotId, datasetId, resourceReleaseId, role, createdAt
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
      'government',
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
      'government',
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
      'historical-measure-version-hash',
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
      'historical-field-version-hash',
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
      fieldDefinitionHashes, "values",
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
      JSON.stringify({ totalPopulation: 'field-version-hash' }),
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
      fieldDefinitionHashes, "values", versionHash, isCurrent, createdAt, updatedAt
    )
    SELECT
      id, datasetCode, sourceReleaseId, sourceFeatureRef, divisionId,
      referencePeriodCode, referencePeriodStart, referencePeriodEnd,
      referencePeriodGranularity, referencePeriodEndYear, geography,
      fieldDefinitionHashes, '{"totalPopulation":"230000"}', 'record-version-hash-superseded', 0,
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
      fieldDefinitionHashes, "values", versionHash, isCurrent, createdAt, updatedAt
    )
    SELECT
      'statistic-population-households-2020-district-1', datasetCode,
      sourceReleaseId, sourceFeatureRef, divisionId, '2020', NULL, NULL,
      'year', '2020', geography, fieldDefinitionHashes, "values",
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
      'field-version-hash',
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
        'field-version-hash',
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
      snapshotId, id, divisionCode, level, class, createdAt, updatedAt
    , hierarchies) VALUES (?, ?, ?, ?, ?, ?, ?, '{"administrative":[],"locality":[],"full":[]}')`,
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

function seedPackedPublication(current: Database, history: Database, meta: Database) {
  run(
    meta,
    `INSERT INTO snapshotSources (snapshotId, datasetId, resourceReleaseId, role, createdAt) VALUES (?, ?, ?, 'primary', ?)`,
    ['snapshot-statistics-historical', 'dataset-statistics', RELEASE_ID, PUBLISHED_AT],
  )
  run(
    history,
    `UPDATE statsFields SET measureVersionHash = CASE WHEN datasetCode = ? THEN 'field-ignore' ELSE 'measure-version-hash' END`,
    [HISTORICAL_DATASET_CODE],
  )
  run(
    history,
    `UPDATE statsFields SET measureVersionHash = 'historical-measure-version-hash' WHERE datasetCode = ?`,
    [HISTORICAL_DATASET_CODE],
  )
  run(
    history,
    `INSERT INTO statsRecords (id, datasetCode, sourceReleaseId, sourceFeatureRef, divisionId, referencePeriodCode, referencePeriodGranularity, referencePeriodEndYear, geography, fieldDefinitionHashes, "values", versionHash, isCurrent, createdAt, updatedAt)
    SELECT 'statistic-households-2020-district-1', ?, ?, 'households/2020/11', divisionId, '2020', 'year', '2020', geography, '{"households":"historical-field-version-hash"}', '{"households":"100000"}', 'households-record-version', 1, createdAt, updatedAt FROM statsRecords WHERE id = ? AND isCurrent = 1`,
    [HISTORICAL_DATASET_CODE, HISTORICAL_RELEASE_ID, STATISTIC_ID],
  )
  for (const table of [
    'statsRecords',
    'statsFields',
    'statsFieldsI18n',
    'statsMeasures',
    'statsMeasuresI18n',
  ]) {
    const columns = (
      current.query(`PRAGMA table_info("${table}")`).all() as Array<{ name: string }>
    ).map(column => column.name)
    const rows = history
      .query(
        `SELECT ${columns.map(name => `"${name}"`).join(',')} FROM "${table}" WHERE isCurrent = 1`,
      )
      .all() as Array<Record<string, SQLQueryBindings>>
    for (const row of rows)
      run(
        current,
        `INSERT INTO "${table}" (${columns.map(name => `"${name}"`).join(',')}) VALUES (${columns.map(() => '?').join(',')})`,
        columns.map(name => row[name]!),
      )
  }
  const records = current
    .query('SELECT id, datasetCode, referencePeriodCode, versionHash FROM statsRecords')
    .all() as Array<{
    id: string
    datasetCode: string
    referencePeriodCode: string
    versionHash: string
  }>
  for (const record of records) {
    const snapshotId =
      record.referencePeriodCode === '2020'
        ? 'snapshot-statistics-historical'
        : 'snapshot-statistics'
    run(
      history,
      `INSERT INTO snapshotVersionChanges (snapshotId, recordType, recordId, versionHash, operation, createdAt, updatedAt) VALUES (?, 'statsRecord', ?, ?, 'upsert', ?, ?)`,
      [snapshotId, record.id, record.versionHash, PUBLISHED_AT, PUBLISHED_AT],
    )
    run(
      current,
      `INSERT OR IGNORE INTO statsPublicationState (datasetCode, referencePeriodCode, snapshotId, status, createdAt, updatedAt) VALUES (?, ?, ?, 'current', ?, ?)`,
      [
        record.datasetCode,
        record.referencePeriodCode,
        snapshotId,
        PUBLISHED_AT,
        PUBLISHED_AT,
      ],
    )
  }
}

export function fixtureEnv() {
  const meta = initSqlite(['meta'])
  const current = initSqlite(['current'])
  const history = initSqlite(['history'])
  const emptyHistory = initSqlite(['history'])
  seedMeta(meta)
  seedSelectedDivision(meta)
  seedHistory(history)
  seedCurrentDivision(current)
  seedPackedPublication(current, history, meta)
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
    current,
    history,
    meta,
    close: () =>
      [meta, current, history, emptyHistory].forEach(db => {
        db.close()
      }),
  }
}
