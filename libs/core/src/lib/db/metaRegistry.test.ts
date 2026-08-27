import { describe, expect, test } from 'bun:test'

import { Database as SQLiteDatabase } from 'bun:sqlite'

import divisionFixtureOverture116To118 from '../../../../../fixtures/meta/apiFields/api-divisions-v0.1@overture-1.16-to-1.18.json'
import { createLocalHarbourDb } from '../../testing/localDb'
import {
  ensureDraftReleaseSetForRelease,
  ensureDraftSnapshotForRelease,
  ensureIngestRunStarted,
  getCurrentReleaseForDatasetId,
  getLatestNewerDatasetRelease,
  getLatestDatasetForRegionSourceDatasetType,
  insertDataset,
  listPublishedSnapshotsForResourceTypeRegionAtOrAfterCohortKey,
  markDatasetCurrent,
  listRegistryReleases,
  listOvertureReleaseSetCohortsAtOrAfterCohortKey,
  listCurrentSnapshotCleanupCandidates,
  publishReleaseArtefacts,
  resolveRegistryReleaseDisplayStatus,
  recordSnapshotAssemblyRun,
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
      familyType TEXT NOT NULL
    );

    CREATE TABLE apiReleaseSets (
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

    CREATE TABLE snapshots (
      id TEXT PRIMARY KEY,
      resourceType TEXT NOT NULL,
      code TEXT NOT NULL,
      cohortKey TEXT NOT NULL,
      status TEXT NOT NULL,
      publishedAt TEXT,
      validFrom TEXT,
      validTo TEXT,
      notes TEXT,
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
      anchorSnapshotId TEXT,
      createdAt TEXT NOT NULL
    );

    CREATE TABLE stats (
      id TEXT PRIMARY KEY,
      apiReleaseSetId TEXT,
      dimension TEXT NOT NULL,
      metric TEXT NOT NULL,
      metricUnit TEXT NOT NULL,
      value REAL NOT NULL,
      groupBy TEXT,
      groupValue TEXT
    );

    CREATE TABLE snapshotSources (
      snapshotId TEXT NOT NULL,
      datasetId TEXT NOT NULL,
      sourceReleaseId TEXT,
      role TEXT NOT NULL
    );

    CREATE TABLE releases (
      id TEXT PRIMARY KEY,
      datasetId TEXT,
      code TEXT,
      sourceVersion TEXT,
      ingestedAt TEXT,
      processingRules TEXT
    );

    CREATE TABLE publishers (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL
    );

    CREATE TABLE datasets (
      id TEXT PRIMARY KEY,
      publisherId TEXT,
      code TEXT NOT NULL,
      subType TEXT
    );

    CREATE TABLE datasetResourceTypes (
      datasetId TEXT NOT NULL,
      resourceType TEXT NOT NULL
    );

    CREATE TABLE datasetI18n (
      datasetId TEXT NOT NULL,
      locale TEXT NOT NULL,
      name TEXT NOT NULL
    );

    CREATE TABLE releaseProcessingActions (
      id TEXT PRIMARY KEY,
      releaseId TEXT NOT NULL,
      action TEXT NOT NULL,
      mode TEXT NOT NULL,
      summary TEXT NOT NULL,
      affectedRecordCount INTEGER NOT NULL,
      evidence TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
  `)

  return {
    sqlite,
    db: createLocalHarbourDb(sqlite),
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

  test('combines actions and bulk rules from the contributing source releases', async () => {
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

      INSERT INTO datasetResourceTypes (datasetId, resourceType) VALUES
        ('dataset-a', 'address'),
        ('dataset-b', 'address'),
        ('dataset-c', 'division');

      INSERT INTO datasetI18n (datasetId, locale, name) VALUES
        ('dataset-a', 'en', 'Hong Kong addresses'),
        ('dataset-a', 'zh-Hant', '香港地址');

      INSERT INTO releases (id, datasetId, code, sourceVersion, ingestedAt, processingRules) VALUES
        ('source-release-a', 'dataset-a', '2026-07-15', '2026-07-15', '2026-07-15T00:00:00.000Z', '{"rulesets":[{"rulesetVersion":"v1","rules":[{"operationCode":"normalise_name","type":"bulk","i18n":[]}]}]}'),
        ('source-release-b', 'dataset-b', '2026-07-15', '2026-07-15', '2026-07-15T00:00:00.000Z', '{"rulesets":[{"rulesetVersion":"v1","rules":[{"operationCode":"normalise_name","type":"bulk","i18n":[]}]}]}'),
        ('source-release-c', 'dataset-c', '2026-07-15', '2026-07-15', '2026-07-15T00:00:00.000Z', null);

      INSERT INTO snapshotSources (snapshotId, datasetId, sourceReleaseId, role) VALUES
        ('snapshot-a', 'dataset-a', 'source-release-a', 'primary'),
        ('snapshot-a', 'dataset-c', 'source-release-c', 'primary'),
        ('snapshot-b', 'dataset-b', 'source-release-b', 'primary');

      INSERT INTO releaseProcessingActions (
        id, releaseId, action, mode, summary, affectedRecordCount, evidence, createdAt, updatedAt
      ) VALUES
        ('action-a', 'source-release-a', 'address_normalised', 'automatic', 'Normalised source A', 5, '{}', '2026-07-15T00:00:00.000Z', '2026-07-15T00:00:00.000Z'),
        ('action-b', 'source-release-b', 'address_normalised', 'automatic', 'Normalised source B', 3, '{}', '2026-07-15T00:00:00.000Z', '2026-07-15T00:00:00.000Z');
    `)

    const [release] = await listRegistryReleases(db as never)
    if (!release) throw new Error('Expected API release to be returned.')

    expect(release.processingActions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'action-a',
          sourceCode: 'hkgov-als',
          sourceReleaseCode: '2026-07-15',
        }),
        expect.objectContaining({
          id: 'action-b',
          sourceCode: 'landsd-addresses',
          sourceReleaseCode: '2026-07-15',
        }),
      ]),
    )
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
      ]),
    )
    expect(release.contributingSources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          publisherCode: 'hkgov-als',
          sourceReleaseCode: '2026-07-15',
          sourceVersion: '2026-07-15',
          subType: null,
          datasetI18n: [
            { datasetId: 'dataset-a', locale: 'en', name: 'Hong Kong addresses' },
            { datasetId: 'dataset-a', locale: 'zh-Hant', name: '香港地址' },
          ],
        }),
        expect.objectContaining({
          publisherCode: 'landsd',
          sourceReleaseCode: '2026-07-15',
          sourceVersion: '2026-07-15',
          subType: null,
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
    db: createLocalHarbourDb(sqlite),
  }
}

