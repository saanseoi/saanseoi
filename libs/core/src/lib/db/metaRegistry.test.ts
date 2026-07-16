import { describe, expect, test } from 'bun:test'

import { Database as SQLiteDatabase } from 'bun:sqlite'

import divisionFixture20260520 from '../../../../../fixtures/meta/apiFields/api-divisions-v0.1@ss-hk-division-2026-05-20.0.json'
import { createLocalHarbourDb } from '../../testing/localDb'
import {
  ensureDraftReleaseSetForRelease,
  ensureDraftSnapshotForRelease,
  ensureIngestRunStarted,
  getLatestNewerDatasetRelease,
  getLatestDatasetForRegionSourceType,
  listCurrentSnapshotCleanupCandidates,
  publishReleaseArtifacts,
  recordSnapshotAssemblyRun,
  resolveActiveSnapshotForType,
  resolveLatestPublishedSnapshotForResourceTypeRegionExcludingId,
  resolveLatestSnapshotForResourceTypeExcludingId,
  resolvePublishedSnapshotsForResourceTypeRegionAtOrBeforeCohortKey,
  resolveShardForTypeRegionYear,
} from './metaRegistry'

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
      status TEXT NOT NULL,
      createdAt TEXT NOT NULL
    );

    CREATE TABLE apiReleaseSets (
      id TEXT PRIMARY KEY,
      apiVersionId TEXT NOT NULL,
      code TEXT NOT NULL,
      domainCode TEXT NOT NULL DEFAULT 'default',
      schemaVersion TEXT NOT NULL,
      rulesetVersion TEXT NOT NULL,
      status TEXT NOT NULL,
      publishedAt TEXT,
      validFrom TEXT,
      validTo TEXT,
      notes TEXT,
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
      type TEXT NOT NULL
    );

    CREATE TABLE releases (
      id TEXT PRIMARY KEY,
      datasetId TEXT NOT NULL,
      code TEXT NOT NULL,
      sourceVersion TEXT NOT NULL,
      cohortKey TEXT NOT NULL,
      rawObjectKey TEXT NOT NULL,
      originalFileName TEXT NOT NULL,
      releaseNotesUrl TEXT,
      notes TEXT,
      status TEXT NOT NULL,
      revokedAt INTEGER,
      revocationReason TEXT,
      supersededByReleaseId TEXT,
      ingestedAt TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
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
      code TEXT NOT NULL
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

function createPublishReleaseArtifactsDb() {
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
      code TEXT NOT NULL
    );

    CREATE TABLE snapshots (
      id TEXT PRIMARY KEY,
      resourceType TEXT NOT NULL DEFAULT 'division',
      code TEXT NOT NULL,
      status TEXT NOT NULL,
      publishedAt INTEGER,
      validFrom INTEGER,
      validTo INTEGER,
      updatedAt INTEGER NOT NULL
    );

    CREATE TABLE apiReleaseSets (
      id TEXT PRIMARY KEY,
      apiVersionId TEXT NOT NULL,
      domainCode TEXT NOT NULL DEFAULT 'default',
      schemaVersion TEXT NOT NULL,
      rulesetVersion TEXT NOT NULL,
      status TEXT NOT NULL,
      publishedAt INTEGER,
      validFrom INTEGER,
      validTo INTEGER,
      updatedAt INTEGER NOT NULL
    );

    CREATE TABLE releases (
      id TEXT PRIMARY KEY,
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

    CREATE TABLE snapshotSources (
      snapshotId TEXT NOT NULL,
      datasetId TEXT NOT NULL,
      sourceReleaseId TEXT NOT NULL
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
      ('dataset-overture-division-area', 'publisher-overture', 'ds-hk-overture-divisionArea'),
      ('dataset-overture-division-boundary', 'publisher-overture', 'ds-hk-overture-divisionBoundary'),
      ('dataset-hkgov-had-district', 'publisher-hkgov-had', 'ds-hk-hkgov-had-district');
  `)

  return {
    sqlite,
    db: createLocalHarbourDb(sqlite),
  }
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
        regionCode: 'hk',
      },
    )
    const secondSnapshot = await ensureDraftSnapshotForRelease(
      second.db as never,
      'division',
      {
        cohortKey: '2025-09-24.0',
        regionCode: 'hk',
      },
    )

    expect(firstSnapshot).toMatchObject({
      id: secondSnapshot.id,
      code: 'ss-hk-division-2025-09-24.0',
    })
    expect(firstSnapshot.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    )

    first.sqlite.close()
    second.sqlite.close()
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
      code: 'data-hk-division-2025-09-24.0-0--default',
    })
    expect(firstReleaseSet.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    )

    first.sqlite.close()
    second.sqlite.close()
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

describe('getLatestDatasetForRegionSourceType', () => {
  test('orders dotted source versions numerically instead of lexicographically', async () => {
    const { sqlite, db } = createLatestDatasetLookupDb()

    sqlite.exec(`
      INSERT INTO publishers (id, code) VALUES ('publisher-overture', 'overture');

      INSERT INTO datasets (id, publisherId, code, regionCode, theme, type) VALUES
        ('dataset-division', 'publisher-overture', 'ds-hk-overture-division', 'hk', 'divisions', 'division');

      INSERT INTO releases (
        id, datasetId, code, sourceVersion, cohortKey, rawObjectKey, originalFileName, status, revokedAt, revocationReason, supersededByReleaseId, ingestedAt, createdAt, updatedAt
      ) VALUES
        (
          'release-10',
          'dataset-division',
          'overture-hk-2026-06-17.10-division',
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
          'overture-hk-2026-06-17.9-division',
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

    const result = await getLatestDatasetForRegionSourceType(
      db as never,
      'hk',
      'overture',
      'division',
    )

    expect(result.latestDataset?.releaseId).toBe('release-10')
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
        id, datasetId, code, sourceVersion, cohortKey, rawObjectKey, originalFileName, status, revokedAt, revocationReason, supersededByReleaseId, ingestedAt, createdAt, updatedAt
      ) VALUES
      (
        'release-overture-hk-2025-09-24.0-division',
        'dataset-overture-hk-division',
        'overture-hk-2025-09-24.0-division',
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
        'release-overture-hk-2025-10-22.0-division',
        'dataset-overture-hk-division',
        'overture-hk-2025-10-22.0-division',
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
        'release-overture-hk-2025-11-19.0-division',
        'dataset-overture-hk-division',
        'overture-hk-2025-11-19.0-division',
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
        'release-overture-hk-2025-12-17.0-division',
        'dataset-overture-hk-division',
        'overture-hk-2025-12-17.0-division',
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
      'release-overture-hk-2025-09-24.0-division',
    )

    expect(result?.releaseId).toBe('release-overture-hk-2025-10-22.0-division')
    sqlite.close()
  })
})

