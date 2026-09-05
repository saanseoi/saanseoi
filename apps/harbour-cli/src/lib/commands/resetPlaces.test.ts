import { describe, expect, test } from 'bun:test'

import { Database as SQLiteDatabase } from 'bun:sqlite'
import { createLocalHarbourDb } from '@repo/core/testing/localDb'

import {
  assertPlacesInitialisationComplete,
  collectOwnedPlaces,
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
      status TEXT NOT NULL
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
      );
    INSERT INTO snapshotLineages (
      id, primaryDatasetId, resourceType, variant
    ) VALUES
      ('places-lineage', 'places-dataset', 'place', 'default'),
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
      ('other-draft', 'other-lineage', 'place', 'other-place', 'draft');
    INSERT INTO assets (id, releaseId, assetKey) VALUES
      ('places-asset', 'places-release', 'places.parquet');
  `)

  return { db: createLocalHarbourDb(sqlite), sqlite }
}

describe('Overture Places initialisation ownership', () => {
  test('owns draft snapshots through their dataset lineage before source linkage', async () => {
    const { db, sqlite } = createPlacesOwnershipDb()
    const owned = await collectOwnedPlaces(db)

    expect(owned).toEqual({
      apiReleaseSetIds: [],
      assets: [
        {
          assetKey: 'places.parquet',
          id: 'places-asset',
          releaseId: 'places-release',
        },
      ],
      releaseCodes: ['dr-hk-overture-place-2026-08-19.0'],
      releaseIds: ['places-release'],
      snapshotIds: ['unlinked-draft'],
      sourceReleaseIds: ['places-source-release'],
    })

    sqlite.close()
  })

  test('refuses to complete while a release or snapshot remains unfinished', async () => {
    const { db, sqlite } = createPlacesOwnershipDb()
    const owned = await collectOwnedPlaces(db)

    await expect(assertPlacesInitialisationComplete(db, owned)).rejects.toThrow(
      'Overture Places release dr-hk-overture-place-2026-08-19.0 is staged',
    )

    sqlite.exec("UPDATE releases SET status = 'published';")
    await expect(assertPlacesInitialisationComplete(db, owned)).rejects.toThrow(
      'Overture Places snapshot data-hk-place-2026-08-19.0 is draft',
    )

    sqlite.exec("UPDATE snapshots SET status = 'published';")
    await expect(assertPlacesInitialisationComplete(db, owned)).resolves.toBeUndefined()

    sqlite.close()
  })
})