function createIngestRunDb() {
  const sqlite = new SQLiteDatabase(':memory:')

  sqlite.exec(`
    CREATE TABLE ingestRuns (
      runId TEXT PRIMARY KEY,
      releaseId TEXT NOT NULL,
      phase TEXT NOT NULL,
      status TEXT NOT NULL,
      stats TEXT,
      error TEXT,
      startedAt TEXT NOT NULL,
      finishedAt TEXT,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL,
      UNIQUE(releaseId, phase)
    );
  `)

  return {
    sqlite,
    db: createLocalHarbourDb(sqlite),
  }
}

function createSnapshotLookupDb() {
  const sqlite = new SQLiteDatabase(':memory:')

  sqlite.exec(`
    CREATE TABLE snapshots (
      id TEXT PRIMARY KEY,
      resourceType TEXT NOT NULL,
      code TEXT NOT NULL,
      status TEXT NOT NULL,
      publishedAt INTEGER,
      createdAt INTEGER NOT NULL
    );
  `)

  return {
    sqlite,
    db: createLocalHarbourDb(sqlite),
  }
}

function createDraftSnapshotDb() {
  const sqlite = new SQLiteDatabase(':memory:')

  sqlite.exec(`
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
      revision INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL,
      publishedAt TEXT,
      validFrom TEXT,
      validTo TEXT,
      notes TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE snapshotSources (
      snapshotId TEXT NOT NULL,
      datasetId TEXT NOT NULL,
      sourceReleaseId TEXT NOT NULL
    );
  `)

  return {
    sqlite,
    db: createLocalHarbourDb(sqlite),
  }
}

