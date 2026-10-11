import { createMemoryProvenanceStore } from '../../../../../libs/core/src/testing/provenanceStore'
import {
  readFieldLineage,
  type FieldLineageReference,
} from '../../../../../libs/core/src/provenance/fieldLineageStorage'
export const { store: lineageStore } = createMemoryProvenanceStore()
import { resolveSnapshotProcessingRules } from '../../../../../libs/core/src/provenance/processingPolicyCatalogue'
import { computeVersionHash } from '@repo/db'
import { datasetVariantForSource } from '@repo/core/codes'
import { initialDatasets } from '@repo/db/registry'
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
  handleBootstrapStatsReleaseSets: bootstrapStats,
  handlePublishDataset: publishDataset,
  handleReconcileDraftReleaseSets: reconcileDraft,
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
    inputs: string
  }>,
) {
  return rows
    .slice()
    .sort(
      (left, right) =>
        left.apiField.localeCompare(right.apiField) ||
        left.inputs.localeCompare(right.inputs),
    )
}

export function initDb(dbPath: string) {
  const db = new Database(dbPath)
  db.exec(migrationSql.replaceAll('--> statement-breakpoint', ''))
  seedFixtureCatalog(db)
  // Match insertDataset: each test release captures its policy at creation.
  db.exec(
    'CREATE TABLE fixturePolicies (datasetCode TEXT PRIMARY KEY, processingRules TEXT)',
  )
  for (const dataset of initialDatasets) {
    const definitionId = dataset.processingRules
      ? computeVersionHash(dataset.processingRules)
      : null
    if (definitionId)
      db.query('INSERT OR IGNORE INTO processingRuleDefinitions VALUES (?,?)').run(
        definitionId,
        JSON.stringify(dataset.processingRules),
      )
    db.query('INSERT INTO fixturePolicies VALUES (?, ?)').run(
      dataset.code,
      definitionId ?? null,
    )
  }
  db.exec(`CREATE TRIGGER fixture_capture_release_rules AFTER INSERT ON resourceReleases
    WHEN NEW.processingRules IS NULL
    BEGIN UPDATE resourceReleases SET processingRules = (SELECT p.processingRules FROM fixturePolicies p JOIN datasets d ON d.code = p.datasetCode WHERE d.id = NEW.datasetId) WHERE id = NEW.id; END;`)
  seedCompletedAudits(db)
  return db
}

export function seedCompletedAudits(db: Database) {
  db.exec(`INSERT OR IGNORE INTO processingAudits
    (resourceReleaseId, stage, ownerId, manifestHash, byteLength, applicationCount, attemptStatus)
    SELECT id, 'ingestion', id, 'sha256:${'0'.repeat(64)}', 1, 0, 'completed' FROM resourceReleases`)
}

