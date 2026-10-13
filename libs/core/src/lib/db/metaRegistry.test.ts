import { releaseFixtureSchemaSql } from '../../testing/releaseFixtures'
import { createMemoryProvenanceStore } from '../../testing/provenanceStore'
const { store: lineageStore } = createMemoryProvenanceStore()
import { compareCatalogMembers } from './metaRegistry'
import { resolveSnapshotProcessingRules } from '../../provenance/processingPolicyCatalogue'
import { initialDatasets } from '@repo/db/registry'
import { describe, expect, test } from 'bun:test'

import { Database as SQLiteDatabase } from 'bun:sqlite'

import divisionFixtureOverture116To118 from '../../../../../fixtures/meta/apiFields/api-divisions-v0.1@geographic-v2.json'
import { createLocalHarbourDb } from '../../testing/localDb'
import { computeVersionHash } from '@repo/db'
import {
  buildDeterministicApiReleaseSetId,
  buildDeterministicApiVersionReleaseSetId,
  ensureDraftReleaseSetForRelease,
  ensureDraftSnapshotForRelease,
  ensureProcessingRunStarted,
  canonicaliseApiFieldSourceSchemas,
  getCurrentReleaseForDatasetId,
  getLatestNewerDatasetRelease,
  getLatestDatasetForRegionSourceDatasetType,
  insertDataset,
  listApiFieldProvenanceForReleaseSet,
  getApiFieldLineageForReleaseSet,
  listPublishedSnapshotsForResourceTypeRegionAtOrAfterCohortKey,
  markDatasetCurrent,
  listRegistryReleases,
  listRegistryApiFields,
  getRegistryApiField,
  listOvertureReleaseSetCohortsAtOrAfterCohortKey,
  listCurrentSnapshotCleanupCandidates,
  publishReleaseArtefacts,
  resolveRegistryReleaseDisplayStatus,
  recordSnapshotAssembly,
  resolveApiReleaseSetForRequest,
  resolveActiveSnapshotForType,
  resolveEarliestPublishedSnapshotForResourceTypeRegionAtOrAfterCohortKey,
  resolveLatestPublishedSnapshotForResourceTypeRegionAtOrBeforeCohortKey,
  resolveLatestPublishedSnapshotForResourceTypeRegionExcludingId,
  resolveLatestSnapshotForResourceTypeExcludingId,
  resolvePublishedSnapshotForResourceTypeRegionCohortKey,
  resolvePublishedSnapshotsForResourceTypeRegionAtOrBeforeCohortKey,
  resolveSnapshotForRelease,
  resolveShardForTypeRegionYear,
  updateDatasetStatus,
} from './metaRegistry'

describe('canonicaliseApiFieldSourceSchemas', () => {
  test('retains Density as source provenance but excludes it from the canonical Population and Household field relationship', () => {
    const result = canonicaliseApiFieldSourceSchemas({
      'ds-hk-hkgov-censtatd-division-statistic-land-area-population-density-district':
        '1.0',
      'ds-hk-hkgov-censtatd-division-statistic-population-households-district': '1.0',
      'ds-hk-hkgov-censtatd-division-statistic-subdivided-units-district': '1.0',
    })

    expect(result).toEqual({
      redundantDatasetCodes: [
        'ds-hk-hkgov-censtatd-division-statistic-land-area-population-density-district',
      ],
      sourceSchemas: {
        'ds-hk-hkgov-censtatd-division-statistic-population-households-district': '1.0',
        'ds-hk-hkgov-censtatd-division-statistic-subdivided-units-district': '1.0',
      },
    })
  })
})

describe('resolveRegistryReleaseDisplayStatus', () => {
  test('keeps older cohort revisions reader-facing as revised', () => {
    expect(
      resolveRegistryReleaseDisplayStatus(
        { cohortKey: '2025-09-24.0', revision: 1, status: 'archived' },
        { cohortKey: '2026-06-17.0', revision: 0 },
      ),
    ).toBe('revised')
  })

  test('marks an older initial cohort as superseded', () => {
    expect(
      resolveRegistryReleaseDisplayStatus(
        { cohortKey: '2025-09-24.0', revision: 0, status: 'archived' },
        { cohortKey: '2026-06-17.0', revision: 0 },
      ),
    ).toBe('superseded')
  })

  test('keeps the latest revision current', () => {
    expect(
      resolveRegistryReleaseDisplayStatus(
        { cohortKey: '2026-06-17.0', revision: 2, status: 'current' },
        { cohortKey: '2026-06-17.0', revision: 2 },
      ),
    ).toBe('current')
  })
})

function createRegistryReleasesDb() {
  const sqlite = new SQLiteDatabase(':memory:')

  sqlite.exec(`
    CREATE TABLE apiVersions (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL,
      familyType TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'current'
    );

    CREATE TABLE apiReleaseSets (
      publisherFields TEXT,
id TEXT PRIMARY KEY,
      apiVersionId TEXT NOT NULL,
      code TEXT NOT NULL,
      regionCode TEXT,
      domainCode TEXT NOT NULL,
      cohortKey TEXT,
      revision INTEGER NOT NULL,
      schemaVersion TEXT NOT NULL,
      rulesetVersion TEXT NOT NULL,
      status TEXT NOT NULL,
      publishedAt TEXT,
      validFrom TEXT,
      validTo TEXT,
      notes TEXT,
      guide TEXT,
      versionHash TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE apiVersionReleaseSets (
      id TEXT PRIMARY KEY,
      apiVersionId TEXT NOT NULL,
      apiReleaseSetId TEXT NOT NULL,
      apiCompositionId TEXT,
      previousRevisionApiReleaseSetId TEXT,
      status TEXT NOT NULL,
      publishedAt TEXT,
      validFrom TEXT,
      validTo TEXT,
      notes TEXT,
      guide TEXT,
      versionHash TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TRIGGER seedRegistryVersion AFTER INSERT ON apiReleaseSets BEGIN
      INSERT INTO apiVersionReleaseSets (id,apiVersionId,apiReleaseSetId,status,publishedAt,validFrom,validTo,notes,guide,versionHash,createdAt,updatedAt)
      VALUES (NEW.id || '-version',NEW.apiVersionId,NEW.id,NEW.status,NEW.publishedAt,NEW.validFrom,NEW.validTo,NEW.notes,NEW.guide,NEW.versionHash,NEW.createdAt,NEW.updatedAt);
    END;
    CREATE TABLE snapshotRecipes (id TEXT PRIMARY KEY, processingRules TEXT);
    CREATE TABLE snapshotAssemblies (snapshotId TEXT, snapshotRecipeId TEXT);

    CREATE TABLE snapshots (
      id TEXT PRIMARY KEY,
      resourceType TEXT NOT NULL,
      code TEXT NOT NULL,
      cohortKey TEXT NOT NULL,
      status TEXT NOT NULL,
      publishedAt TEXT,
      validFrom TEXT,
      validTo TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE apiReleaseSetSnapshots (
      apiReleaseSetId TEXT NOT NULL,
      snapshotId TEXT NOT NULL,
      variant TEXT NOT NULL DEFAULT 'default',
      role TEXT NOT NULL,
      isRequired INTEGER NOT NULL,
      cohortMatchingMode TEXT,
      createdAt TEXT NOT NULL
    );

    CREATE TABLE stats (
      id TEXT PRIMARY KEY,
      apiReleaseSetId TEXT,
      category TEXT NOT NULL,
      measure TEXT NOT NULL,
      unit TEXT NOT NULL,
      value REAL NOT NULL,
      dimension TEXT,
      dimensionValue TEXT
    );

    CREATE TABLE snapshotResourceReleases (
      snapshotId TEXT NOT NULL,
      datasetId TEXT NOT NULL,
      resourceReleaseId TEXT,
      role TEXT NOT NULL
    );

    ${releaseFixtureSchemaSql()};

    ;

    CREATE TABLE publishers (
      i18n TEXT NOT NULL DEFAULT '{}',
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL
    );

    CREATE TABLE datasets (
      i18n TEXT NOT NULL DEFAULT '{}',
      resourceTypes TEXT NOT NULL DEFAULT '[]',
      id TEXT PRIMARY KEY,
      publisherId TEXT,
      code TEXT NOT NULL,
      kind TEXT
    );



  `)

  return {
    sqlite,
    db:
      (sqlite.exec(
        'CREATE TABLE IF NOT EXISTS processingRuleDefinitions (id TEXT PRIMARY KEY, definition TEXT NOT NULL)',
      ),
      createLocalHarbourDb(sqlite)),
  }
}

describe('listRegistryReleases', () => {
  test('keeps the latest release current in each domain', async () => {
    const { sqlite, db } = createRegistryReleasesDb()

    sqlite.exec(`
      INSERT INTO apiVersions (id, code, familyType) VALUES
        ('api-divisions', 'api-divisions-v0.1', 'divisions');

      INSERT INTO apiReleaseSets (
        id, apiVersionId, code, regionCode, domainCode, cohortKey, revision, schemaVersion,
        rulesetVersion, status, publishedAt, versionHash, createdAt, updatedAt
      ) VALUES
        ('overture-current', 'api-divisions', 'data-hk-divisions-2026-07-22.0', 'hk', 'overture', '2026-07-22.0', 0, 'v1', 'v1', 'current', '2026-08-13T15:19:40.010Z', 'hash-1', '2026-08-13T15:19:40.010Z', '2026-08-13T15:19:40.010Z'),
        ('pland-2016', 'api-divisions', 'data-hk-divisions-2016--hkgov-pland-pu', 'hk', 'hkgov-pland-pu', '2016', 0, 'v1', 'v1', 'archived', '2026-08-13T20:12:29.763Z', 'hash-2', '2026-08-13T20:12:29.763Z', '2026-08-13T20:12:29.763Z'),
        ('pland-current', 'api-divisions', 'data-hk-divisions-2021--hkgov-pland-pu', 'hk', 'hkgov-pland-pu', '2021', 0, 'v1', 'v1', 'current', '2026-08-13T20:27:16.700Z', 'hash-3', '2026-08-13T20:27:16.700Z', '2026-08-13T20:27:16.700Z');
    `)

    const releases = await listRegistryReleases(db as never)
    const statuses = new Map(
      releases.map(release => [release.id, release.displayStatus]),
    )

    expect(statuses.get('overture-current')).toBe('current')
    expect(statuses.get('pland-current')).toBe('current')
    expect(statuses.get('pland-2016')).toBe('superseded')
    sqlite.close()
  })

  test('orders drafts by createdAt alongside published releases', async () => {
    const { sqlite, db } = createRegistryReleasesDb()

    sqlite.exec(`
      INSERT INTO apiVersions (id, code, familyType) VALUES
        ('api-divisions', 'api-divisions-v0.1', 'divisions');

      INSERT INTO apiReleaseSets (
        id, apiVersionId, code, regionCode, domainCode, cohortKey, revision, schemaVersion,
        rulesetVersion, status, publishedAt, versionHash, createdAt, updatedAt
      ) VALUES
        ('published-new', 'api-divisions', 'data-hk-divisions-2026-07-15.0', 'hk', 'default', '2026-07-15.0', 0, 'v1', 'v1', 'published', '2026-07-15T00:00:00.000Z', 'hash-1', '2026-07-15T00:00:00.000Z', '2026-07-15T00:00:00.000Z'),
        ('draft', 'api-divisions', 'data-hk-divisions-2026-07-10.0', 'hk', 'default', '2026-07-10.0', 0, 'v1', 'v1', 'draft', null, 'hash-2', '2026-07-10T00:00:00.000Z', '2026-07-10T00:00:00.000Z'),
        ('published-old', 'api-divisions', 'data-hk-divisions-2026-07-05.0', 'hk', 'default', '2026-07-05.0', 0, 'v1', 'v1', 'published', '2026-07-05T00:00:00.000Z', 'hash-3', '2026-07-05T00:00:00.000Z', '2026-07-05T00:00:00.000Z');
    `)

    const releases = await listRegistryReleases(db as never)

    expect(releases.map(release => release.id)).toEqual([
      'published-new',
      'draft',
      'published-old',
    ])
    expect(releases[0]?.regionCode).toBe('hk')
    sqlite.close()
  })

  test('combines bulk rules from the contributing source releases', async () => {
    const { sqlite, db } = createRegistryReleasesDb()

    sqlite.exec(`
      INSERT INTO apiVersions (id, code, familyType) VALUES
        ('api-addresses', 'api-addresses-v0.1', 'addresses');

      INSERT INTO apiReleaseSets (
        id, apiVersionId, code, domainCode, cohortKey, revision, schemaVersion,
        rulesetVersion, status, publishedAt, versionHash, createdAt, updatedAt
      ) VALUES
        ('api-release', 'api-addresses', 'data-hk-addresses-2026-07-15.0', 'default', '2026-07-15.0', 0, 'v1', 'v1', 'published', '2026-07-15T00:00:00.000Z', 'hash', '2026-07-15T00:00:00.000Z', '2026-07-15T00:00:00.000Z');

      INSERT INTO snapshots (
        id, resourceType, code, cohortKey, status, createdAt, updatedAt
      ) VALUES
        ('snapshot-a', 'address', 'snapshot-a', '2026-07-15.0', 'published', '2026-07-15T00:00:00.000Z', '2026-07-15T00:00:00.000Z'),
        ('snapshot-b', 'address', 'snapshot-b', '2026-07-15.0', 'published', '2026-07-15T00:00:00.000Z', '2026-07-15T00:00:00.000Z');

      INSERT INTO apiReleaseSetSnapshots (
        apiReleaseSetId, snapshotId, role, isRequired, createdAt
      ) VALUES
        ('api-release', 'snapshot-a', 'primary', 1, '2026-07-15T00:00:00.000Z'),
        ('api-release', 'snapshot-b', 'supporting', 1, '2026-07-15T00:00:00.000Z');

      INSERT INTO publishers (id, code) VALUES
        ('publisher-a', 'hkgov-als'),
        ('publisher-b', 'landsd'),
        ('publisher-c', 'overture');

      INSERT INTO datasets (id, publisherId, code) VALUES
        ('dataset-a', 'publisher-a', 'hkgov-als'),
        ('dataset-b', 'publisher-b', 'landsd-addresses'),
        ('dataset-c', 'publisher-c', 'overture-divisions');

      UPDATE datasets SET resourceTypes = json_insert(resourceTypes, '$[#]', 'address') WHERE id = 'dataset-a' AND NOT EXISTS (SELECT 1 FROM json_each(datasets.resourceTypes) WHERE value = 'address');
UPDATE datasets SET resourceTypes = json_insert(resourceTypes, '$[#]', 'address') WHERE id = 'dataset-b' AND NOT EXISTS (SELECT 1 FROM json_each(datasets.resourceTypes) WHERE value = 'address');
UPDATE datasets SET resourceTypes = json_insert(resourceTypes, '$[#]', 'division') WHERE id = 'dataset-c' AND NOT EXISTS (SELECT 1 FROM json_each(datasets.resourceTypes) WHERE value = 'division');

      UPDATE datasets SET i18n = '{"en":{"name":"Hong Kong addresses"},"zh-hant":{"name":"香港地址"}}' WHERE id = 'dataset-a';

      INSERT INTO sourceReleases (id, datasetId, code) VALUES
        ('source-version-a', 'dataset-a', 'dr-hk-addresses-2026-07-15'),
        ('source-version-b', 'dataset-b', 'dr-hk-landsd-addresses-2026-07-15'),
        ('source-version-c', 'dataset-c', 'dr-hk-overture-divisions-2026-07-15');

      INSERT OR IGNORE INTO sourceReleases (id, datasetId, code, sourceVersion, status) VALUES ('source-version-a', 'dataset-a', 'source-' || '2026-07-15', '2026-07-15', 'current');
UPDATE sourceReleases SET sourceVersion = '2026-07-15' WHERE id = 'source-version-a';
INSERT INTO resourceReleases (id, datasetId, sourceReleaseId, code, ingestedAt, processingRules, resourceType, status) VALUES ('source-release-a', 'dataset-a', 'source-version-a', '2026-07-15', '2026-07-15T00:00:00.000Z', '{"rulesets":[{"rulesetVersion":"v1","rules":[{"operationCode":"normalise_name","kind":"bulk","i18n":{}}]}]}', 'division', 'current');
INSERT OR IGNORE INTO sourceReleases (id, datasetId, code, sourceVersion, status) VALUES ('source-version-b', 'dataset-b', 'source-' || '2026-07-15', '2026-07-15', 'current');
UPDATE sourceReleases SET sourceVersion = '2026-07-15' WHERE id = 'source-version-b';
INSERT INTO resourceReleases (id, datasetId, sourceReleaseId, code, ingestedAt, processingRules, resourceType, status) VALUES ('source-release-b', 'dataset-b', 'source-version-b', '2026-07-15', '2026-07-15T00:00:00.000Z', '{"rulesets":[{"rulesetVersion":"v1","rules":[{"operationCode":"normalise_name","kind":"bulk","i18n":{}}]}]}', 'division', 'current');
INSERT OR IGNORE INTO sourceReleases (id, datasetId, code, sourceVersion, status) VALUES ('source-version-c', 'dataset-c', 'source-' || '2026-07-15', '2026-07-15', 'current');
UPDATE sourceReleases SET sourceVersion = '2026-07-15' WHERE id = 'source-version-c';
INSERT INTO resourceReleases (id, datasetId, sourceReleaseId, code, ingestedAt, processingRules, resourceType, status) VALUES ('source-release-c', 'dataset-c', 'source-version-c', '2026-07-15', '2026-07-15T00:00:00.000Z', '{}', 'division', 'current');

      INSERT INTO snapshotResourceReleases (snapshotId, datasetId, resourceReleaseId, role) VALUES
        ('snapshot-a', 'dataset-a', 'source-release-a', 'primary'),
        ('snapshot-a', 'dataset-c', 'source-release-c', 'primary'),
        ('snapshot-b', 'dataset-b', 'source-release-b', 'primary');

    `)
    for (const row of sqlite
      .query(
        'SELECT id, processingRules FROM resourceReleases WHERE processingRules IS NOT NULL',
      )
      .all() as Array<{ id: string; processingRules: string }>)
      sqlite
        .query('UPDATE resourceReleases SET processingRules=? WHERE id=?')
        .run(captureFixtureRules(sqlite, JSON.parse(row.processingRules)), row.id)
    const assemblyRules = {
      stage: 'assembly',
      rulesets: [
        {
          rulesetVersion: 'assembly-v1',
          rules: [
            {
              operationCode: 'assemble-addresses',
              kind: 'bulk',
              inputs: ['source-addresses'],
              outputs: ['addresses'],
              i18n: { en: { description: 'Assemble addresses' } },
            },
          ],
        },
      ],
    }
    sqlite
      .query('INSERT INTO snapshotRecipes VALUES (?,?)')
      .run('address-recipe', captureFixtureRules(sqlite, assemblyRules))
    sqlite.exec("INSERT INTO snapshotAssemblies VALUES ('snapshot-a','address-recipe')")
    const [release] = await listRegistryReleases(db as never)
    if (!release) throw new Error('Expected API release to be returned.')

    expect(release.bulkActions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'source-release-a:v1:0',
          sourceCode: 'hkgov-als',
        }),
        expect.objectContaining({
          id: 'source-release-b:v1:0',
          sourceCode: 'landsd-addresses',
        }),
        expect.objectContaining({
          id: 'address-recipe:assembly-v1:0',
          snapshotCode: 'snapshot-a',
          operationCode: 'assemble-addresses',
        }),
      ]),
    )
    expect(release.contributingSources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          publisherCode: 'hkgov-als',
          sourceReleaseCode: '2026-07-15',
          sourceVersion: '2026-07-15',
          kind: null,
          datasetI18n: {
            en: { name: 'Hong Kong addresses' },
            'zh-hant': { name: '香港地址' },
          },
        }),
        expect.objectContaining({
          publisherCode: 'landsd',
          sourceReleaseCode: '2026-07-15',
          sourceVersion: '2026-07-15',
          kind: null,
        }),
      ]),
    )
    expect(release.contributingSources).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sourceCode: 'overture-divisions' }),
      ]),
    )

    sqlite.close()
  })
})

function createShardLookupDb() {
  const sqlite = new SQLiteDatabase(':memory:')

  sqlite.exec(`
    CREATE TABLE dataShards (
      id TEXT PRIMARY KEY,
      shardType TEXT NOT NULL,
      regionCode TEXT,
      year TEXT,
      environment TEXT NOT NULL,
      databaseName TEXT NOT NULL,
      databaseId TEXT NOT NULL,
      bindingName TEXT NOT NULL,
      status TEXT NOT NULL
    );
  `)

  return {
    sqlite,
    db:
      (sqlite.exec(
        'CREATE TABLE IF NOT EXISTS processingRuleDefinitions (id TEXT PRIMARY KEY, definition TEXT NOT NULL)',
      ),
      createLocalHarbourDb(sqlite)),
  }
}

function createProcessingRunDb() {
  const sqlite = new SQLiteDatabase(':memory:')

  sqlite.exec(`
    CREATE TABLE processingRuns (
      runId TEXT PRIMARY KEY,
      resourceReleaseId TEXT NOT NULL,
      stage TEXT NOT NULL DEFAULT 'assembly', checkpoint TEXT, attempt INTEGER NOT NULL DEFAULT 1, snapshotId TEXT, apiReleaseSetId TEXT, phase TEXT NOT NULL,
      status TEXT NOT NULL,
      results TEXT,
      error TEXT,
      startedAt TEXT NOT NULL,
      finishedAt TEXT,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL,
      UNIQUE(resourceReleaseId, phase)
    );
  `)

  return {
    sqlite,
    db:
      (sqlite.exec(
        'CREATE TABLE IF NOT EXISTS processingRuleDefinitions (id TEXT PRIMARY KEY, definition TEXT NOT NULL)',
      ),
      createLocalHarbourDb(sqlite)),
  }
}

function createSnapshotLookupDb() {
  const sqlite = new SQLiteDatabase(':memory:')

  sqlite.exec(`
    CREATE TABLE snapshots (
      id TEXT PRIMARY KEY,
      resourceType TEXT NOT NULL,
      code TEXT NOT NULL,
      geometryStatus TEXT,
      status TEXT NOT NULL,
      publishedAt INTEGER,
      createdAt INTEGER NOT NULL
    );
  `)

  return {
    sqlite,
    db:
      (sqlite.exec(
        'CREATE TABLE IF NOT EXISTS processingRuleDefinitions (id TEXT PRIMARY KEY, definition TEXT NOT NULL)',
      ),
      createLocalHarbourDb(sqlite)),
  }
}

function createDraftSnapshotDb() {
  const sqlite = new SQLiteDatabase(':memory:')

  sqlite.exec(`
    CREATE TABLE resourceReleases(id TEXT PRIMARY KEY,status TEXT NOT NULL);
    CREATE TABLE apiReleaseSetSnapshots(apiReleaseSetId TEXT NOT NULL,snapshotId TEXT NOT NULL);
    CREATE TABLE apiCatalogRevisionReleaseSets(apiCatalogRevisionId TEXT NOT NULL,apiVersionReleaseSetId TEXT NOT NULL);
    CREATE TABLE apiVersionReleaseSets(id TEXT PRIMARY KEY,apiReleaseSetId TEXT NOT NULL);
    CREATE TABLE apiCatalogRevisions(id TEXT PRIMARY KEY,apiVersionId TEXT NOT NULL,regionCode TEXT NOT NULL,status TEXT NOT NULL,publishedAt TEXT NOT NULL,revision INTEGER NOT NULL);
    CREATE TABLE snapshotLineages (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      regionCode TEXT NOT NULL,
      resourceType TEXT NOT NULL,
      variant TEXT NOT NULL,
      identityMode TEXT NOT NULL,
      primaryDatasetId TEXT,
      versionHash TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE UNIQUE INDEX snapshotLineages_primaryDataset_resourceType_variant_unique_idx
      ON snapshotLineages (primaryDatasetId, resourceType, variant);

    CREATE TABLE snapshots (
      id TEXT PRIMARY KEY,
      snapshotLineageId TEXT,
      parentSnapshotId TEXT,
      resourceType TEXT NOT NULL,
      code TEXT NOT NULL,
      cohortKey TEXT NOT NULL,
      geometryStatus TEXT,
      revision INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL,
      publishedAt TEXT,
      validFrom TEXT,
      validTo TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE snapshotResourceReleases (
      snapshotId TEXT NOT NULL,
      datasetId TEXT NOT NULL,
      resourceReleaseId TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'primary'
    );
  `)

  return {
    sqlite,
    db:
      (sqlite.exec(
        'CREATE TABLE IF NOT EXISTS processingRuleDefinitions (id TEXT PRIMARY KEY, definition TEXT NOT NULL)',
      ),
      createLocalHarbourDb(sqlite)),
  }
}