function createDraftReleaseSetDb() {
  const sqlite = new SQLiteDatabase(':memory:')

  sqlite.exec(`
    CREATE TABLE apiVersions (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL,
      familyType TEXT NOT NULL
    );

    CREATE TABLE apiComposition (
      id TEXT PRIMARY KEY,
      apiVersionId TEXT NOT NULL,
      code TEXT NOT NULL,
      version INTEGER NOT NULL,
      primaryResourceType TEXT NOT NULL,
      defaultDomainCode TEXT,
      i18n TEXT,
      status TEXT NOT NULL,
      createdAt TEXT NOT NULL
    );

    CREATE TABLE apiCompositionMembers (
      apiCompositionId TEXT NOT NULL,
      domainCode TEXT NOT NULL DEFAULT 'default',
      resourceType TEXT NOT NULL,
      variant TEXT NOT NULL DEFAULT 'default',
      role TEXT NOT NULL,
      isRequired INTEGER NOT NULL,
      cohortMatchingMode TEXT NOT NULL,
      anchorResourceType TEXT,
      maxLagDays INTEGER,
      priority INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (apiCompositionId, domainCode, resourceType, variant)
    );

    CREATE TABLE apiReleaseSets (
      id TEXT PRIMARY KEY,
      apiVersionId TEXT NOT NULL,
      apiCompositionId TEXT,
      code TEXT NOT NULL,
      regionCode TEXT,
      domainCode TEXT NOT NULL DEFAULT 'default',
      cohortKey TEXT,
      revision INTEGER NOT NULL DEFAULT 0,
      effectiveFrom TEXT,
      effectiveTo TEXT,
      supersedesApiReleaseSetId TEXT,
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

    INSERT INTO apiVersions (id, code, familyType) VALUES
      ('api-version-division', 'api-divisions-v0.1', 'division');

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
    db: createLocalHarbourDb(sqlite),
  }
}

function createSnapshotAssemblyRunDb() {
  const sqlite = new SQLiteDatabase(':memory:')

  sqlite.exec(`
    CREATE TABLE snapshotAssembly (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL,
      resourceType TEXT NOT NULL,
      version INTEGER NOT NULL,
      status TEXT NOT NULL,
      createdAt TEXT NOT NULL
    );

    CREATE TABLE snapshotAssemblyRuns (
      id TEXT PRIMARY KEY,
      snapshotId TEXT NOT NULL,
      snapshotAssemblyId TEXT NOT NULL,
      anchorReleaseId TEXT,
      anchorCohortKey TEXT NOT NULL,
      status TEXT NOT NULL,
      selectionSummaryJson TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    INSERT INTO snapshotAssembly (
      id, code, resourceType, version, status, createdAt
    ) VALUES (
      'snapshot-assembly-division-v1',
      'snapshot-assembly-division-v1',
      'division',
      1,
      'current',
      '2026-07-03T00:00:00.000Z'
    );
  `)

  return {
    sqlite,
    db: createLocalHarbourDb(sqlite),
  }
}

function createRegionalSnapshotLookupDb() {
  const sqlite = new SQLiteDatabase(':memory:')

  sqlite.exec(`
    CREATE TABLE publishers (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL
    );

    CREATE TABLE datasets (
      id TEXT PRIMARY KEY,
      publisherId TEXT,
      regionCode TEXT NOT NULL
    );

    CREATE TABLE snapshots (
      id TEXT PRIMARY KEY,
      snapshotLineageId TEXT,
      resourceType TEXT NOT NULL,
      code TEXT NOT NULL,
      status TEXT NOT NULL,
      publishedAt INTEGER,
      createdAt INTEGER NOT NULL
    );

    CREATE TABLE snapshotSources (
      snapshotId TEXT NOT NULL,
      datasetId TEXT NOT NULL,
      sourceReleaseId TEXT NOT NULL,
      role TEXT NOT NULL
    );

    CREATE TABLE snapshotLineages (
      id TEXT PRIMARY KEY,
      variant TEXT NOT NULL
    );
  `)

  return {
    sqlite,
    db: createLocalHarbourDb(sqlite),
  }
}

function createLatestDatasetLookupDb() {
  const sqlite = new SQLiteDatabase(':memory:')

  sqlite.exec(`
    CREATE TABLE publishers (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL
    );

    CREATE TABLE datasets (
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

    CREATE TABLE releases (
      id TEXT PRIMARY KEY,
      sourceReleaseId TEXT,
      datasetId TEXT NOT NULL,
      code TEXT NOT NULL,
      resourceType TEXT NOT NULL,
      sourceVersion TEXT NOT NULL,
      sourceSchemaVersion TEXT,
      publicationDate TEXT,
      cohortKey TEXT NOT NULL,
      rawObjectKey TEXT NOT NULL,
      originalFileName TEXT NOT NULL,
      releaseNotesUrl TEXT,
      notes TEXT,
      processingRules TEXT,
      status TEXT NOT NULL,
      revokedAt INTEGER,
      revocationReason TEXT,
      supersededByReleaseId TEXT,
      ingestedAt TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE sourceReleases (
      id TEXT PRIMARY KEY,
      datasetId TEXT NOT NULL,
      code TEXT NOT NULL,
      sourceVersion TEXT NOT NULL,
      sourceSchemaVersion TEXT,
      publicationDate TEXT,
      cohortKey TEXT,
      rawObjectKey TEXT,
      originalFileName TEXT,
      releaseNotesUrl TEXT,
      notes TEXT,
      status TEXT NOT NULL,
      revokedAt TEXT,
      revocationReason TEXT,
      supersededBySourceReleaseId TEXT,
      processingRules TEXT,
      ingestedAt TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE datasetResourceTypes (
      datasetId TEXT NOT NULL,
      resourceType TEXT NOT NULL,
      PRIMARY KEY (datasetId, resourceType)
    );
  `)

  return {
    sqlite,
    db: createLocalHarbourDb(sqlite),
  }
}

function createCleanupCandidatesDb() {
  const sqlite = new SQLiteDatabase(':memory:')

  sqlite.exec(`
    CREATE TABLE snapshots (
      id TEXT PRIMARY KEY,
      resourceType TEXT NOT NULL,
      status TEXT NOT NULL
    );

    CREATE TABLE apiReleaseSets (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL,
      status TEXT NOT NULL
    );

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
      apiReleaseSetId TEXT NOT NULL,
      isDefault INTEGER NOT NULL
    );
  `)

  return {
    sqlite,
    db: createLocalHarbourDb(sqlite),
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
      id TEXT PRIMARY KEY,
      apiVersionId TEXT NOT NULL,
      code TEXT NOT NULL,
      domainCode TEXT NOT NULL DEFAULT 'default',
      schemaVersion TEXT NOT NULL,
      rulesetVersion TEXT NOT NULL,
      status TEXT NOT NULL,
      publishedAt INTEGER,
      createdAt INTEGER NOT NULL
    );

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
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL
    );

    CREATE TABLE datasets (
      id TEXT PRIMARY KEY,
      publisherId TEXT NOT NULL,
      code TEXT NOT NULL,
      regionCode TEXT NOT NULL
    );

    CREATE TABLE snapshotSources (
      snapshotId TEXT NOT NULL,
      datasetId TEXT NOT NULL,
      sourceReleaseId TEXT NOT NULL,
      role TEXT NOT NULL
    );
  `)

  return {
    sqlite,
    db: createLocalHarbourDb(sqlite),
  }
}

function createPublishReleaseArtefactsDb() {
  const sqlite = new SQLiteDatabase(':memory:')

  sqlite.exec(`
    CREATE TABLE publishers (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL
    );

    CREATE TABLE datasets (
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
      apiCompositionId TEXT NOT NULL,
      domainCode TEXT NOT NULL DEFAULT 'default',
      resourceType TEXT NOT NULL,
      variant TEXT NOT NULL DEFAULT 'default',
      role TEXT NOT NULL,
      isRequired INTEGER NOT NULL,
      cohortMatchingMode TEXT NOT NULL,
      anchorResourceType TEXT,
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
      id TEXT PRIMARY KEY,
      apiVersionId TEXT NOT NULL,
      apiCompositionId TEXT,
      code TEXT NOT NULL DEFAULT 'data-hk-divisions-2026-05-20.0',
      regionCode TEXT DEFAULT 'hk',
      domainCode TEXT NOT NULL DEFAULT 'geographic',
      cohortKey TEXT DEFAULT '2026-05-20.0',
      revision INTEGER NOT NULL DEFAULT 0,
      effectiveFrom INTEGER,
      effectiveTo INTEGER,
      supersedesApiReleaseSetId TEXT,
      schemaVersion TEXT NOT NULL,
      rulesetVersion TEXT NOT NULL,
      status TEXT NOT NULL,
      publishedAt INTEGER,
      validFrom INTEGER,
      validTo INTEGER,
      updatedAt INTEGER NOT NULL
    );

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
      apiReleaseSetId TEXT NOT NULL,
      domainCode TEXT NOT NULL,
      cohortKey TEXT NOT NULL,
      isDefault INTEGER NOT NULL DEFAULT 0,
      createdAt INTEGER NOT NULL,
      PRIMARY KEY (apiCatalogRevisionId, domainCode, cohortKey)
    );

    CREATE TABLE releases (
      id TEXT PRIMARY KEY,
      sourceReleaseId TEXT,
      sourceVersion TEXT,
      sourceSchemaVersion TEXT,
      releaseNotesUrl TEXT,
      notes TEXT,
      status TEXT NOT NULL,
      revokedAt INTEGER,
      revocationReason TEXT,
      supersededByReleaseId TEXT,
      updatedAt INTEGER NOT NULL
    );

    CREATE TABLE sourceReleases (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      revokedAt INTEGER,
      revocationReason TEXT,
      updatedAt INTEGER NOT NULL
    );

    CREATE TABLE snapshotSources (
      snapshotId TEXT NOT NULL,
      datasetId TEXT NOT NULL,
      sourceReleaseId TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'primary'
    );

    CREATE TABLE apiReleaseSetSnapshots (
      apiReleaseSetId TEXT NOT NULL,
      snapshotId TEXT NOT NULL,
      variant TEXT NOT NULL DEFAULT 'default',
      role TEXT NOT NULL,
      isRequired INTEGER NOT NULL,
      cohortMatchingMode TEXT NOT NULL,
      anchorSnapshotId TEXT,
      createdAt INTEGER NOT NULL,
      PRIMARY KEY (apiReleaseSetId, snapshotId, variant)
    );

    CREATE TABLE apiFieldProvenance (
      id TEXT PRIMARY KEY,
      apiReleaseSetId TEXT NOT NULL,
      apiField TEXT NOT NULL,
      variant TEXT,
      sourceDatasetId TEXT NOT NULL,
      sourceFieldPath TEXT NOT NULL,
      resolverCode TEXT NOT NULL,
      contributionType TEXT NOT NULL,
      priority INTEGER NOT NULL,
      confidence REAL,
      versionHash TEXT NOT NULL,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL
    );

    CREATE TABLE publishedDataJournal (
      id TEXT PRIMARY KEY,
      releaseId TEXT NOT NULL,
      relatedReleaseId TEXT,
      snapshotId TEXT,
      apiReleaseSetId TEXT,
      action TEXT NOT NULL,
      statusFrom TEXT,
      statusTo TEXT,
      reason TEXT,
      metadataJson TEXT,
      createdAt TEXT NOT NULL
    );

    INSERT INTO datasets (id, publisherId, code) VALUES
      ('dataset-overture-division-area', 'publisher-overture', 'ds-hk-overture-division-area'),
      ('dataset-overture-division-boundary', 'publisher-overture', 'ds-hk-overture-division-boundary'),
      ('dataset-hkgov-had-district', 'publisher-hkgov-had', 'ds-hk-hkgov-had-division-area-district'),
      ('dataset-hkgov-censtatd-district', 'publisher-hkgov-censtatd', 'ds-hk-hkgov-censtatd-division-area-district'),
      ('dataset-hkgov-censtatd-area-type', 'publisher-hkgov-censtatd', 'ds-hk-hkgov-censtatd-division-statistic-permanent-living-quarters');
  `)

  return {
    sqlite,
    db: createLocalHarbourDb(sqlite),
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

    INSERT OR IGNORE INTO releases (
      id, sourceVersion, sourceSchemaVersion, status, revokedAt,
      revocationReason, supersededByReleaseId, updatedAt
    ) VALUES
      ('release-supporting-area', '2026-06-17.0', '1.17.0', 'published', null, null, null, 1760000000000),
      ('release-supporting-boundary', '2026-06-17.0', '1.17.0', 'published', null, null, null, 1760000000000),
      ('release-supporting-had', '2022', '1.2', 'published', null, null, null, 1760000000000),
      ('release-supporting-censtatd', '2016', '1.0', 'published', null, null, null, 1760000000000),
      ('release-supporting-censtatd-area-type', '2023-H2', '1.0', 'published', null, null, null, 1760000000000);

    INSERT INTO snapshotSources (snapshotId, datasetId, sourceReleaseId) VALUES
      ('${snapshotId}', 'dataset-overture-division-area', 'release-supporting-area'),
      ('${snapshotId}', 'dataset-overture-division-boundary', 'release-supporting-boundary'),
      ('${snapshotId}', 'dataset-hkgov-had-district', 'release-supporting-had'),
      ('${snapshotId}', 'dataset-hkgov-censtatd-district', 'release-supporting-censtatd'),
      ('${snapshotId}', 'dataset-hkgov-censtatd-area-type', 'release-supporting-censtatd-area-type');
  `)
}

function sortProvenanceRows(
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

describe('ensureIngestRunStarted', () => {
  test('does not reopen a completed ingest run', async () => {
    const { sqlite, db } = createIngestRunDb()

    sqlite.exec(`
      INSERT INTO ingestRuns (
        runId, releaseId, phase, status, stats, error, startedAt, finishedAt, createdAt, updatedAt
      ) VALUES (
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

    await ensureIngestRunStarted(
      db as never,
      'release-1',
      'stageDataset',
      '{"rowCount":2}',
      '2026-06-28T00:00:00.000Z',
    )

    const row = sqlite
      .query(
        'SELECT runId, status, stats, startedAt, finishedAt FROM ingestRuns WHERE releaseId = ? AND phase = ?',
      )
      .get('release-1', 'stageDataset') as {
      finishedAt: string | null
      runId: string
      startedAt: string
      stats: string | null
      status: string
    }

    expect(row).toEqual({
      finishedAt: '2026-06-27T00:01:00.000Z',
      runId: 'run-1',
      startedAt: '2026-06-27T00:00:00.000Z',
      stats: '{"rowCount":1}',
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
    ).toEqual({ code: 'sl-ds-hk-overture-division' })

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
    ).toEqual({ code: 'sl-ds-hk-hkgov-pland-division-pu' })

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
        code: 'sl-ds-hk-hkgov-pland-division-pu',
        resourceType: 'division',
      },
      {
        code: 'sl-ds-hk-hkgov-pland-division-pu-division-area',
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
        code: 'sl-ds-hk-hkgov-censtatd-division-area-district-hkgov-censtatd-2016',
        variant: 'hkgov-censtatd:2016',
      },
      {
        code: 'sl-ds-hk-hkgov-censtatd-division-area-district-hkgov-censtatd-2021',
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
        'INSERT INTO snapshotSources (snapshotId, datasetId, sourceReleaseId) VALUES (?, ?, ?)',
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
        'INSERT INTO snapshotSources (snapshotId, datasetId, sourceReleaseId) VALUES (?, ?, ?)',
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
            INNER JOIN snapshotSources ss ON ss.snapshotId = s.id
            WHERE ss.sourceReleaseId = ?
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
      code: 'sl-ds-hk-overture-division',
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
    )
    const secondReleaseSet = await ensureDraftReleaseSetForRelease(
      second.db as never,
      'division',
      {
        cohortKey: '2025-09-24.0',
        regionCode: 'hk',
      },
    )

    expect(firstReleaseSet).toMatchObject({
      id: secondReleaseSet.id,
      code: 'data-hk-division-2025-09-24.0',
    })
    expect(firstReleaseSet.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    )

    first.sqlite.close()
    second.sqlite.close()
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

    const releaseSet = await ensureDraftReleaseSetForRelease(db as never, 'division', {
      cohortKey: '2026-01-21.0',
      regionCode: 'hk',
    })

    expect(releaseSet.code).toBe('data-hk-division-2026-01-21.0')
    sqlite.close()
  })

  test('creates the next immutable revision when an existing cohort is enriched', async () => {
    const { sqlite, db } = createDraftReleaseSetDb()
    const release = { cohortKey: '2025-09-24.0', regionCode: 'hk' as const }
    const first = await ensureDraftReleaseSetForRelease(
      db as never,
      'division',
      release,
    )
    sqlite
      .query(
        `UPDATE apiReleaseSets
         SET code = 'data-hk-division-2025-09-24.0-0',
             status = 'current',
             publishedAt = '2026-07-01T00:00:00.000Z'
         WHERE id = ?`,
      )
      .run(first.id)

    const enriched = await ensureDraftReleaseSetForRelease(
      db as never,
      'division',
      release,
    )
    const row = sqlite
      .query(
        'SELECT revision, supersedesApiReleaseSetId FROM apiReleaseSets WHERE id = ?',
      )
      .get(enriched.id)

    expect(enriched.code).toBe('data-hk-division-2025-09-24.0-r1')
    expect(row).toEqual({
      revision: 1,
      supersedesApiReleaseSetId: first.id,
    })
    sqlite.close()
  })
})

describe('recordSnapshotAssemblyRun', () => {
  test('creates deterministic run ids from snapshot and assembly ids', async () => {
    const first = createSnapshotAssemblyRunDb()
    const second = createSnapshotAssemblyRunDb()

    await recordSnapshotAssemblyRun(first.db as never, {
      anchorCohortKey: '2025-09-24.0',
      anchorReleaseId: 'release-division',
      resourceType: 'division',
      snapshotId: 'snapshot-division',
    })
    await recordSnapshotAssemblyRun(second.db as never, {
      anchorCohortKey: '2025-09-24.0',
      anchorReleaseId: 'release-division',
      resourceType: 'division',
      snapshotId: 'snapshot-division',
    })

    const firstRun = first.sqlite
      .query('SELECT id FROM snapshotAssemblyRuns LIMIT 1')
      .get() as { id: string }
    const secondRun = second.sqlite
      .query('SELECT id FROM snapshotAssemblyRuns LIMIT 1')
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

      INSERT INTO snapshotSources (snapshotId, datasetId, sourceReleaseId, role) VALUES
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
      INSERT INTO publishers (id, code) VALUES ('publisher-pland', 'hkgov-pland');
      INSERT INTO datasets (id, publisherId, code, regionCode, theme, type) VALUES
        ('dataset-pland-pu', 'publisher-pland', 'ds-hk-hkgov-pland-division-pu', 'hk', 'divisions', 'division'),
        ('dataset-pland-new-town', 'publisher-pland', 'ds-hk-hkgov-pland-division-new-town', 'hk', 'divisions', 'division');
      INSERT INTO datasetResourceTypes (datasetId, resourceType) VALUES
        ('dataset-pland-pu', 'division'),
        ('dataset-pland-new-town', 'division');
    `)

    await insertDataset(
      db as never,
      {
        cohortKey: '2001',
        datasetCode: 'ds-hk-hkgov-pland-division-pu',
        originalFileName: 'hkgov-pland-pu-hk-2001-division.parquet',
        releaseCode: 'dr-hk-hkgov-pland-division-pu-2001',
        source: 'hkgov-pland-pu',
        sourceVersion: '2001',
        type: 'division',
      } as never,
      'raw/hkgov-pland-pu/2001/division.parquet',
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
        type: 'division',
      } as never,
      'raw/hkgov-pland-new-town/2006/division.parquet',
      '2026-07-21T00:00:00.000Z',
    )

    expect(
      sqlite
        .query('SELECT datasetId FROM releases WHERE code = ?')
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
      INSERT INTO releases (
        id, datasetId, code, resourceType, sourceVersion, cohortKey, rawObjectKey,
        originalFileName, status, ingestedAt, createdAt, updatedAt
      ) VALUES
        ('release-district-area-2021', 'dataset-district-area', 'dr-hk-hkgov-censtatd-division-area-district-2021', 'divisionArea', '2021', '2021', 'district-area.parquet', 'district-area.parquet', 'published', '2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z'),
        ('release-hma-2021', 'dataset-hma', 'dr-hk-hkgov-censtatd-division-area-housing-market-areas-building-groups-2021-2021', 'divisionArea', '2021', '2021', 'hma.parquet', 'hma.parquet', 'published', '2026-08-02T00:00:00.000Z', '2026-08-02T00:00:00.000Z', '2026-08-02T00:00:00.000Z');
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

      INSERT INTO releases (
        id, datasetId, code, resourceType, sourceVersion, cohortKey, rawObjectKey, originalFileName, status, revokedAt, revocationReason, supersededByReleaseId, ingestedAt, createdAt, updatedAt
      ) VALUES
        (
          'release-10',
          'dataset-division',
          'dr-hk-overture-division-2026-06-17.10',
          'division',
          '2026-06-17.10',
          '2026-06',
          'hk/overture/2026-06-17.10/division.parquet',
          'division.parquet',
          'published',
          null,
          null,
          null,
          '2026-06-18T00:00:00.000Z',
          '2026-06-18T00:00:00.000Z',
          '2026-06-18T00:00:00.000Z'
        ),
        (
          'release-9',
          'dataset-division',
          'dr-hk-overture-division-2026-06-17.9',
          'division',
          '2026-06-17.9',
          '2026-06',
          'hk/overture/2026-06-17.9/division.parquet',
          'division.parquet',
          'published',
          null,
          null,
          null,
          '2026-06-19T00:00:00.000Z',
          '2026-06-19T00:00:00.000Z',
          '2026-06-19T00:00:00.000Z'
        );
    `)

    const result = await getLatestDatasetForRegionSourceDatasetType(
      db as never,
      'hk',
      'overture',
      'ds-hk-overture-division',
      'division',
    )

    expect(result.latestDataset?.releaseId).toBe('release-10')
  })
})