export function seedSnapshot(
  sqlite: Database,
  {
    code,
    cohortKey = 'fixture-cohort',
    datasetId = 'overture-hk-division',
    resourceType = 'division',
    resourceReleaseId,
    snapshotId = `snapshot-${resourceReleaseId}`,
    status = 'draft',
    timestamp = 1761264000000,
  }: {
    code: string
    cohortKey?: string
    datasetId?: string
    resourceType?: string
    resourceReleaseId: string
    snapshotId?: string
    status?: 'draft' | 'published'
    timestamp?: number
  },
) {
  const publishedAt = status === 'published' ? timestamp : 'null'
  seedCompletedAudits(sqlite)

  sqlite.exec(`
    INSERT INTO snapshots (
      id, resourceType, code, cohortKey, status, publishedAt, validFrom, validTo, createdAt, updatedAt
    ) VALUES (
      '${snapshotId}',
      '${resourceType}',
      '${code}',
      '${cohortKey}',
      '${status}',
      ${publishedAt},
      ${publishedAt},
      null,
      ${timestamp},
      ${timestamp}
    );

    INSERT INTO snapshotResourceReleases (
      snapshotId, datasetId, resourceReleaseId, role, createdAt
    ) VALUES (
      '${snapshotId}',
      '${datasetId}',
      '${resourceReleaseId}',
      'primary',
      ${timestamp}
    );
  `)

  if (resourceType === 'address' || resourceType === 'place') {
    const dataset = sqlite
      .query(`SELECT d.code, d.regionCode, p.code AS publisherCode
      FROM datasets d JOIN publishers p ON p.id = d.publisherId WHERE d.id = ?`)
      .get(datasetId) as { code: string; regionCode: string; publisherCode: string }
    const variant = datasetVariantForSource(resourceType, dataset.publisherCode, {
      datasetCode: dataset.code,
    })
    const lineageId = `fixture-lineage-${datasetId}-${resourceType}-${variant}`
    sqlite
      .query(`INSERT OR IGNORE INTO snapshotLineages (
      id, code, regionCode, resourceType, variant, identityMode, primaryDatasetId,
      versionHash, createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, 'persistent', ?, 'fixture-lineage', ?, ?)`)
      .run(
        lineageId,
        lineageId,
        dataset.regionCode,
        resourceType,
        variant,
        datasetId,
        timestamp,
        timestamp,
      )
    sqlite
      .query('UPDATE snapshots SET snapshotLineageId = ? WHERE id = ?')
      .run(lineageId, snapshotId)
  }
  seedSnapshotAssembly(sqlite, snapshotId)
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

    UPDATE datasets SET resourceTypes = json_insert(resourceTypes, '$[#]', 'divisionArea') WHERE id = 'hkgov-censtatd-hk-district' AND NOT EXISTS (SELECT 1 FROM json_each(datasets.resourceTypes) WHERE value = 'divisionArea');
UPDATE datasets SET resourceTypes = json_insert(resourceTypes, '$[#]', 'divisionArea') WHERE id = 'hkgov-censtatd-hk-district-annual' AND NOT EXISTS (SELECT 1 FROM json_each(datasets.resourceTypes) WHERE value = 'divisionArea');
UPDATE datasets SET resourceTypes = json_insert(resourceTypes, '$[#]', 'divisionArea') WHERE id = 'hkgov-censtatd-hk-permanent-living-quarters' AND NOT EXISTS (SELECT 1 FROM json_each(datasets.resourceTypes) WHERE value = 'divisionArea');

    INSERT OR IGNORE INTO sourceReleases
      (id, datasetId, code, sourceVersion, cohortKey, status)
    VALUES
      (
        'release-dr-hk-hkgov-censtatd-permanent-living-quarters-2023-H2',
        'hkgov-censtatd-hk-permanent-living-quarters',
        'sr-hkgov-censtatd-permanent-living-quarters-2023-H2',
        '2023-H2', '2023-H2', 'current'
      ),
      (
        'release-dr-hk-hkgov-censtatd-division-area-district-annual-2024',
        'hkgov-censtatd-hk-district-annual',
        'sr-hkgov-censtatd-division-area-district-annual-2024',
        '2024', '2024', 'current'
      );

    INSERT OR IGNORE INTO resourceReleases (
      id, sourceReleaseId, datasetId, resourceType, code, sourceVersion, sourceSchemaVersion,
      cohortKey, status, ingestedAt, createdAt,
      updatedAt
    ) VALUES
    (
      'release-dr-hk-hkgov-censtatd-permanent-living-quarters-2023-H2',
      'release-dr-hk-hkgov-censtatd-permanent-living-quarters-2023-H2',
      'hkgov-censtatd-hk-permanent-living-quarters', 'divisionArea',
      'dr-hk-hkgov-censtatd-division-statistic-permanent-living-quarters-2023-H2',
      '2023-H2', '1.0', '2023-H2',
      'current', '2026-06-05T00:00:00.000Z',
      '2026-06-05T00:00:00.000Z', '2026-06-05T00:00:00.000Z'
    ),
    (
      'release-dr-hk-hkgov-censtatd-division-area-district-annual-2024',
      'release-dr-hk-hkgov-censtatd-division-area-district-annual-2024',
      'hkgov-censtatd-hk-district-annual', 'divisionArea',
      'dr-hk-hkgov-censtatd-division-area-district-annual-2024',
      '2024', '1.0', '2024',
      'current', '2026-06-05T00:00:00.000Z',
      '2026-06-05T00:00:00.000Z', '2026-06-05T00:00:00.000Z'
    );

    INSERT OR IGNORE INTO snapshotResourceReleases (
      snapshotId, datasetId, resourceReleaseId, role
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
    const resourceReleaseId = `release-${releaseCode}`
    insertFixtureRelease(sqlite, {
      datasetCode: release.datasetCode,
      resourceReleaseId,
      source: release.source,
      regionCode: 'hk',
      cohortKey: sourceVersion.slice(0, 7),
      resourceType: release.type,
      sourceVersion: release.sourceVersion,
      rawObjectKey: `hk/${release.source}/${release.sourceVersion}/${release.type}.parquet`,
      originalFileName: `${release.type}.parquet`,
      status: 'current',
      ingestedAt: '2026-06-05T00:00:00.000Z',
      createdAt: '2026-06-05T00:00:00.000Z',
      updatedAt: '2026-06-05T00:00:00.000Z',
    })
    sqlite
      .query('UPDATE resourceReleases SET sourceSchemaVersion = ? WHERE id = ?')
      .run(release.schemaVersion, resourceReleaseId)
    const datasetId = sqlite
      .query('SELECT datasetId FROM resourceReleases WHERE id = ?')
      .get(resourceReleaseId) as { datasetId: string }
    sqlite
      .query(
        'INSERT INTO snapshotResourceReleases (snapshotId, datasetId, resourceReleaseId, role) VALUES (?, ?, ?, ?)',
      )
      .run(snapshotId, datasetId.datasetId, resourceReleaseId, 'supporting')
  }
  seedSnapshotAssembly(sqlite, snapshotId)
  const companions = sqlite
    .query<
      {
        resourceReleaseId: string
        datasetId: string
        resourceType: string
        cohortKey: string
      },
      [string]
    >(
      `SELECT r.id AS resourceReleaseId, r.datasetId, r.resourceType, r.cohortKey
     FROM snapshotResourceReleases sr JOIN resourceReleases r ON r.id = sr.resourceReleaseId
     WHERE sr.snapshotId = ? AND r.resourceType IN ('divisionArea', 'divisionBoundary')`,
    )
    .all(snapshotId)
  for (const companion of companions) {
    const companionSnapshotId = `${snapshotId}-${companion.resourceReleaseId}`
    seedSnapshot(sqlite, {
      ...companion,
      snapshotId: companionSnapshotId,
      code: companionSnapshotId,
      status: 'published',
    })
  }
}

