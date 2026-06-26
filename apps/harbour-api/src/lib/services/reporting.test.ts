import { mkdtemp, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'

import { describe, expect, test } from 'bun:test'
import { Database as SQLiteDatabase } from 'bun:sqlite'

import { loadMigrationSql } from '../../../../../libs/core/src/testing/meta-fixtures'
import { createLocalHarbourDb } from '@repo/core/testing/local-db'

import { resolveDataShardEnvironment } from './shared'
import { listIngestRuns, listReleases, listStats } from './reporting'

const repoRoot = resolve(import.meta.dir, '../../../../..')

describe('reporting service', () => {
  test('returns release row counts from real meta/source/history databases', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'harbour-reporting-'))

    try {
      const metaSqlite = await initSqlite(
        join(tempDir, 'meta.sqlite'),
        resolve(repoRoot, 'libs/db/migrations/meta'),
      )
      const sourceSqlite = await initSqlite(
        join(tempDir, 'source.sqlite'),
        resolve(repoRoot, 'libs/db/migrations/source'),
      )
      const historySqlite = await initSqlite(
        join(tempDir, 'history.sqlite'),
        resolve(repoRoot, 'libs/db/migrations/history'),
      )

      seedMetaCatalog(metaSqlite)
      seedRelease(metaSqlite)
      seedIngestRun(metaSqlite)
      seedStat(metaSqlite)
      seedSourceRows(sourceSqlite)
      seedHistoryRows(historySqlite)

      const metaDb = createLocalHarbourDb(metaSqlite)
      const bindings = {
        DB_HISTORY_HK_2026: createD1Database(historySqlite),
        DB_SOURCE_HK_2026: createD1Database(sourceSqlite),
      }

      const releases = await listReleases(metaDb, bindings, 'preview', { limit: 10 })
      const ingestRows = await listIngestRuns(metaDb, { limit: 10 })
      const statRows = await listStats(metaDb, { limit: 10 })

      expect(releases).toHaveLength(1)
      expect(releases[0]?.rowCounts).toEqual([
        {
          kind: 'source',
          label: 'source',
          rowCount: 1,
          tableName: 'sourceHkgovAlsAddresses2d',
        },
        {
          kind: 'source',
          label: 'sourceI18n',
          rowCount: 2,
          tableName: 'sourceHkgovAlsAddress2dI18n',
        },
        {
          kind: 'source',
          label: 'sourceVersions',
          rowCount: 1,
          tableName: 'sourceHkgovAlsAddresses2dVersions',
        },
        {
          kind: 'source',
          label: 'sourceI18nVersions',
          rowCount: 2,
          tableName: 'sourceHkgovAlsAddress2dI18nVersions',
        },
        {
          kind: 'history',
          label: 'history2dVersions',
          rowCount: 1,
          tableName: 'address2dVersions',
        },
        {
          kind: 'history',
          label: 'history2dI18nVersions',
          rowCount: 2,
          tableName: 'address2dVersionsI18n',
        },
        {
          kind: 'history',
          label: 'history3dVersions',
          rowCount: 1,
          tableName: 'address3dVersions',
        },
        {
          kind: 'history',
          label: 'history3dI18nVersions',
          rowCount: 1,
          tableName: 'address3dVersionsI18n',
        },
      ])

      expect(ingestRows).toHaveLength(1)
      expect(ingestRows[0]?.stats).toEqual({
        inserted: 1,
      })
      expect(statRows).toHaveLength(1)
      expect(statRows[0]?.metric).toBe('rows')
      expect(resolveDataShardEnvironment('production')).toBe('production')
      expect(resolveDataShardEnvironment('preview')).toBe('preview')

      metaSqlite.close()
      sourceSqlite.close()
      historySqlite.close()
    } finally {
      await rm(tempDir, { force: true, recursive: true })
    }
  })

  test('returns stats for the latest releases that actually have stats rows', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'harbour-reporting-stats-'))

    try {
      const metaSqlite = await initSqlite(
        join(tempDir, 'meta.sqlite'),
        resolve(repoRoot, 'libs/db/migrations/meta'),
      )

      seedMetaCatalog(metaSqlite)
      metaSqlite.exec(`
        INSERT INTO releases (
          id, datasetId, code, sourceVersion, sourceSchemaVersion, publicationDate, snapshotMonth, rawObjectKey, originalFileName, status, revokedAt, revocationReason, supersededByReleaseId, ingestedAt, createdAt, updatedAt
        ) VALUES
          (
            'release-1',
            'dataset-hkgov-hk-address',
            'hkgov-hk-2026-06-26.0-address',
            '2026-06-26.0',
            null,
            null,
            '2026-06',
            null,
            null,
            'published',
            null,
            null,
            null,
            1761436800000,
            1761436800000,
            1761436800000
          ),
          (
            'release-2',
            'dataset-hkgov-hk-address',
            'hkgov-hk-2026-06-25.0-address',
            '2026-06-25.0',
            null,
            null,
            '2026-06',
            null,
            null,
            'published',
            null,
            null,
            null,
            1761350400000,
            1761350400000,
            1761350400000
          ),
          (
            'release-3',
            'dataset-hkgov-hk-address',
            'hkgov-hk-2026-06-24.0-address',
            '2026-06-24.0',
            null,
            null,
            '2026-06',
            null,
            null,
            'published',
            null,
            null,
            null,
            1761264000000,
            1761264000000,
            1761264000000
          ),
          (
            'release-4',
            'dataset-hkgov-hk-address',
            'hkgov-hk-2026-06-23.0-address',
            '2026-06-23.0',
            null,
            null,
            '2026-06',
            null,
            null,
            'published',
            null,
            null,
            null,
            1761177600000,
            1761177600000,
            1761177600000
          );

        INSERT INTO stats (
          id, type, releaseId, dimension, metric, metricUnit, value, groupBy, groupValue, createdAt, updatedAt
        ) VALUES
          (
            'stat-release-2',
            'address',
            'release-2',
            'count',
            'churn',
            'count',
            2,
            null,
            null,
            1761350400000,
            1761350400000
          ),
          (
            'stat-release-3',
            'address',
            'release-3',
            'count',
            'churn',
            'count',
            3,
            null,
            null,
            1761264000000,
            1761264000000
          ),
          (
            'stat-release-4',
            'address',
            'release-4',
            'count',
            'churn',
            'count',
            4,
            null,
            null,
            1761177600000,
            1761177600000
          );
      `)

      const metaDb = createLocalHarbourDb(metaSqlite)
      const rows = await listStats(metaDb, { limit: 3 })

      expect([...new Set(rows.map(row => row.releaseCode))]).toEqual([
        'hkgov-hk-2026-06-25.0-address',
        'hkgov-hk-2026-06-24.0-address',
        'hkgov-hk-2026-06-23.0-address',
      ])

      metaSqlite.close()
    } finally {
      await rm(tempDir, { force: true, recursive: true })
    }
  })

  test('limits ingestion runs by release in SQL before materializing rows', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'harbour-reporting-ingest-'))

    try {
      const metaSqlite = await initSqlite(
        join(tempDir, 'meta.sqlite'),
        resolve(repoRoot, 'libs/db/migrations/meta'),
      )

      seedMetaCatalog(metaSqlite)
      metaSqlite.exec(`
        INSERT INTO releases (
          id, datasetId, code, sourceVersion, sourceSchemaVersion, publicationDate, snapshotMonth, rawObjectKey, originalFileName, status, revokedAt, revocationReason, supersededByReleaseId, ingestedAt, createdAt, updatedAt
        ) VALUES
          (
            'release-1',
            'dataset-hkgov-hk-address',
            'hkgov-hk-2026-06-26.0-address',
            '2026-06-26.0',
            null,
            null,
            '2026-06',
            null,
            null,
            'published',
            null,
            null,
            null,
            1761436800000,
            1761436800000,
            1761436800000
          ),
          (
            'release-2',
            'dataset-hkgov-hk-address',
            'hkgov-hk-2026-06-25.0-address',
            '2026-06-25.0',
            null,
            null,
            '2026-06',
            null,
            null,
            'published',
            null,
            null,
            null,
            1761350400000,
            1761350400000,
            1761350400000
          ),
          (
            'release-3',
            'dataset-hkgov-hk-address',
            'hkgov-hk-2026-06-24.0-address',
            '2026-06-24.0',
            null,
            null,
            '2026-06',
            null,
            null,
            'published',
            null,
            null,
            null,
            1761264000000,
            1761264000000,
            1761264000000
          );

        INSERT INTO ingestRuns (
          runId, releaseId, phase, status, stats, error, startedAt, finishedAt, createdAt, updatedAt
        ) VALUES
          ('run-1a', 'release-1', 'extractAddresses', 'completed', '{"release":1,"run":"a"}', null, '2026-06-26T10:00:00.000Z', '2026-06-26T10:05:00.000Z', 1761434400000, 1761434700000),
          ('run-1b', 'release-1', 'normalizeAddresses', 'completed', '{"release":1,"run":"b"}', null, '2026-06-26T09:00:00.000Z', '2026-06-26T09:05:00.000Z', 1761430800000, 1761431100000),
          ('run-2a', 'release-2', 'extractAddresses', 'completed', '{"release":2,"run":"a"}', null, '2026-06-25T10:00:00.000Z', '2026-06-25T10:05:00.000Z', 1761348000000, 1761348300000),
          ('run-3a', 'release-3', 'extractAddresses', 'completed', '{"release":3,"run":"a"}', null, '2026-06-24T10:00:00.000Z', '2026-06-24T10:05:00.000Z', 1761261600000, 1761261900000);
      `)

      const metaDb = createLocalHarbourDb(metaSqlite)
      const rows = await listIngestRuns(metaDb, { limit: 2 })

      expect(rows.map(row => row.releaseId)).toEqual([
        'release-1',
        'release-1',
        'release-2',
      ])
      expect(rows.every(row => row.releaseId !== 'release-3')).toBe(true)
      expect(rows[0]?.stats).toEqual({ release: 1, run: 'a' })

      metaSqlite.close()
    } finally {
      await rm(tempDir, { force: true, recursive: true })
    }
  })

  test('batches release row count queries per shard instead of per release', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'harbour-reporting-releases-'))

    try {
      const metaSqlite = await initSqlite(
        join(tempDir, 'meta.sqlite'),
        resolve(repoRoot, 'libs/db/migrations/meta'),
      )
      const sourceSqlite = await initSqlite(
        join(tempDir, 'source.sqlite'),
        resolve(repoRoot, 'libs/db/migrations/source'),
      )
      const historySqlite = await initSqlite(
        join(tempDir, 'history.sqlite'),
        resolve(repoRoot, 'libs/db/migrations/history'),
      )

      seedMetaCatalog(metaSqlite)
      seedRelease(metaSqlite)
      seedSourceRows(sourceSqlite)
      seedHistoryRows(historySqlite)
      seedRelease(
        metaSqlite,
        'release-hkgov-hk-2026-06-25.0-address',
        'hkgov-hk-2026-06-25.0-address',
        '2026-06-25.0',
        1761350400000,
      )
      seedSourceRows(
        sourceSqlite,
        'release-hkgov-hk-2026-06-25.0-address',
        'dataset-hkgov-hk-address',
        'source-address-2',
      )
      seedHistoryRows(
        historySqlite,
        'release-hkgov-hk-2026-06-25.0-address',
        'release-set-2',
        'address-2',
        'address3d-2',
      )

      const queryCounts = {
        history: 0,
        source: 0,
      }
      const metaDb = createLocalHarbourDb(metaSqlite)
      const bindings = {
        DB_HISTORY_HK_2026: createD1Database(historySqlite, () => {
          queryCounts.history += 1
        }),
        DB_SOURCE_HK_2026: createD1Database(sourceSqlite, () => {
          queryCounts.source += 1
        }),
      }

      const releases = await listReleases(metaDb, bindings, 'preview', { limit: 2 })

      expect(releases).toHaveLength(2)
      expect(queryCounts.source).toBe(4)
      expect(queryCounts.history).toBe(4)
      expect(releases.map(release => release.releaseId)).toEqual([
        'release-hkgov-hk-2026-06-25.0-address',
        'release-hkgov-hk-2026-06-24.0-address',
      ])

      metaSqlite.close()
      sourceSqlite.close()
      historySqlite.close()
    } finally {
      await rm(tempDir, { force: true, recursive: true })
    }
  })
})