describe('source release lifecycle status', () => {
  test('advances the source release with its resource release', async () => {
    const { sqlite, db } = createLatestDatasetLookupDb()

    sqlite.exec(`
      INSERT INTO publishers (id, code) VALUES ('publisher-pland', 'hkgov-pland');
      INSERT INTO datasets (id, publisherId, code, regionCode, theme, type) VALUES
        ('dataset-pland-pu', 'publisher-pland', 'ds-hk-hkgov-pland-division-pu', 'hk', 'divisions', 'division');
      INSERT INTO datasetResourceTypes (datasetId, resourceType) VALUES
        ('dataset-pland-pu', 'division');
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
        type: 'division',
      } as never,
      'raw/hkgov-pland-pu/2001/division.parquet',
      '2026-07-21T00:00:00.000Z',
    )

    const release = sqlite
      .query('SELECT id FROM releases WHERE code = ?')
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
    ).toEqual({ status: 'published' })

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
      INSERT INTO releases (
        id, datasetId, code, resourceType, sourceVersion, cohortKey, rawObjectKey, originalFileName, status, ingestedAt, createdAt, updatedAt
      ) VALUES
        (
          'release-pland-pu-division-2001',
          'dataset-pland-pu',
          'dr-hk-hkgov-pland-division-pu-2001',
          'division',
          '2001',
          '2001',
          'hk/hkgov-pland-pu/2001/division.parquet',
          'division.parquet',
          'published',
          '2026-07-21T00:00:00.000Z',
          '2026-07-21T00:00:00.000Z',
          '2026-07-21T00:00:00.000Z'
        ),
        (
          'release-pland-pu-area-2001',
          'dataset-pland-pu',
          'dr-hk-hkgov-pland-division-area-pu-2001',
          'divisionArea',
          '2001',
          '2001',
          'hk/hkgov-pland-pu/2001/division-area.parquet',
          'division-area.parquet',
          'published',
          '2026-07-21T00:01:00.000Z',
          '2026-07-21T00:01:00.000Z',
          '2026-07-21T00:01:00.000Z'
        );
    `)

    await expect(
      getCurrentReleaseForDatasetId(db as never, 'dataset-pland-pu', 'division'),
    ).resolves.toMatchObject({ releaseId: 'release-pland-pu-division-2001' })
    await expect(
      getCurrentReleaseForDatasetId(db as never, 'dataset-pland-pu', 'divisionArea'),
    ).resolves.toMatchObject({ releaseId: 'release-pland-pu-area-2001' })

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
      INSERT INTO releases (
        id, datasetId, code, resourceType, sourceVersion, cohortKey, rawObjectKey, originalFileName, status, revokedAt, revocationReason, supersededByReleaseId, ingestedAt, createdAt, updatedAt
      ) VALUES
      (
        'release-dr-hk-overture-division-2025-09-24.0',
        'dataset-overture-hk-division',
        'dr-hk-overture-division-2025-09-24.0',
        'division',
        '2025-09-24.0',
        '2025-09',
        'hk/overture/2025-09-24.0/division.parquet',
        'division.parquet',
        'staged',
        null,
        null,
        null,
        '2026-07-02T07:11:23.000Z',
        '2026-07-02T07:11:23.000Z',
        '2026-07-02T07:11:23.000Z'
      ),
      (
        'release-dr-hk-overture-division-2025-10-22.0',
        'dataset-overture-hk-division',
        'dr-hk-overture-division-2025-10-22.0',
        'division',
        '2025-10-22.0',
        '2025-10',
        'hk/overture/2025-10-22.0/division.parquet',
        'division.parquet',
        'processing',
        null,
        null,
        null,
        '2026-07-02T07:11:30.000Z',
        '2026-07-02T07:11:30.000Z',
        '2026-07-02T07:11:30.000Z'
      ),
      (
        'release-dr-hk-overture-division-2025-11-19.0',
        'dataset-overture-hk-division',
        'dr-hk-overture-division-2025-11-19.0',
        'division',
        '2025-11-19.0',
        '2025-11',
        'hk/overture/2025-11-19.0/division.parquet',
        'division.parquet',
        'failed',
        null,
        null,
        null,
        '2026-07-02T07:11:40.000Z',
        '2026-07-02T07:11:40.000Z',
        '2026-07-02T07:11:40.000Z'
      ),
      (
        'release-dr-hk-overture-division-2025-12-17.0',
        'dataset-overture-hk-division',
        'dr-hk-overture-division-2025-12-17.0',
        'division',
        '2025-12-17.0',
        '2025-12',
        'hk/overture/2025-12-17.0/division.parquet',
        'division.parquet',
        'uploading',
        null,
        null,
        null,
        '2026-07-02T07:11:50.000Z',
        '2026-07-02T07:11:50.000Z',
        '2026-07-02T07:11:50.000Z'
      );
    `)

    const result = await getLatestNewerDatasetRelease(
      db,
      'release-dr-hk-overture-division-2025-09-24.0',
    )

    expect(result?.releaseId).toBe('release-dr-hk-overture-division-2025-10-22.0')
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
        ('snapshot-published-candidate', 'division', 'published');

      INSERT INTO apiReleaseSets (id, code, status) VALUES
        ('release-set-default', 'ss-hk-division-2026-05-20.0', 'published'),
        ('release-set-historical-cohort', 'ss-hk-division-2026-04-20.0', 'published'),
        ('release-set-retained-revision', 'ss-hk-division-2026-03-20.0', 'published'),
        ('release-set-draft', 'ss-hk-division-2026-06-20.0', 'draft');

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
        apiCatalogRevisionId, apiReleaseSetId, isDefault
      ) VALUES
        ('catalog-current', 'release-set-default', 1),
        ('catalog-current', 'release-set-historical-cohort', 0),
        ('catalog-retained', 'release-set-retained-revision', 0);
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
  })
})

describe('resolveActiveSnapshotForType', () => {
  test('keeps active snapshot resolution scoped to the requested region', async () => {
    const { sqlite, db } = createActiveSnapshotLookupDb()

    sqlite.exec(`
      INSERT INTO apiVersions (id, code) VALUES
        ('api-version-place', 'api-places-v0.1');

      INSERT INTO apiReleaseSets (
        id, apiVersionId, code, schemaVersion, rulesetVersion, status, publishedAt, createdAt
      ) VALUES
        (
          'release-set-hk',
          'api-version-place',
          'rs-hk-place-2026-05',
          'sv-place-v1',
          'rs-place-v1',
          'current',
          1760000000000,
          1760000000000
        ),
        (
          'release-set-mo',
          'api-version-place',
          'rs-mo-place-2026-05',
          'sv-place-v1',
          'rs-place-v1',
          'current',
          1760000100000,
          1760000100000
        );

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

      INSERT INTO snapshotSources (snapshotId, datasetId, sourceReleaseId, role) VALUES
        ('snapshot-hk-place', 'dataset-hk-place', 'release-hk-place', 'primary'),
        ('snapshot-mo-place', 'dataset-mo-place', 'release-mo-place', 'primary');
    `)

    await expect(
      resolveActiveSnapshotForType(db as never, 'place', 'place', {
        regionCode: 'hk',
      }),
    ).resolves.toMatchObject({
      snapshotId: 'snapshot-hk-place',
      apiReleaseSet: 'rs-hk-place-2026-05',
    })

    await expect(
      resolveActiveSnapshotForType(db as never, 'place', 'place', {
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
      INSERT INTO snapshotSources (snapshotId, datasetId, sourceReleaseId, role) VALUES
        ('overture-division-2025', 'dataset-overture-division', 'release-overture-division-2025', 'primary');
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
        ('dataset-overture-division-area', 'publisher-overture', 'ds-hk-overture-division-area', 'hk');
      INSERT INTO snapshots (
        id, snapshotLineageId, resourceType, code, cohortKey, status, publishedAt, createdAt
      ) VALUES
        ('overture-division-area-2025', NULL, 'divisionArea', 'ss-hk-division-area-2025-09-24.0', '2025-09-24.0', 'published', 1758672000000, 1758672000000);
      INSERT INTO snapshotSources (snapshotId, datasetId, sourceReleaseId, role) VALUES
        ('overture-division-area-2025', 'dataset-overture-division-area', 'release-overture-division-area-2025', 'primary');
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

      INSERT INTO snapshotSources (snapshotId, datasetId, sourceReleaseId, role) VALUES
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

      INSERT INTO snapshotSources (snapshotId, datasetId, sourceReleaseId, role) VALUES
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

      INSERT INTO snapshotSources (snapshotId, datasetId, sourceReleaseId, role) VALUES
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

      INSERT INTO snapshotSources (snapshotId, datasetId, sourceReleaseId, role) VALUES
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

      INSERT INTO snapshotSources (snapshotId, datasetId, sourceReleaseId, role) VALUES
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
      INSERT INTO snapshotSources (snapshotId, datasetId, sourceReleaseId, role) VALUES
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
      INSERT INTO snapshotSources (snapshotId, datasetId, sourceReleaseId, role) VALUES
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
        id TEXT PRIMARY KEY,
        apiVersionId TEXT NOT NULL,
        regionCode TEXT NOT NULL,
        domainCode TEXT NOT NULL,
        cohortKey TEXT NOT NULL,
        revision INTEGER NOT NULL,
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

      INSERT INTO snapshotSources (snapshotId, datasetId, sourceReleaseId, role) VALUES
        ('snapshot-overture-2025-r0', 'dataset-overture', 'release-overture-2025-r0', 'primary'),
        ('snapshot-overture-2025-r1', 'dataset-overture', 'release-overture-2025-r1', 'primary'),
        ('snapshot-overture-2026', 'dataset-overture', 'release-overture-2026', 'primary'),
        ('snapshot-had', 'dataset-had', 'release-had', 'primary');

      INSERT INTO apiVersions (id, code) VALUES
        ('api-divisions', 'api-divisions-v0.1');

      INSERT INTO apiReleaseSets (
        id, apiVersionId, regionCode, domainCode, cohortKey, revision, status
      ) VALUES
        ('release-set-2025-r0', 'api-divisions', 'hk', 'geographic', '2025-09-24.0', 0, 'archived'),
        ('release-set-2025-r1', 'api-divisions', 'hk', 'geographic', '2025-09-24.0', 1, 'archived'),
        ('release-set-2026', 'api-divisions', 'hk', 'geographic', '2026-06-17.0', 0, 'current'),
        ('release-set-had', 'api-divisions', 'hk', 'geographic', '2026-07-01.0', 0, 'current'),
        ('release-set-draft', 'api-divisions', 'hk', 'geographic', '2026-08-01.0', 0, 'draft');

      INSERT INTO apiReleaseSetSnapshots (apiReleaseSetId, snapshotId, role) VALUES
        ('release-set-2025-r0', 'snapshot-overture-2025-r0', 'primary'),
        ('release-set-2025-r1', 'snapshot-overture-2025-r1', 'primary'),
        ('release-set-2026', 'snapshot-overture-2026', 'primary'),
        ('release-set-had', 'snapshot-had', 'primary'),
        ('release-set-draft', 'snapshot-overture-2026', 'primary');
    `)

    await expect(
      listOvertureReleaseSetCohortsAtOrAfterCohortKey(
        db as never,
        'division',
        'hk',
        '2025-09-24.0',
      ),
    ).resolves.toEqual(['2025-09-24.0', '2026-06-17.0', '2026-08-01.0'])

    sqlite.close()
  })
})