describe('listCurrentSnapshotCleanupCandidates', () => {
  test('ignores empty snapshot filters and draft snapshots', async () => {
    const { sqlite, db } = createCleanupCandidatesDb()

    sqlite.exec(`
      INSERT INTO snapshots (id, resourceType, status) VALUES
        ('snapshot-draft', 'division', 'draft'),
        ('snapshot-published-protected', 'division', 'published'),
        ('snapshot-published-candidate', 'division', 'published');

      INSERT INTO apiReleaseSets (id, code, status) VALUES
        ('release-set-current', 'ss-hk-division-2026-05-20.0', 'published');

      INSERT INTO apiReleaseSetSnapshots (apiReleaseSetId, snapshotId) VALUES
        ('release-set-current', 'snapshot-published-protected');
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

      INSERT INTO snapshots (
        id, resourceType, code, cohortKey, status, publishedAt, createdAt
      ) VALUES
        ('overture-area-older', 'divisionArea', 'ss-hk-divisionArea-2025-08-20.0', '2025-08-20.0', 'published', 1755648000000, 1755648000000),
        ('overture-area-current', 'divisionArea', 'ss-hk-divisionArea-2025-09-24.0', '2025-09-24.0', 'published', 1758672000000, 1758672000000),
        ('had-area-2022', 'divisionArea', 'ss-hk-divisionArea-2022', '2022', 'published', 1654041600000, 1654041600000),
        ('had-area-future', 'divisionArea', 'ss-hk-divisionArea-2026', '2026', 'published', 1767225600000, 1767225600000);

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
        code: 'ss-hk-divisionArea-2025-09-24.0',
        cohortKey: '2025-09-24.0',
        resourceType: 'divisionArea',
        status: 'published',
      },
      {
        id: 'had-area-2022',
        code: 'ss-hk-divisionArea-2022',
        cohortKey: '2022',
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
        code: 'ss-hk-divisionArea-2022',
        cohortKey: '2022',
        resourceType: 'divisionArea',
        status: 'published',
      },
    ])

    sqlite.close()
  })
})

describe('publishReleaseArtifacts', () => {
  test('replaces an existing release-set snapshot for the same resource type and variant', async () => {
    const { sqlite, db } = createPublishReleaseArtifactsDb()

    sqlite.exec(`
      INSERT INTO publishers (id, code) VALUES ('publisher-overture', 'overture');

      INSERT INTO datasets (id, publisherId, code) VALUES
        ('dataset-overture-division', 'publisher-overture', 'ds-hk-overture-division');

      INSERT INTO apiVersions (id, code) VALUES
        ('api-version-1', 'api-divisions-v0.1');

      INSERT INTO snapshots (id, code, status, publishedAt, validFrom, validTo, updatedAt) VALUES
        ('snapshot-curated', 'ss-hk-division-2026-05-20.0', 'draft', null, null, null, 1760000000000),
        ('snapshot-new', 'ss-hk-division-2026-06-17.0', 'draft', null, null, null, 1760000000000);

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

    await publishReleaseArtifacts(db, {
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
        divisionFixture20260520.fields.map(field => ({
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

  test('fails before publishing when a supported api family has no compatible bundled fixture', async () => {
    const { sqlite, db } = createPublishReleaseArtifactsDb()

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
      publishReleaseArtifacts(db, {
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
    ).rejects.toThrow('API field fixture not found')

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
    const { sqlite, db } = createPublishReleaseArtifactsDb()
    const originalFetch = globalThis.fetch

    sqlite.exec(`
      INSERT INTO publishers (id, code) VALUES ('publisher-overture', 'overture');

      INSERT INTO datasets (id, publisherId, code) VALUES
        ('dataset-overture-division', 'publisher-overture', 'ds-hk-overture-division');

      INSERT INTO apiVersions (id, code) VALUES
        ('api-version-1', 'api-divisions-v0.1');

      INSERT INTO snapshots (id, code, status, publishedAt, validFrom, validTo, updatedAt) VALUES
        ('snapshot-new', 'ss-hk-division-2026-06-24.0', 'draft', null, null, null, 1760000000000);

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
        publishReleaseArtifacts(db, {
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

  test('uses the overture catalog schema version for unmapped releases when available', async () => {
    const { sqlite, db } = createPublishReleaseArtifactsDb()
    const originalFetch = globalThis.fetch

    sqlite.exec(`
      INSERT INTO publishers (id, code) VALUES ('publisher-overture', 'overture');

      INSERT INTO datasets (id, publisherId, code) VALUES
        ('dataset-overture-division', 'publisher-overture', 'ds-hk-overture-division');

      INSERT INTO apiVersions (id, code) VALUES
        ('api-version-1', 'api-divisions-v0.1');

      INSERT INTO snapshots (id, code, status, publishedAt, validFrom, validTo, updatedAt) VALUES
        ('snapshot-new', 'ss-hk-division-2026-06-24.0', 'draft', null, null, null, 1760000000000);

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

    try {
      await publishReleaseArtifacts(db, {
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