async function initSqlite(dbPath: string, migrationsDir: string) {
  const sqlite = new SQLiteDatabase(dbPath)
  sqlite.exec('PRAGMA foreign_keys = ON;')
  sqlite.exec(loadMigrationSql(migrationsDir))
  return sqlite
}

function seedMetaCatalog(sqlite: SQLiteDatabase) {
  sqlite.exec(`
    INSERT INTO publishers (
      id, code, url, contactUrl, contactEmail, contactPhone, parentPublisherId, createdAt, updatedAt
    ) VALUES
      ('publisher-hkgov', 'hkgov', 'https://data.gov.hk', 'https://data.gov.hk/en/feedback', null, null, null, 1, 1);

    INSERT INTO datasets (
      id, publisherId, code, regionCode, releaseType, releaseFrequency, theme, type, sourceUrl, licenseId, attribution, category, createdAt, updatedAt
    ) VALUES (
      'dataset-hkgov-hk-address',
      'publisher-hkgov',
      'hk-address',
      'hk',
      'static',
      'monthly',
      'addresses',
      'address',
      'https://data.gov.hk/en-data/dataset/hk-ogcio-st_div_01-als',
      null,
      null,
      'places',
      1,
      1
    );

    INSERT INTO dataShards (
      id, kind, regionCode, year, environment, databaseName, databaseId, bindingName, status, createdAt, updatedAt
    ) VALUES
      (
        'shard-history-hk-2026-preview',
        'history',
        'hk',
        '2026',
        'preview',
        'history-preview',
        'history-preview',
        'DB_HISTORY_HK_2026',
        'active',
        1,
        1
      ),
      (
        'shard-source-hk-2026-preview',
        'source',
        'hk',
        '2026',
        'preview',
        'source-preview',
        'source-preview',
        'DB_SOURCE_HK_2026',
        'active',
        1,
        1
      );
  `)
}

