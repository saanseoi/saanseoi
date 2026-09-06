import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { Database } from 'bun:sqlite'
import {
  insertFixtureRelease,
  loadMigrationSql,
  seedFixtureCatalog,
} from '../../../../../libs/core/src/testing/metaFixtures'

const migrationsDir = resolve(import.meta.dir, '../../../../../libs/db/migrations')

const migrationSql = loadMigrationSql(migrationsDir, ['meta'])

export const {
  handleBootstrapStatsReleaseSets,
  handlePublishDataset,
  handleReconcileDraftReleaseSets,
  handleStageCompleted,
  handleStageFailed,
  handleStageRunning,
  isTransientControlError,
} = await import('./control')

export const tempDirs: string[] = []

export function createTempDir() {
  const dir = mkdtempSync(join(tmpdir(), 'harbour-control-test-'))
  tempDirs.push(dir)
  return dir
}

export function sortProvenanceRows(
  rows: Array<{
    apiField: string
    sourceFieldPath: string
  }>,
) {
  return rows
    .slice()
    .sort(
      (left, right) =>
        left.apiField.localeCompare(right.apiField) ||
        left.sourceFieldPath.localeCompare(right.sourceFieldPath),
    )
}

export function initDb(dbPath: string) {
  const db = new Database(dbPath)
  db.exec(migrationSql.replaceAll('--> statement-breakpoint', ''))
  seedFixtureCatalog(db)
  return db
}

export function seedSnapshot(
  sqlite: Database,
  {
    code,
    cohortKey = 'fixture-cohort',
    datasetId = 'overture-hk-division',
    resourceType = 'division',
    releaseId,
    snapshotId = `snapshot-${releaseId}`,
    status = 'draft',
    timestamp = 1761264000000,
  }: {
    code: string
    cohortKey?: string
    datasetId?: string
    resourceType?: string
    releaseId: string
    snapshotId?: string
    status?: 'draft' | 'published'
    timestamp?: number
  },
) {
  const publishedAt = status === 'published' ? timestamp : 'null'

  sqlite.exec(`
    INSERT INTO snapshots (
      id, resourceType, code, cohortKey, status, publishedAt, validFrom, validTo, notes, createdAt, updatedAt
    ) VALUES (
      '${snapshotId}',
      '${resourceType}',
      '${code}',
      '${cohortKey}',
      '${status}',
      ${publishedAt},
      ${publishedAt},
      null,
      null,
      ${timestamp},
      ${timestamp}
    );

    INSERT INTO snapshotSources (
      snapshotId, datasetId, sourceReleaseId, role, createdAt
    ) VALUES (
      '${snapshotId}',
      '${datasetId}',
      '${releaseId}',
      'primary',
      ${timestamp}
    );
  `)

  return snapshotId
}