/** Fixtures retain the same selected assembly policies as real snapshot publication. */
export function seedSnapshotAssembly(sqlite: Database, snapshotId: string) {
  sqlite
    .query(`INSERT OR IGNORE INTO processingAudits (resourceReleaseId,stage,ownerId,manifestHash,byteLength,applicationCount,attemptStatus)
    SELECT resourceReleaseId, 'assembly', snapshotId, ?, 1, 0, 'completed' FROM snapshotResourceReleases WHERE snapshotId = ?`)
    .run('sha256:' + '0'.repeat(64), snapshotId)
  const snapshot = sqlite
    .query<{ resourceType: string; cohortKey: string }, [string]>(
      'SELECT resourceType, cohortKey FROM snapshots WHERE id = ?',
    )
    .get(snapshotId)
  if (!snapshot) throw new Error(`Missing fixture snapshot: ${snapshotId}`)
  const sources = sqlite
    .query<{ code: string }, [string]>(
      'SELECT d.code FROM snapshotResourceReleases sr JOIN datasets d ON d.id = sr.datasetId WHERE sr.snapshotId = ?',
    )
    .all(snapshotId)
  const rules = resolveSnapshotProcessingRules(
    sources.map(row => row.code),
    snapshot.resourceType,
  )
  const definitionId = computeVersionHash(rules)
  sqlite
    .query(
      'INSERT OR IGNORE INTO processingRuleDefinitions (id, definition) VALUES (?, ?)',
    )
    .run(definitionId, JSON.stringify(rules))
  const recipeId = `fixture-recipe-${definitionId}`
  sqlite
    .query(`INSERT OR IGNORE INTO snapshotRecipes (id, code, resourceType, version, processingRules, versionHash)
    VALUES (?, ?, ?, 1, ?, ?)`)
    .run(recipeId, recipeId, snapshot.resourceType, definitionId, definitionId)
  sqlite
    .query(`INSERT INTO snapshotAssemblies (id, snapshotId, snapshotRecipeId, anchorCohortKey, status)
    VALUES (?, ?, ?, ?, 'completed')
    ON CONFLICT(snapshotId) DO UPDATE SET snapshotRecipeId = excluded.snapshotRecipeId`)
    .run(`fixture-assembly-${snapshotId}`, snapshotId, recipeId, snapshot.cohortKey)
}

export function handlePublishDataset(
  db: Parameters<typeof publishDataset>[0],
  request: Parameters<typeof publishDataset>[1],
  queue?: Parameters<typeof publishDataset>[2],
  options: Omit<Parameters<typeof publishDataset>[3], 'lineageStore'> = {},
) {
  return publishDataset(db, request, queue, { ...options, lineageStore })
}
export function handleBootstrapStatsReleaseSets(
  db: Parameters<typeof bootstrapStats>[0],
  request: Parameters<typeof bootstrapStats>[1] = {},
) {
  return bootstrapStats(db, request, lineageStore)
}
export function handleReconcileDraftReleaseSets(
  db: Parameters<typeof reconcileDraft>[0],
  request: Parameters<typeof reconcileDraft>[1] = {},
) {
  return reconcileDraft(db, request, lineageStore)
}
export async function readFixtureLineage(db: Database, releaseSetId: string) {
  const row = db
    .query(`SELECT d.* FROM fieldLineageDefinitions d
    JOIN apiFieldProvenance p ON p.definitionId=d.id WHERE p.apiReleaseSetId=?`)
    .get(releaseSetId) as FieldLineageReference | null
  return row ? readFieldLineage(lineageStore, row) : null
}