function seedRelease(
  sqlite: SQLiteDatabase,
  releaseId = 'release-hkgov-hk-2026-06-24.0-address',
  releaseCode = 'hkgov-hk-2026-06-24.0-address',
  sourceVersion = '2026-06-24.0',
  timestamp = 1761264000000,
) {
  sqlite.exec(`
    INSERT INTO releases (
      id, datasetId, code, sourceVersion, sourceSchemaVersion, publicationDate, snapshotMonth, rawObjectKey, originalFileName, status, revokedAt, revocationReason, supersededByReleaseId, ingestedAt, createdAt, updatedAt
    ) VALUES (
      '${releaseId}',
      'dataset-hkgov-hk-address',
      '${releaseCode}',
      '${sourceVersion}',
      null,
      null,
      '2026-06',
      'hk/hkgov/${sourceVersion}/address.parquet',
      'address.parquet',
      'published',
      null,
      null,
      null,
      ${timestamp},
      ${timestamp},
      ${timestamp}
    );

    INSERT INTO releaseShardAssignments (releaseId, dataShardId, createdAt) VALUES (
      '${releaseId}',
      'shard-history-hk-2026-preview',
      ${timestamp}
    );
  `)
}

function seedIngestRun(sqlite: SQLiteDatabase) {
  sqlite.exec(`
    INSERT INTO ingestRuns (
      runId, releaseId, phase, status, stats, error, startedAt, finishedAt, createdAt, updatedAt
    ) VALUES (
      'run-hkgov-hk-2026-06-24.0-address',
      'release-hkgov-hk-2026-06-24.0-address',
      'extractAddresses',
      'completed',
      '{"inserted":1}',
      null,
      '2026-06-24T10:00:00.000Z',
      '2026-06-24T10:05:00.000Z',
      1761261600000,
      1761261900000
    );
  `)
}

