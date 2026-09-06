import { describe, expect, test } from 'bun:test'

import { Database as SQLiteDatabase } from 'bun:sqlite'
import { createLocalHarbourDb } from '@repo/core/testing/localDb'

import {
  assertPlacesInitialisationComplete,
  collectOwnedPlaces,
  failRunningPlacesIngestRuns,
  failPlacesManifest,
  resumePlacesManifest,
} from './resetPlaces.ts'

function createPlacesOwnershipDb() {
  const sqlite = new SQLiteDatabase(':memory:')
  sqlite.exec(`
    CREATE TABLE datasets (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL
    );
    CREATE TABLE releases (
      id TEXT PRIMARY KEY,
      datasetId TEXT NOT NULL,
      sourceReleaseId TEXT NOT NULL,
      resourceType TEXT NOT NULL,
      code TEXT NOT NULL,
      status TEXT NOT NULL,
      updatedAt TEXT NOT NULL DEFAULT '2026-09-06T00:00:00.000Z'
    );
    CREATE TABLE sourceReleases (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
    CREATE TABLE ingestRuns (
      runId TEXT PRIMARY KEY,
      releaseId TEXT NOT NULL,
      phase TEXT NOT NULL,
      status TEXT NOT NULL,
      stats TEXT,
      error TEXT,
      startedAt TEXT NOT NULL,
      finishedAt TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      UNIQUE (releaseId, phase)
    );
    CREATE TABLE snapshotLineages (
      id TEXT PRIMARY KEY,
      primaryDatasetId TEXT,
      resourceType TEXT NOT NULL,
      variant TEXT NOT NULL
    );
    CREATE TABLE snapshots (
      id TEXT PRIMARY KEY,
      snapshotLineageId TEXT,
      resourceType TEXT NOT NULL,
      code TEXT NOT NULL,
      status TEXT NOT NULL
    );
    CREATE TABLE apiReleaseSetSnapshots (
      apiReleaseSetId TEXT NOT NULL,
      snapshotId TEXT NOT NULL
    );
    CREATE TABLE assets (
      id TEXT PRIMARY KEY,
      releaseId TEXT,
      assetKey TEXT NOT NULL
    );

    INSERT INTO datasets (id, code) VALUES
      ('places-dataset', 'ds-hk-overture-place'),
      ('other-dataset', 'ds-hk-other-place');
    INSERT INTO releases (
      id, datasetId, sourceReleaseId, resourceType, code, status
    ) VALUES
      (
        'places-release',
        'places-dataset',
        'places-source-release',
        'place',
        'dr-hk-overture-place-2026-08-19.0',
        'staged'
      ),
      (
        'places-address-release',
        'places-dataset',
        'places-source-release',
        'address',
        'dr-hk-overture-place-address-2026-08-19.0',
        'staged'
      );
    INSERT INTO sourceReleases (id, status, updatedAt) VALUES
      ('places-source-release', 'processing', '2026-09-06T00:00:00.000Z');
    INSERT INTO snapshotLineages (
      id, primaryDatasetId, resourceType, variant
    ) VALUES
      ('places-lineage', 'places-dataset', 'place', 'default'),
      (
        'places-address-lineage',
        'places-dataset',
        'address',
        'overture-places'
      ),
      ('other-lineage', 'other-dataset', 'place', 'default');
    INSERT INTO snapshots (
      id, snapshotLineageId, resourceType, code, status
    ) VALUES
      (
        'unlinked-draft',
        'places-lineage',
        'place',
        'data-hk-place-2026-08-19.0',
        'draft'
      ),
      (
        'address-draft',
        'places-address-lineage',
        'address',
        'data-hk-address-2026-08-19.0--overture-places',
        'draft'
      ),
      ('other-draft', 'other-lineage', 'place', 'other-place', 'draft');
    INSERT INTO assets (id, releaseId, assetKey) VALUES
      ('places-asset', 'places-release', 'places.parquet');
  `)

  return { db: createLocalHarbourDb(sqlite), sqlite }
}

