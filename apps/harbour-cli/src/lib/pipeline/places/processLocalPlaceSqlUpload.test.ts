import { placeDivisionFieldNames } from '@repo/db'
import { Database } from 'bun:sqlite'
import { describe, expect, test } from 'bun:test'
import { normaliseOverturePlace } from '@repo/core/pipeline/services/places/place'
import {
  buildPlaceCountryReviewProcessingActions,
  buildPlaceLocaleConflictProcessingActions,
  buildPlaceReleaseStatsRows,
  buildPlaceSql,
  isExcludedOverturePlace,
} from './processLocalPlaceSqlUpload.ts'

describe('Places SQL materialisation', () => {
  test('builds field statistics against the Place denominator', () => {
    const place = normaliseOverturePlace(
      {
        id: 'stats-place-1',
        geometry: { type: 'Point', coordinates: [114.1694, 22.3193] },
        names: { en: 'Central' },
      },
      '2026-08-19.0',
    )
    if (!place) throw new Error('Expected a normalised place.')

    const rows = buildPlaceReleaseStatsRows([
      {
        place,
        address2dId: null,
        address3dId: null,
        divisionIds: [],
        versionHash: 'version-hash',
        sourcePayloadHash: 'source-hash',
      },
    ])

    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ category: 'records', value: 1 }),
        expect.objectContaining({
          category: 'localisation_coverage',
          dimensionValue: 'name:en',
          value: 100,
          unit: 'percentage',
        }),
        expect.objectContaining({
          category: 'localisation_missing_value_count',
          dimensionValue: 'freeformAddress:zh-hant',
          value: 1,
        }),
      ]),
    )
  })

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

  test('audits locale/script conflicts with the original source value', () => {
    const place = normaliseOverturePlace(
      {
        id: 'place-locale-conflict-1',
        geometry: { type: 'Point', coordinates: [114.1694, 22.3193] },
        names: { language: 'en', value: '香港地點' },
      },
      '2026-08-19.0',
    )
    if (!place) throw new Error('Expected a normalised place.')

    expect(buildPlaceLocaleConflictProcessingActions([place])).toEqual([
      expect.objectContaining({
        action: 'overture_place_locale_conflict',
        evidence: {
          placeId: 'place-locale-conflict-1',
          field: 'name',
          sourceLocale: 'en',
          resolvedLocale: 'zh-hant',
          script: 'han',
          sourceText: '香港地點',
          conflict: true,
          reason: 'Han text was labelled en.',
        },
      }),
    ])
  })

  test('replays source, history, current, and version-change rows in SQLite', async () => {
    const sqlite = new Database(':memory:')
    sqlite.exec(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE overturePlaces (
        sourceRecordId TEXT, properties TEXT, sourceGeometry TEXT, version INTEGER,
        versionHash TEXT, resourceReleaseId TEXT, validFromRelease TEXT, validToRelease TEXT,
        isCurrent INTEGER, createdAt TEXT, updatedAt TEXT,
        PRIMARY KEY (sourceRecordId, versionHash)
      );
      CREATE TABLE places (
        scopeId TEXT, id TEXT, resourceReleaseId TEXT, addressSnapshotId TEXT, addressDependencyHash TEXT,
        address2dId TEXT, address3dId TEXT, address3dUnitId TEXT, address3dMembership TEXT, geometry TEXT, bbox TEXT,
        operatingStatus TEXT, basicCategory TEXT, taxonomyPrimary TEXT,
        taxonomyHierarchy TEXT, taxonomyAlternates TEXT, identifiers TEXT,
        websites TEXT, socials TEXT, emails TEXT, phones TEXT, addresses TEXT,
        confidence REAL, sources TEXT, firstSeenMonth TEXT,
        createdAt TEXT, updatedAt TEXT, PRIMARY KEY (scopeId, id)
      );
      CREATE TABLE placesI18n (
        scopeId TEXT, placeId TEXT, locale TEXT, name TEXT, nameVariant TEXT,
        nameAlts TEXT, brandName TEXT,
        brandNameVariant TEXT, brandNameAlts TEXT, freeformAddress TEXT, accessHint TEXT,
        meta TEXT, searchDependencyText TEXT, createdAt TEXT, updatedAt TEXT
      );
      CREATE TABLE placeDivisionDefinitions(id TEXT PRIMARY KEY,definition TEXT);
      CREATE TABLE placesCells (scopeId TEXT, id TEXT, h3Level INTEGER, h3Cell TEXT);
    `)

    for (const field of [...placeDivisionFieldNames, 'divisionDefinitionSetId'])
      sqlite.exec(`ALTER TABLE places ADD "${field}" TEXT`)
    const history = new Database(':memory:')
    history.exec(`

      CREATE TABLE places (
        id TEXT, resourceReleaseId TEXT, addressSnapshotId TEXT, addressDependencyHash TEXT, address2dId TEXT,
        address3dId TEXT, address3dUnitId TEXT, address3dMembership TEXT, geometry TEXT, bbox TEXT, operatingStatus TEXT,
        basicCategory TEXT, taxonomyPrimary TEXT, taxonomyHierarchy TEXT,
        taxonomyAlternates TEXT, identifiers TEXT, websites TEXT, socials TEXT,
        emails TEXT, phones TEXT, addresses TEXT, confidence REAL,
        sources TEXT, firstSeenMonth TEXT, lastSeenMonth TEXT, versionHash TEXT,
        sourceReleaseId TEXT, snapshotId TEXT, isCurrent INTEGER, createdAt TEXT,
        updatedAt TEXT, PRIMARY KEY (id, snapshotId)
      );
      CREATE TABLE placesI18n (
        placeId TEXT, locale TEXT, name TEXT, nameVariant TEXT, nameAlts TEXT,
        brandName TEXT, brandNameVariant TEXT,
        brandNameAlts TEXT, versionHash TEXT, sourceReleaseId TEXT,
        snapshotId TEXT, isCurrent INTEGER, createdAt TEXT, updatedAt TEXT
        , freeformAddress TEXT, accessHint TEXT, meta TEXT, searchDependencyText TEXT
      );
      ALTER TABLE places ADD operation TEXT DEFAULT 'upsert';
      ALTER TABLE placesI18n ADD operation TEXT DEFAULT 'upsert';
      CREATE VIEW historyEvents AS SELECT snapshotId,'place' AS recordType,id AS recordId,'' AS locale,versionHash,operation,sourceReleaseId FROM places UNION ALL SELECT snapshotId,'placeI18n',placeId,locale,versionHash,operation,sourceReleaseId FROM placesI18n;
    `)

    history.exec(
      'CREATE TABLE placeDivisionDefinitions(id TEXT PRIMARY KEY,definition TEXT)',
    )
    for (const field of [...placeDivisionFieldNames, 'divisionDefinitionSetId'])
      history.exec(`ALTER TABLE places ADD "${field}" TEXT`)

    const result = await buildPlaceSql({
      referenceScopes: new Map([['supplementary-snapshot', 'supplementary-lineage']]),
      activeHistoryBindingName: 'history',
      activeSourceBindingName: 'source',
      sourceBindingNames: ['source'],
      datasetId: 'dataset-place',
      message: {
        datasetCode: 'ds-hk-overture-place',
        datasetId: 'dataset-place',
        rawObjectKey: 'raw/place.parquet',
        releaseCode: 'dr-hk-overture-place-2026-08-19.0',
        resourceReleaseId: 'release-place-2026-08',
        regionCode: 'hk',
        shardYear: '2026',
        cohortKey: '2026-08-19.0',
        source: 'overture',
        sourceVersion: '2026-08-19.0',
        theme: 'places',
        resourceType: 'place',
        processingMode: 'sql',
      },
      snapshots: {
        snapshotLineageId: 'place-lineage',
        addressSnapshotId: 'address-2026',
        divisionSnapshotId: 'division-2026',
        snapshotId: 'place-2026',
      },
      historyRows: [],
      places: [
        {
          effectiveLng: 114.2,
          effectiveLat: 22.4,
          address2dId: 'supplementary-address',
          addressSnapshotId: 'supplementary-snapshot',
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
            identifiers: null,
            websites: null,
            socials: null,
            emails: null,
            phones: null,
            addresses: ['1 Example Road'],
            confidence: 0.9,
            sources: { overture: [{ dataset: 'openstreetmap' }] },
            firstSeenMonth: '2026-08',
            lastSeenMonth: '2026-08',
            i18n: [
              {
                locale: 'en',
                name: 'Example',
                nameVariant: null,
                nameAlts: null,
                brandName: null,
                brandNameVariant: null,
                brandNameAlts: null,
                freeformAddress: '1 Example Road',
                meta: null,
              },
            ],
            localeConflicts: [],
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
    expect(result.changes).toEqual([])

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
      sqlite
        .query(
          "SELECT json_extract(geometry,'$.coordinates[0]') lng,json_extract(geometry,'$.coordinates[1]') lat FROM places",
        )
        .get(),
    ).toEqual({
      lng: 114.2,
      lat: 22.4,
    })
    expect(
      sqlite
        .query('PRAGMA table_info(overturePlaces)')
        .all()
        .map(row => (row as { name: string }).name),
    ).not.toContain('lng')
    expect(
      history
        .query(
          "SELECT json_extract(geometry,'$.coordinates[0]') lng,json_extract(geometry,'$.coordinates[1]') lat FROM places",
        )
        .get(),
    ).toEqual({
      lng: 114.2,
      lat: 22.4,
    })
    for (const db of [sqlite, history]) {
      expect(
        db.query('SELECT addressSnapshotId, address2dId FROM places').get(),
      ).toEqual({
        addressSnapshotId: 'supplementary-snapshot',
        address2dId: 'supplementary-address',
      })
    }
    expect(history.query('SELECT COUNT(*) AS count FROM historyEvents').get()).toEqual({
      count: 2,
    })
    const placeVersionHash = history
      .query("SELECT versionHash FROM places WHERE id = 'place-1'")
      .get() as { versionHash: string }
    const i18nVersionHash = history
      .query("SELECT versionHash FROM placesI18n WHERE placeId = 'place-1'")
      .get() as { versionHash: string }
    expect(
      history
        .query("SELECT versionHash FROM historyEvents WHERE recordType = 'placeI18n'")
        .get(),
    ).toEqual(i18nVersionHash)
    expect(i18nVersionHash.versionHash).not.toBe(placeVersionHash.versionHash)
    expect(sqlite.query('SELECT freeformAddress, meta FROM placesI18n').get()).toEqual({
      freeformAddress: '1 Example Road',
      meta: null,
    })
    expect(
      sqlite.query('SELECT properties, sourceGeometry FROM overturePlaces').get(),
    ).toEqual({
      properties: JSON.stringify({ names: { en: 'Example' } }),
      sourceGeometry: JSON.stringify({
        type: 'Point',
        coordinates: [114.1694, 22.3193],
      }),
    })
    history.close()
    sqlite.close()
  })
})
