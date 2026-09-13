import { describe, expect, test } from 'bun:test'
import { resolve } from 'node:path'

import { Database as SQLiteDatabase } from 'bun:sqlite'
import { createLocalHarbourDb } from '@repo/core/testing/localDb'
import { loadMigrationSql } from '../../../../../libs/core/src/testing/metaFixtures'

import {
  assertPlacesCurrentResetOwnership,
  assertPlacesInitialisationComplete,
  buildPlacesResetSql,
  collectOwnedPlaces,
  failRunningPlacesIngestRuns,
  failPlacesManifest,
  hasCompletedOverturePlacesBaseline,
  recoverFailedPlacesIngestRuns,
  resumePlacesManifest,
} from './resetPlaces.ts'

function createPlacesResetCurrentDb() {
  const sqlite = new SQLiteDatabase(':memory:')
  sqlite.exec(
    loadMigrationSql(resolve(import.meta.dir, '../../../../../libs/db/migrations'), [
      'current',
    ]),
  )
  for (const [scope, snapshot, addressId] of [
    ['places-address-lineage', 'address-draft', 'opa-owned'],
    ['als-lineage', 'als-snapshot', 'official'],
  ] as const) {
    sqlite
      .query(`INSERT INTO addressPublicationState(scopeId,snapshotId,status,publicationToken,preparedAt)
      VALUES(?,?,'current','token','prepared')`)
      .run(scope, snapshot)
    sqlite
      .query('INSERT INTO addressSearchScopes(scopeId,snapshotId) VALUES(?,?)')
      .run(scope, snapshot)
    sqlite
      .query(
        "INSERT INTO address2d(snapshotId,id,divisionSnapshotId) VALUES(?,?,'division')",
      )
      .run(scope, addressId)
    sqlite
      .query(
        "INSERT INTO address2dI18n(snapshotId,addressId,locale,formattedAddress) VALUES(?,?,'en','1 TEST ROAD')",
      )
      .run(scope, addressId)
    sqlite
      .query(
        "INSERT INTO address2dBuildingNumberLookup(snapshotId,addressId,buildingNumber,evidence) VALUES(?,?,'1','source_endpoint')",
      )
      .run(scope, addressId)
  }
  for (const [scope, snapshot] of [
    ['places-lineage', 'unlinked-draft'],
    ['unrelated-place-lineage', 'unrelated-place-snapshot'],
  ] as const) {
    sqlite
      .query(`INSERT INTO placePublicationState(scopeId,snapshotId,status,publicationToken,preparedAt)
      VALUES(?,?,'current','token','prepared')`)
      .run(scope, snapshot)
    sqlite
      .query('INSERT INTO placeSearchScopes(scopeId,snapshotId) VALUES(?,?)')
      .run(scope, snapshot)
    sqlite
      .query(`INSERT INTO places(snapshotId,id,releaseId,lng,lat,firstSeenMonth,lastSeenMonth)
      VALUES(?,'place','release',114,22,'2026-09','2026-09')`)
      .run(scope)
    sqlite
      .query(
        "INSERT INTO placesI18n(snapshotId,placeId,locale,name) VALUES(?,'place','en','Test')",
      )
      .run(scope)
    sqlite
      .query(
        "INSERT INTO placesCells(snapshotId,id,h3Level,h3Cell) VALUES(?,'place',5,'cell')",
      )
      .run(scope)
    sqlite
      .query(`INSERT INTO placesDivision(placeSnapshotId,placeId,divisionSnapshotId,divisionId,definition)
      VALUES(?,'place','division-scope','division','{}')`)
      .run(scope)
  }
  return { db: createLocalHarbourDb(sqlite), sqlite }
}

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
  test('resets owned serving scopes and receipts while preserving unrelated current projections', async () => {
    const metadata = createPlacesOwnershipDb()
    const current = createPlacesResetCurrentDb()
    try {
      const owned = await collectOwnedPlaces(metadata.db)
      current.sqlite.exec(buildPlacesResetSql(owned).currentSql)
      for (const table of [
        'address2d',
        'address2dI18n',
        'address2dBuildingNumberLookup',
      ])
        expect(current.sqlite.query(`SELECT snapshotId FROM ${table}`).all()).toEqual([
          { snapshotId: 'als-lineage' },
        ])
      for (const table of ['places', 'placesI18n', 'placesCells'])
        expect(current.sqlite.query(`SELECT snapshotId FROM ${table}`).all()).toEqual([
          { snapshotId: 'unrelated-place-lineage' },
        ])
      expect(
        current.sqlite.query('SELECT placeSnapshotId FROM placesDivision').all(),
      ).toEqual([{ placeSnapshotId: 'unrelated-place-lineage' }])
      for (const table of ['addressPublicationState', 'addressSearchScopes'])
        expect(
          current.sqlite.query(`SELECT scopeId,snapshotId FROM ${table}`).all(),
        ).toEqual([{ scopeId: 'als-lineage', snapshotId: 'als-snapshot' }])
      for (const table of ['placePublicationState', 'placeSearchScopes'])
        expect(
          current.sqlite.query(`SELECT scopeId,snapshotId FROM ${table}`).all(),
        ).toEqual([
          {
            scopeId: 'unrelated-place-lineage',
            snapshotId: 'unrelated-place-snapshot',
          },
        ])
      expect(
        current.sqlite.query('SELECT addressId FROM addressSearchFts').all(),
      ).toEqual([{ addressId: 'official' }])
      expect(current.sqlite.query('SELECT scopeId FROM placeSearchFts').all()).toEqual([
        { scopeId: 'unrelated-place-lineage' },
      ])
    } finally {
      current.sqlite.close()
      metadata.sqlite.close()
    }
  })

  test('checks current scope ownership through exact publication snapshot selections', async () => {
    const { db, sqlite } = createPlacesResetCurrentDb()
    const owned = {
      addressSnapshotIds: [
        'address-draft',
        ...Array.from({ length: 150 }, (_, i) => `retained-${i}`),
      ],
      placeSnapshotIds: ['unlinked-draft', 'unrelated-place-snapshot'],
    }
    try {
      await expect(
        assertPlacesCurrentResetOwnership(db, owned),
      ).resolves.toBeUndefined()
      sqlite.exec(
        "UPDATE addressPublicationState SET snapshotId='unowned-snapshot' WHERE scopeId='places-address-lineage'",
      )
      await expect(assertPlacesCurrentResetOwnership(db, owned)).rejects.toThrow(
        'supplementary Address rows are not owned',
      )
      sqlite.exec(
        "UPDATE addressPublicationState SET snapshotId='address-draft' WHERE scopeId='places-address-lineage'",
      )
      sqlite.exec(
        "UPDATE placePublicationState SET snapshotId='unowned-place-snapshot' WHERE scopeId='places-lineage'",
      )
      await expect(assertPlacesCurrentResetOwnership(db, owned)).rejects.toThrow(
        'current Places rows are not owned',
      )
    } finally {
      sqlite.close()
    }
  })

  test('recognises a fully published retained local baseline without claiming reset ownership', () => {
    expect(
      hasCompletedOverturePlacesBaseline({
        releaseStatuses: ['published', 'superseded'],
        hasCurrentPlaces: true,
        hasPublishedPlaceSnapshot: true,
      }),
    ).toBe(true)
    expect(
      hasCompletedOverturePlacesBaseline({
        releaseStatuses: ['published', 'staged'],
        hasCurrentPlaces: true,
        hasPublishedPlaceSnapshot: true,
      }),
    ).toBe(false)
  })

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

  test('opens interrupted recovery as the retained SQL owner before failing its stale phase', async () => {
    const { db, sqlite } = createPlacesOwnershipDb()
    sqlite.exec(`
      INSERT INTO ingestRuns (
        runId, releaseId, phase, status, startedAt, createdAt, updatedAt
      ) VALUES (
        'abandoned', 'places-release', 'processDataset', 'running',
        '2026-09-06T00:00:00.000Z', '2026-09-06T00:00:00.000Z',
        '2026-09-06T00:01:00.000Z'
      );
    `)
    const events: string[] = []

    await recoverFailedPlacesIngestRuns(
      { environment: 'dev', remote: false },
      {
        createdAt: '2026-09-06T00:00:00.000Z',
        failedAt: '2026-09-06T00:02:00.000Z',
        runId: 'init-run',
        status: 'failed',
        target: 'local',
        version: 1,
      },
      {
        resolveSqlDeliveryOwner: async () => {
          events.push('resolve owner')
          return 'places-release'
        },
        resolveContext: (async (_target, _regionCode, _shardYear, options) => {
          events.push(`open as ${options.resumeSqlDeliveryReleaseId}`)
          return { cleanup() {}, metaDb: db }
        }) as never,
      },
    )

    expect(events).toEqual(['resolve owner', 'open as places-release'])
    expect(
      sqlite.query('SELECT status FROM ingestRuns WHERE runId = ?').get('abandoned'),
    ).toEqual({ status: 'error' })
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