describe('Overture Places initialisation ownership', () => {
  test('records failed runs and resumes them without retaining stale failure state', () => {
    const running = {
      createdAt: '2026-09-06T00:00:00.000Z',
      runId: 'run-1',
      status: 'running' as const,
      target: 'local' as const,
      version: 1 as const,
    }
    const failed = failPlacesManifest(running, '2026-09-06T00:01:00.000Z')
    expect(failed).toMatchObject({
      failedAt: '2026-09-06T00:01:00.000Z',
      status: 'failed',
    })
    expect(resumePlacesManifest(failed)).toEqual(running)
    expect(() =>
      failPlacesManifest({
        ...running,
        completedAt: '2026-09-06T00:02:00.000Z',
        status: 'complete',
      }),
    ).toThrow('cannot be failed')
  })

  test('owns draft snapshots through their dataset lineage before source linkage', async () => {
    const { db, sqlite } = createPlacesOwnershipDb()
    const owned = await collectOwnedPlaces(db)

    expect(owned).toEqual({
      addressReleaseIds: ['places-address-release'],
      addressSnapshotIds: ['address-draft'],
      apiReleaseSetIds: [],
      assets: [
        {
          assetKey: 'places.parquet',
          id: 'places-asset',
          releaseId: 'places-release',
        },
      ],
      placeReleaseIds: ['places-release'],
      placeSnapshotIds: ['unlinked-draft'],
      releaseCodes: [
        'dr-hk-overture-place-2026-08-19.0',
        'dr-hk-overture-place-address-2026-08-19.0',
      ],
      releaseIds: ['places-release', 'places-address-release'],
      snapshotIds: ['unlinked-draft', 'address-draft'],
      sourceReleaseIds: ['places-source-release'],
    })

    sqlite.close()
  })

  test('fails only abandoned Places phases last updated before the manifest failure', async () => {
    const { db, sqlite } = createPlacesOwnershipDb()
    sqlite.exec(`
      INSERT INTO ingestRuns (
        runId, releaseId, phase, status, startedAt, createdAt, updatedAt
      ) VALUES
        (
          'abandoned', 'places-release', 'processDataset', 'running',
          '2026-09-06T00:00:00.000Z', '2026-09-06T00:00:00.000Z',
          '2026-09-06T00:01:00.000Z'
        ),
        (
          'newer', 'places-release', 'extractPlaces', 'running',
          '2026-09-06T00:03:00.000Z', '2026-09-06T00:03:00.000Z',
          '2026-09-06T00:03:00.000Z'
        );
    `)

    expect(await failRunningPlacesIngestRuns(db, '2026-09-06T00:02:00.000Z')).toBe(1)
    expect(
      sqlite
        .query('SELECT status, finishedAt, error FROM ingestRuns WHERE runId = ?')
        .get('abandoned'),
    ).toMatchObject({
      error: expect.stringContaining('interrupted'),
      finishedAt: expect.any(String),
      status: 'error',
    })
    expect(
      sqlite.query('SELECT status FROM releases WHERE id = ?').get('places-release'),
    ).toEqual({ status: 'failed' })
    expect(
      sqlite.query('SELECT status FROM ingestRuns WHERE runId = ?').get('newer'),
    ).toEqual({ status: 'running' })

    sqlite.close()
  })

  test('refuses to complete while a release or snapshot remains unfinished', async () => {
    const { db, sqlite } = createPlacesOwnershipDb()
    const owned = await collectOwnedPlaces(db)

    await expect(assertPlacesInitialisationComplete(db, owned)).rejects.toThrow(
      /Overture Places release .* is staged/,
    )

    sqlite.exec("UPDATE releases SET status = 'published';")
    await expect(assertPlacesInitialisationComplete(db, owned)).rejects.toThrow(
      /Overture Places snapshot .* is draft/,
    )

    sqlite.exec("UPDATE snapshots SET status = 'published';")
    await expect(assertPlacesInitialisationComplete(db, owned)).resolves.toBeUndefined()

    sqlite.close()
  })
})