function createDraftReleaseSetDb() {
  const sqlite = new SQLiteDatabase(':memory:')

  sqlite.exec(`
    CREATE TABLE apiVersions (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL,
      familyType TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'current'
    );

    CREATE TABLE apiComposition (
      id TEXT PRIMARY KEY,
      apiVersionId TEXT NOT NULL,
      code TEXT NOT NULL,
      version INTEGER NOT NULL,
      primaryResourceType TEXT NOT NULL,
      defaultDomainCode TEXT,
      status TEXT NOT NULL,
      createdAt TEXT NOT NULL
    );

    CREATE TABLE apiCompositionMembers (
      i18n TEXT NOT NULL DEFAULT '{}',
      apiCompositionId TEXT NOT NULL,
      domainCode TEXT NOT NULL DEFAULT 'default',
      resourceType TEXT NOT NULL,
      variant TEXT NOT NULL DEFAULT 'default',
      role TEXT NOT NULL,
      isRequired INTEGER NOT NULL,
      cohortMatchingMode TEXT NOT NULL,
      maxLagDays INTEGER,
      priority INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (apiCompositionId, domainCode, resourceType, variant)
    );

    CREATE TABLE apiReleaseSets (
      publisherFields TEXT,
id TEXT PRIMARY KEY,
      apiVersionId TEXT,
      apiCompositionId TEXT,
      code TEXT NOT NULL,
      regionCode TEXT,
      domainCode TEXT NOT NULL DEFAULT 'default',
      cohortKey TEXT,
      revision INTEGER NOT NULL DEFAULT 0,
      effectiveFrom TEXT,
      previousRevisionApiReleaseSetId TEXT,
      schemaVersion TEXT NOT NULL,
      rulesetVersion TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      publishedAt TEXT,
      validFrom TEXT,
      validTo TEXT,
      notes TEXT,
      guide TEXT,
      versionHash TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE apiVersionReleaseSets (
      id TEXT PRIMARY KEY,
      apiVersionId TEXT NOT NULL,
      apiReleaseSetId TEXT NOT NULL,
      apiCompositionId TEXT,
      previousRevisionApiReleaseSetId TEXT,
      status TEXT NOT NULL,
      publishedAt TEXT,
      validFrom TEXT,
      validTo TEXT,
      notes TEXT,
      guide TEXT,
      versionHash TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    INSERT INTO apiVersions (id, code, familyType) VALUES
      ('api-version-division', 'api-divisions-v0.1', 'divisions'),
      ('api-version-division-v02', 'api-divisions-v0.2', 'divisions');

    INSERT INTO apiComposition (
      id, apiVersionId, code, version, primaryResourceType, status, createdAt
    ) VALUES (
      'api-composition-division',
      'api-version-division',
      'api-divisions-default',
      1,
      'division',
      'current',
      '2026-07-03T00:00:00.000Z'
    );
  `)

  return {
    sqlite,
    db:
      (sqlite.exec(
        'CREATE TABLE IF NOT EXISTS processingRuleDefinitions (id TEXT PRIMARY KEY, definition TEXT NOT NULL)',
      ),
      createLocalHarbourDb(sqlite)),
  }
}

function createSnapshotAssemblyDb() {
  const sqlite = new SQLiteDatabase(':memory:')

  sqlite.exec(`
    CREATE TABLE snapshotRecipes (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL,
      resourceType TEXT NOT NULL,
      version INTEGER NOT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT,
      versionHash TEXT,
      processingRules TEXT
    );

    CREATE TABLE snapshotDependencies (snapshotId TEXT NOT NULL, dependencySnapshotId TEXT NOT NULL, role TEXT NOT NULL, PRIMARY KEY (snapshotId,role));

    CREATE TABLE snapshotAssemblies (
      id TEXT PRIMARY KEY,
      snapshotId TEXT NOT NULL,
      snapshotRecipeId TEXT NOT NULL,
      anchorReleaseId TEXT,
      status TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    INSERT INTO snapshotRecipes (
      id, code, resourceType, version, createdAt
    ) VALUES (
      'snapshot-assembly-division-v1',
      'snapshot-assembly-division-v1',
      'division',
      1,
      '2026-07-03T00:00:00.000Z'
    );
    CREATE TABLE datasets (id TEXT PRIMARY KEY, code TEXT NOT NULL);
    INSERT INTO datasets VALUES ('dataset-division','ds-hk-overture-division');
    CREATE TABLE snapshots (id TEXT PRIMARY KEY, resourceType TEXT, status TEXT, cohortKey TEXT);
    INSERT INTO snapshots VALUES ('snapshot-division', 'division', 'draft', '2025-09-24.0');
    CREATE TABLE snapshotResourceReleases (snapshotId TEXT, datasetId TEXT, resourceReleaseId TEXT, role TEXT, selectedByRule TEXT, selectionMode TEXT, anchorReleaseId TEXT, sourceCohortKey TEXT);
    INSERT INTO snapshotResourceReleases VALUES ('snapshot-division', 'dataset-division', 'release-division', 'primary', 'assembly:division:source-release:v1', 'exact_ref', 'release-division', '2025-09-24.0');
    CREATE TABLE snapshotRecipeInputs (snapshotRecipeId TEXT, datasetId TEXT, role TEXT, isRequired INTEGER, maxLagDays INTEGER, priority INTEGER, selectionPolicyJson TEXT, PRIMARY KEY(snapshotRecipeId, datasetId, role));
  `)

  return {
    sqlite,
    db:
      (sqlite.exec(
        'CREATE TABLE IF NOT EXISTS processingRuleDefinitions (id TEXT PRIMARY KEY, definition TEXT NOT NULL)',
      ),
      createLocalHarbourDb(sqlite)),
  }
}

function createRegionalSnapshotLookupDb() {
  const sqlite = new SQLiteDatabase(':memory:')

  sqlite.exec(`
    CREATE TABLE publishers (
      i18n TEXT NOT NULL DEFAULT '{}',
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL
    );

    CREATE TABLE datasets (
      i18n TEXT NOT NULL DEFAULT '{}',
      resourceTypes TEXT NOT NULL DEFAULT '[]',
      id TEXT PRIMARY KEY,
      publisherId TEXT,
      regionCode TEXT NOT NULL
    );

    CREATE TABLE snapshots (
      id TEXT PRIMARY KEY,
      snapshotLineageId TEXT,
      resourceType TEXT NOT NULL,
      code TEXT NOT NULL,
      geometryStatus TEXT,
      status TEXT NOT NULL,
      publishedAt INTEGER,
      createdAt INTEGER NOT NULL
    );

    CREATE TABLE snapshotResourceReleases (
      snapshotId TEXT NOT NULL,
      datasetId TEXT NOT NULL,
      resourceReleaseId TEXT NOT NULL,
      role TEXT NOT NULL
    );

    CREATE TABLE snapshotLineages (
      id TEXT PRIMARY KEY,
      variant TEXT NOT NULL
    );
  `)

  return {
    sqlite,
    db:
      (sqlite.exec(
        'CREATE TABLE IF NOT EXISTS processingRuleDefinitions (id TEXT PRIMARY KEY, definition TEXT NOT NULL)',
      ),
      createLocalHarbourDb(sqlite)),
  }
}

function createLatestDatasetLookupDb() {
  const sqlite = new SQLiteDatabase(':memory:')

  sqlite.exec(`
    CREATE TABLE publishers (
      i18n TEXT NOT NULL DEFAULT '{}',
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL
    );

    CREATE TABLE datasets (
      i18n TEXT NOT NULL DEFAULT '{}',
      resourceTypes TEXT NOT NULL DEFAULT '[]',
      id TEXT PRIMARY KEY,
      publisherId TEXT NOT NULL,
      code TEXT NOT NULL,
      regionCode TEXT NOT NULL,
      theme TEXT NOT NULL,
      type TEXT NOT NULL,
      sourceVariant TEXT NOT NULL DEFAULT 'default',
      sourceCrs TEXT,
      processingRules TEXT
    );

    ${releaseFixtureSchemaSql()};

    ;

  `)

  return {
    sqlite,
    db:
      (sqlite.exec(
        'CREATE TABLE IF NOT EXISTS processingRuleDefinitions (id TEXT PRIMARY KEY, definition TEXT NOT NULL)',
      ),
      createLocalHarbourDb(sqlite)),
  }
}

function createCleanupCandidatesDb() {
  const sqlite = new SQLiteDatabase(':memory:')

  sqlite.exec(`
    CREATE TABLE snapshots (
      id TEXT PRIMARY KEY,
      snapshotLineageId TEXT,
      resourceType TEXT NOT NULL,
      cohortKey TEXT NOT NULL DEFAULT '2026',
      geometryStatus TEXT,
      revision INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL,
      publishedAt TEXT,
      createdAt TEXT
    );

    CREATE TABLE snapshotLineages (id TEXT PRIMARY KEY, variant TEXT);
    CREATE TABLE snapshotResourceReleases (
      snapshotId TEXT, datasetId TEXT, resourceReleaseId TEXT, role TEXT
    );
    CREATE TABLE resourceReleases (
      id TEXT PRIMARY KEY, datasetId TEXT, resourceType TEXT, status TEXT
    );
    CREATE TABLE datasets (
      i18n TEXT NOT NULL DEFAULT '{}',
      id TEXT PRIMARY KEY, publisherId TEXT, code TEXT, regionCode TEXT, sourceVariant TEXT
    );
    CREATE TABLE publishers (
      i18n TEXT NOT NULL DEFAULT '{}', id TEXT PRIMARY KEY, code TEXT);

    CREATE TABLE apiReleaseSets (
      publisherFields TEXT,
id TEXT PRIMARY KEY,
      code TEXT NOT NULL
    );

    CREATE TABLE apiVersionReleaseSets (id TEXT PRIMARY KEY, apiReleaseSetId TEXT NOT NULL, status TEXT NOT NULL);

    CREATE TABLE apiReleaseSetSnapshots (
      apiReleaseSetId TEXT NOT NULL,
      snapshotId TEXT NOT NULL,
      PRIMARY KEY (apiReleaseSetId, snapshotId)
    );

    CREATE TABLE apiCatalogRevisions (
      id TEXT PRIMARY KEY,
      apiVersionId TEXT NOT NULL,
      regionCode TEXT NOT NULL,
      revision INTEGER NOT NULL,
      status TEXT NOT NULL,
      publishedAt INTEGER NOT NULL
    );

    CREATE TABLE apiCatalogRevisionReleaseSets (
      apiCatalogRevisionId TEXT NOT NULL,
      apiVersionReleaseSetId TEXT NOT NULL,
      isDefault INTEGER NOT NULL
    );
  `)

  return {
    sqlite,
    db:
      (sqlite.exec(
        'CREATE TABLE IF NOT EXISTS processingRuleDefinitions (id TEXT PRIMARY KEY, definition TEXT NOT NULL)',
      ),
      createLocalHarbourDb(sqlite)),
  }
}

function createActiveSnapshotLookupDb() {
  const sqlite = new SQLiteDatabase(':memory:')

  sqlite.exec(`
    CREATE TABLE apiVersions (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL,
      familyType TEXT NOT NULL DEFAULT 'divisions',
      version TEXT NOT NULL DEFAULT '0.1'
    );

    CREATE TABLE apiReleaseSets (
      publisherFields TEXT,
id TEXT PRIMARY KEY,
      code TEXT NOT NULL,
      domainCode TEXT NOT NULL DEFAULT 'default',
      schemaVersion TEXT NOT NULL,
      rulesetVersion TEXT NOT NULL,
      createdAt INTEGER NOT NULL
    );

    CREATE TABLE apiVersionReleaseSets (id TEXT PRIMARY KEY, apiReleaseSetId TEXT NOT NULL, apiVersionId TEXT NOT NULL, status TEXT NOT NULL, publishedAt INTEGER);

    CREATE TABLE snapshots (
      id TEXT PRIMARY KEY,
      resourceType TEXT NOT NULL,
      code TEXT NOT NULL
    );

    CREATE TABLE apiReleaseSetSnapshots (
      apiReleaseSetId TEXT NOT NULL,
      snapshotId TEXT NOT NULL,
      PRIMARY KEY (apiReleaseSetId, snapshotId)
    );

    CREATE TABLE publishers (
      i18n TEXT NOT NULL DEFAULT '{}',
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL
    );

    CREATE TABLE datasets (
      i18n TEXT NOT NULL DEFAULT '{}',
      resourceTypes TEXT NOT NULL DEFAULT '[]',
      id TEXT PRIMARY KEY,
      publisherId TEXT NOT NULL,
      code TEXT NOT NULL,
      regionCode TEXT NOT NULL
    );

    CREATE TABLE snapshotResourceReleases (
      snapshotId TEXT NOT NULL,
      datasetId TEXT NOT NULL,
      resourceReleaseId TEXT NOT NULL,
      role TEXT NOT NULL
    );
  `)

  return {
    sqlite,
    db:
      (sqlite.exec(
        'CREATE TABLE IF NOT EXISTS processingRuleDefinitions (id TEXT PRIMARY KEY, definition TEXT NOT NULL)',
      ),
      createLocalHarbourDb(sqlite)),
  }
}

function createPublishReleaseArtefactsDb() {
  const sqlite = new SQLiteDatabase(':memory:')

  sqlite.exec(`
    CREATE TABLE publishers (
      i18n TEXT NOT NULL DEFAULT '{}',
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL
    );

    CREATE TABLE datasets (
      i18n TEXT NOT NULL DEFAULT '{}',
      resourceTypes TEXT NOT NULL DEFAULT '[]',
      id TEXT PRIMARY KEY,
      publisherId TEXT NOT NULL,
      code TEXT NOT NULL
    );

    CREATE TABLE apiVersions (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL,
      familyType TEXT NOT NULL DEFAULT 'divisions',
      version TEXT NOT NULL DEFAULT '0.1'
    );

    CREATE TABLE apiComposition (
      id TEXT PRIMARY KEY,
      apiVersionId TEXT NOT NULL,
      code TEXT NOT NULL,
      version INTEGER NOT NULL,
      primaryResourceType TEXT NOT NULL,
      defaultDomainCode TEXT,
      status TEXT NOT NULL,
      createdAt INTEGER NOT NULL
    );

    CREATE TABLE apiCompositionMembers (
      i18n TEXT NOT NULL DEFAULT '{}',
      apiCompositionId TEXT NOT NULL,
      domainCode TEXT NOT NULL DEFAULT 'default',
      resourceType TEXT NOT NULL,
      variant TEXT NOT NULL DEFAULT 'default',
      role TEXT NOT NULL,
      isRequired INTEGER NOT NULL,
      cohortMatchingMode TEXT NOT NULL,
      maxLagDays INTEGER,
      priority INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (apiCompositionId, domainCode, resourceType, variant)
    );

    CREATE TABLE snapshots (
      id TEXT PRIMARY KEY,
      snapshotLineageId TEXT,
      parentSnapshotId TEXT,
      resourceType TEXT NOT NULL DEFAULT 'division',
      code TEXT NOT NULL,
      cohortKey TEXT NOT NULL DEFAULT '2026-05-20.0',
      revision INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL,
      publishedAt INTEGER,
      validFrom INTEGER,
      validTo INTEGER,
      updatedAt INTEGER NOT NULL
    );

    CREATE TABLE apiReleaseSets (
      publisherFields TEXT,
id TEXT PRIMARY KEY,
      apiVersionId TEXT NOT NULL,
      apiCompositionId TEXT,
      code TEXT NOT NULL DEFAULT 'data-hk-divisions-2026-05-20.0',
      regionCode TEXT DEFAULT 'hk',
      domainCode TEXT NOT NULL DEFAULT 'geographic',
      cohortKey TEXT DEFAULT '2026-05-20.0',
      revision INTEGER NOT NULL DEFAULT 0,
      effectiveFrom INTEGER,
      previousRevisionApiReleaseSetId TEXT,
      schemaVersion TEXT NOT NULL,
      rulesetVersion TEXT NOT NULL,
      status TEXT NOT NULL,
      publishedAt INTEGER,
      validFrom INTEGER,
      validTo INTEGER,
      updatedAt INTEGER NOT NULL
    );

    CREATE TABLE apiVersionReleaseSets (id TEXT PRIMARY KEY, apiReleaseSetId TEXT, apiVersionId TEXT, apiCompositionId TEXT, previousRevisionApiReleaseSetId TEXT, status TEXT, publishedAt INTEGER, validFrom INTEGER, validTo INTEGER, notes TEXT, guide TEXT, versionHash TEXT, createdAt INTEGER, updatedAt INTEGER);
    CREATE TRIGGER seedVersionRelease AFTER INSERT ON apiReleaseSets BEGIN
      INSERT INTO apiVersionReleaseSets (id,apiReleaseSetId,apiVersionId,apiCompositionId,previousRevisionApiReleaseSetId,status,publishedAt,validFrom,validTo,versionHash,createdAt,updatedAt)
      VALUES (NEW.id || '-version',NEW.id,NEW.apiVersionId,NEW.apiCompositionId,NEW.previousRevisionApiReleaseSetId,NEW.status,NEW.publishedAt,NEW.validFrom,NEW.validTo,'hash',NEW.updatedAt,NEW.updatedAt);
    END;
    CREATE TABLE snapshotRecipes (id TEXT PRIMARY KEY, resourceType TEXT, processingRules TEXT);
    CREATE TABLE snapshotAssemblies (id TEXT PRIMARY KEY, snapshotId TEXT, snapshotRecipeId TEXT);

    CREATE TABLE apiCatalogRevisions (
      id TEXT PRIMARY KEY,
      apiVersionId TEXT NOT NULL,
      code TEXT NOT NULL UNIQUE,
      regionCode TEXT NOT NULL,
      publicationDate TEXT NOT NULL,
      revision INTEGER NOT NULL,
      defaultDomainCode TEXT,
      status TEXT NOT NULL,
      publishedAt INTEGER NOT NULL,
      versionHash TEXT NOT NULL,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL
    );

    CREATE TABLE apiCatalogRevisionReleaseSets (
      apiCatalogRevisionId TEXT NOT NULL,
      apiReleaseSetId TEXT,
      apiVersionReleaseSetId TEXT,
      domainCode TEXT NOT NULL,
      cohortKey TEXT NOT NULL,
      isDefault INTEGER NOT NULL DEFAULT 0,
      createdAt INTEGER NOT NULL,
      PRIMARY KEY (apiCatalogRevisionId, domainCode, cohortKey)
    );

    ${releaseFixtureSchemaSql()};

    ;

    CREATE TABLE snapshotResourceReleases (
      snapshotId TEXT NOT NULL,
      datasetId TEXT NOT NULL,
      resourceReleaseId TEXT NOT NULL,
      anchorReleaseId TEXT,
      role TEXT NOT NULL DEFAULT 'primary'
    );

    CREATE TABLE apiReleaseSetSnapshots (
      apiReleaseSetId TEXT NOT NULL,
      snapshotId TEXT NOT NULL,
      variant TEXT NOT NULL DEFAULT 'default',
      role TEXT NOT NULL,
      isRequired INTEGER NOT NULL,
      cohortMatchingMode TEXT NOT NULL,
      createdAt INTEGER NOT NULL,
      PRIMARY KEY (apiReleaseSetId, snapshotId, variant)
    );

    CREATE TABLE fieldLineageDefinitions (id TEXT PRIMARY KEY, schemaVersion INTEGER NOT NULL, manifestHash TEXT NOT NULL, manifestByteLength INTEGER NOT NULL);
    CREATE TABLE apiFieldProvenance (apiReleaseSetId TEXT PRIMARY KEY, definitionId TEXT NOT NULL, binding TEXT);
    CREATE TABLE processingAudits(resourceReleaseId TEXT NOT NULL,stage TEXT NOT NULL,ownerId TEXT NOT NULL,manifestHash TEXT NOT NULL,byteLength INTEGER NOT NULL,applicationCount INTEGER NOT NULL,attemptStatus TEXT NOT NULL,PRIMARY KEY(resourceReleaseId,stage,ownerId));
    CREATE TABLE processingRuns (runId TEXT PRIMARY KEY, resourceReleaseId TEXT, snapshotId TEXT, apiReleaseSetId TEXT, stage TEXT NOT NULL, phase TEXT NOT NULL, status TEXT NOT NULL, attempt INTEGER NOT NULL DEFAULT 1, checkpoint TEXT, results TEXT, error TEXT, startedAt TEXT NOT NULL, finishedAt TEXT, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL, UNIQUE(resourceReleaseId,phase), UNIQUE(snapshotId,phase), UNIQUE(apiReleaseSetId,phase));


    CREATE TABLE releaseSetLifecycleJournal (
      id TEXT PRIMARY KEY,
      resourceReleaseId TEXT NOT NULL,
      relatedResourceReleaseId TEXT,
      snapshotId TEXT,
      apiReleaseSetId TEXT,
      apiVersionReleaseSetId TEXT,
      action TEXT NOT NULL,
      statusFrom TEXT,
      statusTo TEXT,
      metadataJson TEXT,
      createdAt TEXT NOT NULL
    );

    INSERT INTO datasets (id, publisherId, code) VALUES
      ('dataset-hkgov-had-district', 'publisher-hkgov-had', 'ds-hk-hkgov-had-division-area-district'),
      ('dataset-hkgov-censtatd-district', 'publisher-hkgov-censtatd', 'ds-hk-hkgov-censtatd-division-statistic-subdivided-units-district'),
      ('dataset-hkgov-censtatd-district-annual', 'publisher-hkgov-censtatd', 'ds-hk-hkgov-censtatd-division-statistic-population-households-district'),
      ('dataset-hkgov-censtatd-area-type', 'publisher-hkgov-censtatd', 'ds-hk-hkgov-censtatd-division-statistic-permanent-living-quarters');
  `)

  return {
    sqlite,
    db:
      (sqlite.exec(
        'CREATE TABLE IF NOT EXISTS processingRuleDefinitions (id TEXT PRIMARY KEY, definition TEXT NOT NULL)',
      ),
      createLocalHarbourDb(sqlite)),
  }
}

function seedSnapshotProcessingPolicies(sqlite: SQLiteDatabase) {
  const rows = sqlite
    .query(
      'SELECT s.id, s.resourceType, d.code FROM snapshots s JOIN snapshotResourceReleases sr ON sr.snapshotId=s.id JOIN datasets d ON d.id=sr.datasetId',
    )
    .all() as Array<{ id: string; resourceType: string; code: string }>
  for (const id of new Set(rows.map(row => row.id))) {
    const selected = rows.filter(row => row.id === id)
    const policy = resolveSnapshotProcessingRules(
      selected.map(row => row.code),
      selected[0]!.resourceType,
    )
    sqlite
      .query('INSERT OR REPLACE INTO snapshotRecipes VALUES (?,?,?)')
      .run(
        id + '-recipe',
        selected[0]!.resourceType,
        captureFixtureRules(sqlite, policy),
      )
    sqlite
      .query('INSERT OR REPLACE INTO snapshotAssemblies VALUES (?,?,?)')
      .run(id + '-assembly', id, id + '-recipe')
  }
}

