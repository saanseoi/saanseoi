import { afterEach, describe, expect, mock, test } from 'bun:test'
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { Database } from 'bun:sqlite'

import { createLocalHarbourDb } from '../../../../../libs/core/src/testing/local-db'

const migrationsDir = resolve(import.meta.dir, '../../../../../libs/db/migrations')
const migrationSql = readdirSync(migrationsDir)
  .filter(fileName => fileName.endsWith('.sql'))
  .sort()
  .map(fileName => readFileSync(join(migrationsDir, fileName), 'utf8'))
  .join('\n')

const baseParquetBatches: Array<Array<Record<string, unknown>>> = [
  [
    {
      id: 'division-hk-island',
      subtype: 'region',
      class: 'region',
      geometry: createWkbPoint(114.158229, 22.281884),
      population: 123456,
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
      geometry: {
        type: 'Point',
        coordinates: [114.15769, 22.28171],
      },
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

function createWkbPoint(x: number, y: number) {
  const buffer = new ArrayBuffer(21)
  const view = new DataView(buffer)

  view.setUint8(0, 1)
  view.setUint32(1, 1, true)
  view.setFloat64(5, x, true)
  view.setFloat64(13, y, true)

  return new Uint8Array(buffer)
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
        id, datasetId, regionCode, snapshotMonth, theme, type, source, sourceVersion,
        rawObjectKey, originalFileName, status, supersedesDatasetId, revokedAt,
        revocationReason, ingestedAt, createdAt, updatedAt
      ) VALUES (
        'overture-hk-2026-04-24.0-division-row', 'overture-hk-2026-04-24.0-division', 'hk', '2026-04', 'divisions', 'division',
        'overture', '2026-04-24.0', 'hk/overture/2026-04-24.0/division.parquet',
        'division.parquet', 'current', null, null, null, '${now}', '${now}', '${now}'
      );
    `)

    sqlite.exec(`
      INSERT INTO divisions (
        id, level, type, otVersion, otSubtype, otClass, otWikidata,
        otHierarchyJson, hierarchyJson, parentDivisionId, otCartographyJson, otBboxJson,
        sourcesJson, createdAt, updatedAt
      ) VALUES (
        'division-obsolete', 1, 'area', '1', 'region', 'region', null, null, null, null,
        null, null, null, '${now}', '${now}'
      );
    `)

    sqlite.exec(`
      INSERT INTO divisionsVersions (
        id, versionHash, regionCode, datasetRecordId, validFromMonth, validToMonth, isCurrent,
        level, type, otVersion, otVersionHash, otSubtype, otClass, otWikidata,
        otHierarchyJson, hierarchyJson, parentDivisionId, otCartographyJson, otBboxJson,
        sourcesJson, createdAt, updatedAt
      ) VALUES (
        'division-obsolete', 'hash-obsolete', 'hk',
        (SELECT id FROM datasets WHERE datasetId = 'overture-hk-2026-04-24.0-division'),
        '2026-04', null, 1, 1, 'area', '1', 'ot-hash-obsolete', 'region', 'region', null,
        null, null, null, null, null, null, '${now}', '${now}'
      );
    `)

    sqlite.exec(`
      INSERT INTO datasets (
        id, datasetId, regionCode, snapshotMonth, theme, type, source, sourceVersion,
        rawObjectKey, originalFileName, status, supersedesDatasetId, revokedAt,
        revocationReason, ingestedAt, createdAt, updatedAt
      ) VALUES (
        'overture-hk-2026-05-24.0-division-row', 'overture-hk-2026-05-24.0-division', 'hk', '2026-05', 'divisions', 'division',
        'overture', '2026-05-24.0', 'hk/overture/2026-05-24.0/division.parquet',
        'division.parquet', 'staged', 'overture-hk-2026-04-24.0-division', null, null,
        '${now}', '${now}', '${now}'
      );
    `)

    const result = await processDivisionDataset(
      db as never,
      db as never,
      db as never,
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
      .query(
        "SELECT id, level, type, otGeometryJson, otPopulation, parentDivisionId, otHierarchyJson, hierarchyJson, sourcesJson FROM divisions WHERE id != 'saanseoi-cn-prc' ORDER BY id",
      )
      .all() as Array<{
      id: string
      level: number
      type: string
      otGeometryJson: string | null
      otPopulation: number | null
      parentDivisionId: string | null
      otHierarchyJson: string | null
      hierarchyJson: string | null
      sourcesJson: string | null
    }>
    const i18nRows = sqlite
      .query(
        "SELECT divisionId, locale, otName, isLocaleInferred FROM divisionsI18n WHERE divisionId != 'saanseoi-cn-prc' ORDER BY divisionId, locale",
      )
      .all() as Array<{
      divisionId: string
      locale: string
      otName: string | null
      isLocaleInferred: number
    }>
    const statsRows = sqlite
      .query(
        "SELECT s.dimension, s.metricUnit, s.groupValue, s.value FROM stats s INNER JOIN datasets d ON d.id = s.datasetRecordId WHERE d.datasetId = 'overture-hk-2026-05-24.0-division' AND s.metric = 'completeness' ORDER BY s.dimension, s.groupValue",
      )
      .all() as Array<{
      dimension: string
      metricUnit: string
      groupValue: string | null
      value: number
    }>
    const churnStatsRows = sqlite
      .query(
        "SELECT s.dimension, s.groupBy, s.groupValue, s.value FROM stats s INNER JOIN datasets d ON d.id = s.datasetRecordId WHERE d.datasetId = 'overture-hk-2026-05-24.0-division' AND s.metric = 'churn' ORDER BY s.groupBy, s.groupValue, s.dimension",
      )
      .all() as Array<{
      dimension: string
      groupBy: string | null
      groupValue: string | null
      value: number
    }>

    sqlite.close()

    expect(result).toEqual({
      deletedRows: 1,
      insertedVersions: 2,
      localizedRows: 4,
      processedRows: 2,
      statsRows: 31,
      unchangedRows: 0,
    })
    expect(divisionsRows).toEqual([
      {
        id: 'division-central',
        hierarchyJson: '[{"ids":["division-hk-island","division-central"]}]',
        level: 2,
        otGeometryJson: '{"coordinates":[114.15769,22.28171],"type":"Point"}',
        otPopulation: null,
        otHierarchyJson: '[{"ids":["division-hk-island","division-central"]}]',
        parentDivisionId: 'division-hk-island',
        sourcesJson: '{"overture":[{"dataset":"overture"}]}',
        type: 'district',
      },
      {
        id: 'division-hk-island',
        hierarchyJson: '[{"ids":["division-hk-island"]}]',
        level: 1,
        otGeometryJson: '{"coordinates":[114.158229,22.281884],"type":"Point"}',
        otPopulation: 123456,
        otHierarchyJson: '[{"ids":["division-hk-island"]}]',
        parentDivisionId: null,
        sourcesJson: '{"overture":[{"dataset":"overture"}]}',
        type: 'area',
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
      {
        dimension: 'locale_alt_coverage',
        metricUnit: 'percentage',
        groupValue: 'en',
        value: 0,
      },
      {
        dimension: 'locale_alt_coverage',
        metricUnit: 'percentage',
        groupValue: 'zh-hans',
        value: 0,
      },
      {
        dimension: 'locale_alt_coverage',
        metricUnit: 'percentage',
        groupValue: 'zh-hant',
        value: 0,
      },
      { dimension: 'locale_count', metricUnit: 'count', groupValue: 'en', value: 2 },
      {
        dimension: 'locale_count',
        metricUnit: 'count',
        groupValue: 'zh-hans',
        value: 0,
      },
      {
        dimension: 'locale_count',
        metricUnit: 'count',
        groupValue: 'zh-hant',
        value: 2,
      },
      {
        dimension: 'locale_coverage',
        metricUnit: 'percentage',
        groupValue: 'en',
        value: 100,
      },
      {
        dimension: 'locale_coverage',
        metricUnit: 'percentage',
        groupValue: 'zh-hans',
        value: 0,
      },
      {
        dimension: 'locale_coverage',
        metricUnit: 'percentage',
        groupValue: 'zh-hant',
        value: 100,
      },
      {
        dimension: 'locale_coverage_non_inferred',
        metricUnit: 'percentage',
        groupValue: 'en',
        value: 100,
      },
      {
        dimension: 'locale_coverage_non_inferred',
        metricUnit: 'percentage',
        groupValue: 'zh-hans',
        value: 0,
      },
      {
        dimension: 'locale_coverage_non_inferred',
        metricUnit: 'percentage',
        groupValue: 'zh-hant',
        value: 100,
      },
    ])
    expect(churnStatsRows).toEqual([
      { dimension: 'added_count', groupBy: null, groupValue: null, value: 2 },
      { dimension: 'changed_count', groupBy: null, groupValue: null, value: 0 },
      { dimension: 'count', groupBy: null, groupValue: null, value: 2 },
      { dimension: 'removed_count', groupBy: null, groupValue: null, value: 1 },
      { dimension: 'unchanged_count', groupBy: null, groupValue: null, value: 0 },
      { dimension: 'added_count', groupBy: 'type', groupValue: 'area', value: 1 },
      { dimension: 'changed_count', groupBy: 'type', groupValue: 'area', value: 0 },
      { dimension: 'count', groupBy: 'type', groupValue: 'area', value: 1 },
      { dimension: 'removed_count', groupBy: 'type', groupValue: 'area', value: 1 },
      { dimension: 'unchanged_count', groupBy: 'type', groupValue: 'area', value: 0 },
      { dimension: 'added_count', groupBy: 'type', groupValue: 'district', value: 1 },
      { dimension: 'changed_count', groupBy: 'type', groupValue: 'district', value: 0 },
      { dimension: 'count', groupBy: 'type', groupValue: 'district', value: 1 },
      { dimension: 'removed_count', groupBy: 'type', groupValue: 'district', value: 0 },
      {
        dimension: 'unchanged_count',
        groupBy: 'type',
        groupValue: 'district',
        value: 0,
      },
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
        id, datasetId, regionCode, snapshotMonth, theme, type, source, sourceVersion,
        rawObjectKey, originalFileName, status, supersedesDatasetId, revokedAt,
        revocationReason, ingestedAt, createdAt, updatedAt
      ) VALUES (
        'overture-hk-2026-06-24.0-division-row', 'overture-hk-2026-06-24.0-division', 'hk', '2026-06', 'divisions', 'division',
        'overture', '2026-06-24.0', 'hk/overture/2026-06-24.0/division.parquet',
        'division.parquet', 'staged', null, null, null, '2026-06-04T00:00:00.000Z',
        '2026-06-04T00:00:00.000Z', '2026-06-04T00:00:00.000Z'
      );
    `)

    await processDivisionDataset(
      db as never,
      db as never,
      db as never,
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

  test('records division churn stats from the previous active snapshot including i18n-only changes', async () => {
    const tempDir = createTempDir()
    const dbPath = join(tempDir, 'division-churn.sqlite')
    const sqlite = initDb(dbPath)
    const db = createLocalHarbourDb(sqlite)
    const now = '2026-06-04T00:00:00.000Z'

    parquetBatches = [
      [
        {
          id: 'division-unchanged',
          subtype: 'region',
          class: 'region',
          version: 101,
          wikidata: null,
          parent_division_id: null,
          bbox: null,
          cartography: null,
          hierarchies: [{ ids: ['division-unchanged'] }],
          sources: [{ dataset: 'overture' }],
          names: {
            common: {
              en: 'Stable Area',
            },
          },
          local_type: {},
        },
        {
          id: 'division-i18n-change',
          subtype: 'district',
          class: 'district',
          version: 102,
          wikidata: null,
          parent_division_id: 'division-unchanged',
          bbox: null,
          cartography: null,
          hierarchies: [{ ids: ['division-unchanged', 'division-i18n-change'] }],
          sources: [{ dataset: 'overture' }],
          names: {
            common: {
              en: 'Central',
              'zh-hk': '中環',
            },
            rules: ['Central District'],
          },
          local_type: {},
        },
        {
          id: 'division-base-change',
          subtype: 'district',
          class: 'district',
          version: 104,
          wikidata: null,
          parent_division_id: 'division-unchanged',
          geometry: {
            type: 'Point',
            coordinates: [114.15, 22.28],
          },
          bbox: null,
          cartography: null,
          hierarchies: [{ ids: ['division-unchanged', 'division-base-change'] }],
          sources: [{ dataset: 'overture' }],
          names: {
            common: {
              en: 'Harbour District',
            },
          },
          local_type: {},
        },
        {
          id: 'division-removed',
          subtype: 'district',
          class: 'district',
          version: 105,
          wikidata: null,
          parent_division_id: 'division-unchanged',
          bbox: null,
          cartography: null,
          hierarchies: [{ ids: ['division-unchanged', 'division-removed'] }],
          sources: [{ dataset: 'overture' }],
          names: {
            common: {
              en: 'Obsolete District',
            },
          },
          local_type: {},
        },
      ],
    ]

    sqlite.exec(`
      INSERT INTO datasets (
        id, datasetId, regionCode, snapshotMonth, theme, type, source, sourceVersion,
        rawObjectKey, originalFileName, status, supersedesDatasetId, revokedAt,
        revocationReason, ingestedAt, createdAt, updatedAt
      ) VALUES (
        'overture-hk-2026-05-24.0-division-row', 'overture-hk-2026-05-24.0-division', 'hk', '2026-05', 'divisions', 'division',
        'overture', '2026-05-24.0', 'hk/overture/2026-05-24.0/division.parquet',
        'division.parquet', 'current', null, null, null, '${now}', '${now}', '${now}'
      );
    `)

    await processDivisionDataset(
      db as never,
      db as never,
      db as never,
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

    parquetBatches = [
      [
        {
          id: 'division-unchanged',
          subtype: 'region',
          class: 'region',
          version: 101,
          wikidata: null,
          parent_division_id: null,
          bbox: null,
          cartography: null,
          hierarchies: [{ ids: ['division-unchanged'] }],
          sources: [{ dataset: 'overture' }],
          names: {
            common: {
              en: 'Stable Area',
            },
          },
          local_type: {},
        },
        {
          id: 'division-i18n-change',
          subtype: 'district',
          class: 'district',
          version: 102,
          wikidata: null,
          parent_division_id: 'division-unchanged',
          bbox: null,
          cartography: null,
          hierarchies: [{ ids: ['division-unchanged', 'division-i18n-change'] }],
          sources: [{ dataset: 'overture' }],
          names: {
            common: {
              en: 'Central',
            },
          },
          local_type: {},
        },
        {
          id: 'division-base-change',
          subtype: 'district',
          class: 'district',
          version: 104,
          wikidata: null,
          parent_division_id: 'division-added',
          geometry: {
            type: 'Point',
            coordinates: [114.16, 22.29],
          },
          bbox: null,
          cartography: null,
          hierarchies: [{ ids: ['division-added', 'division-base-change'] }],
          sources: [{ dataset: 'overture' }],
          names: {
            common: {
              en: 'Harbour District',
            },
          },
          local_type: {},
        },
        {
          id: 'division-added',
          subtype: 'district',
          class: 'district',
          version: 106,
          wikidata: null,
          parent_division_id: 'division-unchanged',
          bbox: null,
          cartography: null,
          hierarchies: [{ ids: ['division-unchanged', 'division-added'] }],
          sources: [{ dataset: 'overture' }],
          names: {
            common: {
              en: 'New District',
            },
          },
          local_type: {},
        },
      ],
    ]

    sqlite.exec(`
      INSERT INTO datasets (
        id, datasetId, regionCode, snapshotMonth, theme, type, source, sourceVersion,
        rawObjectKey, originalFileName, status, supersedesDatasetId, revokedAt,
        revocationReason, ingestedAt, createdAt, updatedAt
      ) VALUES (
        'overture-hk-2026-06-24.0-division-row', 'overture-hk-2026-06-24.0-division', 'hk', '2026-06', 'divisions', 'division',
        'overture', '2026-06-24.0', 'hk/overture/2026-06-24.0/division.parquet',
        'division.parquet', 'staged', 'overture-hk-2026-05-24.0-division', null, null,
        '${now}', '${now}', '${now}'
      );
    `)

    const result = await processDivisionDataset(
      db as never,
      db as never,
      db as never,
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

    const churnRows = sqlite
      .query(
        "SELECT s.dimension, s.groupBy, s.groupValue, s.value FROM stats s INNER JOIN datasets d ON d.id = s.datasetRecordId WHERE d.datasetId = 'overture-hk-2026-06-24.0-division' AND s.metric = 'churn' ORDER BY s.groupBy, s.groupValue, s.dimension",
      )
      .all()
    const qualityRows = sqlite
      .query(
        "SELECT s.dimension, s.value FROM stats s INNER JOIN datasets d ON d.id = s.datasetRecordId WHERE d.datasetId = 'overture-hk-2026-06-24.0-division' AND s.metric = 'quality' ORDER BY s.dimension",
      )
      .all()

    sqlite.close()

    expect(result).toEqual({
      deletedRows: 1,
      insertedVersions: 2,
      localizedRows: 4,
      processedRows: 4,
      statsRows: 26,
      unchangedRows: 2,
    })
    expect(churnRows).toEqual([
      { dimension: 'added_count', groupBy: null, groupValue: null, value: 1 },
      { dimension: 'changed_count', groupBy: null, groupValue: null, value: 2 },
      { dimension: 'count', groupBy: null, groupValue: null, value: 4 },
      { dimension: 'removed_count', groupBy: null, groupValue: null, value: 1 },
      { dimension: 'unchanged_count', groupBy: null, groupValue: null, value: 1 },
      { dimension: 'added_count', groupBy: 'type', groupValue: 'district', value: 1 },
      { dimension: 'changed_count', groupBy: 'type', groupValue: 'district', value: 2 },
      { dimension: 'count', groupBy: 'type', groupValue: 'district', value: 4 },
      { dimension: 'removed_count', groupBy: 'type', groupValue: 'district', value: 1 },
      {
        dimension: 'unchanged_count',
        groupBy: 'type',
        groupValue: 'district',
        value: 1,
      },
    ])
    expect(qualityRows).toEqual([
      { dimension: 'geometry_changed_count', value: 1 },
      { dimension: 'locale_regression_count', value: 1 },
      { dimension: 'name_regression_count', value: 1 },
      { dimension: 'parent_changed_count', value: 1 },
    ])
  })

  test('maps overture division types to taxonomy levels and preserves Hong Kong areas', async () => {
    parquetBatches = [
      [
        {
          id: 'division-hk-sar',
          subtype: 'dependency',
          class: 'dependency',
          version: 401,
          wikidata: null,
          parent_division_id: null,
          bbox: null,
          cartography: null,
          hierarchies: [{ ids: ['division-hk-sar'] }],
          sources: [{ dataset: 'overture' }],
          names: {
            common: {
              en: 'Hong Kong',
              'zh-hk': '香港',
            },
          },
          local_type: {},
        },
        {
          id: 'division-new-territories',
          subtype: 'region',
          class: 'region',
          version: 402,
          wikidata: null,
          parent_division_id: 'division-hk-sar',
          bbox: null,
          cartography: null,
          hierarchies: [{ ids: ['division-hk-sar', 'division-new-territories'] }],
          sources: [{ dataset: 'overture' }],
          names: {
            common: {
              en: 'New Territories',
              'zh-hk': '新界',
            },
          },
          local_type: {},
        },
        {
          id: 'division-yau-tsim-mong',
          subtype: 'region',
          class: 'region',
          version: 403,
          wikidata: null,
          parent_division_id: 'division-kowloon',
          bbox: null,
          cartography: null,
          hierarchies: [{ ids: ['division-kowloon', 'division-yau-tsim-mong'] }],
          sources: [{ dataset: 'overture' }],
          names: {
            common: {
              en: 'Yau Tsim Mong',
              'zh-hk': '油尖旺',
            },
          },
          local_type: {},
        },
        {
          id: 'division-tuen-mun',
          subtype: 'locality',
          class: 'town',
          version: 404,
          wikidata: null,
          parent_division_id: 'division-tuen-mun-district',
          bbox: null,
          cartography: null,
          hierarchies: [
            {
              ids: [
                'division-new-territories',
                'division-tuen-mun-district',
                'division-tuen-mun',
              ],
            },
          ],
          sources: [{ dataset: 'overture' }],
          names: {
            common: {
              en: 'Tuen Mun',
              'zh-hk': '屯門',
            },
          },
          local_type: {},
        },
        {
          id: 'division-mong-kok',
          subtype: 'macrohood',
          class: 'macrohood',
          version: 405,
          wikidata: null,
          parent_division_id: 'division-yau-tsim-mong',
          bbox: null,
          cartography: null,
          hierarchies: [
            {
              ids: ['division-kowloon', 'division-yau-tsim-mong', 'division-mong-kok'],
            },
          ],
          sources: [{ dataset: 'overture' }],
          names: {
            common: {
              en: 'Mong Kok',
              'zh-hk': '旺角',
            },
          },
          local_type: {},
        },
        {
          id: 'division-sha-tin',
          subtype: 'locality',
          class: 'city',
          version: 4051,
          wikidata: null,
          parent_division_id: 'division-hk-sar',
          bbox: null,
          cartography: null,
          hierarchies: [{ ids: ['division-hk-sar', 'division-sha-tin'] }],
          sources: [{ dataset: 'overture' }],
          names: {
            common: {
              en: 'Sha Tin',
              'zh-hk': '沙田',
            },
          },
          local_type: {},
        },
        {
          id: 'division-prince-edward',
          subtype: 'neighborhood',
          class: 'neighborhood',
          version: 406,
          wikidata: null,
          parent_division_id: 'division-mong-kok',
          bbox: null,
          cartography: null,
          hierarchies: [
            {
              ids: [
                'division-kowloon',
                'division-yau-tsim-mong',
                'division-mong-kok',
                'division-prince-edward',
              ],
            },
          ],
          sources: [{ dataset: 'overture' }],
          names: {
            common: {
              en: 'Prince Edward',
              'zh-hk': '太子',
            },
          },
          local_type: {},
        },
        {
          id: 'division-kam-tsin',
          subtype: 'locality',
          class: 'village',
          version: 4061,
          wikidata: null,
          parent_division_id: 'division-yuen-long',
          bbox: null,
          cartography: null,
          hierarchies: [
            {
              ids: [
                'division-new-territories',
                'division-yuen-long',
                'division-kam-tsin',
              ],
            },
          ],
          sources: [{ dataset: 'overture' }],
          names: {
            common: {
              en: 'Kam Tsin',
              'zh-hk': '錦田',
            },
          },
          local_type: {},
        },
        {
          id: 'division-thirty-houses',
          subtype: 'microhood',
          class: 'microhood',
          version: 407,
          wikidata: null,
          parent_division_id: 'division-prince-edward',
          bbox: null,
          cartography: null,
          hierarchies: [
            {
              ids: [
                'division-kowloon',
                'division-yau-tsim-mong',
                'division-mong-kok',
                'division-prince-edward',
                'division-thirty-houses',
              ],
            },
          ],
          sources: [{ dataset: 'overture' }],
          names: {
            common: {
              en: '30 Houses',
              'zh-hk': '三十間',
            },
          },
          local_type: {},
        },
        {
          id: 'division-lok-ma-chau-hamlet',
          subtype: 'locality',
          class: 'hamlet',
          version: 4071,
          wikidata: null,
          parent_division_id: 'division-kam-tsin',
          bbox: null,
          cartography: null,
          hierarchies: [
            {
              ids: [
                'division-new-territories',
                'division-yuen-long',
                'division-kam-tsin',
                'division-lok-ma-chau-hamlet',
              ],
            },
          ],
          sources: [{ dataset: 'overture' }],
          names: {
            common: {
              en: 'Lok Ma Chau Hamlet',
              'zh-hk': '落馬洲村',
            },
          },
          local_type: {},
        },
      ],
    ]

    const tempDir = createTempDir()
    const dbPath = join(tempDir, 'division-taxonomy.sqlite')
    const sqlite = initDb(dbPath)
    const db = createLocalHarbourDb(sqlite)

    sqlite.exec(`
      INSERT INTO datasets (
        id, datasetId, regionCode, snapshotMonth, theme, type, source, sourceVersion,
        rawObjectKey, originalFileName, status, supersedesDatasetId, revokedAt,
        revocationReason, ingestedAt, createdAt, updatedAt
      ) VALUES (
        'overture-hk-2026-09-24.0-division-row', 'overture-hk-2026-09-24.0-division', 'hk', '2026-09', 'divisions', 'division',
        'overture', '2026-09-24.0', 'hk/overture/2026-09-24.0/division.parquet',
        'division.parquet', 'staged', null, null, null, '2026-06-04T00:00:00.000Z',
        '2026-06-04T00:00:00.000Z', '2026-06-04T00:00:00.000Z'
      );
    `)

    await processDivisionDataset(
      db as never,
      db as never,
      db as never,
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
        datasetId: 'overture-hk-2026-09-24.0-division',
        rawObjectKey: 'hk/overture/2026-09-24.0/division.parquet',
        regionCode: 'hk',
        snapshotMonth: '2026-09',
        source: 'overture',
        sourceVersion: '2026-09-24.0',
        theme: 'divisions',
        type: 'division',
      },
    )

    const rows = sqlite
      .query(
        "SELECT id, level, type FROM divisions WHERE id != 'saanseoi-cn-prc' ORDER BY id",
      )
      .all() as Array<{ id: string; level: number; type: string }>

    sqlite.close()

    expect(rows).toEqual([
      { id: 'division-hk-sar', level: 0, type: 'sar' },
      { id: 'division-kam-tsin', level: 5, type: 'village' },
      { id: 'division-lok-ma-chau-hamlet', level: 6, type: 'hamlet' },
      { id: 'division-mong-kok', level: 4, type: 'macrohood' },
      { id: 'division-new-territories', level: 1, type: 'area' },
      { id: 'division-prince-edward', level: 5, type: 'neighbourhood' },
      { id: 'division-sha-tin', level: 1, type: 'area' },
      { id: 'division-thirty-houses', level: 6, type: 'microhood' },
      { id: 'division-tuen-mun', level: 3, type: 'town' },
      { id: 'division-yau-tsim-mong', level: 2, type: 'district' },
    ])
  })

  test('unwraps doubly wrapped hierarchy arrays before storing JSON', async () => {
    parquetBatches = [
      [
        {
          id: 'division-wrapped-hierarchy',
          subtype: 'district',
          class: 'district',
          version: 401,
          wikidata: null,
          parent_division_id: 'division-hk-island',
          bbox: null,
          cartography: null,
          hierarchies: [
            [{ ids: ['division-hk-island', 'division-wrapped-hierarchy'] }],
          ],
          sources: [{ dataset: 'overture' }],
          names: {
            common: {
              en: 'Wrapped',
            },
          },
          local_type: {},
        },
      ],
    ]

    const tempDir = createTempDir()
    const dbPath = join(tempDir, 'division-wrapped-hierarchy.sqlite')
    const sqlite = initDb(dbPath)
    const db = createLocalHarbourDb(sqlite)

    sqlite.exec(`
      INSERT INTO datasets (
        id, datasetId, regionCode, snapshotMonth, theme, type, source, sourceVersion,
        rawObjectKey, originalFileName, status, supersedesDatasetId, revokedAt,
        revocationReason, ingestedAt, createdAt, updatedAt
      ) VALUES (
        'overture-hk-2026-08-24.0-division-row', 'overture-hk-2026-08-24.0-division', 'hk', '2026-08', 'divisions', 'division',
        'overture', '2026-08-24.0', 'hk/overture/2026-08-24.0/division.parquet',
        'division.parquet', 'staged', null, null, null, '2026-06-04T00:00:00.000Z',
        '2026-06-04T00:00:00.000Z', '2026-06-04T00:00:00.000Z'
      );
    `)

    await processDivisionDataset(
      db as never,
      db as never,
      db as never,
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
        datasetId: 'overture-hk-2026-08-24.0-division',
        rawObjectKey: 'hk/overture/2026-08-24.0/division.parquet',
        regionCode: 'hk',
        snapshotMonth: '2026-08',
        source: 'overture',
        sourceVersion: '2026-08-24.0',
        theme: 'divisions',
        type: 'division',
      },
    )

    const row = sqlite
      .query(
        "SELECT otHierarchyJson, hierarchyJson FROM divisions WHERE id = 'division-wrapped-hierarchy'",
      )
      .get() as {
      otHierarchyJson: string | null
      hierarchyJson: string | null
    }

    sqlite.close()

    expect(row).toEqual({
      otHierarchyJson: '[{"ids":["division-hk-island","division-wrapped-hierarchy"]}]',
      hierarchyJson: '[{"ids":["division-hk-island","division-wrapped-hierarchy"]}]',
    })
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
              'Victoria Peak',
              {
                value: 'The Peak',
                variant: 'alternate',
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
        id, datasetId, regionCode, snapshotMonth, theme, type, source, sourceVersion,
        rawObjectKey, originalFileName, status, supersedesDatasetId, revokedAt,
        revocationReason, ingestedAt, createdAt, updatedAt
      ) VALUES (
        'overture-hk-2026-07-24.0-division-row', 'overture-hk-2026-07-24.0-division', 'hk', '2026-07', 'divisions', 'division',
        'overture', '2026-07-24.0', 'hk/overture/2026-07-24.0/division.parquet',
        'division.parquet', 'staged', null, null, null, '2026-06-04T00:00:00.000Z',
        '2026-06-04T00:00:00.000Z', '2026-06-04T00:00:00.000Z'
      );
    `)

    const result = await processDivisionDataset(
      db as never,
      db as never,
      db as never,
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
        "SELECT divisionId, locale, otName, otNameAlts, otNameVariantJson, otNameRulesJson, otLocalType, isLocaleInferred FROM divisionsI18n WHERE divisionId != 'saanseoi-cn-prc' ORDER BY divisionId, locale",
      )
      .all()
    const statsRows = sqlite
      .query(
        "SELECT s.dimension, s.groupValue, s.value FROM stats s INNER JOIN datasets d ON d.id = s.datasetRecordId WHERE d.datasetId = 'overture-hk-2026-07-24.0-division' AND s.metric = 'completeness' ORDER BY s.dimension, s.groupValue",
      )
      .all()

    sqlite.close()

    expect(result).toEqual({
      deletedRows: 0,
      insertedVersions: 3,
      localizedRows: 5,
      processedRows: 3,
      statsRows: 26,
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
        otNameRulesJson:
          '[{"value":"Victoria Peak","variant":null},{"value":"The Peak","variant":"alternate"}]',
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
      {
        dimension: 'locale_coverage_non_inferred',
        groupValue: 'en',
        value: 33.33333333333333,
      },
      { dimension: 'locale_coverage_non_inferred', groupValue: 'zh-hans', value: 0 },
      {
        dimension: 'locale_coverage_non_inferred',
        groupValue: 'zh-hant',
        value: 33.33333333333333,
      },
    ])
  })

  test('keeps rule variants out of otNameAlts', async () => {
    parquetBatches = [
      [
        {
          id: 'division-short-variant',
          subtype: 'microhood',
          class: 'microhood',
          version: 401,
          wikidata: null,
          parent_division_id: null,
          bbox: null,
          cartography: null,
          hierarchies: null,
          sources: [{ dataset: 'overture' }],
          names: {
            common: {
              en: 'Tin Shui Wai North',
            },
            rules: [
              {
                locale: 'en',
                value: '天北',
                variant: 'short',
              },
            ],
          },
          local_type: {},
        },
        {
          id: 'division-alternate-variant',
          subtype: 'microhood',
          class: 'microhood',
          version: 402,
          wikidata: null,
          parent_division_id: null,
          bbox: null,
          cartography: null,
          hierarchies: null,
          sources: [{ dataset: 'overture' }],
          names: {
            common: {
              en: 'Fung Mei Wai',
            },
            rules: [
              {
                locale: 'en',
                value: 'Kau Shi Wai',
                variant: 'alternate',
              },
              {
                locale: 'en',
                value: '狗屎圍 Kau Shi Wai',
                variant: 'alternate',
              },
            ],
          },
          local_type: {},
        },
      ],
    ]

    const tempDir = createTempDir()
    const dbPath = join(tempDir, 'division-rule-variants.sqlite')
    const sqlite = initDb(dbPath)
    const db = createLocalHarbourDb(sqlite)

    sqlite.exec(`
      INSERT INTO datasets (
        id, datasetId, regionCode, snapshotMonth, theme, type, source, sourceVersion,
        rawObjectKey, originalFileName, status, supersedesDatasetId, revokedAt,
        revocationReason, ingestedAt, createdAt, updatedAt
      ) VALUES (
        'overture-hk-2026-07-24.0-division-row', 'overture-hk-2026-07-24.0-division', 'hk', '2026-07', 'divisions', 'division',
        'overture', '2026-07-24.0', 'hk/overture/2026-07-24.0/division.parquet',
        'division.parquet', 'staged', null, null, null, '2026-06-04T00:00:00.000Z',
        '2026-06-04T00:00:00.000Z', '2026-06-04T00:00:00.000Z'
      );
    `)

    await processDivisionDataset(
      db as never,
      db as never,
      db as never,
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
        "SELECT divisionId, locale, otName, otNameAlts, otNameVariantJson, otNameRulesJson FROM divisionsI18n WHERE divisionId != 'saanseoi-cn-prc' ORDER BY divisionId, locale",
      )
      .all()

    sqlite.close()

    expect(i18nRows).toEqual([
      {
        divisionId: 'division-alternate-variant',
        locale: 'en',
        otName: 'Fung Mei Wai',
        otNameAlts: 'Kau Shi Wai|狗屎圍 Kau Shi Wai',
        otNameRulesJson:
          '[{"value":"Kau Shi Wai","variant":"alternate"},{"value":"狗屎圍 Kau Shi Wai","variant":"alternate"}]',
        otNameVariantJson: '["Fung Mei Wai","Kau Shi Wai","狗屎圍 Kau Shi Wai"]',
      },
      {
        divisionId: 'division-short-variant',
        locale: 'en',
        otName: 'Tin Shui Wai North',
        otNameAlts: '天北',
        otNameRulesJson: '[{"value":"天北","variant":"short"}]',
        otNameVariantJson: '["Tin Shui Wai North","天北"]',
      },
    ])
  })

  test('chunks large current-division reads and cleanup for follow-up datasets', async () => {
    parquetBatches = []

    const tempDir = createTempDir()
    const dbPath = join(tempDir, 'division-large-follow-up.sqlite')
    const sqlite = initDb(dbPath)
    const db = createLocalHarbourDb(sqlite)
    const now = '2026-06-04T00:00:00.000Z'
    const previousDatasetId = 'overture-hk-2026-04-24.0-division'
    const nextDatasetId = 'overture-hk-2026-05-24.0-division'
    const existingDivisionCount = 120

    sqlite.exec(`
      INSERT INTO datasets (
        id, datasetId, regionCode, snapshotMonth, theme, type, source, sourceVersion,
        rawObjectKey, originalFileName, status, supersedesDatasetId, revokedAt,
        revocationReason, ingestedAt, createdAt, updatedAt
      ) VALUES (
        '${previousDatasetId}-row', '${previousDatasetId}', 'hk', '2026-04', 'divisions', 'division',
        'overture', '2026-04-24.0', 'hk/overture/2026-04-24.0/division.parquet',
        'division.parquet', 'current', null, null, null, '${now}', '${now}', '${now}'
      );
    `)

    sqlite.exec('BEGIN')

    for (let index = 0; index < existingDivisionCount; index += 1) {
      const divisionId = `division-existing-${index}`
      const versionHash = `hash-${index}`

      sqlite.exec(`
        INSERT INTO divisions (
          id, level, type, otVersion, otSubtype, otClass, otWikidata,
          otHierarchyJson, hierarchyJson, parentDivisionId, otCartographyJson, otBboxJson,
          sourcesJson, createdAt, updatedAt
        ) VALUES (
          '${divisionId}', 1, 'area', '${index}', 'district', 'district', null, null, null,
          null, null, null, null, '${now}', '${now}'
        );
      `)

      sqlite.exec(`
        INSERT INTO divisionsI18n (
          divisionId, locale, otName, otNameAlts, otNameVariantJson, otNameRulesJson,
          otLocalType, isLocaleInferred, createdAt, updatedAt
        ) VALUES (
          '${divisionId}', 'en', 'Existing ${index}', null, '["Existing ${index}"]', null, null, 0,
          '${now}', '${now}'
        );
      `)

      sqlite.exec(`
        INSERT INTO divisionsVersions (
          id, versionHash, regionCode, datasetRecordId, validFromMonth, validToMonth, isCurrent,
          level, type, otVersion, otVersionHash, otSubtype, otClass, otWikidata,
          otHierarchyJson, hierarchyJson, parentDivisionId, otCartographyJson, otBboxJson,
          sourcesJson, createdAt, updatedAt
        ) VALUES (
          '${divisionId}', '${versionHash}', 'hk',
          (SELECT id FROM datasets WHERE datasetId = '${previousDatasetId}'), '2026-04', null, 1,
          1, 'area', '${index}', 'ot-hash-${index}', 'district', 'district', null,
          null, null, null, null, null, null, '${now}', '${now}'
        );
      `)
    }

    sqlite.exec('COMMIT')

    sqlite.exec(`
      INSERT INTO datasets (
        id, datasetId, regionCode, snapshotMonth, theme, type, source, sourceVersion,
        rawObjectKey, originalFileName, status, supersedesDatasetId, revokedAt,
        revocationReason, ingestedAt, createdAt, updatedAt
      ) VALUES (
        '${nextDatasetId}-row', '${nextDatasetId}', 'hk', '2026-05', 'divisions', 'division',
        'overture', '2026-05-24.0', 'hk/overture/2026-05-24.0/division.parquet',
        'division.parquet', 'staged', '${previousDatasetId}', null, null,
        '${now}', '${now}', '${now}'
      );
    `)

    const result = await processDivisionDataset(
      db as never,
      db as never,
      db as never,
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
        datasetId: nextDatasetId,
        rawObjectKey: 'hk/overture/2026-05-24.0/division.parquet',
        regionCode: 'hk',
        snapshotMonth: '2026-05',
        source: 'overture',
        sourceVersion: '2026-05-24.0',
        theme: 'divisions',
        type: 'division',
      },
    )

    const remainingDivisions = sqlite
      .query("SELECT count(*) as count FROM divisions WHERE id != 'saanseoi-cn-prc'")
      .get() as { count: number }
    const remainingI18n = sqlite
      .query(
        "SELECT count(*) as count FROM divisionsI18n WHERE divisionId != 'saanseoi-cn-prc'",
      )
      .get() as { count: number }
    const currentVersions = sqlite
      .query(
        "SELECT count(*) as count FROM divisionsVersions WHERE isCurrent = 1 AND id != 'saanseoi-cn-prc'",
      )
      .get() as { count: number }

    sqlite.close()

    expect(result.deletedRows).toBe(existingDivisionCount)
    expect(result.insertedVersions).toBe(0)
    expect(result.localizedRows).toBe(0)
    expect(result.processedRows).toBe(0)
    expect(result.unchangedRows).toBe(0)
    expect(remainingDivisions.count).toBe(0)
    expect(remainingI18n.count).toBe(0)
    expect(currentVersions.count).toBe(0)
  })
})
