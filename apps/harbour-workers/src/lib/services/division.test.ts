import { afterEach, describe, expect, mock, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { Database } from 'bun:sqlite'

import { createLocalHarbourDb } from '../../../../../libs/core/src/testing/local-db'

const migrationSql = await Bun.file(
  resolve(
    import.meta.dir,
    '../../../../../libs/db/migrations/20260602105608_ordinary_true_believers.sql',
  ),
).text()

const baseParquetBatches: Array<Array<Record<string, unknown>>> = [
  [
    {
      id: 'division-hk-island',
      subtype: 'region',
      class: 'region',
      version: 101,
      wikidata: 'Q123',
      parent_division_id: null,
      bbox: { minX: 1, minY: 2, maxX: 3, maxY: 4 },
      cartography: { kind: 'admin' },
      hierarchies: [{ ids: ['division-hk-island'] }],
      sources: [{ dataset: 'overture' }],
      names: {
        common: {
          en: 'Hong Kong Island',
          'zh-hk': '香港島',
        },
      },
      local_type: {
        en: 'region',
        'zh-hk': '地區',
      },
    },
    {
      id: 'division-central',
      subtype: 'district',
      class: 'district',
      version: 102,
      wikidata: 'Q456',
      parent_division_id: 'division-hk-island',
      bbox: { minX: 5, minY: 6, maxX: 7, maxY: 8 },
      cartography: { kind: 'district' },
      hierarchies: [{ ids: ['division-hk-island', 'division-central'] }],
      sources: [{ dataset: 'overture' }],
      names: {
        common: [
          { language: 'en', value: 'Central' },
          { language: 'zh-hk', value: '中環' },
        ],
      },
      local_type: {
        en: 'district',
        'zh-hk': '地區',
      },
    },
  ],
]

let parquetBatches = structuredClone(baseParquetBatches)
const tempDirs: string[] = []

mock.module('../parquetR2', () => ({
  createAsyncBufferFromR2: mock(async () => ({
    byteLength: 1,
    slice: async () => new ArrayBuffer(0),
  })),
  readParquetObjectsInBatches: mock(async function* () {
    for (const batch of parquetBatches) {
      yield batch
    }
  }),
}))

const { processDivisionDataset } = await import('./division')

function createTempDir() {
  const dir = mkdtempSync(join(tmpdir(), 'division-test-'))
  tempDirs.push(dir)
  return dir
}

function initDb(dbPath: string) {
  const db = new Database(dbPath)
  db.exec(migrationSql.replaceAll('--> statement-breakpoint', ''))
  return db
}

afterEach(() => {
  parquetBatches = structuredClone(baseParquetBatches)

  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()

    if (dir) {
      rmSync(dir, { recursive: true, force: true })
    }
  }
})