export function seedCompleteDivisionSourceSignature(
  sqlite: Database,
  {
    snapshotId,
    sourceVersion,
    overtureSchemaVersion,
  }: {
    snapshotId: string
    sourceVersion: string
    overtureSchemaVersion: string
  },
) {
  sqlite.exec(`
    INSERT OR IGNORE INTO publishers (id, code, versionHash, createdAt, updatedAt)
    VALUES ('publisher-hkgov-censtatd', 'hkgov-censtatd', 'vh-publisher-hkgov-censtatd-v1', 1761264000000, 1761264000000);

    INSERT OR IGNORE INTO datasets (
      id, publisherId, code, regionCode, releaseType, releaseFrequency, theme,
      sourceVariant, sourceUrl, versionHash, createdAt, updatedAt
    ) VALUES
      (
        'hkgov-censtatd-hk-district', 'publisher-hkgov-censtatd',
        'ds-hk-hkgov-censtatd-division-statistic-subdivided-units-district', 'hk', 'static', 'as-needed',
        'divisions', 'default', 'https://www.censtatd.gov.hk/',
        'vh-dataset-hkgov-censtatd-hk-district-v1', 1761264000000, 1761264000000
      ),
      (
        'hkgov-censtatd-hk-district-annual', 'publisher-hkgov-censtatd',
        'ds-hk-hkgov-censtatd-division-statistic-population-households-district', 'hk', 'static', 'yearly',
        'divisions', 'official-statistics', 'https://www.censtatd.gov.hk/',
        'vh-dataset-hkgov-censtatd-hk-district-annual-v1', 1761264000000, 1761264000000
      ),
      (
        'hkgov-censtatd-hk-permanent-living-quarters', 'publisher-hkgov-censtatd',
        'ds-hk-hkgov-censtatd-division-statistic-permanent-living-quarters',
        'hk', 'static', 'half-yearly', 'divisions', 'hkgov-censtatd-area',
        'https://www.censtatd.gov.hk/',
        'vh-dataset-hkgov-censtatd-hk-permanent-living-quarters-v1', 1761264000000, 1761264000000
      );

    INSERT OR IGNORE INTO datasetResourceTypes (datasetId, resourceType)
    VALUES
      ('hkgov-censtatd-hk-district', 'divisionArea'),
      ('hkgov-censtatd-hk-district-annual', 'divisionArea'),
      ('hkgov-censtatd-hk-permanent-living-quarters', 'divisionArea');

    INSERT OR IGNORE INTO releases (
      id, sourceReleaseId, datasetId, resourceType, code, sourceVersion, sourceSchemaVersion,
      cohortKey, rawObjectKey, originalFileName, status, ingestedAt, createdAt,
      updatedAt
    ) VALUES
    (
      'release-dr-hk-hkgov-censtatd-permanent-living-quarters-2023-H2',
      'release-dr-hk-hkgov-censtatd-permanent-living-quarters-2023-H2',
      'hkgov-censtatd-hk-permanent-living-quarters', 'divisionArea',
      'dr-hk-hkgov-censtatd-division-statistic-permanent-living-quarters-2023-H2',
      '2023-H2', '1.0', '2023-H2',
      'hk/hkgov-censtatd/2023-H2/division-area.parquet',
      'division-area.parquet', 'published', '2026-06-05T00:00:00.000Z',
      '2026-06-05T00:00:00.000Z', '2026-06-05T00:00:00.000Z'
    ),
    (
      'release-dr-hk-hkgov-censtatd-division-area-district-annual-2024',
      'release-dr-hk-hkgov-censtatd-division-area-district-annual-2024',
      'hkgov-censtatd-hk-district-annual', 'divisionArea',
      'dr-hk-hkgov-censtatd-division-area-district-annual-2024',
      '2024', '1.0', '2024',
      'hk/hkgov-censtatd/2024/division-area.parquet',
      'division-area.parquet', 'published', '2026-06-05T00:00:00.000Z',
      '2026-06-05T00:00:00.000Z', '2026-06-05T00:00:00.000Z'
    );

    INSERT OR IGNORE INTO sourceReleases
      (id, datasetId, code, sourceVersion, cohortKey, status)
    VALUES
      (
        'release-dr-hk-hkgov-censtatd-permanent-living-quarters-2023-H2',
        'hkgov-censtatd-hk-permanent-living-quarters',
        'sr-hkgov-censtatd-permanent-living-quarters-2023-H2',
        '2023-H2', '2023-H2', 'published'
      ),
      (
        'release-dr-hk-hkgov-censtatd-division-area-district-annual-2024',
        'hkgov-censtatd-hk-district-annual',
        'sr-hkgov-censtatd-division-area-district-annual-2024',
        '2024', '2024', 'published'
      );

    INSERT OR IGNORE INTO snapshotSources (
      snapshotId, datasetId, sourceReleaseId, role
    ) VALUES
    (
      '${snapshotId}', 'hkgov-censtatd-hk-permanent-living-quarters',
      'release-dr-hk-hkgov-censtatd-permanent-living-quarters-2023-H2', 'supporting'
    ),
    (
      '${snapshotId}', 'hkgov-censtatd-hk-district-annual',
      'release-dr-hk-hkgov-censtatd-division-area-district-annual-2024', 'supporting'
    );
  `)

  const companionReleases = [
    {
      source: 'overture',
      type: 'divisionArea' as const,
      sourceVersion,
      schemaVersion: overtureSchemaVersion,
    },
    {
      source: 'overture',
      type: 'divisionBoundary' as const,
      sourceVersion,
      schemaVersion: overtureSchemaVersion,
    },
    {
      source: 'hkgov-had',
      type: 'divisionArea' as const,
      sourceVersion: '2022',
      schemaVersion: '1.2',
    },
    {
      datasetCode: 'ds-hk-hkgov-censtatd-division-statistic-subdivided-units-district',
      source: 'hkgov-censtatd',
      type: 'divisionArea' as const,
      sourceVersion: '2016',
      schemaVersion: '1.0',
    },
  ]

  for (const release of companionReleases) {
    const releaseCode = `dr-hk-${release.source}-${release.type === 'divisionArea' && release.source !== 'overture' ? 'division-area-district' : release.type === 'divisionBoundary' ? 'division-boundary' : 'division-area'}-${release.sourceVersion}`
    const releaseId = `release-${releaseCode}`
    insertFixtureRelease(sqlite, {
      datasetCode: release.datasetCode,
      releaseId,
      source: release.source,
      regionCode: 'hk',
      cohortKey: sourceVersion.slice(0, 7),
      type: release.type,
      sourceVersion: release.sourceVersion,
      rawObjectKey: `hk/${release.source}/${release.sourceVersion}/${release.type}.parquet`,
      originalFileName: `${release.type}.parquet`,
      status: 'published',
      ingestedAt: '2026-06-05T00:00:00.000Z',
      createdAt: '2026-06-05T00:00:00.000Z',
      updatedAt: '2026-06-05T00:00:00.000Z',
    })
    sqlite
      .query('UPDATE releases SET sourceSchemaVersion = ? WHERE id = ?')
      .run(release.schemaVersion, releaseId)
    const datasetId = sqlite
      .query('SELECT datasetId FROM releases WHERE id = ?')
      .get(releaseId) as { datasetId: string }
    sqlite
      .query(
        'INSERT INTO snapshotSources (snapshotId, datasetId, sourceReleaseId, role) VALUES (?, ?, ?, ?)',
      )
      .run(snapshotId, datasetId.datasetId, releaseId, 'supporting')
  }
}
