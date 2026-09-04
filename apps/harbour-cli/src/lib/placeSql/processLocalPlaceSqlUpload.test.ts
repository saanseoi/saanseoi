import { Database } from 'bun:sqlite'
import { describe, expect, test } from 'bun:test'

import { buildPlaceSql } from './processLocalPlaceSqlUpload.ts'

describe('Places SQL materialisation', () => {
  test('replays source, history, current, and version-change rows in SQLite', async () => {
    const sqlite = new Database(':memory:')
    sqlite.exec(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE overturePlaces (
        sourceRecordId TEXT, sources TEXT, rawProperties TEXT, version INTEGER,
        versionHash TEXT, releaseId TEXT, validFromRelease TEXT, validToRelease TEXT,
        isCurrent INTEGER, createdAt TEXT, updatedAt TEXT, names TEXT, lng REAL, lat REAL,
        bbox TEXT, operatingStatus TEXT, basicCategory TEXT, taxonomyPrimary TEXT,
        taxonomyHierarchy TEXT, taxonomyAlternates TEXT, brandWikidata TEXT,
        brandNames TEXT, websites TEXT, socials TEXT, emails TEXT, phones TEXT,
        addresses TEXT, confidence REAL, PRIMARY KEY (sourceRecordId, versionHash)
      );
      CREATE TABLE places (
        snapshotId TEXT, id TEXT, releaseId TEXT, addressSnapshotId TEXT,
        address2dId TEXT, address3dId TEXT, lng REAL, lat REAL, bbox TEXT,
        operatingStatus TEXT, basicCategory TEXT, taxonomyPrimary TEXT,
        taxonomyHierarchy TEXT, taxonomyAlternates TEXT, brandWikidata TEXT,
        websites TEXT, socials TEXT, emails TEXT, phones TEXT, addresses TEXT,
        confidence REAL, sourceKeys TEXT, sources TEXT, firstSeenMonth TEXT,
        lastSeenMonth TEXT, createdAt TEXT, updatedAt TEXT, PRIMARY KEY (snapshotId, id)
      );
      CREATE TABLE placesI18n (snapshotId TEXT, placeId TEXT, locale TEXT);
      CREATE TABLE placesDivision (placeSnapshotId TEXT, placeId TEXT);
      CREATE TABLE placesCells (snapshotId TEXT, id TEXT, h3Level INTEGER, h3Cell TEXT);
    `)

    const history = new Database(':memory:')
    history.exec(`
      CREATE TABLE places (
        id TEXT, releaseId TEXT, addressSnapshotId TEXT, address2dId TEXT,
        address3dId TEXT, lng REAL, lat REAL, bbox TEXT, operatingStatus TEXT,
        basicCategory TEXT, taxonomyPrimary TEXT, taxonomyHierarchy TEXT,
        taxonomyAlternates TEXT, brandWikidata TEXT, websites TEXT, socials TEXT,
        emails TEXT, phones TEXT, addresses TEXT, confidence REAL, sourceKeys TEXT,
        sources TEXT, firstSeenMonth TEXT, lastSeenMonth TEXT, versionHash TEXT,
        sourceReleaseId TEXT, snapshotId TEXT, isCurrent INTEGER, createdAt TEXT,
        updatedAt TEXT, PRIMARY KEY (id, versionHash)
      );
      CREATE TABLE placesI18n (
        placeId TEXT, locale TEXT, name TEXT, nameVariant TEXT, nameAlts TEXT,
        isLocaleInferred INTEGER, brandName TEXT, brandNameVariant TEXT,
        brandNameAlts TEXT, versionHash TEXT, sourceReleaseId TEXT,
        snapshotId TEXT, isCurrent INTEGER, createdAt TEXT, updatedAt TEXT
      );
      CREATE TABLE snapshotVersionChanges (
        snapshotId TEXT, recordType TEXT, recordId TEXT, locale TEXT,
        versionHash TEXT, operation TEXT, sourceReleaseId TEXT,
        createdAt TEXT, updatedAt TEXT,
        PRIMARY KEY (snapshotId, recordType, recordId, locale)
      );
    `)

    const result = await buildPlaceSql({
      activeHistoryBindingName: 'history',
      activeSourceBindingName: 'source',
      sourceBindingNames: ['source'],
      datasetId: 'dataset-place',
      message: {
        datasetCode: 'ds-hk-overture-place',
        datasetId: 'dataset-place',
        rawObjectKey: 'raw/place.parquet',
        releaseCode: 'dr-hk-overture-place-2026-08-19.0',
        releaseId: 'release-place-2026-08',
        regionCode: 'hk',
        shardYear: '2026',
        cohortKey: '2026-08-19.0',
        source: 'overture',
        sourceVersion: '2026-08-19.0',
        theme: 'places',
        type: 'place',
        processingMode: 'sql',
      },
      snapshots: {
        addressSnapshotId: 'address-2026',
        divisionSnapshotId: 'division-2026',
        snapshotId: 'place-2026',
      },
      historyRows: [],
      places: [
        {
          address2dId: null,
          address3dId: null,
          divisionIds: [],
          sourcePayloadHash: 'source-hash',
          versionHash: 'place-hash',
          place: {
            id: 'place-1',
            lng: 114.1694,
            lat: 22.3193,
            bbox: null,
            operatingStatus: 'open',
            basicCategory: 'restaurant',
            taxonomyPrimary: 'restaurant',
            taxonomyHierarchy: ['food', 'restaurant'],
            taxonomyAlternates: null,
            brandWikidata: null,
            websites: null,
            socials: null,
            emails: null,
            phones: null,
            addresses: null,
            confidence: 0.9,
            sourceKeys: ['openstreetmap'],
            sources: [{ dataset: 'openstreetmap' }],
            firstSeenMonth: '2026-08',
            lastSeenMonth: '2026-08',
            i18n: [],
            raw: {
              id: 'place-1',
              geometry: { type: 'Point', coordinates: [114.1694, 22.3193] },
              names: { en: 'Example' },
            },
          },
        },
      ],
    })

    for (const statements of result.sourceSqlByBinding.values())
      sqlite.exec(statements.join('\n'))
    for (const statements of result.historySqlByBinding.values())
      history.exec(statements.join('\n'))
    sqlite.exec(result.currentSql.join('\n'))
    history.exec(result.changes.join('\n'))

    expect(sqlite.query('SELECT COUNT(*) AS count FROM overturePlaces').get()).toEqual({
      count: 1,
    })
    expect(sqlite.query('SELECT COUNT(*) AS count FROM places').get()).toEqual({
      count: 1,
    })
    expect(history.query('SELECT COUNT(*) AS count FROM places').get()).toEqual({
      count: 1,
    })
    expect(
      history.query('SELECT COUNT(*) AS count FROM snapshotVersionChanges').get(),
    ).toEqual({ count: 1 })
    expect(sqlite.query('SELECT rawProperties FROM overturePlaces').get()).toEqual({
      rawProperties: JSON.stringify({
        id: 'place-1',
        geometry: { type: 'Point', coordinates: [114.1694, 22.3193] },
        names: { en: 'Example' },
      }),
    })
    history.close()
    sqlite.close()
  })
})