function seedCompleteOvertureFixtureSources(
  sqlite: SQLiteDatabase,
  snapshotId: string,
) {
  sqlite.exec(`
    INSERT OR IGNORE INTO publishers (id, code) VALUES
      ('publisher-overture', 'overture'),
      ('publisher-hkgov-had', 'hkgov-had'),
      ('publisher-hkgov-censtatd', 'hkgov-censtatd');

    INSERT OR IGNORE INTO sourceReleases (id, datasetId, code, sourceVersion, status, sourceSchemaVersion) VALUES (coalesce((SELECT id FROM sourceReleases WHERE datasetId = 'fixture' AND sourceVersion = '2026-06-17.0'), 'source-' || 'release-supporting-area'), 'fixture', 'source-' || 'release-supporting-area', '2026-06-17.0', 'current', '1.17.0');
UPDATE sourceReleases SET sourceVersion = '2026-06-17.0', sourceSchemaVersion = '1.17.0' WHERE id = coalesce((SELECT id FROM sourceReleases WHERE datasetId = 'fixture' AND sourceVersion = '2026-06-17.0'), 'source-' || 'release-supporting-area');
INSERT INTO resourceReleases (id, status, revokedAt, revocationReason, supersededByResourceReleaseId, updatedAt, sourceReleaseId, datasetId, code, resourceType) VALUES ('release-supporting-area', 'current', null, null, null, 1760000000000, coalesce((SELECT id FROM sourceReleases WHERE datasetId = 'fixture' AND sourceVersion = '2026-06-17.0'), 'source-' || 'release-supporting-area'), 'fixture', 'release-supporting-area', 'division');
INSERT OR IGNORE INTO sourceReleases (id, datasetId, code, sourceVersion, status, sourceSchemaVersion) VALUES (coalesce((SELECT id FROM sourceReleases WHERE datasetId = 'fixture' AND sourceVersion = '2026-06-17.0'), 'source-' || 'release-supporting-boundary'), 'fixture', 'source-' || 'release-supporting-boundary', '2026-06-17.0', 'current', '1.17.0');
UPDATE sourceReleases SET sourceVersion = '2026-06-17.0', sourceSchemaVersion = '1.17.0' WHERE id = coalesce((SELECT id FROM sourceReleases WHERE datasetId = 'fixture' AND sourceVersion = '2026-06-17.0'), 'source-' || 'release-supporting-boundary');
INSERT INTO resourceReleases (id, status, revokedAt, revocationReason, supersededByResourceReleaseId, updatedAt, sourceReleaseId, datasetId, code, resourceType) VALUES ('release-supporting-boundary', 'current', null, null, null, 1760000000000, coalesce((SELECT id FROM sourceReleases WHERE datasetId = 'fixture' AND sourceVersion = '2026-06-17.0'), 'source-' || 'release-supporting-boundary'), 'fixture', 'release-supporting-boundary', 'division');
INSERT OR IGNORE INTO sourceReleases (id, datasetId, code, sourceVersion, status, sourceSchemaVersion) VALUES (coalesce((SELECT id FROM sourceReleases WHERE datasetId = 'fixture' AND sourceVersion = '2022'), 'source-' || 'release-supporting-had'), 'fixture', 'source-' || 'release-supporting-had', '2022', 'current', '1.2');
UPDATE sourceReleases SET sourceVersion = '2022', sourceSchemaVersion = '1.2' WHERE id = coalesce((SELECT id FROM sourceReleases WHERE datasetId = 'fixture' AND sourceVersion = '2022'), 'source-' || 'release-supporting-had');
INSERT INTO resourceReleases (id, status, revokedAt, revocationReason, supersededByResourceReleaseId, updatedAt, sourceReleaseId, datasetId, code, resourceType) VALUES ('release-supporting-had', 'current', null, null, null, 1760000000000, coalesce((SELECT id FROM sourceReleases WHERE datasetId = 'fixture' AND sourceVersion = '2022'), 'source-' || 'release-supporting-had'), 'fixture', 'release-supporting-had', 'division');
INSERT OR IGNORE INTO sourceReleases (id, datasetId, code, sourceVersion, status, sourceSchemaVersion) VALUES (coalesce((SELECT id FROM sourceReleases WHERE datasetId = 'fixture' AND sourceVersion = '2016'), 'source-' || 'release-supporting-censtatd'), 'fixture', 'source-' || 'release-supporting-censtatd', '2016', 'current', '1.0');
UPDATE sourceReleases SET sourceVersion = '2016', sourceSchemaVersion = '1.0' WHERE id = coalesce((SELECT id FROM sourceReleases WHERE datasetId = 'fixture' AND sourceVersion = '2016'), 'source-' || 'release-supporting-censtatd');
INSERT INTO resourceReleases (id, status, revokedAt, revocationReason, supersededByResourceReleaseId, updatedAt, sourceReleaseId, datasetId, code, resourceType) VALUES ('release-supporting-censtatd', 'current', null, null, null, 1760000000000, coalesce((SELECT id FROM sourceReleases WHERE datasetId = 'fixture' AND sourceVersion = '2016'), 'source-' || 'release-supporting-censtatd'), 'fixture', 'release-supporting-censtatd', 'division');
INSERT OR IGNORE INTO sourceReleases (id, datasetId, code, sourceVersion, status, sourceSchemaVersion) VALUES (coalesce((SELECT id FROM sourceReleases WHERE datasetId = 'fixture' AND sourceVersion = '2024'), 'source-' || 'release-supporting-censtatd-annual'), 'fixture', 'source-' || 'release-supporting-censtatd-annual', '2024', 'current', '1.0');
UPDATE sourceReleases SET sourceVersion = '2024', sourceSchemaVersion = '1.0' WHERE id = coalesce((SELECT id FROM sourceReleases WHERE datasetId = 'fixture' AND sourceVersion = '2024'), 'source-' || 'release-supporting-censtatd-annual');
INSERT INTO resourceReleases (id, status, revokedAt, revocationReason, supersededByResourceReleaseId, updatedAt, sourceReleaseId, datasetId, code, resourceType) VALUES ('release-supporting-censtatd-annual', 'current', null, null, null, 1760000000000, coalesce((SELECT id FROM sourceReleases WHERE datasetId = 'fixture' AND sourceVersion = '2024'), 'source-' || 'release-supporting-censtatd-annual'), 'fixture', 'release-supporting-censtatd-annual', 'division');
INSERT OR IGNORE INTO sourceReleases (id, datasetId, code, sourceVersion, status, sourceSchemaVersion) VALUES (coalesce((SELECT id FROM sourceReleases WHERE datasetId = 'fixture' AND sourceVersion = '2023-H2'), 'source-' || 'release-supporting-censtatd-area-type'), 'fixture', 'source-' || 'release-supporting-censtatd-area-type', '2023-H2', 'current', '1.0');
UPDATE sourceReleases SET sourceVersion = '2023-H2', sourceSchemaVersion = '1.0' WHERE id = coalesce((SELECT id FROM sourceReleases WHERE datasetId = 'fixture' AND sourceVersion = '2023-H2'), 'source-' || 'release-supporting-censtatd-area-type');
INSERT INTO resourceReleases (id, status, revokedAt, revocationReason, supersededByResourceReleaseId, updatedAt, sourceReleaseId, datasetId, code, resourceType) VALUES ('release-supporting-censtatd-area-type', 'current', null, null, null, 1760000000000, coalesce((SELECT id FROM sourceReleases WHERE datasetId = 'fixture' AND sourceVersion = '2023-H2'), 'source-' || 'release-supporting-censtatd-area-type'), 'fixture', 'release-supporting-censtatd-area-type', 'division');

    INSERT INTO snapshotResourceReleases (snapshotId, datasetId, resourceReleaseId) VALUES
      ('${snapshotId}', 'dataset-overture-division', 'release-supporting-area'),
      ('${snapshotId}', 'dataset-overture-division', 'release-supporting-boundary'),
      ('${snapshotId}', 'dataset-hkgov-had-district', 'release-supporting-had'),
      ('${snapshotId}', 'dataset-hkgov-censtatd-district', 'release-supporting-censtatd'),
      ('${snapshotId}', 'dataset-hkgov-censtatd-district-annual', 'release-supporting-censtatd-annual');
  `)
  for (const resourceType of [
    'divisionArea',
    'divisionBoundary',
    'divisionStatistic',
  ]) {
    const companionId = `${snapshotId}-${resourceType}`
    sqlite
      .query(
        'INSERT OR IGNORE INTO snapshots (id,code,resourceType,status,updatedAt) VALUES (?,?,?,?,?)',
      )
      .run(companionId, companionId, resourceType, 'published', 1760000000000)
    const memberships = sqlite
      .query(
        'SELECT datasetId,resourceReleaseId FROM snapshotResourceReleases WHERE snapshotId=?',
      )
      .all(snapshotId) as Array<{ datasetId: string; resourceReleaseId: string }>
    for (const membership of memberships) {
      const datasetCode = (
        sqlite
          .query('SELECT code FROM datasets WHERE id=?')
          .get(membership.datasetId) as { code: string }
      ).code
      if (!resolveSnapshotProcessingRules([datasetCode], resourceType).rulesets.length)
        continue
      sqlite
        .query(
          'INSERT INTO snapshotResourceReleases(snapshotId,datasetId,resourceReleaseId) VALUES (?,?,?)',
        )
        .run(companionId, membership.datasetId, membership.resourceReleaseId)
    }
    sqlite
      .query(
        "INSERT OR IGNORE INTO apiReleaseSetSnapshots (apiReleaseSetId,snapshotId,variant,role,isRequired,cohortMatchingMode,createdAt) SELECT id,?,'overture','supporting',0,'exact_ref',1760000000000 FROM apiReleaseSets WHERE status='draft'",
      )
      .run(companionId)
  }
  for (const dataset of initialDatasets) {
    sqlite
      .query(
        `UPDATE resourceReleases SET processingRules = ? WHERE id IN (SELECT ss.resourceReleaseId FROM snapshotResourceReleases ss JOIN datasets d ON d.id = ss.datasetId WHERE d.code = ?)`,
      )
      .run(captureFixtureRules(sqlite, dataset.processingRules), dataset.code)
  }
}

function captureFixtureRules(sqlite: SQLiteDatabase, definition: unknown) {
  if (!definition) return null
  const id = computeVersionHash(definition)
  sqlite
    .query('INSERT OR IGNORE INTO processingRuleDefinitions VALUES (?,?)')
    .run(id, JSON.stringify(definition))
  return id
}

