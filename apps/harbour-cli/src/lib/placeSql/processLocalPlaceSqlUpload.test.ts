import { Database } from 'bun:sqlite'
import { describe, expect, test } from 'bun:test'

import {
  buildPlaceCountryReviewProcessingActions,
  buildPlaceSql,
  isExcludedOverturePlace,
} from './processLocalPlaceSqlUpload.ts'
import { normaliseOverturePlace } from '@repo/core/pipeline/services/place'

describe('Places SQL materialisation', () => {
  test('audits excluded and missing-country Places while retaining null-country Places', () => {
    const place = normaliseOverturePlace(
      {
        id: 'place-cn-1',
        geometry: { type: 'Point', coordinates: [114.1694, 22.3193] },
        names: { en: 'Shenzhen Place' },
        addresses: [
          {
            freeform: '1 Shenzhen Road',
            country: 'CN',
            locality: 'Shenzhen',
          },
        ],
      },
      '2026-08-19.0',
    )
    if (!place) throw new Error('Expected a normalised place.')

    expect(isExcludedOverturePlace(place)).toBe(true)
    expect(buildPlaceCountryReviewProcessingActions([place])).toEqual([
      expect.objectContaining({
        action: 'overture_place_country_review_required',
        affectedRecordCount: 1,
        mode: 'automatic',
        evidence: expect.objectContaining({
          placeId: 'place-cn-1',
          addresses: ['1 Shenzhen Road'],
          country: 'CN',
          disposition: 'excluded',
          reason: 'excluded_country_code',
        }),
      }),
    ])

    const hongKongPlace = normaliseOverturePlace(
      {
        id: 'place-hk-1',
        geometry: { type: 'Point', coordinates: [114.1694, 22.3193] },
        addresses: [{ freeform: '1 Hong Kong Road', country: 'HK' }],
      },
      '2026-08-19.0',
    )
    if (!hongKongPlace) throw new Error('Expected a normalised place.')
    expect(isExcludedOverturePlace(hongKongPlace)).toBe(false)
    expect(buildPlaceCountryReviewProcessingActions([hongKongPlace])).toEqual([])

    const missingCountryPlace = normaliseOverturePlace(
      {
        id: 'place-missing-country-1',
        geometry: { type: 'Point', coordinates: [114.1694, 22.3193] },
        addresses: [{ freeform: '屯赤隧道' }],
      },
      '2026-08-19.0',
    )
    if (!missingCountryPlace) throw new Error('Expected a normalised place.')
    expect(isExcludedOverturePlace(missingCountryPlace)).toBe(false)
    expect(buildPlaceCountryReviewProcessingActions([missingCountryPlace])).toEqual([
      expect.objectContaining({
        action: 'overture_place_country_review_required',
        evidence: expect.objectContaining({
          country: null,
          disposition: 'included',
          reason: 'missing_country_code',
        }),
      }),
    ])
  })

  test('replays source, history, current, and version-change rows in SQLite', async () => {
    const sqlite = new Database(':memory:')
    sqlite.exec(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE overturePlaces (
        sourceRecordId TEXT, sources TEXT, rawProperties TEXT, version INTEGER,
        versionHash TEXT, releaseId TEXT, validFromRelease TEXT, validToRelease TEXT,
        isCurrent INTEGER, createdAt TEXT, updatedAt TEXT, names TEXT, lng REAL, lat REAL,
        bbox TEXT, operatingStatus TEXT, basicCategory TEXT, taxonomyPrimary TEXT,
        taxonomyHierarchy TEXT, taxonomyAlternates TEXT, wikidataId TEXT,
        brandNames TEXT, websites TEXT, socials TEXT, emails TEXT, phones TEXT,
        addresses TEXT, confidence REAL, PRIMARY KEY (sourceRecordId, versionHash)
      );
      CREATE TABLE places (
        snapshotId TEXT, id TEXT, releaseId TEXT, addressSnapshotId TEXT,
        address2dId TEXT, address3dId TEXT, lng REAL, lat REAL, bbox TEXT,
        operatingStatus TEXT, basicCategory TEXT, taxonomyPrimary TEXT,
        taxonomyHierarchy TEXT, taxonomyAlternates TEXT, wikidataId TEXT,
        websites TEXT, socials TEXT, emails TEXT, phones TEXT, addresses TEXT,
        confidence REAL, sources TEXT, firstSeenMonth TEXT,
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
        taxonomyAlternates TEXT, wikidataId TEXT, websites TEXT, socials TEXT,
        emails TEXT, phones TEXT, addresses TEXT, confidence REAL,
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
            wikidataId: null,
            websites: null,
            socials: null,
            emails: null,
            phones: null,
            addresses: ['1 Example Road'],
            confidence: 0.9,
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
