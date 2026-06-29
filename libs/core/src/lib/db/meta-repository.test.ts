import { describe, expect, test } from 'bun:test'

import { Database as SQLiteDatabase } from 'bun:sqlite'

import { createLocalHarbourDb } from '../../testing/local-db'
import {
  ensureIngestRunStarted,
  publishReleaseArtifacts,
  resolveLatestSnapshotForResourceTypeExcludingId,
  resolveShardForTypeRegionYear,
} from './meta-repository'

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

function createPublishReleaseArtifactsDb() {
  const sqlite = new SQLiteDatabase(':memory:')

  sqlite.exec(`
    CREATE TABLE snapshots (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      publishedAt INTEGER,
      validFrom INTEGER,
      validTo INTEGER,
      updatedAt INTEGER NOT NULL
    );

    CREATE TABLE apiReleaseSets (
      id TEXT PRIMARY KEY,
      apiVersionId TEXT NOT NULL,
      status TEXT NOT NULL,
      publishedAt INTEGER,
      validFrom INTEGER,
      validTo INTEGER,
      updatedAt INTEGER NOT NULL
    );

    CREATE TABLE releases (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      revokedAt INTEGER,
      revocationReason TEXT,
      supersededByReleaseId TEXT,
      updatedAt INTEGER NOT NULL
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

describe('publishReleaseArtifacts', () => {
  test('preserves existing release-set snapshot links while adding the published snapshot', async () => {
    const { sqlite, db } = createPublishReleaseArtifactsDb()

    sqlite.exec(`
      INSERT INTO snapshots (id, status, publishedAt, validFrom, validTo, updatedAt) VALUES
        ('snapshot-curated', 'draft', null, null, null, 1760000000000),
        ('snapshot-new', 'draft', null, null, null, 1760000000000);

      INSERT INTO apiReleaseSets (
        id, apiVersionId, status, publishedAt, validFrom, validTo, updatedAt
      ) VALUES (
        'release-set-1',
        'api-version-1',
        'draft',
        null,
        null,
        null,
        1760000000000
      );

      INSERT INTO releases (
        id, status, revokedAt, revocationReason, supersededByReleaseId, updatedAt
      ) VALUES (
        'release-1',
        'staged',
        null,
        null,
        null,
        1760000000000
      );

      INSERT INTO apiReleaseSetSnapshots (apiReleaseSetId, snapshotId) VALUES
        ('release-set-1', 'snapshot-curated');
    `)

    await publishReleaseArtifacts(db as never, {
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
  })
})