function seedStat(sqlite: SQLiteDatabase) {
  sqlite.exec(`
    INSERT INTO stats (
      id, type, releaseId, dimension, metric, metricUnit, value, groupBy, groupValue, createdAt, updatedAt
    ) VALUES (
      'stat-hkgov-hk-2026-06-24.0-address-rows',
      'address',
      'release-hkgov-hk-2026-06-24.0-address',
      'ingest',
      'rows',
      'count',
      1,
      null,
      null,
      1761264000000,
      1761264000000
    );
  `)
}

function seedSourceRows(
  sqlite: SQLiteDatabase,
  releaseId = 'release-hkgov-hk-2026-06-24.0-address',
  datasetId = 'dataset-hkgov-hk-address',
  sourceRecordId = 'source-address-1',
) {
  sqlite.exec(`
    INSERT INTO sourceHkgovAlsAddresses2d (
      releaseId, datasetId, sourceRecordId, sourcePayloadHash, createdAt, updatedAt, regionCode, geoAddress, csuId, x, y, geometry, districtCode, districtName, estateName, buildingName, blockNumber, blockDescriptor, phaseName, phaseNumber, floor, unit, streetNumber, streetName, villageName, dataOwner, rawPayload
    ) VALUES (
      '${releaseId}',
      '${datasetId}',
      '${sourceRecordId}',
      'hash-1',
      1761264000000,
      1761264000000,
      'hk',
      '1 Example Road',
      'csu-1',
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      '1',
      'Example Road',
      null,
      'hkgov-als',
      null
    );

    INSERT INTO sourceHkgovAlsAddress2dI18n (
      sourceRecordId, locale, formattedAddress, buildingName, buildingNumberFrom, buildingNumberTo, blockType, blockNumber, blockTypeBeforeNumber, phaseName, phaseNumber, estateName, streetNumber, streetName, villageName, districtName
    ) VALUES
      ('${sourceRecordId}', 'en', '1 Example Road', null, null, null, null, null, null, null, null, null, '1', 'Example Road', null, null),
      ('${sourceRecordId}', 'zhHant', '示例路1號', null, null, null, null, null, null, null, null, null, '1', '示例路', null, null);

    INSERT INTO sourceHkgovAlsAddresses2dVersions (
      sourceRecordId, regionCode, versionHash, releaseId, validFromRelease, validToRelease, isCurrent, createdAt, updatedAt, geoAddress, csuId, x, y, geometry, districtCode, districtName, estateName, buildingName, blockNumber, blockDescriptor, phaseName, phaseNumber, floor, unit, streetNumber, streetName, villageName, dataOwner, rawPayload
    ) VALUES (
      '${sourceRecordId}',
      'hk',
      'version-hash-1',
      '${releaseId}',
      '${releaseId}',
      null,
      1,
      1761264000000,
      1761264000000,
      '1 Example Road',
      'csu-1',
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      '1',
      'Example Road',
      null,
      'hkgov-als',
      null
    );

    INSERT INTO sourceHkgovAlsAddress2dI18nVersions (
      sourceRecordId, versionHash, releaseId, validFromRelease, validToRelease, isCurrent, createdAt, updatedAt, locale, formattedAddress, buildingName, buildingNumberFrom, buildingNumberTo, blockType, blockNumber, blockTypeBeforeNumber, phaseName, phaseNumber, estateName, streetNumber, streetName, villageName, districtName
    ) VALUES
      ('${sourceRecordId}', 'version-hash-1', '${releaseId}', '${releaseId}', null, 1, 1761264000000, 1761264000000, 'en', '1 Example Road', null, null, null, null, null, null, null, null, null, '1', 'Example Road', null, null),
      ('${sourceRecordId}', 'version-hash-1', '${releaseId}', '${releaseId}', null, 1, 1761264000000, 1761264000000, 'zhHant', '示例路1號', null, null, null, null, null, null, null, null, null, '1', '示例路', null, null);
  `)
}

