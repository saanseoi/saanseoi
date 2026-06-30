import { describe, expect, test } from 'bun:test'

import { Database as SQLiteDatabase } from 'bun:sqlite'

import divisionFixture20260520 from '../../../../../fixtures/meta/apiFields/api-divisions-v0.1@ss-hk-division-2026-05-20.0.json'
import { createLocalHarbourDb } from '../../testing/localDb'
import {
  ensureIngestRunStarted,
  getLatestDatasetForRegionSourceType,
  listCurrentSnapshotCleanupCandidates,
  publishReleaseArtifacts,
  resolveLatestSnapshotForResourceTypeExcludingId,
  resolveShardForTypeRegionYear,
} from './metaRepository'

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
      role TEXT NOT NULL,
      isRequired INTEGER NOT NULL,
      selectionMode TEXT NOT NULL,
      anchorSnapshotId TEXT,
      createdAt INTEGER NOT NULL,
      PRIMARY KEY (apiReleaseSetId, snapshotId)
    );

    CREATE TABLE apiFieldProvenance (
      id TEXT PRIMARY KEY,
      apiReleaseSetId TEXT NOT NULL,
      apiField TEXT NOT NULL,
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

describe('publishReleaseArtifacts', () => {
  test('preserves existing release-set snapshot links while adding the published snapshot', async () => {
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
        apiReleaseSetId, snapshotId, role, isRequired, selectionMode, anchorSnapshotId, createdAt
      ) VALUES (
        'release-set-1',
        'snapshot-curated',
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

    expect(linkedSnapshotIds).toEqual([
      { snapshotId: 'snapshot-curated' },
      { snapshotId: 'snapshot-new' },
    ])

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
          },
          publishedAt: '2026-06-29T00:00:00.000Z',
          releaseSetId: 'release-set-1',
          snapshotId: 'snapshot-new',
          type: 'division',
        }),
      ).rejects.toThrow(
        'No Overture source schema mapping found for sourceVersion=2026-06-24.0.',
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