describe('processDivisionDataset', () => {
  test('applies division dataset changes to current and versioned tables', async () => {
    const tempDir = createTempDir()
    const dbPath = join(tempDir, 'division.sqlite')
    const sqlite = initDb(dbPath)
    const db = createLocalHarbourDb(sqlite)
    const now = '2026-06-04T00:00:00.000Z'

    sqlite.exec(`
      INSERT INTO datasets (
        datasetId, regionCode, snapshotMonth, theme, type, source, sourceVersion,
        rawObjectKey, originalFileName, status, isActive, supersedesDatasetId, revokedAt,
        revocationReason, ingestedAt
      ) VALUES (
        'overture-hk-2026-04-24.0-division', 'hk', '2026-04', 'divisions', 'division',
        'overture', '2026-04-24.0', 'hk/overture/2026-04-24.0/division.parquet',
        'division.parquet', 'active', 1, null, null, null, '${now}'
      );
    `)

    sqlite.exec(`
      INSERT INTO divisions (
        id, level, otVersion, otSubtype, otAdminLevel, otClass, otWikidata,
        otHierarchyJson, hierarchyJson, parentDivisionId, otCartographyJson, otBboxJson, sourcesJson
      ) VALUES (
        'division-obsolete', 1, '1', 'region', null, 'region', null, null, null, null, null, null, null
      );
    `)

    sqlite.exec(`
      INSERT INTO divisionsVersions (
        id, versionHash, regionCode, datasetId, validFromMonth, validToMonth, isCurrent,
        level, otVersion, otVersionHash, otSubtype, otAdminLevel, otClass, otWikidata,
        otHierarchyJson, hierarchyJson, parentDivisionId, otCartographyJson, otBboxJson,
        sourcesJson, createdAt
      ) VALUES (
        'division-obsolete', 'hash-obsolete', 'hk', 'overture-hk-2026-04-24.0-division',
        '2026-04', null, 1, 1, '1', 'ot-hash-obsolete', 'region', null, 'region', null,
        null, null, null, null, null, null, '${now}'
      );
    `)

    sqlite.exec(`
      INSERT INTO datasets (
        datasetId, regionCode, snapshotMonth, theme, type, source, sourceVersion,
        rawObjectKey, originalFileName, status, isActive, supersedesDatasetId, revokedAt,
        revocationReason, ingestedAt
      ) VALUES (
        'overture-hk-2026-05-24.0-division', 'hk', '2026-05', 'divisions', 'division',
        'overture', '2026-05-24.0', 'hk/overture/2026-05-24.0/division.parquet',
        'division.parquet', 'staged', 0, 'overture-hk-2026-04-24.0-division', null, null, '${now}'
      );
    `)

    const result = await processDivisionDataset(
      db,
      {
        async head() {
          return { size: 1 }
        },
        async get() {
          return {
            async arrayBuffer() {
              return new ArrayBuffer(0)
            },
          }
        },
      },
      {
        datasetId: 'overture-hk-2026-05-24.0-division',
        rawObjectKey: 'hk/overture/2026-05-24.0/division.parquet',
        regionCode: 'hk',
        snapshotMonth: '2026-05',
        source: 'overture',
        sourceVersion: '2026-05-24.0',
        theme: 'divisions',
        type: 'division',
      },
    )

    const divisionsRows = sqlite
      .query('SELECT id, level, parentDivisionId FROM divisions ORDER BY id')
      .all() as Array<{
      id: string
      level: number
      parentDivisionId: string | null
    }>
    const i18nRows = sqlite
      .query(
        'SELECT divisionId, locale, otName, isLocaleInferred FROM divisionsI18n ORDER BY divisionId, locale',
      )
      .all() as Array<{
      divisionId: string
      locale: string
      otName: string | null
      isLocaleInferred: number
    }>
    const statsRows = sqlite
      .query(
        "SELECT dimension, metricUnit, groupValue, value FROM stats WHERE datasetId = 'overture-hk-2026-05-24.0-division' ORDER BY dimension, groupValue",
      )
      .all() as Array<{
      dimension: string
      metricUnit: string
      groupValue: string | null
      value: number
    }>

    sqlite.close()

    expect(result).toEqual({
      deletedRows: 1,
      insertedVersions: 2,
      localizedRows: 4,
      processedRows: 2,
      statsRows: 12,
      unchangedRows: 0,
    })
    expect(divisionsRows).toEqual([
      {
        id: 'division-central',
        level: 2,
        parentDivisionId: 'division-hk-island',
      },
      {
        id: 'division-hk-island',
        level: 1,
        parentDivisionId: null,
      },
    ])
    expect(i18nRows).toEqual([
      {
        divisionId: 'division-central',
        locale: 'en',
        otName: 'Central',
        isLocaleInferred: 0,
      },
      {
        divisionId: 'division-central',
        locale: 'zh-hk',
        otName: '中環',
        isLocaleInferred: 0,
      },
      {
        divisionId: 'division-hk-island',
        locale: 'en',
        otName: 'Hong Kong Island',
        isLocaleInferred: 0,
      },
      {
        divisionId: 'division-hk-island',
        locale: 'zh-hk',
        otName: '香港島',
        isLocaleInferred: 0,
      },
    ])
    expect(statsRows).toEqual([
      { dimension: 'locale_alt_coverage', metricUnit: 'percentage', groupValue: 'en', value: 0 },
      { dimension: 'locale_alt_coverage', metricUnit: 'percentage', groupValue: 'zh-hans', value: 0 },
      { dimension: 'locale_alt_coverage', metricUnit: 'percentage', groupValue: 'zh-hant', value: 0 },
      { dimension: 'locale_count', metricUnit: 'count', groupValue: 'en', value: 2 },
      { dimension: 'locale_count', metricUnit: 'count', groupValue: 'zh-hans', value: 0 },
      { dimension: 'locale_count', metricUnit: 'count', groupValue: 'zh-hant', value: 2 },
      { dimension: 'locale_coverage', metricUnit: 'percentage', groupValue: 'en', value: 100 },
      { dimension: 'locale_coverage', metricUnit: 'percentage', groupValue: 'zh-hans', value: 0 },
      { dimension: 'locale_coverage', metricUnit: 'percentage', groupValue: 'zh-hant', value: 100 },
      { dimension: 'locale_coverage_non_inferred', metricUnit: 'percentage', groupValue: 'en', value: 100 },
      { dimension: 'locale_coverage_non_inferred', metricUnit: 'percentage', groupValue: 'zh-hans', value: 0 },
      { dimension: 'locale_coverage_non_inferred', metricUnit: 'percentage', groupValue: 'zh-hant', value: 100 },
    ])
  })

  test('splits large localized division inserts into smaller D1-safe chunks', async () => {
    const locales = Array.from({ length: 25 }, (_, index) => {
      const first = String.fromCharCode(97 + Math.floor(index / 26))
      const second = String.fromCharCode(97 + (index % 26))
      return `${first}${second}`
    })
    parquetBatches = [
      [
        {
          id: 'division-many-locales',
          subtype: 'region',
          class: 'region',
          version: 201,
          wikidata: 'Q999',
          parent_division_id: null,
          bbox: { minX: 1, minY: 2, maxX: 3, maxY: 4 },
          cartography: { kind: 'admin' },
          hierarchies: [{ ids: ['division-many-locales'] }],
          sources: [{ dataset: 'overture' }],
          names: {
            common: Object.fromEntries(
              locales.map(locale => [locale, `Name ${locale}`]),
            ),
          },
          local_type: Object.fromEntries(
            locales.map(locale => [locale, `Type ${locale}`]),
          ),
        },
      ],
    ]

    const tempDir = createTempDir()
    const dbPath = join(tempDir, 'division-many-locales.sqlite')
    const sqlite = initDb(dbPath)
    const db = createLocalHarbourDb(sqlite)

    sqlite.exec(`
      INSERT INTO datasets (
        datasetId, regionCode, snapshotMonth, theme, type, source, sourceVersion,
        rawObjectKey, originalFileName, status, isActive, supersedesDatasetId, revokedAt,
        revocationReason, ingestedAt
      ) VALUES (
        'overture-hk-2026-06-24.0-division', 'hk', '2026-06', 'divisions', 'division',
        'overture', '2026-06-24.0', 'hk/overture/2026-06-24.0/division.parquet',
        'division.parquet', 'staged', 0, null, null, null, '2026-06-04T00:00:00.000Z'
      );
    `)

    await processDivisionDataset(
      db,
      {
        async head() {
          return { size: 1 }
        },
        async get() {
          return {
            async arrayBuffer() {
              return new ArrayBuffer(0)
            },
          }
        },
      },
      {
        datasetId: 'overture-hk-2026-06-24.0-division',
        rawObjectKey: 'hk/overture/2026-06-24.0/division.parquet',
        regionCode: 'hk',
        snapshotMonth: '2026-06',
        source: 'overture',
        sourceVersion: '2026-06-24.0',
        theme: 'divisions',
        type: 'division',
      },
    )

    const localizedRows = sqlite
      .query(
        "SELECT count(*) as count FROM divisionsI18n WHERE divisionId = 'division-many-locales'",
      )
      .get() as {
      count: number
    }
    const versionedLocalizedRows = sqlite
      .query(
        "SELECT count(*) as count FROM divisionsVersionsI18n WHERE divisionId = 'division-many-locales'",
      )
      .get() as {
      count: number
    }

    sqlite.close()

    expect(localizedRows.count).toBe(25)
    expect(versionedLocalizedRows.count).toBe(25)
  })

  test('infers locales from primary names and locale-less rules', async () => {
    parquetBatches = [
      [
        {
          id: 'division-primary-zh',
          subtype: 'microhood',
          class: 'microhood',
          version: 301,
          wikidata: null,
          parent_division_id: null,
          bbox: null,
          cartography: null,
          hierarchies: null,
          sources: [{ dataset: 'overture' }],
          names: {
            primary: '沙頭角廣場',
          },
          local_type: {},
        },
        {
          id: 'division-primary-mixed',
          subtype: 'microhood',
          class: 'microhood',
          version: 302,
          wikidata: null,
          parent_division_id: null,
          bbox: null,
          cartography: null,
          hierarchies: null,
          sources: [{ dataset: 'overture' }],
          names: {
            primary: '太平山 Victoria Peak',
          },
          local_type: {
            en: 'peak',
          },
        },
        {
          id: 'division-rules-zh',
          subtype: 'microhood',
          class: 'microhood',
          version: 303,
          wikidata: null,
          parent_division_id: null,
          bbox: null,
          cartography: null,
          hierarchies: null,
          sources: [{ dataset: 'overture' }],
          names: {
            common: {
              zh: '山頂',
            },
            rules: [
              {
                value: 'Victoria Peak',
                variant: 'The Peak',
              },
            ],
          },
          local_type: {},
        },
      ],
    ]

    const tempDir = createTempDir()
    const dbPath = join(tempDir, 'division-inferred.sqlite')
    const sqlite = initDb(dbPath)
    const db = createLocalHarbourDb(sqlite)

    sqlite.exec(`
      INSERT INTO datasets (
        datasetId, regionCode, snapshotMonth, theme, type, source, sourceVersion,
        rawObjectKey, originalFileName, status, isActive, supersedesDatasetId, revokedAt,
        revocationReason, ingestedAt
      ) VALUES (
        'overture-hk-2026-07-24.0-division', 'hk', '2026-07', 'divisions', 'division',
        'overture', '2026-07-24.0', 'hk/overture/2026-07-24.0/division.parquet',
        'division.parquet', 'staged', 0, null, null, null, '2026-06-04T00:00:00.000Z'
      );
    `)

    const result = await processDivisionDataset(
      db,
      {
        async head() {
          return { size: 1 }
        },
        async get() {
          return {
            async arrayBuffer() {
              return new ArrayBuffer(0)
            },
          }
        },
      },
      {
        datasetId: 'overture-hk-2026-07-24.0-division',
        rawObjectKey: 'hk/overture/2026-07-24.0/division.parquet',
        regionCode: 'hk',
        snapshotMonth: '2026-07',
        source: 'overture',
        sourceVersion: '2026-07-24.0',
        theme: 'divisions',
        type: 'division',
      },
    )

    const i18nRows = sqlite
      .query(
        'SELECT divisionId, locale, otName, otNameAlts, otNameVariantJson, otNameRulesJson, otLocalType, isLocaleInferred FROM divisionsI18n ORDER BY divisionId, locale',
      )
      .all()
    const statsRows = sqlite
      .query(
        "SELECT dimension, groupValue, value FROM stats WHERE datasetId = 'overture-hk-2026-07-24.0-division' ORDER BY dimension, groupValue",
      )
      .all()

    sqlite.close()

    expect(result).toEqual({
      deletedRows: 0,
      insertedVersions: 3,
      localizedRows: 5,
      processedRows: 3,
      statsRows: 12,
      unchangedRows: 0,
    })
    expect(i18nRows).toEqual([
      {
        divisionId: 'division-primary-mixed',
        isLocaleInferred: 0,
        locale: 'en',
        otLocalType: 'peak',
        otName: 'Victoria Peak',
        otNameAlts: null,
        otNameRulesJson: null,
        otNameVariantJson: '["Victoria Peak"]',
      },
      {
        divisionId: 'division-primary-mixed',
        isLocaleInferred: 1,
        locale: 'zh-hant',
        otLocalType: null,
        otName: '太平山',
        otNameAlts: null,
        otNameRulesJson: null,
        otNameVariantJson: '["太平山"]',
      },
      {
        divisionId: 'division-primary-zh',
        isLocaleInferred: 1,
        locale: 'zh-hans',
        otLocalType: null,
        otName: '沙頭角廣場',
        otNameAlts: null,
        otNameRulesJson: null,
        otNameVariantJson: '["沙頭角廣場"]',
      },
      {
        divisionId: 'division-rules-zh',
        isLocaleInferred: 1,
        locale: 'en',
        otLocalType: null,
        otName: 'Victoria Peak',
        otNameAlts: 'The Peak',
        otNameRulesJson: '[{"value":"Victoria Peak","variant":"The Peak"}]',
        otNameVariantJson: '["Victoria Peak","The Peak"]',
      },
      {
        divisionId: 'division-rules-zh',
        isLocaleInferred: 0,
        locale: 'zh-hant',
        otLocalType: null,
        otName: '山頂',
        otNameAlts: null,
        otNameRulesJson: null,
        otNameVariantJson: '["山頂"]',
      },
    ])
    expect(statsRows).toEqual([
      { dimension: 'locale_alt_coverage', groupValue: 'en', value: 33.33333333333333 },
      { dimension: 'locale_alt_coverage', groupValue: 'zh-hans', value: 0 },
      { dimension: 'locale_alt_coverage', groupValue: 'zh-hant', value: 0 },
      { dimension: 'locale_count', groupValue: 'en', value: 2 },
      { dimension: 'locale_count', groupValue: 'zh-hans', value: 1 },
      { dimension: 'locale_count', groupValue: 'zh-hant', value: 2 },
      { dimension: 'locale_coverage', groupValue: 'en', value: 66.66666666666666 },
      { dimension: 'locale_coverage', groupValue: 'zh-hans', value: 33.33333333333333 },
      { dimension: 'locale_coverage', groupValue: 'zh-hant', value: 66.66666666666666 },
      { dimension: 'locale_coverage_non_inferred', groupValue: 'en', value: 33.33333333333333 },
      { dimension: 'locale_coverage_non_inferred', groupValue: 'zh-hans', value: 0 },
      { dimension: 'locale_coverage_non_inferred', groupValue: 'zh-hant', value: 33.33333333333333 },
    ])
  })
})