function seedHistoryRows(
  sqlite: SQLiteDatabase,
  releaseId = 'release-hkgov-hk-2026-06-24.0-address',
  releaseSetId = 'release-set-1',
  addressId = 'address-1',
  address3dId = 'address3d-1',
) {
  sqlite.exec(`
    INSERT INTO address2dVersions (
      id, regionCode, versionHash, releaseId, validFromReleaseSetId, validToReleaseSetId, validFromMonth, validToMonth, isCurrent, streetId, hamletId, microhoodId, villageId, neighbourhoodId, macrohoodId, townId, districtId, areaId, countryId, geometry, bbox, identifiers, sources, createdAt, updatedAt
    ) VALUES (
      '${addressId}',
      'hk',
      'address-2d-version-1',
      '${releaseId}',
      '${releaseSetId}',
      null,
      '2026-06',
      null,
      1,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      '2026-06-24T12:00:00.000Z',
      '2026-06-24T12:00:00.000Z'
    );

    INSERT INTO address2dVersionsI18n (
      addressId, versionHash, releaseId, validFromReleaseSetId, validToReleaseSetId, isCurrent, locale, formattedAddress, buildingName, buildingNumberFrom, buildingNumberTo, blockType, blockNumber, blockTypeBeforeNumber, phaseName, phaseNumber, estateName, streetNumber, streetName, createdAt, updatedAt
    ) VALUES
      ('${addressId}', 'address-2d-version-1', '${releaseId}', '${releaseSetId}', null, 1, 'en', '1 Example Road', null, null, null, null, null, null, null, null, null, '1', 'Example Road', '2026-06-24T12:00:00.000Z', '2026-06-24T12:00:00.000Z'),
      ('${addressId}', 'address-2d-version-1', '${releaseId}', '${releaseSetId}', null, 1, 'zhHant', '示例路1號', null, null, null, null, null, null, null, null, null, '1', '示例路', '2026-06-24T12:00:00.000Z', '2026-06-24T12:00:00.000Z');

    INSERT INTO address3dVersions (
      id, versionHash, releaseId, validFromReleaseSetId, validToReleaseSetId, validFromMonth, validToMonth, isCurrent, address2dId, sources, createdAt, updatedAt
    ) VALUES (
      '${address3dId}',
      'address-3d-version-1',
      '${releaseId}',
      '${releaseSetId}',
      null,
      '2026-06',
      null,
      1,
      '${addressId}',
      null,
      '2026-06-24T12:00:00.000Z',
      '2026-06-24T12:00:00.000Z'
    );

    INSERT INTO address3dVersionsI18n (
      address3dId, versionHash, releaseId, validFromReleaseSetId, validToReleaseSetId, isCurrent, locale, formattedAddressPart, accessHint, unitPortion, unitNumber, unitType, floorNumber, floorType, createdAt, updatedAt
    ) VALUES (
      '${address3dId}',
      'address-3d-version-1',
      '${releaseId}',
      '${releaseSetId}',
      null,
      1,
      'en',
      'Flat A',
      null,
      null,
      'A',
      null,
      null,
      null,
      '2026-06-24T12:00:00.000Z',
      '2026-06-24T12:00:00.000Z'
    );
  `)
}

function createD1Database(sqlite: SQLiteDatabase, onPrepare?: () => void) {
  type SqliteStatement = {
    all: (...values: unknown[]) => unknown[]
    get: (...values: unknown[]) => unknown
  }

  return {
    prepare(query: string) {
      onPrepare?.()
      let values: unknown[] = []
      const statement = sqlite.query(query) as unknown as SqliteStatement

      return {
        bind(...nextValues: unknown[]) {
          values = nextValues
          return this
        },
        async all<T>() {
          return (statement.all(...values) as T[]) ?? []
        },
        async first<T>() {
          return (statement.get(...values) as T | null) ?? null
        },
      }
    },
  } as unknown as D1Database
}