describe('publishReleaseArtefacts', () => {
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

      INSERT INTO releases (
        id, sourceReleaseId, sourceVersion, sourceSchemaVersion, status, revokedAt, revocationReason, supersededByReleaseId, updatedAt
      ) VALUES (
        'release-1',
        'source-release-1',
        '2026-06-17.0',
        '1.17.0',
        'staged',
        null,
        null,
        null,
        1760000000000
      );

      INSERT INTO snapshotSources (snapshotId, datasetId, sourceReleaseId) VALUES
        ('snapshot-curated', 'dataset-overture-division', 'release-1'),
        ('snapshot-new', 'dataset-overture-division', 'release-1');

      INSERT INTO apiReleaseSetSnapshots (
        apiReleaseSetId, snapshotId, variant, role, isRequired, cohortMatchingMode, anchorSnapshotId, createdAt
      ) VALUES (
        'release-set-1',
        'snapshot-curated',
        'overture',
        'supporting',
        1,
        'carry_forward_optional',
        null,
        1760000000000
      );
    `)
    seedCompleteOvertureFixtureSources(sqlite, 'snapshot-new')

    const catalogRevision = await publishReleaseArtefacts(db, {
      carriedSnapshots: [],
      currentRelease: null,
      currentReleaseIsCorrected: false,
      dataset: {
        datasetId: 'dataset-1',
        releaseCode: 'release-code-1',
        releaseId: 'release-1',
        source: 'overture',
      },
      publishedAt: '2026-06-29T00:00:00.000Z',
      releaseSetId: 'release-set-1',
      snapshotId: 'snapshot-new',
      type: 'division',
    })

    expect(catalogRevision).toMatchObject({
      code: 'catalog-hk-divisions-v0.1-2026-06-29.0',
      publicationDate: '2026-06-29',
      revision: 0,
    })
    expect(
      sqlite
        .query('SELECT status, validTo FROM apiReleaseSets WHERE id = ?')
        .get('release-set-previous'),
    ).toEqual({
      status: 'archived',
      validTo: '2026-06-29T00:00:00.000Z',
    })
    expect(
      sqlite
        .query('SELECT status FROM sourceReleases WHERE id = ?')
        .get('source-release-1'),
    ).toEqual({ status: 'published' })
    expect(sqlite.query('SELECT id, status FROM snapshots ORDER BY id').all()).toEqual([
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

    expect(linkedSnapshotIds).toEqual([{ snapshotId: 'snapshot-new' }])

    const provenanceRows = sqlite
      .query(
        'SELECT apiField, sourceFieldPath FROM apiFieldProvenance WHERE apiReleaseSetId = ? ORDER BY apiField',
      )
      .all('release-set-1') as Array<{
      apiField: string
      sourceFieldPath: string
    }>

    expect(sortProvenanceRows(provenanceRows)).toEqual(
      sortProvenanceRows(
        divisionFixtureOverture116To118.fields.map(field => ({
          apiField: field.apiField,
          sourceFieldPath: field.sourceFieldPath,
        })),
      ),
    )

    const journalRows = sqlite
      .query(
        'SELECT releaseId, relatedReleaseId, snapshotId, apiReleaseSetId, action, statusFrom, statusTo FROM publishedDataJournal ORDER BY createdAt',
      )
      .all() as Array<{
      action: string
      apiReleaseSetId: string | null
      relatedReleaseId: string | null
      releaseId: string
      snapshotId: string | null
      statusFrom: string | null
      statusTo: string | null
    }>

    expect(journalRows).toEqual([
      {
        releaseId: 'release-1',
        relatedReleaseId: null,
        snapshotId: 'snapshot-new',
        apiReleaseSetId: 'release-set-1',
        action: 'published',
        statusFrom: null,
        statusTo: 'published',
      },
    ])
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

      INSERT INTO releases (
        id, sourceVersion, sourceSchemaVersion, status, revokedAt, revocationReason, supersededByReleaseId, updatedAt
      ) VALUES
        ('release-overture-2025', '2025-09-24.0', '1.12.0', 'published', null, null, null, 1760000000000),
        ('release-overture-2026', '2026-07-22.0', '1.18.0', 'published', null, null, null, 1760000000000),
        ('release-censtatd', '2016', '1.0', 'staged', null, null, null, 1760000000000);

      INSERT INTO snapshotSources (snapshotId, datasetId, sourceReleaseId, role) VALUES
        ('snapshot-overture', 'dataset-overture-division', 'release-overture-2025', 'primary'),
        ('snapshot-censtatd', 'dataset-hkgov-censtatd-district', 'release-censtatd', 'primary'),
        ('snapshot-censtatd', 'dataset-overture-division', 'release-overture-2026', 'lookup');

      INSERT INTO apiReleaseSetSnapshots (
        apiReleaseSetId, snapshotId, variant, role, isRequired, cohortMatchingMode, anchorSnapshotId, createdAt
      ) VALUES (
        'release-set-1',
        'snapshot-overture',
        'overture',
        'primary',
        1,
        'exact_ref',
        null,
        1760000000000
      );
    `)

    await expect(
      publishReleaseArtefacts(db, {
        carriedSnapshots: [],
        currentRelease: null,
        currentReleaseIsCorrected: false,
        dataset: {
          cohortKey: '2016',
          datasetCode: 'ds-hk-hkgov-censtatd-division-area-district',
          datasetId: 'dataset-hkgov-censtatd-district',
          releaseCode: 'release-censtatd',
          releaseId: 'release-censtatd',
          source: 'hkgov-censtatd',
          sourceVersion: '2016',
        },
        deferApiReleaseSet: true,
        publishedAt: '2026-08-20T00:00:00.000Z',
        releaseSetId: 'release-set-1',
        snapshotId: 'snapshot-censtatd',
        type: 'divisionArea',
        updateDatasetRelease: false,
      }),
    ).resolves.toBeNull()

    expect(
      sqlite
        .query(
          `SELECT role FROM snapshotSources
           WHERE snapshotId = ? AND sourceReleaseId = ?`,
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

      INSERT INTO releases (
        id, sourceVersion, sourceSchemaVersion, status, revokedAt, revocationReason, supersededByReleaseId, updatedAt
      ) VALUES (
        'release-1',
        '2026-07-15.0',
        '1.17.0',
        'staged',
        null,
        null,
        null,
        1760000000000
      );

      INSERT INTO snapshotSources (snapshotId, datasetId, sourceReleaseId) VALUES
        ('snapshot-new', 'dataset-overture-division', 'release-1');
    `)

    await expect(
      publishReleaseArtefacts(db, {
        carriedSnapshots: [],
        currentRelease: null,
        currentReleaseIsCorrected: false,
        dataset: {
          datasetId: 'dataset-1',
          releaseCode: 'release-code-1',
          releaseId: 'release-1',
          source: 'overture',
        },
        publishedAt: '2026-06-29T00:00:00.000Z',
        releaseSetId: 'release-set-1',
        snapshotId: 'snapshot-new',
        type: 'division',
      }),
    ).rejects.toThrow(
      /API field fixture not found\. Lookup:\n\{[\s\S]*"sourceSchemas"[\s\S]*\}/,
    )

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

      INSERT INTO releases (
        id, sourceVersion, sourceSchemaVersion, status, revokedAt, revocationReason, supersededByReleaseId, updatedAt
      ) VALUES (
        'release-1',
        '2026-06-24.0',
        null,
        'staged',
        null,
        null,
        null,
        1760000000000
      );

      INSERT INTO snapshotSources (snapshotId, datasetId, sourceReleaseId) VALUES
        ('snapshot-new', 'dataset-overture-division', 'release-1');
    `)

    globalThis.fetch = (async () =>
      new Response(null, { status: 404 })) as unknown as typeof fetch

    try {
      await expect(
        publishReleaseArtefacts(db, {
          carriedSnapshots: [],
          currentRelease: null,
          currentReleaseIsCorrected: false,
          dataset: {
            datasetId: 'dataset-1',
            releaseCode: 'release-code-1',
            releaseId: 'release-1',
            source: 'overture',
          },
          publishedAt: '2026-06-29T00:00:00.000Z',
          releaseSetId: 'release-set-1',
          snapshotId: 'snapshot-new',
          type: 'division',
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

      INSERT INTO releases (
        id, sourceVersion, sourceSchemaVersion, status, revokedAt, revocationReason, supersededByReleaseId, updatedAt
      ) VALUES (
        'release-1',
        '2026-06-24.0',
        null,
        'staged',
        null,
        null,
        null,
        1760000000000
      );

      INSERT INTO snapshotSources (snapshotId, datasetId, sourceReleaseId) VALUES
        ('snapshot-new', 'dataset-overture-division', 'release-1');
    `)

    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ 'schema:version': '1.17.0' }), {
        headers: { 'content-type': 'application/json' },
        status: 200,
      })) as unknown as typeof fetch

    seedCompleteOvertureFixtureSources(sqlite, 'snapshot-new')

    try {
      await publishReleaseArtefacts(db, {
        carriedSnapshots: [],
        currentRelease: null,
        currentReleaseIsCorrected: false,
        dataset: {
          datasetId: 'dataset-1',
          releaseCode: 'release-code-1',
          releaseId: 'release-1',
          source: 'overture',
        },
        publishedAt: '2026-06-29T00:00:00.000Z',
        releaseSetId: 'release-set-1',
        snapshotId: 'snapshot-new',
        type: 'division',
      })
    } finally {
      globalThis.fetch = originalFetch
    }

    const provenanceCount = sqlite
      .query(
        'SELECT COUNT(*) AS count FROM apiFieldProvenance WHERE apiReleaseSetId = ?',
      )
      .get('release-set-1') as { count: number }

    expect(provenanceCount.count).toBeGreaterThan(20)
  })
})