function sortProvenanceRows(
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

describe('resolveShardForKindRegionYear', () => {
  test('routes pre-2025 history requests to the region-scoped before shard', async () => {
    const { sqlite, db } = createShardLookupDb()

    sqlite.exec(`
      INSERT INTO dataShards (
        id, shardType, regionCode, year, environment, databaseName, databaseId, bindingName, status
      ) VALUES
        (
          'history-hk-before-preview',
          'history',
          'hk',
          null,
          'preview',
          'ss-history-hk-before-db-preview',
          'db-history-hk-before-preview',
          'DB_HISTORY_HK_BEFORE',
          'active'
        ),
        (
          'history-hk-2025-preview',
          'history',
          'hk',
          '2025',
          'preview',
          'ss-history-hk-2025-db-preview',
          'db-history-hk-2025-preview',
          'DB_HISTORY_HK_2025',
          'active'
        );
    `)

    const shard = await resolveShardForTypeRegionYear(
      db as never,
      'history',
      'preview',
      'hk',
      '2001',
    )

    expect(shard).toEqual({
      id: 'history-hk-before-preview',
      bindingName: 'DB_HISTORY_HK_BEFORE',
      databaseId: 'db-history-hk-before-preview',
      databaseName: 'ss-history-hk-before-db-preview',
    })
  })

  test('returns the closest active shard when an exact year mapping is unavailable', async () => {
    const { sqlite, db } = createShardLookupDb()

    sqlite.exec(`
      INSERT INTO dataShards (
        id, shardType, regionCode, year, environment, databaseName, databaseId, bindingName, status
      ) VALUES (
        'history-hk-2026-preview',
        'history',
        'hk',
        '2026',
        'preview',
        'ss-history-hk-2026-db-preview',
        'db-history-hk-2026-preview',
        'DB_HISTORY_HK_2026',
        'active'
      );
    `)

    const shard = await resolveShardForTypeRegionYear(
      db as never,
      'history',
      'preview',
      'hk',
      '2025',
    )

    expect(shard).toEqual({
      id: 'history-hk-2026-preview',
      bindingName: 'DB_HISTORY_HK_2026',
      databaseId: 'db-history-hk-2026-preview',
      databaseName: 'ss-history-hk-2026-db-preview',
    })
  })

  test('applies year fallback for source shards', async () => {
    const { sqlite, db } = createShardLookupDb()

    sqlite.exec(`
      INSERT INTO dataShards (
        id, shardType, regionCode, year, environment, databaseName, databaseId, bindingName, status
      ) VALUES (
        'source-hk-2026-preview',
        'source',
        'hk',
        '2026',
        'preview',
        'ss-source-hk-2026-db-preview',
        'db-source-hk-2026-preview',
        'DB_SOURCE_HK_2026',
        'active'
      );
    `)

    const shard = await resolveShardForTypeRegionYear(
      db as never,
      'source',
      'preview',
      'hk',
      '2025',
    )

    expect(shard).toEqual({
      id: 'source-hk-2026-preview',
      bindingName: 'DB_SOURCE_HK_2026',
      databaseId: 'db-source-hk-2026-preview',
      databaseName: 'ss-source-hk-2026-db-preview',
    })
  })

  test('returns the unscoped current shard even when region and year are provided', async () => {
    const { sqlite, db } = createShardLookupDb()

    sqlite.exec(`
      INSERT INTO dataShards (
        id, shardType, regionCode, year, environment, databaseName, databaseId, bindingName, status
      ) VALUES (
        'current-preview',
        'current',
        null,
        null,
        'preview',
        'ss-current-db-preview',
        'db-current-preview',
        'DB_CURRENT',
        'active'
      );
    `)

    const shard = await resolveShardForTypeRegionYear(
      db as never,
      'current',
      'preview',
      'hk',
      '2025',
    )

    expect(shard).toEqual({
      id: 'current-preview',
      bindingName: 'DB_CURRENT',
      databaseId: 'db-current-preview',
      databaseName: 'ss-current-db-preview',
    })
  })
})

describe('ensureProcessingRunStarted', () => {
  test('does not reopen a completed ingest run', async () => {
    const { sqlite, db } = createProcessingRunDb()

    sqlite.exec(`
      INSERT INTO processingRuns (stage,
        runId, resourceReleaseId, phase, status, results, error, startedAt, finishedAt, createdAt, updatedAt
      ) VALUES ('assembly',
        'run-1',
        'release-1',
        'stageDataset',
        'completed',
        '{"rowCount":1}',
        null,
        '2026-06-27T00:00:00.000Z',
        '2026-06-27T00:01:00.000Z',
        1760000000000,
        1760000060000
      );
    `)

    await ensureProcessingRunStarted(
      db as never,
      'release-1',
      'stageDataset',
      '{"rowCount":2}',
      '2026-06-28T00:00:00.000Z',
    )

    const row = sqlite
      .query(
        'SELECT runId, status, results, startedAt, finishedAt FROM processingRuns WHERE resourceReleaseId = ? AND phase = ?',
      )
      .get('release-1', 'stageDataset') as {
      finishedAt: string | null
      runId: string
      startedAt: string
      results: string | null
      status: string
    }

    expect(row).toEqual({
      finishedAt: '2026-06-27T00:01:00.000Z',
      runId: 'run-1',
      startedAt: '2026-06-27T00:00:00.000Z',
      results: '{"rowCount":1}',
      status: 'completed',
    })
  })
})

describe('resolveLatestSnapshotForResourceTypeExcludingId', () => {
  test('ignores draft snapshots when selecting a prior baseline', async () => {
    const { sqlite, db } = createSnapshotLookupDb()

    sqlite.exec(`
      INSERT INTO snapshots (id, resourceType, code, status, publishedAt, createdAt) VALUES
        ('snapshot-current', 'division', 'current', 'draft', null, 1760003000000),
        ('snapshot-draft-newer', 'division', 'draft-newer', 'draft', null, 1760002000000),
        ('snapshot-published', 'division', 'published', 'published', 1760001000000, 1760001000000);
    `)

    const snapshot = await resolveLatestSnapshotForResourceTypeExcludingId(
      db as never,
      'division',
      'snapshot-current',
    )

    expect(snapshot).toEqual({
      code: 'published',
      resourceType: 'division',
      id: 'snapshot-published',
      status: 'published',
    })
  })
})

describe('ensureDraftSnapshotForRelease', () => {
  test('creates deterministic snapshot ids from the snapshot code', async () => {
    const first = createDraftSnapshotDb()
    const second = createDraftSnapshotDb()

    const firstSnapshot = await ensureDraftSnapshotForRelease(
      first.db as never,
      'division',
      {
        cohortKey: '2025-09-24.0',
        datasetCode: 'ds-hk-overture-division',
        datasetId: 'dataset-overture-division',
        regionCode: 'hk',
        sourceReleaseId: 'release-2025-09-24',
        variant: 'overture',
      },
    )
    const secondSnapshot = await ensureDraftSnapshotForRelease(
      second.db as never,
      'division',
      {
        cohortKey: '2025-09-24.0',
        datasetCode: 'ds-hk-overture-division',
        datasetId: 'dataset-overture-division',
        regionCode: 'hk',
        sourceReleaseId: 'release-2025-09-24',
        variant: 'overture',
      },
    )

    expect(firstSnapshot).toMatchObject({
      id: secondSnapshot.id,
      code: 'ss-hk-division-2025-09-24.0',
    })
    expect(firstSnapshot.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    )
    expect(
      first.sqlite
        .query('SELECT code FROM snapshotLineages WHERE primaryDatasetId = ?')
        .get('dataset-overture-division'),
    ).toEqual({ code: 'sl-hk-overture-division' })

    first.sqlite.close()
    second.sqlite.close()
  })

  test('uses a concise variant segment for non-default snapshot codes', async () => {
    const { db, sqlite } = createDraftSnapshotDb()

    const snapshot = await ensureDraftSnapshotForRelease(db as never, 'division', {
      cohortKey: '2006',
      datasetCode: 'ds-hk-hkgov-pland-division-pu',
      datasetId: 'dataset-pland-division-pu',
      regionCode: 'hk',
      sourceReleaseId: 'release-pland-division-pu-2006',
      variant: 'hkgov-pland-pu',
    })

    expect(snapshot.code).toBe('ss-hk-division-hkgov-pland-pu-2006')
    expect(
      sqlite
        .query('SELECT code FROM snapshotLineages WHERE primaryDatasetId = ?')
        .get('dataset-pland-division-pu'),
    ).toEqual({ code: 'sl-hk-hkgov-pland-division-pu' })

    sqlite.close()
  })

  test('creates distinct lineages when a Planning Department dataset exposes division areas', async () => {
    const { db, sqlite } = createDraftSnapshotDb()
    const args = {
      cohortKey: '2001',
      datasetCode: 'ds-hk-hkgov-pland-division-pu',
      datasetId: 'dataset-pland-division-pu',
      regionCode: 'hk',
      variant: 'hkgov-pland-pu',
    }

    const divisionSnapshot = await ensureDraftSnapshotForRelease(
      db as never,
      'division',
      {
        ...args,
        sourceReleaseId: 'release-pland-division-pu-2001',
      },
    )
    const divisionAreaSnapshot = await ensureDraftSnapshotForRelease(
      db as never,
      'divisionArea',
      {
        ...args,
        sourceReleaseId: 'release-pland-division-area-pu-2001',
      },
    )

    expect(
      sqlite
        .query('SELECT code, resourceType FROM snapshotLineages ORDER BY resourceType')
        .all(),
    ).toEqual([
      {
        code: 'sl-hk-hkgov-pland-division-pu',
        resourceType: 'division',
      },
      {
        code: 'sl-hk-hkgov-pland-division-pu-division-area',
        resourceType: 'divisionArea',
      },
    ])
    expect(divisionAreaSnapshot.snapshotLineageId).not.toBe(
      divisionSnapshot.snapshotLineageId,
    )

    sqlite.close()
  })

  test('keeps separately selectable C&SD cohorts in separate lineages', async () => {
    const { db, sqlite } = createDraftSnapshotDb()
    const base = {
      datasetCode: 'ds-hk-hkgov-censtatd-division-area-district',
      datasetId: 'dataset-censtatd-division-area',
      regionCode: 'hk',
    }

    const cohort2016 = await ensureDraftSnapshotForRelease(
      db as never,
      'divisionArea',
      {
        ...base,
        cohortKey: '2016',
        sourceReleaseId: 'release-censtatd-2016',
        variant: 'hkgov-censtatd:2016',
      },
    )
    const cohort2021 = await ensureDraftSnapshotForRelease(
      db as never,
      'divisionArea',
      {
        ...base,
        cohortKey: '2021',
        sourceReleaseId: 'release-censtatd-2021',
        variant: 'hkgov-censtatd:2021',
      },
    )

    expect(cohort2016.snapshotLineageId).not.toBe(cohort2021.snapshotLineageId)
    expect(
      sqlite
        .query(
          'SELECT code, variant FROM snapshotLineages WHERE primaryDatasetId = ? ORDER BY variant',
        )
        .all(base.datasetId),
    ).toEqual([
      {
        code: 'sl-hk-hkgov-censtatd-division-area-district-hkgov-censtatd-2016',
        variant: 'hkgov-censtatd:2016',
      },
      {
        code: 'sl-hk-hkgov-censtatd-division-area-district-hkgov-censtatd-2021',
        variant: 'hkgov-censtatd:2021',
      },
    ])

    sqlite.close()
  })

  test('keeps exact and transformed C&SD geometry in separate snapshots of one release', async () => {
    const { db, sqlite } = createDraftSnapshotDb()
    const base = {
      cohortKey: '2021',
      datasetCode: 'ds-hk-hkgov-censtatd-division-area-district',
      datasetId: 'dataset-censtatd-division-area',
      regionCode: 'hk',
      sourceReleaseId: 'release-censtatd-2021',
    }

    const exact = await ensureDraftSnapshotForRelease(db as never, 'divisionArea', {
      ...base,
      variant: 'hkgov-censtatd:2021',
    })
    sqlite
      .query(
        'INSERT INTO snapshotResourceReleases (snapshotId, datasetId, resourceReleaseId) VALUES (?, ?, ?)',
      )
      .run(exact.id, base.datasetId, base.sourceReleaseId)
    const simplified = await ensureDraftSnapshotForRelease(
      db as never,
      'divisionArea',
      {
        ...base,
        variant: 'hkgov-censtatd:2021:simplified',
      },
    )
    sqlite
      .query(
        'INSERT INTO snapshotResourceReleases (snapshotId, datasetId, resourceReleaseId) VALUES (?, ?, ?)',
      )
      .run(simplified.id, base.datasetId, base.sourceReleaseId)

    expect(simplified.id).not.toBe(exact.id)
    expect(simplified.snapshotLineageId).not.toBe(exact.snapshotLineageId)
    await expect(
      resolveSnapshotForRelease(db as never, base.sourceReleaseId, 'divisionArea', {
        variant: 'hkgov-censtatd:2021',
      }),
    ).resolves.toMatchObject({ id: exact.id })
    await expect(
      resolveSnapshotForRelease(db as never, base.sourceReleaseId, 'divisionArea', {
        variant: 'hkgov-censtatd:2021:simplified',
      }),
    ).resolves.toMatchObject({ id: simplified.id })
    expect(
      sqlite
        .query(
          `
            SELECT sl.variant
            FROM snapshots s
            INNER JOIN snapshotLineages sl ON sl.id = s.snapshotLineageId
            INNER JOIN snapshotResourceReleases ss ON ss.snapshotId = s.id
            WHERE ss.resourceReleaseId = ?
            ORDER BY sl.variant
          `,
        )
        .all(base.sourceReleaseId),
    ).toEqual([
      { variant: 'hkgov-censtatd:2021' },
      { variant: 'hkgov-censtatd:2021:simplified' },
    ])

    sqlite.close()
  })

  test('parents revisions and later cohorts to the exact published lineage state', async () => {
    const { db, sqlite } = createDraftSnapshotDb()
    const args = {
      cohortKey: '2025-09-24.0',
      datasetCode: 'ds-hk-overture-division',
      datasetId: 'dataset-overture-division',
      regionCode: 'hk',
      sourceReleaseId: 'release-2025-09-24',
      variant: 'overture',
    }
    const revisionZero = await ensureDraftSnapshotForRelease(
      db as never,
      'division',
      args,
    )
    sqlite
      .query("UPDATE snapshots SET status = 'published' WHERE id = ?")
      .run(revisionZero.id)

    const revisionOne = await ensureDraftSnapshotForRelease(db as never, 'division', {
      ...args,
      sourceReleaseId: 'release-2025-09-24-correction',
    })
    expect(revisionOne).toMatchObject({
      code: 'ss-hk-division-2025-09-24.0-r1',
      parentSnapshotId: revisionZero.id,
    })
    sqlite
      .query("UPDATE snapshots SET status = 'published' WHERE id = ?")
      .run(revisionOne.id)

    const later = await ensureDraftSnapshotForRelease(db as never, 'division', {
      ...args,
      cohortKey: '2025-10-22.0',
      sourceReleaseId: 'release-2025-10-22',
    })
    expect(later.parentSnapshotId).toBe(revisionOne.id)

    sqlite.close()
  })

  test('creates a new revision when reprocessing a source attached to a published snapshot', async () => {
    const { db, sqlite } = createDraftSnapshotDb()
    const args = {
      cohortKey: '2025-09-24.0',
      datasetCode: 'ds-hk-overture-division',
      datasetId: 'dataset-overture-division',
      regionCode: 'hk',
      sourceReleaseId: 'release-2025-09-24',
      variant: 'overture',
    }
    const first = await ensureDraftSnapshotForRelease(db as never, 'division', args)
    sqlite
      .query(
        'INSERT INTO snapshotResourceReleases(snapshotId,datasetId,resourceReleaseId) VALUES (?,?,?)',
      )
      .run(first.id, args.datasetId, args.sourceReleaseId)
    sqlite.query("UPDATE snapshots SET status = 'published' WHERE id = ?").run(first.id)

    const revision = await ensureDraftSnapshotForRelease(db as never, 'division', {
      ...args,
      rebuildPublishedSnapshot: true,
    })

    expect(revision).toMatchObject({
      code: 'ss-hk-division-2025-09-24.0-r1',
      parentSnapshotId: first.id,
      status: 'draft',
    })
    expect(revision.id).not.toBe(first.id)
    sqlite.close()
  })

  test('reuses an interrupted root snapshot without adopting the selected predecessor', async () => {
    const { db, sqlite } = createDraftSnapshotDb()
    const args = {
      cohortKey: '2026-04-15.0',
      datasetCode: 'ds-hk-overture-place',
      datasetId: 'dataset-overture-place',
      regionCode: 'hk',
      sourceReleaseId: 'release-2026-04-15',
      variant: 'overture-places',
      rootSnapshot: true,
    }
    const first = await ensureDraftSnapshotForRelease(db as never, 'address', args)
    expect(first.parentSnapshotId).toBeNull()

    const retry = await ensureDraftSnapshotForRelease(db as never, 'address', args)
    expect(retry).toMatchObject({ id: first.id, parentSnapshotId: null, revision: 0 })
    sqlite.close()
  })

  test('does not parent a new cohort in a cohort-scoped lineage', async () => {
    const { db, sqlite } = createDraftSnapshotDb()
    const args = {
      cohortKey: '2006',
      datasetCode: 'ds-hk-hkgov-pland-division-new-town',
      datasetId: 'dataset-pland-new-town',
      identityMode: 'cohort_scoped' as const,
      regionCode: 'hk',
      sourceReleaseId: 'release-2006',
      variant: 'hkgov-pland-new-town',
    }
    const first = await ensureDraftSnapshotForRelease(db as never, 'division', args)
    sqlite.query("UPDATE snapshots SET status = 'published' WHERE id = ?").run(first.id)

    const later = await ensureDraftSnapshotForRelease(db as never, 'division', {
      ...args,
      cohortKey: '2021',
      sourceReleaseId: 'release-2021',
    })
    expect(later.parentSnapshotId).toBeNull()
    sqlite.close()
  })

  for (const withdrawnSourceStatus of ['revoked', 'current'])
    test(`parents forward ingestion to the restored catalogue branch with withdrawn source ${withdrawnSourceStatus}`, async () => {
      const { db, sqlite } = createDraftSnapshotDb()
      try {
        const args = {
          cohortKey: '2026',
          datasetCode: 'ds-hk-overture-division',
          datasetId: 'dataset',
          regionCode: 'hk',
          sourceReleaseId: 'source-a',
          variant: 'overture',
        }
        const a = await ensureDraftSnapshotForRelease(db as never, 'division', args)
        sqlite.query("UPDATE snapshots SET status='published' WHERE id=?").run(a.id)
        const b = await ensureDraftSnapshotForRelease(db as never, 'division', {
          ...args,
          sourceReleaseId: 'source-b',
        })
        sqlite.query("UPDATE snapshots SET status='published' WHERE id=?").run(b.id)
        sqlite
          .query('INSERT INTO resourceReleases VALUES (?,?)')
          .run('source-a', 'current')
        sqlite
          .query('INSERT INTO resourceReleases VALUES (?,?)')
          .run('source-b', withdrawnSourceStatus)
        sqlite
          .query(
            'INSERT INTO snapshotResourceReleases(snapshotId,datasetId,resourceReleaseId) VALUES (?,?,?)',
          )
          .run(a.id, 'dataset', 'source-a')
        sqlite
          .query(
            'INSERT INTO snapshotResourceReleases(snapshotId,datasetId,resourceReleaseId) VALUES (?,?,?)',
          )
          .run(b.id, 'dataset', 'source-b')
        sqlite
          .query('INSERT INTO apiReleaseSetSnapshots VALUES (?,?)')
          .run('set-a', a.id)
        sqlite
          .query('INSERT INTO apiReleaseSetSnapshots VALUES (?,?)')
          .run('set-b', b.id)
        sqlite.exec(
          "INSERT INTO apiCatalogRevisions VALUES ('catalog-b','api','hk','current','2026-01-01',0),('catalog-restored','api','hk','current','2026-01-02',0)",
        )
        sqlite.exec(
          "INSERT INTO apiVersionReleaseSets VALUES ('version-a','set-a'),('version-b','set-b'); INSERT INTO apiCatalogRevisionReleaseSets VALUES ('catalog-b','version-b'),('catalog-restored','version-a')",
        )
        const c = await ensureDraftSnapshotForRelease(db as never, 'division', {
          ...args,
          sourceReleaseId: 'source-c',
        })
        expect(c.parentSnapshotId).toBe(a.id)
        expect(c.code).toBe('ss-hk-division-2026-r2')
        expect(
          sqlite.query('SELECT status FROM snapshots WHERE id=?').get(b.id),
        ).toEqual({ status: 'published' })
        const later = await ensureDraftSnapshotForRelease(db as never, 'division', {
          ...args,
          cohortKey: '2027',
          sourceReleaseId: 'source-later',
        })
        expect(later.parentSnapshotId).toBe(a.id)
        sqlite
          .query('UPDATE snapshots SET parentSnapshotId=? WHERE id=?')
          .run(b.id, c.id)
        sqlite
          .query(
            'INSERT INTO snapshotResourceReleases(snapshotId,datasetId,resourceReleaseId) VALUES (?,?,?)',
          )
          .run(c.id, 'dataset', 'source-c')
        await expect(
          ensureDraftSnapshotForRelease(db as never, 'division', {
            ...args,
            sourceReleaseId: 'source-c',
          }),
        ).rejects.toThrow('predecessor is no longer selected')
        await expect(
          ensureDraftSnapshotForRelease(db as never, 'division', {
            ...args,
            sourceReleaseId: 'source-d',
          }),
        ).rejects.toThrow('predecessor is no longer selected')
      } finally {
        sqlite.close()
      }
    })

  test('an empty restored catalogue resets ancestry while retaining monotonically increasing revision numbers', async () => {
    const { db, sqlite } = createDraftSnapshotDb()
    try {
      const args = {
        cohortKey: '2026',
        datasetCode: 'ds-hk-overture-division',
        datasetId: 'dataset',
        regionCode: 'hk',
        sourceReleaseId: 'source-a',
        variant: 'overture',
      }
      const a = await ensureDraftSnapshotForRelease(db as never, 'division', args)
      sqlite.query("UPDATE snapshots SET status='published' WHERE id=?").run(a.id)
      sqlite.query('INSERT INTO apiReleaseSetSnapshots VALUES (?,?)').run('set-a', a.id)
      sqlite.exec(
        "INSERT INTO apiCatalogRevisions VALUES ('catalog-a','api','hk','current','2026-01-01',0),('catalog-empty','api','hk','current','2026-01-02',0)",
      )
      sqlite.exec(
        "INSERT INTO apiVersionReleaseSets VALUES ('version-a','set-a'); INSERT INTO apiCatalogRevisionReleaseSets VALUES ('catalog-a','version-a')",
      )
      const b = await ensureDraftSnapshotForRelease(db as never, 'division', {
        ...args,
        sourceReleaseId: 'source-b',
      })
      expect(b.parentSnapshotId).toBeNull()
      expect(b.code).toBe('ss-hk-division-2026-r1')
    } finally {
      sqlite.close()
    }
  })

  test('accepted historical cohorts remain eligible parents even when they are not the latest cohort', async () => {
    const { db, sqlite } = createDraftSnapshotDb()
    try {
      const args = {
        cohortKey: '2025',
        datasetCode: 'ds-hk-overture-division',
        datasetId: 'dataset',
        regionCode: 'hk',
        sourceReleaseId: 'source-a',
        variant: 'overture',
      }
      const a = await ensureDraftSnapshotForRelease(db as never, 'division', args)
      sqlite.query("UPDATE snapshots SET status='published' WHERE id=?").run(a.id)
      const b = await ensureDraftSnapshotForRelease(db as never, 'division', {
        ...args,
        cohortKey: '2026',
        sourceReleaseId: 'source-b',
      })
      sqlite.query("UPDATE snapshots SET status='published' WHERE id=?").run(b.id)
      sqlite.query('INSERT INTO apiReleaseSetSnapshots VALUES (?,?)').run('set-a', a.id)
      sqlite.query('INSERT INTO apiReleaseSetSnapshots VALUES (?,?)').run('set-b', b.id)
      sqlite.exec(
        "INSERT INTO apiCatalogRevisions VALUES ('catalog','api','hk','current','2026-01-01',0)",
      )
      sqlite.exec(
        "INSERT INTO apiVersionReleaseSets VALUES ('version-a','set-a'),('version-b','set-b'); INSERT INTO apiCatalogRevisionReleaseSets VALUES ('catalog','version-a'),('catalog','version-b')",
      )
      const revision = await ensureDraftSnapshotForRelease(db as never, 'division', {
        ...args,
        sourceReleaseId: 'source-a-revised',
      })
      expect(revision.parentSnapshotId).toBe(a.id)
    } finally {
      sqlite.close()
    }
  })

  test('normalises a v0 lineage code while retaining its referenced id', async () => {
    const { db, sqlite } = createDraftSnapshotDb()
    sqlite
      .query(
        `INSERT INTO snapshotLineages (
          id, code, regionCode, resourceType, variant, identityMode,
          primaryDatasetId, versionHash, createdAt, updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        'legacy-lineage-id',
        'sl-hk-division-ds-hk-overture-division',
        'hk',
        'division',
        'overture',
        'persistent',
        'dataset-overture-division',
        'legacy-version-hash',
        '2026-01-01T00:00:00.000Z',
        '2026-01-01T00:00:00.000Z',
      )

    const snapshot = await ensureDraftSnapshotForRelease(db as never, 'division', {
      cohortKey: '2026-06-17.0',
      datasetCode: 'ds-hk-overture-division',
      datasetId: 'dataset-overture-division',
      regionCode: 'hk',
      sourceReleaseId: 'release-overture-division-2026-06-17',
      variant: 'overture',
    })

    expect(
      sqlite
        .query('SELECT id, code FROM snapshotLineages WHERE primaryDatasetId = ?')
        .get('dataset-overture-division'),
    ).toEqual({
      id: 'legacy-lineage-id',
      code: 'sl-hk-overture-division',
    })
    expect(
      sqlite
        .query('SELECT snapshotLineageId FROM snapshots WHERE id = ?')
        .get(snapshot.id),
    ).toEqual({ snapshotLineageId: 'legacy-lineage-id' })

    sqlite.close()
  })
})

describe('ensureDraftReleaseSetForRelease', () => {
  const versions = {
    schemaVersion: 'sv-division-v1',
    rulesetVersion: 'rs-division-merge-v1',
  }

  test('creates deterministic release set ids from the release set code', async () => {
    const first = createDraftReleaseSetDb()
    const second = createDraftReleaseSetDb()

    const firstReleaseSet = await ensureDraftReleaseSetForRelease(
      first.db as never,
      'division',
      {
        cohortKey: '2025-09-24.0',
        regionCode: 'hk',
      },
      versions,
    )
    const secondReleaseSet = await ensureDraftReleaseSetForRelease(
      second.db as never,
      'division',
      {
        cohortKey: '2025-09-24.0',
        regionCode: 'hk',
      },
      versions,
    )

    expect(firstReleaseSet).toMatchObject({
      id: secondReleaseSet.id,
      code: 'data-hk-divisions-2025-09-24.0',
    })
    expect(firstReleaseSet.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    )

    first.sqlite.close()
    second.sqlite.close()
  })

  test('shares release-set content across API versions through distinct associations', async () => {
    const { sqlite, db } = createDraftReleaseSetDb()
    const v01 = await ensureDraftReleaseSetForRelease(
      db as never,
      'division',
      { cohortKey: '2026-09-01.0', regionCode: 'hk' },
      { ...versions, apiVersion: 'api-divisions-v0.1' },
    )
    const v02 = await ensureDraftReleaseSetForRelease(
      db as never,
      'division',
      { cohortKey: '2026-09-01.0', regionCode: 'hk' },
      { ...versions, apiVersion: 'api-divisions-v0.2' },
    )

    expect(v01.code).toBe('data-hk-divisions-2026-09-01.0')
    expect(v02.id).toBe(v01.id)
    expect(
      buildDeterministicApiVersionReleaseSetId('api-version-division', v01.id),
    ).not.toBe(
      buildDeterministicApiVersionReleaseSetId('api-version-division-v02', v02.id),
    )
    expect(
      sqlite
        .query(
          'SELECT apiReleaseSetId FROM apiVersionReleaseSets ORDER BY apiVersionId',
        )
        .all(),
    ).toEqual([{ apiReleaseSetId: v01.id }, { apiReleaseSetId: v01.id }])
    sqlite.close()
  })

  test('uses the declared default composition domain when none is specified', async () => {
    const { sqlite, db } = createDraftReleaseSetDb()
    sqlite
      .query(
        `UPDATE apiComposition
         SET defaultDomainCode = 'overture'
         WHERE id = 'api-composition-division'`,
      )
      .run()

    const releaseSet = await ensureDraftReleaseSetForRelease(
      db as never,
      'division',
      {
        cohortKey: '2026-01-21.0',
        regionCode: 'hk',
      },
      versions,
    )

    expect(releaseSet.code).toBe('data-hk-divisions-2026-01-21.0')
    sqlite.close()
  })

  test('pins explicit versions without changing the composition or API version', async () => {
    const { sqlite, db } = createDraftReleaseSetDb()
    const release = { cohortKey: '2026-09-01.0', regionCode: 'hk' }
    const original = await ensureDraftReleaseSetForRelease(
      db as never,
      'division',
      release,
      versions,
    )
    const same = await ensureDraftReleaseSetForRelease(
      db as never,
      'division',
      release,
      versions,
    )
    expect(same.id).toBe(original.id)
    const changed = await ensureDraftReleaseSetForRelease(
      db as never,
      'division',
      release,
      {
        ...versions,
        rulesetVersion: 'rs-division-merge-v2',
      },
    )
    expect(changed.id).not.toBe(original.id)
    expect(changed.code).toBe('data-hk-divisions-2026-09-01.0-r1')
    expect(
      sqlite.query('SELECT rulesetVersion FROM apiReleaseSets ORDER BY revision').all(),
    ).toEqual([
      { rulesetVersion: 'rs-division-merge-v1' },
      { rulesetVersion: 'rs-division-merge-v2' },
    ])
    expect(
      sqlite
        .query(
          'SELECT DISTINCT apiVersionId, apiCompositionId FROM apiVersionReleaseSets',
        )
        .all(),
    ).toEqual([
      {
        apiVersionId: 'api-version-division',
        apiCompositionId: 'api-composition-division',
      },
    ])
    sqlite.close()
  })

  test.each([
    [undefined, 'explicit schemaVersion and rulesetVersion'],
    [
      { ...versions, schemaVersion: 'sv-missing-v1' },
      'Unknown API release schemaVersion',
    ],
    [
      { ...versions, rulesetVersion: 'rs-missing-v1' },
      'Unknown API release rulesetVersion',
    ],
    [
      { schemaVersion: 'sv-place-v1', rulesetVersion: 'rs-place-merge-v1' },
      'Incompatible API release versions',
    ],
  ])(
    'rejects invalid publication versions before writing: %j',
    async (pins, message) => {
      const { sqlite, db } = createDraftReleaseSetDb()
      await expect(
        ensureDraftReleaseSetForRelease(
          db as never,
          'division',
          {
            cohortKey: '2026-09-01.0',
            regionCode: 'hk',
          },
          pins as never,
        ),
      ).rejects.toThrow(message as string)
      expect(
        sqlite.query('SELECT count(*) AS count FROM apiReleaseSets').get(),
      ).toEqual({ count: 0 })
      sqlite.close()
    },
  )

  test('creates a September Overture release under a deprecated API with v1 rules', async () => {
    const { sqlite, db } = createDraftReleaseSetDb()
    sqlite.exec(
      "UPDATE apiVersions SET status='deprecated' WHERE id='api-version-division'",
    )
    const release = await ensureDraftReleaseSetForRelease(
      db as never,
      'division',
      { cohortKey: '2026-09-23.0', regionCode: 'hk' },
      versions,
    )
    expect(
      sqlite
        .query(`SELECT v.code, s.rulesetVersion FROM apiReleaseSets s
      JOIN apiVersionReleaseSets a ON a.apiReleaseSetId=s.id
      JOIN apiVersions v ON v.id=a.apiVersionId WHERE s.id=?`)
        .get(release.id),
    ).toEqual({ code: 'api-divisions-v0.1', rulesetVersion: 'rs-division-merge-v1' })
    sqlite.close()
  })

  test('does not create releases for archived API versions', async () => {
    const { sqlite, db } = createDraftReleaseSetDb()
    sqlite
      .query(
        "UPDATE apiVersions SET status = 'archived' WHERE id = 'api-version-division'",
      )
      .run()

    await expect(
      ensureDraftReleaseSetForRelease(
        db as never,
        'division',
        {
          cohortKey: '2026-09-01.0',
          regionCode: 'hk',
        },
        versions,
      ),
    ).rejects.toThrow('Cannot create an API release for api-divisions-v0.1')
    sqlite.close()
  })

  test('creates the next immutable revision when an existing cohort is enriched', async () => {
    const { sqlite, db } = createDraftReleaseSetDb()
    const release = { cohortKey: '2025-09-24.0', regionCode: 'hk' as const }
    const first = await ensureDraftReleaseSetForRelease(
      db as never,
      'division',
      release,
      versions,
    )
    sqlite
      .query(
        `UPDATE apiReleaseSets
         SET code = 'data-hk-divisions-2025-09-24.0-0'
         WHERE id = ?`,
      )
      .run(first.id)
    sqlite
      .query(
        `UPDATE apiVersionReleaseSets
         SET status = 'current',
             publishedAt = '2026-07-01T00:00:00.000Z'
         WHERE apiReleaseSetId = ?`,
      )
      .run(first.id)

    const enriched = await ensureDraftReleaseSetForRelease(
      db as never,
      'division',
      release,
      versions,
    )
    const row = sqlite
      .query(
        `SELECT apiReleaseSets.revision, apiVersionReleaseSets.previousRevisionApiReleaseSetId
         FROM apiReleaseSets
         INNER JOIN apiVersionReleaseSets ON apiVersionReleaseSets.apiReleaseSetId = apiReleaseSets.id
         WHERE apiReleaseSets.id = ?`,
      )
      .get(enriched.id)

    expect(enriched.code).toBe('data-hk-divisions-2025-09-24.0-r1')
    expect(row).toEqual({
      revision: 1,
      previousRevisionApiReleaseSetId: first.id,
    })
    const nextCohort = await ensureDraftReleaseSetForRelease(
      db as never,
      'division',
      { ...release, cohortKey: '2025-10-22.0' },
      versions,
    )
    expect(
      sqlite
        .query(
          'SELECT previousRevisionApiReleaseSetId FROM apiVersionReleaseSets WHERE apiReleaseSetId = ?',
        )
        .get(nextCohort.id),
    ).toEqual({ previousRevisionApiReleaseSetId: null })
    sqlite.close()
  })
})

describe('recordSnapshotAssembly', () => {
  test('creates deterministic run ids from snapshot and assembly ids', async () => {
    const first = createSnapshotAssemblyDb()
    const second = createSnapshotAssemblyDb()

    await recordSnapshotAssembly(first.db as never, {
      anchorReleaseId: 'release-division',
      resourceType: 'division',
      snapshotId: 'snapshot-division',
    })
    await recordSnapshotAssembly(second.db as never, {
      anchorReleaseId: 'release-division',
      resourceType: 'division',
      snapshotId: 'snapshot-division',
    })

    const firstRun = first.sqlite
      .query('SELECT id FROM snapshotAssemblies LIMIT 1')
      .get() as { id: string }
    const secondRun = second.sqlite
      .query('SELECT id FROM snapshotAssemblies LIMIT 1')
      .get() as { id: string }

    expect(firstRun.id).toBe(secondRun.id)
    expect(firstRun.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    )

    first.sqlite.close()
    second.sqlite.close()
  })
})

describe('resolveLatestPublishedSnapshotForResourceTypeRegionExcludingId', () => {
  test('selects the previous published snapshot for the same region', async () => {
    const { sqlite, db } = createRegionalSnapshotLookupDb()

    sqlite.exec(`
      INSERT INTO datasets (id, regionCode) VALUES
        ('dataset-hk', 'hk'),
        ('dataset-mo', 'mo');

      INSERT INTO snapshots (id, resourceType, code, status, publishedAt, createdAt) VALUES
        ('snapshot-hk-draft', 'division', 'hk-draft', 'draft', null, 1760005000000),
        ('snapshot-hk-old', 'division', 'hk-old', 'published', 1760001000000, 1760001000000),
        ('snapshot-hk-new', 'division', 'hk-new', 'published', 1760002000000, 1760002000000),
        ('snapshot-mo-newer', 'division', 'mo-newer', 'published', 1760004000000, 1760004000000);

      INSERT INTO snapshotResourceReleases (snapshotId, datasetId, resourceReleaseId, role) VALUES
        ('snapshot-hk-draft', 'dataset-hk', 'release-hk-draft', 'primary'),
        ('snapshot-hk-old', 'dataset-hk', 'release-hk-old', 'primary'),
        ('snapshot-hk-new', 'dataset-hk', 'release-hk-new', 'primary'),
        ('snapshot-mo-newer', 'dataset-mo', 'release-mo-newer', 'primary');
    `)

    const snapshot =
      await resolveLatestPublishedSnapshotForResourceTypeRegionExcludingId(
        db as never,
        'division',
        'hk',
        'snapshot-hk-draft',
      )

    expect(snapshot).toEqual({
      code: 'hk-new',
      resourceType: 'division',
      id: 'snapshot-hk-new',
      status: 'published',
    })
  })
})

describe('getLatestDatasetForRegionSourceDatasetType', () => {
  test('keeps Planning Department upload variants in separate product lineages', async () => {
    const { sqlite, db } = createLatestDatasetLookupDb()
    sqlite.exec(`
      -- Release metadata stores no asset storage coordinates.
      INSERT INTO publishers (id, code) VALUES ('publisher-pland', 'hkgov-pland');
      INSERT INTO datasets (id, publisherId, code, regionCode, theme, type) VALUES
        ('dataset-pland-pu', 'publisher-pland', 'ds-hk-hkgov-pland-division-pu', 'hk', 'divisions', 'division'),
        ('dataset-pland-new-town', 'publisher-pland', 'ds-hk-hkgov-pland-division-new-town', 'hk', 'divisions', 'division');
      UPDATE datasets SET resourceTypes = json_insert(resourceTypes, '$[#]', 'division') WHERE id = 'dataset-pland-pu' AND NOT EXISTS (SELECT 1 FROM json_each(datasets.resourceTypes) WHERE value = 'division');
UPDATE datasets SET resourceTypes = json_insert(resourceTypes, '$[#]', 'division') WHERE id = 'dataset-pland-new-town' AND NOT EXISTS (SELECT 1 FROM json_each(datasets.resourceTypes) WHERE value = 'division');
    `)

    await insertDataset(
      db as never,
      {
        cohortKey: '2001',
        datasetCode: 'ds-hk-hkgov-pland-division-pu',
        originalFileName: 'hkgov-pland-pu-hk-2001-division.parquet',
        releaseCode: 'dr-hk-hkgov-pland-division-pu-2001',
        publicationDate: '2022-03-16',
        source: 'hkgov-pland-pu',
        sourceVersion: '2001',
        resourceType: 'division',
      } as never,
      '2026-07-21T00:00:00.000Z',
    )

    await insertDataset(
      db as never,
      {
        cohortKey: '2006',
        datasetCode: 'ds-hk-hkgov-pland-division-new-town',
        originalFileName: 'hkgov-pland-new-town-hk-2006-division.parquet',
        releaseCode: 'dr-hk-hkgov-pland-division-new-town-2006',
        source: 'hkgov-pland-new-town',
        sourceVersion: '2006',
        resourceType: 'division',
      } as never,
      '2026-07-21T00:00:00.000Z',
    )

    for (const table of ['sourceReleases', 'resourceReleaseDetails']) {
      expect(
        sqlite
          .query(`SELECT publicationDate FROM ${table} WHERE code = ?`)
          .get('dr-hk-hkgov-pland-division-pu-2001'),
      ).toEqual({ publicationDate: '2022-03-16' })
    }

    expect(
      sqlite
        .query('SELECT datasetId FROM resourceReleases WHERE code = ?')
        .get('dr-hk-hkgov-pland-division-pu-2001'),
    ).toEqual({ datasetId: 'dataset-pland-pu' })

    expect(
      (
        await getLatestDatasetForRegionSourceDatasetType(
          db as never,
          'hk',
          'hkgov-pland-pu',
          'ds-hk-hkgov-pland-division-pu',
          'division',
        )
      ).latestDataset?.releaseCode,
    ).toBe('dr-hk-hkgov-pland-division-pu-2001')

    expect(
      (
        await getLatestDatasetForRegionSourceDatasetType(
          db as never,
          'hk',
          'hkgov-pland-new-town',
          'ds-hk-hkgov-pland-division-new-town',
          'division',
        )
      ).latestDataset?.releaseCode,
    ).toBe('dr-hk-hkgov-pland-division-new-town-2006')

    sqlite.close()
  })

  test('does not compare C&SD products that share a resource type and source version', async () => {
    const { sqlite, db } = createLatestDatasetLookupDb()
    sqlite.exec(`
      INSERT INTO publishers (id, code) VALUES ('publisher-censtatd', 'hkgov-censtatd');
      INSERT INTO datasets (id, publisherId, code, regionCode, theme, type) VALUES
        ('dataset-district-area', 'publisher-censtatd', 'ds-hk-hkgov-censtatd-division-area-district', 'hk', 'divisions', 'divisionArea'),
        ('dataset-hma', 'publisher-censtatd', 'ds-hk-hkgov-censtatd-division-statistic-housing-market-areas-building-groups', 'hk', 'divisions', 'divisionArea');
      INSERT OR IGNORE INTO sourceReleases (id, datasetId, code, sourceVersion, status, cohortKey) VALUES (coalesce((SELECT id FROM sourceReleases WHERE datasetId = 'dataset-district-area' AND sourceVersion = '2021'), 'source-' || 'release-district-area-2021'), 'dataset-district-area', 'source-' || 'dr-hk-hkgov-censtatd-division-area-district-2021', '2021', 'current', '2021');
UPDATE sourceReleases SET sourceVersion = '2021', cohortKey = '2021' WHERE id = coalesce((SELECT id FROM sourceReleases WHERE datasetId = 'dataset-district-area' AND sourceVersion = '2021'), 'source-' || 'release-district-area-2021');
INSERT INTO resourceReleases (id, datasetId, code, resourceType, status, ingestedAt, createdAt, updatedAt, sourceReleaseId) VALUES ('release-district-area-2021', 'dataset-district-area', 'dr-hk-hkgov-censtatd-division-area-district-2021', 'divisionArea', 'current', '2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z', coalesce((SELECT id FROM sourceReleases WHERE datasetId = 'dataset-district-area' AND sourceVersion = '2021'), 'source-' || 'release-district-area-2021'));
INSERT OR IGNORE INTO sourceReleases (id, datasetId, code, sourceVersion, status, cohortKey) VALUES (coalesce((SELECT id FROM sourceReleases WHERE datasetId = 'dataset-hma' AND sourceVersion = '2021'), 'source-' || 'release-hma-2021'), 'dataset-hma', 'source-' || 'dr-hk-hkgov-censtatd-division-area-housing-market-areas-building-groups-2021-2021', '2021', 'current', '2021');
UPDATE sourceReleases SET sourceVersion = '2021', cohortKey = '2021' WHERE id = coalesce((SELECT id FROM sourceReleases WHERE datasetId = 'dataset-hma' AND sourceVersion = '2021'), 'source-' || 'release-hma-2021');
INSERT INTO resourceReleases (id, datasetId, code, resourceType, status, ingestedAt, createdAt, updatedAt, sourceReleaseId) VALUES ('release-hma-2021', 'dataset-hma', 'dr-hk-hkgov-censtatd-division-area-housing-market-areas-building-groups-2021-2021', 'divisionArea', 'current', '2026-08-02T00:00:00.000Z', '2026-08-02T00:00:00.000Z', '2026-08-02T00:00:00.000Z', coalesce((SELECT id FROM sourceReleases WHERE datasetId = 'dataset-hma' AND sourceVersion = '2021'), 'source-' || 'release-hma-2021'));
    `)

    const result = await getLatestDatasetForRegionSourceDatasetType(
      db as never,
      'hk',
      'hkgov-censtatd',
      'ds-hk-hkgov-censtatd-division-statistic-housing-market-areas-building-groups',
      'divisionArea',
    )

    expect(result.latestDataset?.releaseCode).toBe(
      'dr-hk-hkgov-censtatd-division-area-housing-market-areas-building-groups-2021-2021',
    )
    sqlite.close()
  })

  test('orders dotted source versions numerically instead of lexicographically', async () => {
    const { sqlite, db } = createLatestDatasetLookupDb()

    sqlite.exec(`
      INSERT INTO publishers (id, code) VALUES ('publisher-overture', 'overture');

      INSERT INTO datasets (id, publisherId, code, regionCode, theme, type) VALUES
        ('dataset-division', 'publisher-overture', 'ds-hk-overture-division', 'hk', 'divisions', 'division');

      INSERT OR IGNORE INTO sourceReleases (id, datasetId, code, sourceVersion, status, cohortKey) VALUES (coalesce((SELECT id FROM sourceReleases WHERE datasetId = 'dataset-division' AND sourceVersion = '2026-06-17.10'), 'source-' || 'release-10'), 'dataset-division', 'source-' || 'dr-hk-overture-division-2026-06-17.10', '2026-06-17.10', 'current', '2026-06');
UPDATE sourceReleases SET sourceVersion = '2026-06-17.10', cohortKey = '2026-06' WHERE id = coalesce((SELECT id FROM sourceReleases WHERE datasetId = 'dataset-division' AND sourceVersion = '2026-06-17.10'), 'source-' || 'release-10');
INSERT INTO resourceReleases (id, datasetId, code, resourceType, status, revokedAt, revocationReason, supersededByResourceReleaseId, ingestedAt, createdAt, updatedAt, sourceReleaseId) VALUES ('release-10', 'dataset-division', 'dr-hk-overture-division-2026-06-17.10', 'division', 'current', null, null, null, '2026-06-18T00:00:00.000Z', '2026-06-18T00:00:00.000Z', '2026-06-18T00:00:00.000Z', coalesce((SELECT id FROM sourceReleases WHERE datasetId = 'dataset-division' AND sourceVersion = '2026-06-17.10'), 'source-' || 'release-10'));
INSERT OR IGNORE INTO sourceReleases (id, datasetId, code, sourceVersion, status, cohortKey) VALUES (coalesce((SELECT id FROM sourceReleases WHERE datasetId = 'dataset-division' AND sourceVersion = '2026-06-17.9'), 'source-' || 'release-9'), 'dataset-division', 'source-' || 'dr-hk-overture-division-2026-06-17.9', '2026-06-17.9', 'current', '2026-06');
UPDATE sourceReleases SET sourceVersion = '2026-06-17.9', cohortKey = '2026-06' WHERE id = coalesce((SELECT id FROM sourceReleases WHERE datasetId = 'dataset-division' AND sourceVersion = '2026-06-17.9'), 'source-' || 'release-9');
INSERT INTO resourceReleases (id, datasetId, code, resourceType, status, revokedAt, revocationReason, supersededByResourceReleaseId, ingestedAt, createdAt, updatedAt, sourceReleaseId) VALUES ('release-9', 'dataset-division', 'dr-hk-overture-division-2026-06-17.9', 'division', 'current', null, null, null, '2026-06-19T00:00:00.000Z', '2026-06-19T00:00:00.000Z', '2026-06-19T00:00:00.000Z', coalesce((SELECT id FROM sourceReleases WHERE datasetId = 'dataset-division' AND sourceVersion = '2026-06-17.9'), 'source-' || 'release-9'));
    `)

    const result = await getLatestDatasetForRegionSourceDatasetType(
      db as never,
      'hk',
      'overture',
      'ds-hk-overture-division',
      'division',
    )

    expect(result.latestDataset?.resourceReleaseId).toBe('release-10')
  })
})

describe('source release lifecycle status', () => {
  test('advances the source release with its resource release', async () => {
    const { sqlite, db } = createLatestDatasetLookupDb()

    sqlite.exec(`
      INSERT INTO publishers (id, code) VALUES ('publisher-pland', 'hkgov-pland');
      INSERT INTO datasets (id, publisherId, code, regionCode, theme, type) VALUES
        ('dataset-pland-pu', 'publisher-pland', 'ds-hk-hkgov-pland-division-pu', 'hk', 'divisions', 'division');
      UPDATE datasets SET resourceTypes = json_insert(resourceTypes, '$[#]', 'division') WHERE id = 'dataset-pland-pu' AND NOT EXISTS (SELECT 1 FROM json_each(datasets.resourceTypes) WHERE value = 'division');
    `)

    await insertDataset(
      db as never,
      {
        cohortKey: '2001',
        datasetCode: 'ds-hk-hkgov-pland-division-pu',
        originalFileName: 'division.parquet',
        releaseCode: 'dr-hk-hkgov-pland-division-pu-2001',
        source: 'hkgov-pland-pu',
        sourceVersion: '2001',
        resourceType: 'division',
      } as never,
      '2026-07-21T00:00:00.000Z',
    )

    const release = sqlite
      .query('SELECT id FROM resourceReleases WHERE code = ?')
      .get('dr-hk-hkgov-pland-division-pu-2001') as { id: string }

    await updateDatasetStatus(db as never, release.id, 'processing')
    expect(
      sqlite
        .query('SELECT status FROM sourceReleases WHERE code = ?')
        .get('dr-hk-hkgov-pland-division-pu-2001'),
    ).toEqual({ status: 'processing' })

    await markDatasetCurrent(db as never, release.id)
    expect(
      sqlite
        .query('SELECT status FROM sourceReleases WHERE code = ?')
        .get('dr-hk-hkgov-pland-division-pu-2001'),
    ).toEqual({ status: 'current' })

    sqlite.close()
  })
})

describe('getCurrentReleaseForDatasetId', () => {
  test('keeps independently published resource types in one dataset separate', async () => {
    const { sqlite, db } = createLatestDatasetLookupDb()

    sqlite.exec(`
      INSERT INTO publishers (id, code) VALUES ('publisher-pland', 'hkgov-pland');
      INSERT INTO datasets (id, publisherId, code, regionCode, theme, type) VALUES
        ('dataset-pland-pu', 'publisher-pland', 'ds-hk-hkgov-pland-division-pu', 'hk', 'divisions', 'division');
      INSERT OR IGNORE INTO sourceReleases (id, datasetId, code, sourceVersion, status, cohortKey) VALUES (coalesce((SELECT id FROM sourceReleases WHERE datasetId = 'dataset-pland-pu' AND sourceVersion = '2001'), 'source-' || 'release-pland-pu-division-2001'), 'dataset-pland-pu', 'source-' || 'dr-hk-hkgov-pland-division-pu-2001', '2001', 'current', '2001');
UPDATE sourceReleases SET sourceVersion = '2001', cohortKey = '2001' WHERE id = coalesce((SELECT id FROM sourceReleases WHERE datasetId = 'dataset-pland-pu' AND sourceVersion = '2001'), 'source-' || 'release-pland-pu-division-2001');
INSERT INTO resourceReleases (id, datasetId, code, resourceType, status, ingestedAt, createdAt, updatedAt, sourceReleaseId) VALUES ('release-pland-pu-division-2001', 'dataset-pland-pu', 'dr-hk-hkgov-pland-division-pu-2001', 'division', 'current', '2026-07-21T00:00:00.000Z', '2026-07-21T00:00:00.000Z', '2026-07-21T00:00:00.000Z', coalesce((SELECT id FROM sourceReleases WHERE datasetId = 'dataset-pland-pu' AND sourceVersion = '2001'), 'source-' || 'release-pland-pu-division-2001'));
INSERT OR IGNORE INTO sourceReleases (id, datasetId, code, sourceVersion, status, cohortKey) VALUES (coalesce((SELECT id FROM sourceReleases WHERE datasetId = 'dataset-pland-pu' AND sourceVersion = '2001'), 'source-' || 'release-pland-pu-area-2001'), 'dataset-pland-pu', 'source-' || 'dr-hk-hkgov-pland-division-area-pu-2001', '2001', 'current', '2001');
UPDATE sourceReleases SET sourceVersion = '2001', cohortKey = '2001' WHERE id = coalesce((SELECT id FROM sourceReleases WHERE datasetId = 'dataset-pland-pu' AND sourceVersion = '2001'), 'source-' || 'release-pland-pu-area-2001');
INSERT INTO resourceReleases (id, datasetId, code, resourceType, status, ingestedAt, createdAt, updatedAt, sourceReleaseId) VALUES ('release-pland-pu-area-2001', 'dataset-pland-pu', 'dr-hk-hkgov-pland-division-area-pu-2001', 'divisionArea', 'current', '2026-07-21T00:01:00.000Z', '2026-07-21T00:01:00.000Z', '2026-07-21T00:01:00.000Z', coalesce((SELECT id FROM sourceReleases WHERE datasetId = 'dataset-pland-pu' AND sourceVersion = '2001'), 'source-' || 'release-pland-pu-area-2001'));
    `)

    await expect(
      getCurrentReleaseForDatasetId(db as never, 'dataset-pland-pu', 'division'),
    ).resolves.toMatchObject({ resourceReleaseId: 'release-pland-pu-division-2001' })
    await expect(
      getCurrentReleaseForDatasetId(db as never, 'dataset-pland-pu', 'divisionArea'),
    ).resolves.toMatchObject({ resourceReleaseId: 'release-pland-pu-area-2001' })

    sqlite.close()
  })
})

describe('getLatestNewerDatasetRelease', () => {
  test('returns the highest newer non-failed non-uploading sibling release', async () => {
    const { sqlite, db } = createLatestDatasetLookupDb()

    sqlite.exec(`
      INSERT INTO publishers (id, code) VALUES ('publisher-overture', 'overture');
      INSERT INTO datasets (
        id, publisherId, code, regionCode, theme, type
      ) VALUES (
        'dataset-overture-hk-division',
        'publisher-overture',
        'ds-hk-overture-division',
        'hk',
        'divisions',
        'division'
      );
      INSERT OR IGNORE INTO sourceReleases (id, datasetId, code, sourceVersion, status, cohortKey) VALUES (coalesce((SELECT id FROM sourceReleases WHERE datasetId = 'dataset-overture-hk-division' AND sourceVersion = '2025-09-24.0'), 'source-' || 'release-dr-hk-overture-division-2025-09-24.0'), 'dataset-overture-hk-division', 'source-' || 'dr-hk-overture-division-2025-09-24.0', '2025-09-24.0', 'staged', '2025-09');
UPDATE sourceReleases SET sourceVersion = '2025-09-24.0', cohortKey = '2025-09' WHERE id = coalesce((SELECT id FROM sourceReleases WHERE datasetId = 'dataset-overture-hk-division' AND sourceVersion = '2025-09-24.0'), 'source-' || 'release-dr-hk-overture-division-2025-09-24.0');
INSERT INTO resourceReleases (id, datasetId, code, resourceType, status, revokedAt, revocationReason, supersededByResourceReleaseId, ingestedAt, createdAt, updatedAt, sourceReleaseId) VALUES ('release-dr-hk-overture-division-2025-09-24.0', 'dataset-overture-hk-division', 'dr-hk-overture-division-2025-09-24.0', 'division', 'staged', null, null, null, '2026-07-02T07:11:23.000Z', '2026-07-02T07:11:23.000Z', '2026-07-02T07:11:23.000Z', coalesce((SELECT id FROM sourceReleases WHERE datasetId = 'dataset-overture-hk-division' AND sourceVersion = '2025-09-24.0'), 'source-' || 'release-dr-hk-overture-division-2025-09-24.0'));
INSERT OR IGNORE INTO sourceReleases (id, datasetId, code, sourceVersion, status, cohortKey) VALUES (coalesce((SELECT id FROM sourceReleases WHERE datasetId = 'dataset-overture-hk-division' AND sourceVersion = '2025-10-22.0'), 'source-' || 'release-dr-hk-overture-division-2025-10-22.0'), 'dataset-overture-hk-division', 'source-' || 'dr-hk-overture-division-2025-10-22.0', '2025-10-22.0', 'processing', '2025-10');
UPDATE sourceReleases SET sourceVersion = '2025-10-22.0', cohortKey = '2025-10' WHERE id = coalesce((SELECT id FROM sourceReleases WHERE datasetId = 'dataset-overture-hk-division' AND sourceVersion = '2025-10-22.0'), 'source-' || 'release-dr-hk-overture-division-2025-10-22.0');
INSERT INTO resourceReleases (id, datasetId, code, resourceType, status, revokedAt, revocationReason, supersededByResourceReleaseId, ingestedAt, createdAt, updatedAt, sourceReleaseId) VALUES ('release-dr-hk-overture-division-2025-10-22.0', 'dataset-overture-hk-division', 'dr-hk-overture-division-2025-10-22.0', 'division', 'processing', null, null, null, '2026-07-02T07:11:30.000Z', '2026-07-02T07:11:30.000Z', '2026-07-02T07:11:30.000Z', coalesce((SELECT id FROM sourceReleases WHERE datasetId = 'dataset-overture-hk-division' AND sourceVersion = '2025-10-22.0'), 'source-' || 'release-dr-hk-overture-division-2025-10-22.0'));
INSERT OR IGNORE INTO sourceReleases (id, datasetId, code, sourceVersion, status, cohortKey) VALUES (coalesce((SELECT id FROM sourceReleases WHERE datasetId = 'dataset-overture-hk-division' AND sourceVersion = '2025-11-19.0'), 'source-' || 'release-dr-hk-overture-division-2025-11-19.0'), 'dataset-overture-hk-division', 'source-' || 'dr-hk-overture-division-2025-11-19.0', '2025-11-19.0', 'failed', '2025-11');
UPDATE sourceReleases SET sourceVersion = '2025-11-19.0', cohortKey = '2025-11' WHERE id = coalesce((SELECT id FROM sourceReleases WHERE datasetId = 'dataset-overture-hk-division' AND sourceVersion = '2025-11-19.0'), 'source-' || 'release-dr-hk-overture-division-2025-11-19.0');
INSERT INTO resourceReleases (id, datasetId, code, resourceType, status, revokedAt, revocationReason, supersededByResourceReleaseId, ingestedAt, createdAt, updatedAt, sourceReleaseId) VALUES ('release-dr-hk-overture-division-2025-11-19.0', 'dataset-overture-hk-division', 'dr-hk-overture-division-2025-11-19.0', 'division', 'failed', null, null, null, '2026-07-02T07:11:40.000Z', '2026-07-02T07:11:40.000Z', '2026-07-02T07:11:40.000Z', coalesce((SELECT id FROM sourceReleases WHERE datasetId = 'dataset-overture-hk-division' AND sourceVersion = '2025-11-19.0'), 'source-' || 'release-dr-hk-overture-division-2025-11-19.0'));
INSERT OR IGNORE INTO sourceReleases (id, datasetId, code, sourceVersion, status, cohortKey) VALUES (coalesce((SELECT id FROM sourceReleases WHERE datasetId = 'dataset-overture-hk-division' AND sourceVersion = '2025-12-17.0'), 'source-' || 'release-dr-hk-overture-division-2025-12-17.0'), 'dataset-overture-hk-division', 'source-' || 'dr-hk-overture-division-2025-12-17.0', '2025-12-17.0', 'uploading', '2025-12');
UPDATE sourceReleases SET sourceVersion = '2025-12-17.0', cohortKey = '2025-12' WHERE id = coalesce((SELECT id FROM sourceReleases WHERE datasetId = 'dataset-overture-hk-division' AND sourceVersion = '2025-12-17.0'), 'source-' || 'release-dr-hk-overture-division-2025-12-17.0');
INSERT INTO resourceReleases (id, datasetId, code, resourceType, status, revokedAt, revocationReason, supersededByResourceReleaseId, ingestedAt, createdAt, updatedAt, sourceReleaseId) VALUES ('release-dr-hk-overture-division-2025-12-17.0', 'dataset-overture-hk-division', 'dr-hk-overture-division-2025-12-17.0', 'division', 'uploading', null, null, null, '2026-07-02T07:11:50.000Z', '2026-07-02T07:11:50.000Z', '2026-07-02T07:11:50.000Z', coalesce((SELECT id FROM sourceReleases WHERE datasetId = 'dataset-overture-hk-division' AND sourceVersion = '2025-12-17.0'), 'source-' || 'release-dr-hk-overture-division-2025-12-17.0'));
    `)

    const result = await getLatestNewerDatasetRelease(
      db,
      'release-dr-hk-overture-division-2025-09-24.0',
    )

    expect(result?.resourceReleaseId).toBe(
      'release-dr-hk-overture-division-2025-10-22.0',
    )
    sqlite.close()
  })
})

describe('listCurrentSnapshotCleanupCandidates', () => {
  test('protects every release set in retained catalogue revisions', async () => {
    const { sqlite, db } = createCleanupCandidatesDb()

    sqlite.exec(`
      INSERT INTO snapshots (id, resourceType, status) VALUES
        ('snapshot-draft', 'division', 'draft'),
        ('snapshot-published-default', 'division', 'published'),
        ('snapshot-published-historical-cohort', 'division', 'published'),
        ('snapshot-published-retained-revision', 'division', 'published'),
        ('snapshot-published-draft-member', 'division', 'published'),
        ('snapshot-published-candidate', 'division', 'published'),
        ('snapshot-published-area-variant', 'divisionArea', 'published'),
        ('snapshot-published-boundary-variant', 'divisionBoundary', 'published');

      INSERT INTO apiReleaseSets (id, code) VALUES
        ('release-set-default', 'ss-hk-division-2026-05-20.0'),
        ('release-set-historical-cohort', 'ss-hk-division-2026-04-20.0'),
        ('release-set-retained-revision', 'ss-hk-division-2026-03-20.0'),
        ('release-set-draft', 'ss-hk-division-2026-06-20.0');

      INSERT INTO apiVersionReleaseSets (id, apiReleaseSetId, status) VALUES
        ('version-default', 'release-set-default', 'current'),
        ('version-historical', 'release-set-historical-cohort', 'current'),
        ('version-retained', 'release-set-retained-revision', 'current'),
        ('version-draft', 'release-set-draft', 'draft');

      INSERT INTO apiReleaseSetSnapshots (apiReleaseSetId, snapshotId) VALUES
        ('release-set-default', 'snapshot-published-default'),
        ('release-set-historical-cohort', 'snapshot-published-historical-cohort'),
        ('release-set-retained-revision', 'snapshot-published-retained-revision'),
        ('release-set-draft', 'snapshot-published-draft-member');

      INSERT INTO apiCatalogRevisions (
        id, apiVersionId, regionCode, revision, status, publishedAt
      ) VALUES (
        'catalog-current', 'api-version-division', 'hk', 1, 'current', 1760000000000
      ),
      (
        'catalog-retained', 'api-version-division', 'hk', 0, 'current', 1750000000000
      );

      INSERT INTO apiCatalogRevisionReleaseSets (
        apiCatalogRevisionId, apiVersionReleaseSetId, isDefault
      ) VALUES
        ('catalog-current', 'version-default', 1),
        ('catalog-current', 'version-historical', 0),
        ('catalog-retained', 'version-retained', 0);
    `)

    await expect(
      listCurrentSnapshotCleanupCandidates(db as never, {
        snapshotIds: [],
      }),
    ).resolves.toEqual([])

    await expect(
      listCurrentSnapshotCleanupCandidates(db as never, {
        resourceType: 'division',
      }),
    ).resolves.toEqual([
      {
        snapshotId: 'snapshot-published-candidate',
        resourceType: 'division',
      },
    ])

    await expect(
      listCurrentSnapshotCleanupCandidates(db as never, {
        resourceType: 'divisionArea',
      }),
    ).resolves.toEqual([
      {
        snapshotId: 'snapshot-published-area-variant',
        resourceType: 'divisionArea',
      },
    ])

    await expect(
      listCurrentSnapshotCleanupCandidates(db as never, {
        resourceType: 'divisionBoundary',
      }),
    ).resolves.toEqual([
      {
        snapshotId: 'snapshot-published-boundary-variant',
        resourceType: 'divisionBoundary',
      },
    ])
    sqlite.close()
  })
})

describe('resolveActiveSnapshotForType', () => {
  test('keeps active snapshot resolution scoped to the requested region', async () => {
    const { sqlite, db } = createActiveSnapshotLookupDb()

    sqlite.exec(`
      INSERT INTO apiVersions (id, code) VALUES
        ('api-version-place', 'api-places-v0.1');

      INSERT INTO apiReleaseSets (
        id, code, domainCode, schemaVersion, rulesetVersion, createdAt
      ) VALUES
        (
          'release-set-hk',
          'rs-hk-place-2026-05',
          'place',
          'sv-place-v1',
          'rs-place-v1',
          1760000000000
        ),
        (
          'release-set-mo',
          'rs-mo-place-2026-05',
          'place',
          'sv-place-v1',
          'rs-place-v1',
          1760000100000
        );

      INSERT INTO apiVersionReleaseSets VALUES
        ('version-hk', 'release-set-hk', 'api-version-place', 'current', 1760000000000),
        ('version-mo', 'release-set-mo', 'api-version-place', 'current', 1760000100000);

      INSERT INTO snapshots (id, resourceType, code) VALUES
        ('snapshot-hk-place', 'place', 'ss-hk-place-2026-05'),
        ('snapshot-mo-place', 'place', 'ss-mo-place-2026-05');

      INSERT INTO apiReleaseSetSnapshots (apiReleaseSetId, snapshotId) VALUES
        ('release-set-hk', 'snapshot-hk-place'),
        ('release-set-mo', 'snapshot-mo-place');

      INSERT INTO publishers (id, code) VALUES ('publisher-overture', 'overture');

      INSERT INTO datasets (id, publisherId, code, regionCode) VALUES
        ('dataset-hk-place', 'publisher-overture', 'ds-hk-overture-place', 'hk'),
        ('dataset-mo-place', 'publisher-overture', 'ds-mo-overture-place', 'mo');

      INSERT INTO snapshotResourceReleases (snapshotId, datasetId, resourceReleaseId, role) VALUES
        ('snapshot-hk-place', 'dataset-hk-place', 'release-hk-place', 'primary'),
        ('snapshot-mo-place', 'dataset-mo-place', 'release-mo-place', 'primary');
    `)

    await expect(
      resolveActiveSnapshotForType(db as never, 'place', {
        domainCode: 'place',
        regionCode: 'hk',
      }),
    ).resolves.toMatchObject({
      snapshotId: 'snapshot-hk-place',
      apiReleaseSet: 'rs-hk-place-2026-05',
    })

    await expect(
      resolveActiveSnapshotForType(db as never, 'place', {
        domainCode: 'place',
        regionCode: 'mo',
      }),
    ).resolves.toMatchObject({
      snapshotId: 'snapshot-mo-place',
      apiReleaseSet: 'rs-mo-place-2026-05',
    })

    sqlite.close()
  })
})

describe('resolvePublishedSnapshotForResourceTypeRegionCohortKey', () => {
  test('resolves an Overture division snapshot by its canonical dataset when it has no lineage', async () => {
    const { sqlite, db } = createRegionalSnapshotLookupDb()

    sqlite.exec(`
      ALTER TABLE datasets ADD COLUMN code TEXT;
      ALTER TABLE snapshots ADD COLUMN cohortKey TEXT;

      INSERT INTO publishers (id, code) VALUES ('publisher-overture', 'overture');
      INSERT INTO datasets (id, publisherId, code, regionCode) VALUES
        ('dataset-overture-division', 'publisher-overture', 'ds-hk-overture-division', 'hk');
      INSERT INTO snapshots (
        id, snapshotLineageId, resourceType, code, cohortKey, status, publishedAt, createdAt
      ) VALUES
        ('overture-division-2025', NULL, 'division', 'ss-hk-division-2025-09-24.0', '2025-09-24.0', 'published', 1758672000000, 1758672000000);
      INSERT INTO snapshotResourceReleases (snapshotId, datasetId, resourceReleaseId, role) VALUES
        ('overture-division-2025', 'dataset-overture-division', 'release-overture-division-2025', 'primary');
    `)

    sqlite.exec(`
      INSERT INTO snapshotLineages (id,variant) VALUES ('curated-lineage','saanseoi');
      INSERT INTO snapshots (id,snapshotLineageId,resourceType,code,cohortKey,status,publishedAt,createdAt)
      VALUES ('curated','curated-lineage','division','ss-hk-division-saanseoi-2025-09-24.0','2025-09-24.0','published',1758672001000,1758672001000);
      INSERT INTO snapshotResourceReleases (snapshotId,datasetId,resourceReleaseId,role)
      VALUES ('curated','dataset-overture-division','release-overture-division-2025','primary');
    `)

    await expect(
      resolvePublishedSnapshotForResourceTypeRegionCohortKey(
        db as never,
        'division',
        'hk',
        '2025-09-24.0',
        { variant: 'overture' },
      ),
    ).resolves.toEqual({
      id: 'overture-division-2025',
      code: 'ss-hk-division-2025-09-24.0',
      resourceType: 'division',
      status: 'published',
    })

    sqlite.close()
  })

  test('resolves an Overture division-area snapshot by its geometry dataset', async () => {
    const { sqlite, db } = createRegionalSnapshotLookupDb()

    sqlite.exec(`
      ALTER TABLE datasets ADD COLUMN code TEXT;
      ALTER TABLE snapshots ADD COLUMN cohortKey TEXT;

      INSERT INTO publishers (id, code) VALUES ('publisher-overture', 'overture');
      INSERT INTO datasets (id, publisherId, code, regionCode) VALUES
        ('dataset-overture-division', 'publisher-overture', 'ds-hk-overture-division', 'hk');
      INSERT INTO snapshots (
        id, snapshotLineageId, resourceType, code, cohortKey, status, publishedAt, createdAt
      ) VALUES
        ('overture-division-area-2025', NULL, 'divisionArea', 'ss-hk-division-area-2025-09-24.0', '2025-09-24.0', 'published', 1758672000000, 1758672000000);
      INSERT INTO snapshotResourceReleases (snapshotId, datasetId, resourceReleaseId, role) VALUES
        ('overture-division-area-2025', 'dataset-overture-division', 'release-overture-division-area-2025', 'primary');
    `)

    await expect(
      resolvePublishedSnapshotForResourceTypeRegionCohortKey(
        db as never,
        'divisionArea',
        'hk',
        '2025-09-24.0',
        { variant: 'overture' },
      ),
    ).resolves.toEqual({
      id: 'overture-division-area-2025',
      code: 'ss-hk-division-area-2025-09-24.0',
      resourceType: 'divisionArea',
      status: 'published',
    })

    sqlite.close()
  })

  test('selects the requested variant when a cohort has multiple division snapshots', async () => {
    const { sqlite, db } = createRegionalSnapshotLookupDb()

    sqlite.exec(`
      ALTER TABLE snapshots ADD COLUMN cohortKey TEXT;

      INSERT INTO publishers (id, code) VALUES ('publisher-pland', 'hkgov-pland');

      INSERT INTO datasets (id, publisherId, regionCode) VALUES
        ('dataset-pland-pu', 'publisher-pland', 'hk'),
        ('dataset-pland-new-town', 'publisher-pland', 'hk');

      INSERT INTO snapshotLineages (id, variant) VALUES
        ('lineage-pland-pu', 'hkgov-pland-pu'),
        ('lineage-pland-new-town', 'hkgov-pland-new-town');

      INSERT INTO snapshots (
        id, snapshotLineageId, resourceType, code, cohortKey, status, publishedAt, createdAt
      ) VALUES
        ('pland-pu-2006', 'lineage-pland-pu', 'division', 'ss-hk-division-hkgov-pland-pu-2006', '2006', 'published', 1136073600000, 1136073600000),
        ('pland-new-town-2006', 'lineage-pland-new-town', 'division', 'ss-hk-division-hkgov-pland-new-town-2006', '2006', 'published', 1136073600001, 1136073600001);

      INSERT INTO snapshotResourceReleases (snapshotId, datasetId, resourceReleaseId, role) VALUES
        ('pland-pu-2006', 'dataset-pland-pu', 'release-pland-pu-2006', 'primary'),
        ('pland-new-town-2006', 'dataset-pland-new-town', 'release-pland-new-town-2006', 'primary');
    `)

    await expect(
      resolvePublishedSnapshotForResourceTypeRegionCohortKey(
        db as never,
        'division',
        'hk',
        '2006',
        { variant: 'hkgov-pland-new-town' },
      ),
    ).resolves.toEqual({
      id: 'pland-new-town-2006',
      code: 'ss-hk-division-hkgov-pland-new-town-2006',
      resourceType: 'division',
      status: 'published',
    })

    sqlite.close()
  })

  test('prefers authoritative geometry over a later fallback for the same variant and cohort', async () => {
    const { sqlite, db } = createRegionalSnapshotLookupDb()

    sqlite.exec(`
      ALTER TABLE datasets ADD COLUMN code TEXT;
      ALTER TABLE snapshots ADD COLUMN cohortKey TEXT;

      INSERT INTO publishers (id, code) VALUES ('publisher-censtatd', 'hkgov-censtatd');
      INSERT INTO datasets (id, publisherId, code, regionCode) VALUES
        ('dataset-censtatd', 'publisher-censtatd', 'ds-hk-hkgov-censtatd-division-statistic-population-households-district', 'hk');
      INSERT INTO snapshotLineages (id, variant) VALUES
        ('lineage-censtatd', 'hkgov-censtatd');
      INSERT INTO snapshots (
        id, snapshotLineageId, resourceType, code, cohortKey, geometryStatus, status, publishedAt, createdAt
      ) VALUES
        ('censtatd-authoritative-2024', 'lineage-censtatd', 'divisionArea', 'ss-hk-division-area-censtatd-2024.0', '2024', 'authoritative', 'published', 1735689600000, 1735689600000),
        ('censtatd-fallback-2024', 'lineage-censtatd', 'divisionArea', 'ss-hk-division-area-censtatd-2024.1', '2024', 'fallback', 'published', 1767225600000, 1767225600000);
      INSERT INTO snapshotResourceReleases (snapshotId, datasetId, resourceReleaseId, role) VALUES
        ('censtatd-authoritative-2024', 'dataset-censtatd', 'release-censtatd-2024', 'primary'),
        ('censtatd-fallback-2024', 'dataset-censtatd', 'release-censtatd-2026-q2', 'primary');
    `)

    await expect(
      resolvePublishedSnapshotForResourceTypeRegionCohortKey(
        db as never,
        'divisionArea',
        'hk',
        '2024',
        { variant: 'hkgov-censtatd' },
      ),
    ).resolves.toMatchObject({ id: 'censtatd-authoritative-2024' })

    sqlite.close()
  })
})

describe('resolvePublishedSnapshotsForResourceTypeRegionAtOrBeforeCohortKey', () => {
  test("selects each provider's newest published geometry snapshot without selecting future cohorts", async () => {
    const { sqlite, db } = createRegionalSnapshotLookupDb()

    sqlite.exec(`
      ALTER TABLE snapshots ADD COLUMN cohortKey TEXT;

      INSERT INTO publishers (id, code) VALUES
        ('publisher-overture', 'overture'),
        ('publisher-had', 'hkgov-had');

      INSERT INTO datasets (id, publisherId, regionCode) VALUES
        ('dataset-overture-area', 'publisher-overture', 'hk'),
        ('dataset-had-area', 'publisher-had', 'hk');

      INSERT INTO snapshotLineages (id, variant) VALUES
        ('lineage-overture-area', 'overture'),
        ('lineage-had-area', 'hkgov-had');

      INSERT INTO snapshots (
        id, snapshotLineageId, resourceType, code, cohortKey, status, publishedAt, createdAt
      ) VALUES
        ('overture-area-older', 'lineage-overture-area', 'divisionArea', 'ss-hk-division-area-2025-08-20.0', '2025-08-20.0', 'published', 1755648000000, 1755648000000),
        ('overture-area-current', 'lineage-overture-area', 'divisionArea', 'ss-hk-division-area-2025-09-24.0', '2025-09-24.0', 'published', 1758672000000, 1758672000000),
        ('had-area-2022', 'lineage-had-area', 'divisionArea', 'ss-hk-division-area-2022', '2022', 'published', 1654041600000, 1654041600000),
        ('had-area-future', 'lineage-had-area', 'divisionArea', 'ss-hk-division-area-2026', '2026', 'published', 1767225600000, 1767225600000);

      INSERT INTO snapshotResourceReleases (snapshotId, datasetId, resourceReleaseId, role) VALUES
        ('overture-area-older', 'dataset-overture-area', 'release-overture-area-older', 'primary'),
        ('overture-area-current', 'dataset-overture-area', 'release-overture-area-current', 'primary'),
        ('had-area-2022', 'dataset-had-area', 'release-had-area-2022', 'primary'),
        ('had-area-future', 'dataset-had-area', 'release-had-area-future', 'primary');
    `)

    await expect(
      resolvePublishedSnapshotsForResourceTypeRegionAtOrBeforeCohortKey(
        db as never,
        'divisionArea',
        'hk',
        '2025-09-24.0',
        {},
      ),
    ).resolves.toEqual([
      {
        id: 'overture-area-current',
        code: 'ss-hk-division-area-2025-09-24.0',
        cohortKey: '2025-09-24.0',
        resourceType: 'divisionArea',
        status: 'published',
      },
      {
        id: 'had-area-2022',
        code: 'ss-hk-division-area-2022',
        cohortKey: '2022',
        resourceType: 'divisionArea',
        status: 'published',
      },
    ])

    sqlite.exec(`
      INSERT INTO publishers (id, code) VALUES ('publisher-censtatd', 'hkgov-censtatd');

      INSERT INTO datasets (id, publisherId, regionCode) VALUES
        ('dataset-censtatd-area', 'publisher-censtatd', 'hk');

      INSERT INTO snapshotLineages (id, variant) VALUES
        ('lineage-censtatd-2016', 'hkgov-censtatd:2016'),
        ('lineage-censtatd-2021', 'hkgov-censtatd:2021');

      INSERT INTO snapshots (
        id, snapshotLineageId, resourceType, code, cohortKey, status, publishedAt, createdAt
      ) VALUES
        ('censtatd-area-2016', 'lineage-censtatd-2016', 'divisionArea', 'ss-hk-division-area-censtatd-2016', '2016', 'published', 1451606400000, 1451606400000),
        ('censtatd-area-2021', 'lineage-censtatd-2021', 'divisionArea', 'ss-hk-division-area-censtatd-2021', '2021', 'published', 1609459200000, 1609459200000);

      INSERT INTO snapshotResourceReleases (snapshotId, datasetId, resourceReleaseId, role) VALUES
        ('censtatd-area-2016', 'dataset-censtatd-area', 'release-censtatd-area-2016', 'primary'),
        ('censtatd-area-2021', 'dataset-censtatd-area', 'release-censtatd-area-2021', 'primary');
    `)

    await expect(
      resolvePublishedSnapshotsForResourceTypeRegionAtOrBeforeCohortKey(
        db as never,
        'divisionArea',
        'hk',
        '2025-09-24.0',
        {
          publisherCode: 'hkgov-censtatd',
          variant: 'hkgov-censtatd:2016',
        },
      ),
    ).resolves.toEqual([
      {
        id: 'censtatd-area-2016',
        code: 'ss-hk-division-area-censtatd-2016',
        cohortKey: '2016',
        resourceType: 'divisionArea',
        status: 'published',
      },
    ])

    await expect(
      resolvePublishedSnapshotsForResourceTypeRegionAtOrBeforeCohortKey(
        db as never,
        'divisionArea',
        'hk',
        '2025-09-24.0',
        { publisherCode: 'hkgov-had' },
      ),
    ).resolves.toEqual([
      {
        id: 'had-area-2022',
        code: 'ss-hk-division-area-2022',
        cohortKey: '2022',
        resourceType: 'divisionArea',
        status: 'published',
      },
    ])

    sqlite.exec(`
      INSERT INTO publishers (id, code) VALUES ('publisher-pland', 'hkgov-pland');

      INSERT INTO datasets (id, publisherId, regionCode) VALUES
        ('dataset-pland-pu-area', 'publisher-pland', 'hk'),
        ('dataset-pland-new-town-area', 'publisher-pland', 'hk');

      INSERT INTO snapshotLineages (id, variant) VALUES
        ('lineage-pland-pu-area', 'hkgov-pland-pu'),
        ('lineage-pland-new-town-area', 'hkgov-pland-new-town');

      INSERT INTO snapshots (
        id, snapshotLineageId, resourceType, code, cohortKey, status, publishedAt, createdAt
      ) VALUES
        ('pland-pu-area-2006', 'lineage-pland-pu-area', 'divisionArea', 'ss-hk-division-area-hkgov-pland-pu-2006', '2006', 'published', 1136073600000, 1136073600000),
        ('pland-new-town-area-2006', 'lineage-pland-new-town-area', 'divisionArea', 'ss-hk-division-area-hkgov-pland-new-town-2006', '2006', 'published', 1136073600000, 1136073600000);

      INSERT INTO snapshotResourceReleases (snapshotId, datasetId, resourceReleaseId, role) VALUES
        ('pland-pu-area-2006', 'dataset-pland-pu-area', 'release-pland-pu-area-2006', 'primary'),
        ('pland-new-town-area-2006', 'dataset-pland-new-town-area', 'release-pland-new-town-area-2006', 'primary');
    `)

    await expect(
      resolvePublishedSnapshotsForResourceTypeRegionAtOrBeforeCohortKey(
        db as never,
        'divisionArea',
        'hk',
        '2006',
        {
          publisherCode: 'hkgov-pland',
          variant: 'hkgov-pland-pu',
        },
      ),
    ).resolves.toEqual([
      {
        id: 'pland-pu-area-2006',
        code: 'ss-hk-division-area-hkgov-pland-pu-2006',
        cohortKey: '2006',
        resourceType: 'divisionArea',
        status: 'published',
      },
    ])

    sqlite.close()
  })
})

describe('resolveEarliestPublishedSnapshotForResourceTypeRegionAtOrAfterCohortKey', () => {
  test('uses the earliest eligible Overture division snapshot as a historical geometry anchor', async () => {
    const { sqlite, db } = createRegionalSnapshotLookupDb()

    sqlite.exec(`
      ALTER TABLE snapshots ADD COLUMN cohortKey TEXT;

      INSERT INTO publishers (id, code) VALUES
        ('publisher-overture', 'overture'),
        ('publisher-other', 'other');

      INSERT INTO datasets (id, publisherId, regionCode) VALUES
        ('dataset-overture-division', 'publisher-overture', 'hk'),
        ('dataset-other-division', 'publisher-other', 'hk');

      INSERT INTO snapshots (
        id, resourceType, code, cohortKey, status, publishedAt, createdAt
      ) VALUES
        ('overture-first', 'division', 'ss-hk-division-2025-09-24.0', '2025-09-24.0', 'published', 1758672000000, 1758672000000),
        ('overture-later', 'division', 'ss-hk-division-2026-02-18.0', '2026-02-18.0', 'published', 1771372800000, 1771372800000),
        ('other-earlier', 'division', 'ss-hk-division-2024-01', '2024-01', 'published', 1704067200000, 1704067200000);

      INSERT INTO snapshotResourceReleases (snapshotId, datasetId, resourceReleaseId, role) VALUES
        ('overture-first', 'dataset-overture-division', 'release-overture-first', 'primary'),
        ('overture-later', 'dataset-overture-division', 'release-overture-later', 'primary'),
        ('other-earlier', 'dataset-other-division', 'release-other-earlier', 'primary');
    `)

    await expect(
      resolveEarliestPublishedSnapshotForResourceTypeRegionAtOrAfterCohortKey(
        db as never,
        'division',
        'hk',
        '2016',
        { publisherCode: 'overture' },
      ),
    ).resolves.toEqual({
      id: 'overture-first',
      code: 'ss-hk-division-2025-09-24.0',
      cohortKey: '2025-09-24.0',
      resourceType: 'division',
      status: 'published',
    })

    sqlite.close()
  })
})

describe('listPublishedSnapshotsForResourceTypeRegionAtOrAfterCohortKey', () => {
  test('keeps later eligible Overture snapshots available in chronological order', async () => {
    const { sqlite, db } = createRegionalSnapshotLookupDb()

    sqlite.exec(`
      ALTER TABLE snapshots ADD COLUMN cohortKey TEXT;

      INSERT INTO publishers (id, code) VALUES ('publisher-overture', 'overture');
      INSERT INTO datasets (id, publisherId, regionCode) VALUES
        ('dataset-overture-division', 'publisher-overture', 'hk');
      INSERT INTO snapshots (
        id, resourceType, code, cohortKey, status, publishedAt, createdAt
      ) VALUES
        ('overture-first', 'division', 'ss-hk-division-2025-09-24.0', '2025-09-24.0', 'published', 1758672000000, 1758672000000),
        ('overture-second', 'division', 'ss-hk-division-2026-01-21.0', '2026-01-21.0', 'published', 1768953600000, 1768953600000);
      INSERT INTO snapshotResourceReleases (snapshotId, datasetId, resourceReleaseId, role) VALUES
        ('overture-first', 'dataset-overture-division', 'release-overture-first', 'primary'),
        ('overture-second', 'dataset-overture-division', 'release-overture-second', 'primary');
    `)

    await expect(
      listPublishedSnapshotsForResourceTypeRegionAtOrAfterCohortKey(
        db as never,
        'division',
        'hk',
        '2023-H2',
        { publisherCode: 'overture' },
      ),
    ).resolves.toMatchObject([
      { id: 'overture-first', cohortKey: '2025-09-24.0' },
      { id: 'overture-second', cohortKey: '2026-01-21.0' },
    ])

    sqlite.close()
  })
})

describe('resolveLatestPublishedSnapshotForResourceTypeRegionAtOrBeforeCohortKey', () => {
  test('prefers the closest earlier canonical snapshot over a future snapshot', async () => {
    const { sqlite, db } = createRegionalSnapshotLookupDb()

    sqlite.exec(`
      ALTER TABLE snapshots ADD COLUMN cohortKey TEXT;

      INSERT INTO publishers (id, code) VALUES ('publisher-overture', 'overture');
      INSERT INTO datasets (id, publisherId, regionCode) VALUES
        ('dataset-overture-division', 'publisher-overture', 'hk');
      INSERT INTO snapshots (
        id, resourceType, code, cohortKey, status, publishedAt, createdAt
      ) VALUES
        ('overture-earlier', 'division', 'ss-hk-division-2023-06-01.0', '2023-06-01.0', 'published', 1685577600000, 1685577600000),
        ('overture-future', 'division', 'ss-hk-division-2025-09-24.0', '2025-09-24.0', 'published', 1758672000000, 1758672000000);
      INSERT INTO snapshotResourceReleases (snapshotId, datasetId, resourceReleaseId, role) VALUES
        ('overture-earlier', 'dataset-overture-division', 'release-overture-earlier', 'primary'),
        ('overture-future', 'dataset-overture-division', 'release-overture-future', 'primary');
    `)

    await expect(
      resolveLatestPublishedSnapshotForResourceTypeRegionAtOrBeforeCohortKey(
        db as never,
        'division',
        'hk',
        '2023-H2',
        { publisherCode: 'overture' },
      ),
    ).resolves.toEqual({
      id: 'overture-earlier',
      code: 'ss-hk-division-2023-06-01.0',
      cohortKey: '2023-06-01.0',
      resourceType: 'division',
      status: 'published',
    })

    sqlite.close()
  })
})

describe('listOvertureReleaseSetCohortsAtOrAfterCohortKey', () => {
  test('selects draft and published-compatible Geographic cohorts in chronological order', async () => {
    const { sqlite, db } = createRegionalSnapshotLookupDb()

    sqlite.exec(`
      CREATE TABLE apiVersions (
        id TEXT PRIMARY KEY,
        code TEXT NOT NULL
      );

      CREATE TABLE apiReleaseSets (
        publisherFields TEXT,
id TEXT PRIMARY KEY,
        regionCode TEXT NOT NULL,
        domainCode TEXT NOT NULL,
        cohortKey TEXT NOT NULL,
        revision INTEGER NOT NULL,
        status TEXT NOT NULL
      );

      CREATE TABLE apiVersionReleaseSets (
        id TEXT PRIMARY KEY,
        apiVersionId TEXT NOT NULL,
        apiReleaseSetId TEXT NOT NULL,
        status TEXT NOT NULL
      );

      CREATE TABLE apiReleaseSetSnapshots (
        apiReleaseSetId TEXT NOT NULL,
        snapshotId TEXT NOT NULL,
        role TEXT NOT NULL
      );

      INSERT INTO publishers (id, code) VALUES
        ('publisher-overture', 'overture'),
        ('publisher-had', 'hkgov-had');

      INSERT INTO datasets (id, publisherId, regionCode) VALUES
        ('dataset-overture', 'publisher-overture', 'hk'),
        ('dataset-had', 'publisher-had', 'hk');

      INSERT INTO snapshots (id, resourceType, code, status, createdAt) VALUES
        ('snapshot-overture-2025-r0', 'division', 'ss-hk-division-2025-r0', 'published', 1),
        ('snapshot-overture-2025-r1', 'division', 'ss-hk-division-2025-r1', 'published', 1),
        ('snapshot-overture-2026', 'division', 'ss-hk-division-2026', 'published', 1),
        ('snapshot-had', 'division', 'ss-hk-division-had', 'published', 1);

      INSERT INTO snapshotResourceReleases (snapshotId, datasetId, resourceReleaseId, role) VALUES
        ('snapshot-overture-2025-r0', 'dataset-overture', 'release-overture-2025-r0', 'primary'),
        ('snapshot-overture-2025-r1', 'dataset-overture', 'release-overture-2025-r1', 'primary'),
        ('snapshot-overture-2026', 'dataset-overture', 'release-overture-2026', 'primary'),
        ('snapshot-had', 'dataset-had', 'release-had', 'primary');

      INSERT INTO apiVersions (id, code) VALUES
        ('api-divisions', 'api-divisions-v0.1'),
        ('api-divisions-v02', 'api-divisions-v0.2');

      INSERT INTO apiReleaseSets (
        id, regionCode, domainCode, cohortKey, revision, status
      ) VALUES
        ('release-set-2025-r0', 'hk', 'geographic', '2025-09-24.0', 0, 'archived'),
        ('release-set-2025-r1', 'hk', 'geographic', '2025-09-24.0', 1, 'archived'),
        ('release-set-2026', 'hk', 'geographic', '2026-06-17.0', 0, 'current'),
        ('release-set-had', 'hk', 'geographic', '2026-07-01.0', 0, 'current'),
        ('release-set-draft', 'hk', 'geographic', '2026-08-01.0', 0, 'draft'),
        ('release-set-v02', 'hk', 'geographic', '2026-09-23.0', 0, 'draft');

      INSERT INTO apiVersionReleaseSets (id, apiVersionId, apiReleaseSetId, status)
        SELECT id || '-version', CASE WHEN id='release-set-v02' THEN 'api-divisions-v02' ELSE 'api-divisions' END, id, status FROM apiReleaseSets;

      INSERT INTO apiReleaseSetSnapshots (apiReleaseSetId, snapshotId, role) VALUES
        ('release-set-2025-r0', 'snapshot-overture-2025-r0', 'primary'),
        ('release-set-2025-r1', 'snapshot-overture-2025-r1', 'primary'),
        ('release-set-2026', 'snapshot-overture-2026', 'primary'),
        ('release-set-had', 'snapshot-had', 'primary'),
        ('release-set-draft', 'snapshot-overture-2026', 'primary'),
        ('release-set-v02', 'snapshot-overture-2026', 'primary');
    `)

    await expect(
      listOvertureReleaseSetCohortsAtOrAfterCohortKey(
        db as never,
        'division',
        'hk',
        '2025-09-24.0',
      ),
    ).resolves.toEqual(['2025-09-24.0', '2026-06-17.0', '2026-08-01.0'])

    await expect(
      listOvertureReleaseSetCohortsAtOrAfterCohortKey(
        db as never,
        'division',
        'hk',
        '2025-09-24.0',
        'geographic',
        'api-divisions-v0.2',
      ),
    ).resolves.toEqual(['2026-09-23.0'])

    sqlite.close()
  })
})

describe('publishReleaseArtefacts', () => {
  test('records derived Address field rules from the selected Place release anchor', async () => {
    const { sqlite, db } = createPublishReleaseArtefactsDb()

    sqlite.exec(`
      INSERT INTO publishers (id, code) VALUES
        ('publisher-overture', 'overture'),
        ('publisher-dpo', 'hkgov-dpo');

      INSERT INTO datasets (id, publisherId, code) VALUES
        ('dataset-address', 'publisher-dpo', 'ds-hk-hkgov-dpo-address'),
        ('dataset-division', 'publisher-overture', 'ds-hk-overture-division'),
        ('dataset-place', 'publisher-overture', 'ds-hk-overture-place');

      INSERT INTO apiVersions (id, code, familyType) VALUES
        ('api-addresses', 'api-addresses-v0.1', 'addresses');

      INSERT INTO snapshots (
        id, resourceType, code, cohortKey, status, publishedAt, validFrom, validTo, updatedAt
      ) VALUES
        ('snapshot-address', 'address', 'ss-hk-address-hkgov-dpo-2025-09-03.0', '2025-09-24.0', 'draft', null, null, null, 1760000000000),
        ('snapshot-place-address', 'address', 'ss-hk-address-2025-09-24.0--overture-places', '2025-09-24.0', 'published', 1760000000000, 1760000000000, null, 1760000000000),
        ('snapshot-division', 'division', 'ss-hk-division-2025-09-24.0', '2025-09-24.0', 'published', 1760000000000, 1760000000000, null, 1760000000000);

      INSERT INTO apiReleaseSets (
        id, apiVersionId, code, regionCode, domainCode, cohortKey,
        schemaVersion, rulesetVersion, status, publishedAt, validFrom, validTo, updatedAt
      ) VALUES (
        'release-set-addresses', 'api-addresses', 'data-hk-addresses-2025-09-24.0',
        'hk', 'saanseoi', '2025-09-24.0', 'sv-address-v1',
        'rs-address-merge-v1', 'draft', null, null, null, 1760000000000
      );

      INSERT INTO sourceReleases (id, status, updatedAt) VALUES
        ('source-release-address', 'staged', 1760000000000);
      UPDATE sourceReleases
      SET expectedResourceTypes = '["address"]'
      WHERE id = 'source-release-address';

      INSERT OR IGNORE INTO sourceReleases (id, datasetId, code, sourceVersion, status, sourceSchemaVersion) VALUES ('source-release-address', 'dataset-address', 'source-' || 'release-address', '2025-09-03.0', 'staged', '3.2');
UPDATE sourceReleases SET sourceVersion = '2025-09-03.0', sourceSchemaVersion = '3.2' WHERE id = 'source-release-address';
INSERT INTO resourceReleases (id, sourceReleaseId, datasetId, processingRules, resourceType, status, updatedAt, code) VALUES ('release-address', 'source-release-address', 'dataset-address', null, 'address', 'staged', 1760000000000, 'release-address');
INSERT OR IGNORE INTO sourceReleases (id, datasetId, code, sourceVersion, status, sourceSchemaVersion) VALUES ('source-release-division', 'dataset-division', 'source-' || 'release-division', '2025-09-24.0', 'current', '1.12.0');
UPDATE sourceReleases SET sourceVersion = '2025-09-24.0', sourceSchemaVersion = '1.12.0' WHERE id = 'source-release-division';
INSERT INTO resourceReleases (id, sourceReleaseId, datasetId, processingRules, resourceType, status, updatedAt, code) VALUES ('release-division', 'source-release-division', 'dataset-division', null, 'division', 'current', 1760000000000, 'release-division');
INSERT OR IGNORE INTO sourceReleases (id, datasetId, code, sourceVersion, status, sourceSchemaVersion) VALUES ('source-release-place', 'dataset-place', 'source-' || 'release-place-address', '2025-09-24.0', 'current', '1.12.0');
UPDATE sourceReleases SET sourceVersion = '2025-09-24.0', sourceSchemaVersion = '1.12.0' WHERE id = 'source-release-place';
INSERT INTO resourceReleases (id, sourceReleaseId, datasetId, processingRules, resourceType, status, updatedAt, code) VALUES ('release-place-address', 'source-release-place', 'dataset-place', '{}', 'address', 'current', 1760000000000, 'release-place-address');
INSERT OR IGNORE INTO sourceReleases (id, datasetId, code, sourceVersion, status, sourceSchemaVersion) VALUES ('source-release-place', 'dataset-place', 'source-' || 'release-place-anchor', '2025-09-24.0', 'current', '1.12.0');
UPDATE sourceReleases SET sourceVersion = '2025-09-24.0', sourceSchemaVersion = '1.12.0' WHERE id = 'source-release-place';
INSERT INTO resourceReleases (id, sourceReleaseId, datasetId, processingRules, resourceType, status, updatedAt, code) VALUES ('release-place-anchor', 'source-release-place', 'dataset-place', null, 'place', 'current', 1760000000000, 'release-place-anchor');

      INSERT INTO snapshotResourceReleases (
        snapshotId, datasetId, resourceReleaseId, anchorReleaseId, role
      ) VALUES
        ('snapshot-address', 'dataset-address', 'release-address', null, 'primary'),
        ('snapshot-place-address', 'dataset-place', 'release-place-address', 'release-place-anchor', 'primary'),
        ('snapshot-division', 'dataset-division', 'release-division', null, 'primary');

      INSERT INTO apiReleaseSetSnapshots (
        apiReleaseSetId, snapshotId, variant, role, isRequired,
        cohortMatchingMode, createdAt
      ) VALUES
        ('release-set-addresses', 'snapshot-address', 'hkgov-dpo', 'primary', 1, 'exact_ref', 1760000000000),
        ('release-set-addresses', 'snapshot-place-address', 'overture-places', 'supplementary', 1, 'exact_ref', 1760000000000),
        ('release-set-addresses', 'snapshot-division', 'overture', 'lookup', 1, 'exact_ref', 1760000000000);
    `)

    for (const [datasetCode, resourceReleaseId] of [
      ['ds-hk-hkgov-dpo-address', 'release-address'],
      ['ds-hk-overture-division', 'release-division'],
      ['ds-hk-overture-place', 'release-place-anchor'],
    ] as const) {
      const processingRules = initialDatasets.find(
        dataset => dataset.code === datasetCode,
      )?.processingRules
      if (!processingRules) throw new Error(`Missing rules for ${datasetCode}.`)
      sqlite
        .query('UPDATE resourceReleases SET processingRules = ? WHERE id = ?')
        .run(captureFixtureRules(sqlite, processingRules), resourceReleaseId)
    }

    seedSnapshotProcessingPolicies(sqlite)
    await publishReleaseArtefacts(db, {
      lineageStore,
      carriedSnapshots: [],
      currentRelease: null,
      currentReleaseIsCorrected: false,
      dataset: {
        datasetId: 'dataset-address',
        releaseCode: 'release-address',
        resourceReleaseId: 'release-address',
        source: 'hkgov-dpo',
      },
      publishedAt: '2026-09-13T00:00:00.000Z',
      releaseSetId: 'release-set-addresses',
      snapshotId: 'snapshot-address',
      resourceType: 'address',
    })

    const lineageRow = (await getApiFieldLineageForReleaseSet(
      db,
      'release-set-addresses',
      lineageStore,
    ))!
    const lineage = lineageRow.definition
    expect(
      lineage.sourceSchemas
        .map(({ sourceDatasetId, sourceSchemaVersion }) => ({
          sourceDatasetId,
          sourceSchemaVersion,
        }))
        .sort((a, b) => a.sourceDatasetId.localeCompare(b.sourceDatasetId)),
    ).toEqual([
      { sourceDatasetId: 'dataset-address', sourceSchemaVersion: '3.2' },
      { sourceDatasetId: 'dataset-division', sourceSchemaVersion: '1.12.0' },
      { sourceDatasetId: 'dataset-place', sourceSchemaVersion: '1.12.0' },
      { sourceDatasetId: 'dataset-place', sourceSchemaVersion: '1.12.0' },
    ])
    const placeScopes = lineage.sourceSchemas.filter(
      scope => scope.sourceDatasetId === 'dataset-place',
    )
    expect(new Set(placeScopes.map(scope => scope.scopeId)).size).toBe(2)
    const binding = lineageRow.binding as {
      scopes: Array<{ scopeId: string; resourceReleaseId?: string }>
    }
    expect(
      new Set(
        placeScopes.map(
          scope =>
            binding.scopes.find(pin => pin.scopeId === scope.scopeId)
              ?.resourceReleaseId,
        ),
      ).size,
    ).toBe(2)
    expect(lineage.fields.length).toBeGreaterThan(0)
    expect(
      lineage.definitions[
        computeVersionHash(
          initialDatasets.find(dataset => dataset.code === 'ds-hk-overture-place')
            ?.processingRules,
        )
      ],
    ).toBeDefined()
    expect(
      lineage.fields.every(field => field.provenance.composition!.length > 0),
    ).toBe(true)

    sqlite.close()
  })

  test('replaces an existing release-set snapshot for the same resource type and variant', async () => {
    const { sqlite, db } = createPublishReleaseArtefactsDb()

    sqlite.exec(`
      INSERT INTO publishers (id, code) VALUES ('publisher-overture', 'overture');

      INSERT INTO datasets (id, publisherId, code) VALUES
        ('dataset-overture-division', 'publisher-overture', 'ds-hk-overture-division');

      INSERT INTO apiVersions (id, code) VALUES
        ('api-version-1', 'api-divisions-v0.1');

      INSERT INTO snapshots (id, parentSnapshotId, code, status, publishedAt, validFrom, validTo, updatedAt) VALUES
        ('snapshot-curated', null, 'ss-hk-division-2026-05-20.0', 'draft', null, null, null, 1760000000000),
        ('snapshot-new', 'snapshot-curated', 'ss-hk-division-2026-06-17.0', 'draft', null, null, null, 1760000000000);

      INSERT INTO apiReleaseSets (
        id, apiVersionId, regionCode, domainCode, cohortKey, schemaVersion, rulesetVersion, status, publishedAt, validFrom, validTo, updatedAt
      ) VALUES (
        'release-set-previous',
        'api-version-1',
        'hk',
        'geographic',
        '2026-05-20.0',
        'sv-division-v1',
        'rs-division-merge-v1',
        'current',
        '2026-06-01T00:00:00.000Z',
        '2026-06-01T00:00:00.000Z',
        null,
        1760000000000
      ), (
        'release-set-1',
        'api-version-1',
        'hk',
        'geographic',
        '2026-06-17.0',
        'sv-division-v1',
        'rs-division-merge-v1',
        'draft',
        null,
        null,
        null,
        1760000000000
      );

      INSERT INTO sourceReleases (id, status, revokedAt, revocationReason, updatedAt) VALUES
        ('source-release-1', 'staged', null, null, 1760000000000);
      UPDATE sourceReleases SET expectedResourceTypes = '["division"]' WHERE id = 'source-release-1';

      INSERT OR IGNORE INTO sourceReleases (id, datasetId, code, sourceVersion, status, sourceSchemaVersion) VALUES ('source-release-1', 'fixture', 'source-' || 'release-1', '2026-06-17.0', 'staged', '1.17.0');
UPDATE sourceReleases SET sourceVersion = '2026-06-17.0', sourceSchemaVersion = '1.17.0' WHERE id = 'source-release-1';
INSERT INTO resourceReleases (id, sourceReleaseId, status, revokedAt, revocationReason, supersededByResourceReleaseId, updatedAt, datasetId, code, resourceType) VALUES ('release-1', 'source-release-1', 'staged', null, null, null, 1760000000000, 'fixture', 'release-1', 'division');

      INSERT INTO snapshotResourceReleases (snapshotId, datasetId, resourceReleaseId) VALUES
        ('snapshot-curated', 'dataset-overture-division', 'release-1'),
        ('snapshot-new', 'dataset-overture-division', 'release-1');

      INSERT INTO apiReleaseSetSnapshots (
        apiReleaseSetId, snapshotId, variant, role, isRequired, cohortMatchingMode, createdAt
      ) VALUES (
        'release-set-1',
        'snapshot-curated',
        'overture',
        'supporting',
        1,
        'carry_forward_optional',
        1760000000000
      );
    `)
    seedCompleteOvertureFixtureSources(sqlite, 'snapshot-new')
    sqlite.run(
      "UPDATE resourceReleases SET resourceType = 'division' WHERE id = 'release-1'",
    )

    seedSnapshotProcessingPolicies(sqlite)
    const publicationArgs: Parameters<typeof publishReleaseArtefacts>[1] = {
      lineageStore,
      carriedSnapshots: [],
      currentRelease: null,
      currentReleaseIsCorrected: false,
      dataset: {
        datasetId: 'dataset-1',
        releaseCode: 'release-code-1',
        resourceReleaseId: 'release-1',
        source: 'overture',
      },
      publishedAt: '2026-06-29T00:00:00.000Z',
      releaseSetId: 'release-set-1',
      snapshotId: 'snapshot-new',
      resourceType: 'division',
    }
    const beforeSnapshots = sqlite.query('SELECT * FROM snapshots ORDER BY id').all()
    await expect(
      publishReleaseArtefacts(db, {
        ...publicationArgs,
        lineageStore: {
          get: async () => null,
          put: async () => {
            throw new Error('R2 unavailable')
          },
        },
      }),
    ).rejects.toThrow('R2 unavailable')
    expect(sqlite.query('SELECT * FROM apiFieldProvenance').all()).toEqual([])
    expect(sqlite.query('SELECT * FROM fieldLineageDefinitions').all()).toEqual([])
    expect(sqlite.query('SELECT * FROM snapshots ORDER BY id').all()).toEqual(
      beforeSnapshots,
    )
    const catalogRevision = await publishReleaseArtefacts(db, publicationArgs)

    expect(catalogRevision).toMatchObject({
      code: 'catalog-hk-divisions-v0.1-2026-06-29.0',
      publicationDate: '2026-06-29',
      revision: 0,
    })
    expect(
      sqlite
        .query(
          'SELECT status, validTo FROM apiVersionReleaseSets WHERE apiReleaseSetId = ?',
        )
        .get('release-set-previous'),
    ).toEqual({
      status: 'archived',
      validTo: '2026-06-29T00:00:00.000Z',
    })
    expect(
      sqlite
        .query('SELECT status FROM sourceReleases WHERE id = ?')
        .get('source-release-1'),
    ).toEqual({ status: 'current' })
    expect(
      sqlite
        .query(
          "SELECT id, status FROM snapshots WHERE resourceType='division' ORDER BY id",
        )
        .all(),
    ).toEqual([
      { id: 'snapshot-curated', status: 'published' },
      { id: 'snapshot-new', status: 'published' },
    ])
    if (!catalogRevision) throw new Error('Expected a published catalogue revision.')
    expect(
      sqlite
        .query(
          `SELECT domainCode, cohortKey, isDefault
           FROM apiCatalogRevisionReleaseSets
           WHERE apiCatalogRevisionId = ?`,
        )
        .all(catalogRevision.id),
    ).toEqual([
      {
        domainCode: 'geographic',
        cohortKey: '2026-05-20.0',
        isDefault: 0,
      },
      {
        domainCode: 'geographic',
        cohortKey: '2026-06-17.0',
        isDefault: 1,
      },
    ])
    await expect(
      resolveApiReleaseSetForRequest(db, 'division', {
        domainCode: 'geographic',
        knownAt: '2026-06-29T00:00:00.000Z',
        regionCode: 'hk',
      }),
    ).resolves.toMatchObject({
      apiCatalogRevision: catalogRevision.code,
      code: 'data-hk-divisions-2026-05-20.0',
      cohortKey: '2026-06-17.0',
    })
    await expect(
      resolveApiReleaseSetForRequest(db, 'division', {
        domainCode: 'geographic',
        knownAt: '2026-06-28T23:59:59.999Z',
        regionCode: 'hk',
      }),
    ).resolves.toBeNull()

    const linkedSnapshotIds = sqlite
      .query(
        'SELECT snapshotId FROM apiReleaseSetSnapshots WHERE apiReleaseSetId = ? ORDER BY snapshotId',
      )
      .all('release-set-1') as Array<{ snapshotId: string }>

    expect(linkedSnapshotIds).toEqual([
      { snapshotId: 'snapshot-new' },
      { snapshotId: 'snapshot-new-divisionArea' },
      { snapshotId: 'snapshot-new-divisionBoundary' },
      { snapshotId: 'snapshot-new-divisionStatistic' },
    ])

    const mapping = await getApiFieldLineageForReleaseSet(
      db,
      'release-set-1',
      lineageStore,
    )
    expect(
      mapping?.definition.nodes.some(
        node =>
          node.stage === 'ingestion' && node.output.path === 'properties.names.primary',
      ),
    ).toBe(true)
    const provenanceRows = (
      await listApiFieldProvenanceForReleaseSet(db, 'release-set-1', lineageStore)
    ).map(row => ({
      apiField: row.apiField,
      resourceType: row.resourceType,
      inputs: JSON.stringify(row.provenance),
    }))
    expect(provenanceRows.length).toBeGreaterThan(0)
    expect(mapping?.binding?.apiReleaseSetId).toBe('release-set-1')
    const catalogue = await listRegistryApiFields(db as never)
    expect(catalogue[0]).not.toHaveProperty('definition')
    expect(catalogue[0]?.manifestHash).toMatch(/^sha256:/)
    const detail = await getRegistryApiField(db as never, 'release-set-1', lineageStore)
    expect(detail?.definition).toEqual(mapping?.definition)
    await expect(
      getRegistryApiField(db as never, 'release-set-1', {
        get: async () => null,
        put: async () => {},
      }),
    ).rejects.toThrow('Missing provenance object')

    expect(mapping?.definition.resolution.layerOrder).toEqual([
      'baseline',
      'conditional-rule',
      'curation',
      'patch',
    ])

    const journalRows = sqlite
      .query(
        'SELECT resourceReleaseId, relatedResourceReleaseId, snapshotId, apiVersionReleaseSetId, action, statusFrom, statusTo FROM releaseSetLifecycleJournal ORDER BY createdAt',
      )
      .all() as Array<{
      action: string
      apiVersionReleaseSetId: string | null
      relatedResourceReleaseId: string | null
      resourceReleaseId: string
      snapshotId: string | null
      statusFrom: string | null
      statusTo: string | null
    }>

    expect(journalRows).toEqual([
      {
        resourceReleaseId: 'release-1',
        relatedResourceReleaseId: null,
        snapshotId: 'snapshot-new',
        apiVersionReleaseSetId: 'release-set-1-version',
        action: 'published',
        statusFrom: null,
        statusTo: 'current',
      },
    ])

    sqlite.exec(`
      INSERT INTO apiReleaseSets (
        id, apiVersionId, regionCode, domainCode, cohortKey, revision,
        previousRevisionApiReleaseSetId, schemaVersion, rulesetVersion, status,
        publishedAt, validFrom, validTo, updatedAt
      ) VALUES (
        'release-set-2',
        'api-version-1',
        'hk',
        'geographic',
        '2026-06-17.0',
        1,
        'release-set-1',
        'sv-division-v1',
        'rs-division-merge-v1',
        'draft',
        null,
        null,
        null,
        1760000000000
      );
    `)

    seedSnapshotProcessingPolicies(sqlite)
    await publishReleaseArtefacts(db, {
      lineageStore,
      carriedSnapshots: [
        {
          resourceType: 'divisionArea',
          snapshotId: 'snapshot-new-divisionArea',
          variant: 'overture',
        },
        {
          resourceType: 'divisionBoundary',
          snapshotId: 'snapshot-new-divisionBoundary',
          variant: 'overture',
        },
        {
          resourceType: 'divisionStatistic',
          snapshotId: 'snapshot-new-divisionStatistic',
          variant: 'overture',
        },
      ],
      currentRelease: null,
      currentReleaseIsCorrected: false,
      dataset: {
        datasetId: 'dataset-1',
        releaseCode: 'release-code-1',
        resourceReleaseId: 'release-1',
        source: 'overture',
      },
      publishedAt: '2026-06-30T00:00:00.000Z',
      publishApiCatalogRevision: false,
      releaseSetId: 'release-set-2',
      snapshotId: 'snapshot-new',
      resourceType: 'division',
      updateDatasetRelease: false,
    })

    expect(
      sqlite
        .query(
          'SELECT COUNT(*) AS count FROM apiFieldProvenance WHERE apiReleaseSetId = ?',
        )
        .get('release-set-2'),
    ).toEqual({ count: 1 })
    expect(
      sqlite.query('SELECT COUNT(*) AS count FROM fieldLineageDefinitions').get(),
    ).toEqual({ count: 1 })
    expect(
      sortProvenanceRows(
        (
          await listApiFieldProvenanceForReleaseSet(db, 'release-set-2', lineageStore)
        ).map(row => ({
          apiField: row.apiField,
          resourceType: row.resourceType,
          inputs: JSON.stringify(row.provenance),
        })),
      ),
    ).toEqual(sortProvenanceRows(provenanceRows))
  })

  test('does not treat a lookup dependency as a conflicting release-set source schema', async () => {
    const { sqlite, db } = createPublishReleaseArtefactsDb()

    sqlite.exec(`
      INSERT INTO publishers (id, code) VALUES
        ('publisher-overture', 'overture'),
        ('publisher-hkgov-censtatd', 'hkgov-censtatd');

      INSERT INTO datasets (id, publisherId, code) VALUES
        ('dataset-overture-division', 'publisher-overture', 'ds-hk-overture-division'),
        ('dataset-hkgov-censtatd-district', 'publisher-hkgov-censtatd', 'ds-hk-hkgov-censtatd-division-area-district');

      INSERT INTO apiVersions (id, code) VALUES
        ('api-version-1', 'api-divisions-v0.1');

      INSERT INTO snapshots (id, code, status, publishedAt, validFrom, validTo, updatedAt) VALUES
        ('snapshot-overture', 'ss-hk-division-2025-09-24.0', 'draft', null, null, null, 1760000000000),
        ('snapshot-censtatd', 'ss-hk-division-area-hkgov-censtatd-2016', 'draft', null, null, null, 1760000000000);

      INSERT INTO apiReleaseSets (
        id, apiVersionId, regionCode, domainCode, cohortKey, schemaVersion, rulesetVersion, status, publishedAt, validFrom, validTo, updatedAt
      ) VALUES (
        'release-set-1',
        'api-version-1',
        'hk',
        'geographic',
        '2025-09-24.0',
        'sv-division-v1',
        'rs-division-merge-v1',
        'draft',
        null,
        null,
        null,
        1760000000000
      );

      INSERT OR IGNORE INTO sourceReleases (id, datasetId, code, sourceVersion, status, sourceSchemaVersion) VALUES (coalesce((SELECT id FROM sourceReleases WHERE datasetId = 'fixture' AND sourceVersion = '2025-09-24.0'), 'source-' || 'release-overture-2025'), 'fixture', 'source-' || 'release-overture-2025', '2025-09-24.0', 'current', '1.12.0');
UPDATE sourceReleases SET sourceVersion = '2025-09-24.0', sourceSchemaVersion = '1.12.0' WHERE id = coalesce((SELECT id FROM sourceReleases WHERE datasetId = 'fixture' AND sourceVersion = '2025-09-24.0'), 'source-' || 'release-overture-2025');
INSERT INTO resourceReleases (id, status, revokedAt, revocationReason, supersededByResourceReleaseId, updatedAt, sourceReleaseId, datasetId, code, resourceType) VALUES ('release-overture-2025', 'current', null, null, null, 1760000000000, coalesce((SELECT id FROM sourceReleases WHERE datasetId = 'fixture' AND sourceVersion = '2025-09-24.0'), 'source-' || 'release-overture-2025'), 'fixture', 'release-overture-2025', 'division');
INSERT OR IGNORE INTO sourceReleases (id, datasetId, code, sourceVersion, status, sourceSchemaVersion) VALUES (coalesce((SELECT id FROM sourceReleases WHERE datasetId = 'fixture' AND sourceVersion = '2026-07-22.0'), 'source-' || 'release-overture-2026'), 'fixture', 'source-' || 'release-overture-2026', '2026-07-22.0', 'current', '1.18.0');
UPDATE sourceReleases SET sourceVersion = '2026-07-22.0', sourceSchemaVersion = '1.18.0' WHERE id = coalesce((SELECT id FROM sourceReleases WHERE datasetId = 'fixture' AND sourceVersion = '2026-07-22.0'), 'source-' || 'release-overture-2026');
INSERT INTO resourceReleases (id, status, revokedAt, revocationReason, supersededByResourceReleaseId, updatedAt, sourceReleaseId, datasetId, code, resourceType) VALUES ('release-overture-2026', 'current', null, null, null, 1760000000000, coalesce((SELECT id FROM sourceReleases WHERE datasetId = 'fixture' AND sourceVersion = '2026-07-22.0'), 'source-' || 'release-overture-2026'), 'fixture', 'release-overture-2026', 'division');
INSERT OR IGNORE INTO sourceReleases (id, datasetId, code, sourceVersion, status, sourceSchemaVersion) VALUES (coalesce((SELECT id FROM sourceReleases WHERE datasetId = 'fixture' AND sourceVersion = '2016'), 'source-' || 'release-censtatd'), 'fixture', 'source-' || 'release-censtatd', '2016', 'staged', '1.0');
UPDATE sourceReleases SET sourceVersion = '2016', sourceSchemaVersion = '1.0' WHERE id = coalesce((SELECT id FROM sourceReleases WHERE datasetId = 'fixture' AND sourceVersion = '2016'), 'source-' || 'release-censtatd');
INSERT INTO resourceReleases (id, status, revokedAt, revocationReason, supersededByResourceReleaseId, updatedAt, sourceReleaseId, datasetId, code, resourceType) VALUES ('release-censtatd', 'staged', null, null, null, 1760000000000, coalesce((SELECT id FROM sourceReleases WHERE datasetId = 'fixture' AND sourceVersion = '2016'), 'source-' || 'release-censtatd'), 'fixture', 'release-censtatd', 'division');

      INSERT INTO snapshotResourceReleases (snapshotId, datasetId, resourceReleaseId, role) VALUES
        ('snapshot-overture', 'dataset-overture-division', 'release-overture-2025', 'primary'),
        ('snapshot-censtatd', 'dataset-hkgov-censtatd-district', 'release-censtatd', 'primary'),
        ('snapshot-censtatd', 'dataset-overture-division', 'release-overture-2026', 'lookup');

      INSERT INTO apiReleaseSetSnapshots (
        apiReleaseSetId, snapshotId, variant, role, isRequired, cohortMatchingMode, createdAt
      ) VALUES (
        'release-set-1',
        'snapshot-overture',
        'overture',
        'primary',
        1,
        'exact_ref',
        1760000000000
      );
    `)

    seedSnapshotProcessingPolicies(sqlite)
    await expect(
      publishReleaseArtefacts(db, {
        lineageStore,
        carriedSnapshots: [],
        currentRelease: null,
        currentReleaseIsCorrected: false,
        dataset: {
          cohortKey: '2016',
          datasetCode: 'ds-hk-hkgov-censtatd-division-area-district',
          datasetId: 'dataset-hkgov-censtatd-district',
          releaseCode: 'release-censtatd',
          resourceReleaseId: 'release-censtatd',
          source: 'hkgov-censtatd',
          sourceVersion: '2016',
        },
        deferApiReleaseSet: true,
        publishedAt: '2026-08-20T00:00:00.000Z',
        releaseSetId: 'release-set-1',
        snapshotId: 'snapshot-censtatd',
        resourceType: 'divisionArea',
        updateDatasetRelease: false,
      }),
    ).resolves.toBeNull()

    expect(
      sqlite
        .query(
          `SELECT role FROM snapshotResourceReleases
           WHERE snapshotId = ? AND resourceReleaseId = ?`,
        )
        .get('snapshot-censtatd', 'release-overture-2026'),
    ).toEqual({ role: 'lookup' })

    sqlite.close()
  })

  test('fails before publishing when a supported api family has no compatible bundled fixture', async () => {
    const { sqlite, db } = createPublishReleaseArtefactsDb()

    sqlite.exec(`
      INSERT INTO publishers (id, code) VALUES ('publisher-overture', 'overture');

      INSERT INTO datasets (id, publisherId, code) VALUES
        ('dataset-overture-division', 'publisher-overture', 'ds-hk-overture-division');

      INSERT INTO apiVersions (id, code) VALUES
        ('api-version-1', 'api-divisions-v0.1');

      INSERT INTO snapshots (id, code, status, publishedAt, validFrom, validTo, updatedAt) VALUES
        ('snapshot-new', 'ss-hk-division-2026-07-15.0', 'draft', null, null, null, 1760000000000);

      INSERT INTO apiReleaseSets (
        id, apiVersionId, schemaVersion, rulesetVersion, status, publishedAt, validFrom, validTo, updatedAt
      ) VALUES (
        'release-set-1',
        'api-version-1',
        'sv-division-v2',
        'rs-division-merge-v1',
        'draft',
        null,
        null,
        null,
        1760000000000
      );

      INSERT OR IGNORE INTO sourceReleases (id, datasetId, code, sourceVersion, status, sourceSchemaVersion) VALUES (coalesce((SELECT id FROM sourceReleases WHERE datasetId = 'fixture' AND sourceVersion = '2026-07-15.0'), 'source-' || 'release-1'), 'fixture', 'source-' || 'release-1', '2026-07-15.0', 'staged', '1.17.0');
UPDATE sourceReleases SET sourceVersion = '2026-07-15.0', sourceSchemaVersion = '1.17.0' WHERE id = coalesce((SELECT id FROM sourceReleases WHERE datasetId = 'fixture' AND sourceVersion = '2026-07-15.0'), 'source-' || 'release-1');
INSERT INTO resourceReleases (id, status, revokedAt, revocationReason, supersededByResourceReleaseId, updatedAt, sourceReleaseId, datasetId, code, resourceType) VALUES ('release-1', 'staged', null, null, null, 1760000000000, coalesce((SELECT id FROM sourceReleases WHERE datasetId = 'fixture' AND sourceVersion = '2026-07-15.0'), 'source-' || 'release-1'), 'fixture', 'release-1', 'division');

      INSERT INTO snapshotResourceReleases (snapshotId, datasetId, resourceReleaseId) VALUES
        ('snapshot-new', 'dataset-overture-division', 'release-1');
    `)

    seedSnapshotProcessingPolicies(sqlite)
    await expect(
      publishReleaseArtefacts(db, {
        lineageStore,
        carriedSnapshots: [],
        currentRelease: null,
        currentReleaseIsCorrected: false,
        dataset: {
          datasetId: 'dataset-1',
          releaseCode: 'release-code-1',
          resourceReleaseId: 'release-1',
          source: 'overture',
        },
        publishedAt: '2026-06-29T00:00:00.000Z',
        releaseSetId: 'release-set-1',
        snapshotId: 'snapshot-new',
        resourceType: 'division',
      }),
    ).rejects.toThrow('Unknown API release schemaVersion: sv-division-v2')

    const snapshotRow = sqlite
      .query('SELECT status, publishedAt FROM snapshots WHERE id = ?')
      .get('snapshot-new') as {
      publishedAt: number | null
      status: string
    }
    const provenanceCount = sqlite
      .query(
        'SELECT COUNT(*) AS count FROM apiFieldProvenance WHERE apiReleaseSetId = ?',
      )
      .get('release-set-1') as { count: number }

    expect(snapshotRow).toEqual({
      publishedAt: null,
      status: 'draft',
    })
    expect(provenanceCount.count).toBe(0)
  })

  test('rejects unknown future overture releases when schema lookup cannot be resolved', async () => {
    const { sqlite, db } = createPublishReleaseArtefactsDb()
    const originalFetch = globalThis.fetch

    sqlite.exec(`
      INSERT INTO publishers (id, code) VALUES ('publisher-overture', 'overture');

      INSERT INTO datasets (id, publisherId, code) VALUES
        ('dataset-overture-division', 'publisher-overture', 'ds-hk-overture-division');

      INSERT INTO apiVersions (id, code) VALUES
        ('api-version-1', 'api-divisions-v0.1');

      INSERT INTO snapshots (id, parentSnapshotId, code, status, publishedAt, validFrom, validTo, updatedAt) VALUES
        ('snapshot-fixture-anchor', null, 'ss-hk-division-2026-05-20.0', 'published', 1760000000000, null, null, 1760000000000),
        ('snapshot-new', 'snapshot-fixture-anchor', 'ss-hk-division-2026-06-24.0', 'draft', null, null, null, 1760000000000);

      INSERT INTO apiReleaseSets (
        id, apiVersionId, schemaVersion, rulesetVersion, status, publishedAt, validFrom, validTo, updatedAt
      ) VALUES (
        'release-set-1',
        'api-version-1',
        'sv-division-v1',
        'rs-division-merge-v1',
        'draft',
        null,
        null,
        null,
        1760000000000
      );

      INSERT OR IGNORE INTO sourceReleases (id, datasetId, code, sourceVersion, status, sourceSchemaVersion) VALUES (coalesce((SELECT id FROM sourceReleases WHERE datasetId = 'fixture' AND sourceVersion = '2026-06-24.0'), 'source-' || 'release-1'), 'fixture', 'source-' || 'release-1', '2026-06-24.0', 'staged', null);
UPDATE sourceReleases SET sourceVersion = '2026-06-24.0', sourceSchemaVersion = null WHERE id = coalesce((SELECT id FROM sourceReleases WHERE datasetId = 'fixture' AND sourceVersion = '2026-06-24.0'), 'source-' || 'release-1');
INSERT INTO resourceReleases (id, status, revokedAt, revocationReason, supersededByResourceReleaseId, updatedAt, sourceReleaseId, datasetId, code, resourceType) VALUES ('release-1', 'staged', null, null, null, 1760000000000, coalesce((SELECT id FROM sourceReleases WHERE datasetId = 'fixture' AND sourceVersion = '2026-06-24.0'), 'source-' || 'release-1'), 'fixture', 'release-1', 'division');

      INSERT INTO snapshotResourceReleases (snapshotId, datasetId, resourceReleaseId) VALUES
        ('snapshot-new', 'dataset-overture-division', 'release-1');
    `)

    globalThis.fetch = (async () =>
      new Response(null, { status: 404 })) as unknown as typeof fetch

    try {
      await expect(
        publishReleaseArtefacts(db, {
          lineageStore,
          carriedSnapshots: [],
          currentRelease: null,
          currentReleaseIsCorrected: false,
          dataset: {
            datasetId: 'dataset-1',
            releaseCode: 'release-code-1',
            resourceReleaseId: 'release-1',
            source: 'overture',
          },
          publishedAt: '2026-06-29T00:00:00.000Z',
          releaseSetId: 'release-set-1',
          snapshotId: 'snapshot-new',
          resourceType: 'division',
        }),
      ).rejects.toThrow(
        'No overture source schema mapping found for sourceVersion=2026-06-24.0.',
      )
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test('uses the Overture catalogue schema version for unmapped releases when available', async () => {
    const { sqlite, db } = createPublishReleaseArtefactsDb()
    const originalFetch = globalThis.fetch

    sqlite.exec(`
      INSERT INTO publishers (id, code) VALUES ('publisher-overture', 'overture');

      INSERT INTO datasets (id, publisherId, code) VALUES
        ('dataset-overture-division', 'publisher-overture', 'ds-hk-overture-division');

      INSERT INTO apiVersions (id, code) VALUES
        ('api-version-1', 'api-divisions-v0.1');

      INSERT INTO snapshots (id, parentSnapshotId, code, status, publishedAt, validFrom, validTo, updatedAt) VALUES
        ('snapshot-fixture-anchor', null, 'ss-hk-division-2026-05-20.0', 'published', 1760000000000, null, null, 1760000000000),
        ('snapshot-new', 'snapshot-fixture-anchor', 'ss-hk-division-2026-06-24.0', 'draft', null, null, null, 1760000000000);

      INSERT INTO apiReleaseSets (
        id, apiVersionId, schemaVersion, rulesetVersion, status, publishedAt, validFrom, validTo, updatedAt
      ) VALUES (
        'release-set-1',
        'api-version-1',
        'sv-division-v1',
        'rs-division-merge-v1',
        'draft',
        null,
        null,
        null,
        1760000000000
      );

      INSERT OR IGNORE INTO sourceReleases (id, datasetId, code, sourceVersion, status, sourceSchemaVersion) VALUES (coalesce((SELECT id FROM sourceReleases WHERE datasetId = 'fixture' AND sourceVersion = '2026-06-24.0'), 'source-' || 'release-1'), 'fixture', 'source-' || 'release-1', '2026-06-24.0', 'staged', null);
UPDATE sourceReleases SET sourceVersion = '2026-06-24.0', sourceSchemaVersion = null WHERE id = coalesce((SELECT id FROM sourceReleases WHERE datasetId = 'fixture' AND sourceVersion = '2026-06-24.0'), 'source-' || 'release-1');
INSERT INTO resourceReleases (id, status, revokedAt, revocationReason, supersededByResourceReleaseId, updatedAt, sourceReleaseId, datasetId, code, resourceType) VALUES ('release-1', 'staged', null, null, null, 1760000000000, coalesce((SELECT id FROM sourceReleases WHERE datasetId = 'fixture' AND sourceVersion = '2026-06-24.0'), 'source-' || 'release-1'), 'fixture', 'release-1', 'division');

      INSERT INTO snapshotResourceReleases (snapshotId, datasetId, resourceReleaseId) VALUES
        ('snapshot-new', 'dataset-overture-division', 'release-1');
    `)

    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ 'schema:version': '1.17.0' }), {
        headers: { 'content-type': 'application/json' },
        status: 200,
      })) as unknown as typeof fetch

    seedCompleteOvertureFixtureSources(sqlite, 'snapshot-new')

    try {
      seedSnapshotProcessingPolicies(sqlite)
      await publishReleaseArtefacts(db, {
        lineageStore,
        carriedSnapshots: [],
        currentRelease: null,
        currentReleaseIsCorrected: false,
        dataset: {
          datasetId: 'dataset-1',
          releaseCode: 'release-code-1',
          resourceReleaseId: 'release-1',
          source: 'overture',
        },
        publishedAt: '2026-06-29T00:00:00.000Z',
        releaseSetId: 'release-set-1',
        snapshotId: 'snapshot-new',
        resourceType: 'division',
      })
    } finally {
      globalThis.fetch = originalFetch
    }

    const provenanceCount = sqlite
      .query(
        'SELECT COUNT(*) AS count FROM apiFieldProvenance WHERE apiReleaseSetId = ?',
      )
      .get('release-set-1') as { count: number }

    expect(provenanceCount.count).toBe(1)
    expect(
      (await listApiFieldProvenanceForReleaseSet(db, 'release-set-1', lineageStore))
        .length,
    ).toBeGreaterThan(20)
  })
})

test('catalogue defaults select the newest numbered edition on the same effective date', () => {
  const member = (cohortKey: string, revision = 0) => ({
    cohortKey,
    revision,
    effectiveFrom: '2026-09-01T00:00:00.000Z',
  })
  expect(
    compareCatalogMembers(member('2026-09-01.7'), member('2026-09-01.6')),
  ).toBeGreaterThan(0)
  expect(
    compareCatalogMembers(member('2026-09-01.10'), member('2026-09-01.9')),
  ).toBeGreaterThan(0)
  expect(
    compareCatalogMembers(member('2026-09-01.7', 1), member('2026-09-01.7')),
  ).toBeGreaterThan(0)
  expect(
    compareCatalogMembers(member('2026-09-01.6'), member('2026-09-01.7')),
  ).toBeLessThan(0)
})
