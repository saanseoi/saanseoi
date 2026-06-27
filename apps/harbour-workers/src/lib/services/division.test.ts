import { afterEach, describe, expect, mock, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { Database } from 'bun:sqlite'

import {
  insertFixtureRelease,
  loadMigrationSql,
  seedFixtureCatalog,
} from '../../../../../libs/core/src/testing/meta-fixtures'
import { createLocalHarbourDb } from '../../../../../libs/core/src/testing/local-db'

const migrationsDir = resolve(import.meta.dir, '../../../../../libs/db/migrations')
const migrationSql = loadMigrationSql(migrationsDir)

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
  seedFixtureCatalog(db)
  return db
}

function seedDivisionRelease(
  sqlite: Database,
  releaseCode: string,
  snapshotMonth: string,
  status: string,
  ingestedAt = '2026-06-04T00:00:00.000Z',
) {
  const sourceVersion = releaseCode.split('-').slice(2, -1).join('-')

  return insertFixtureRelease(sqlite, {
    releaseId: `release-${releaseCode}`,
    releaseCode,
    source: 'overture',
    regionCode: 'hk',
    snapshotMonth,
    type: 'division',
    sourceVersion,
    rawObjectKey: `hk/overture/${sourceVersion}/division.parquet`,
    originalFileName: 'division.parquet',
    status,
    ingestedAt,
    createdAt: ingestedAt,
    updatedAt: ingestedAt,
  })
}

function createDivisionMessage(
  releaseCode: string,
  snapshotMonth: string,
  sourceVersion: string,
) {
  return {
    datasetId: releaseCode,
    releaseCode,
    releaseId: `release-${releaseCode}`,
    rawObjectKey: `hk/overture/${sourceVersion}/division.parquet`,
    regionCode: 'hk',
    snapshotMonth,
    source: 'overture',
    sourceVersion,
    theme: 'divisions',
    type: 'division',
  } as const
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
  test('does not rewrite unchanged current and source rows in later releases', async () => {
    const tempDir = createTempDir()
    const dbPath = join(tempDir, 'division-unchanged.sqlite')
    const sqlite = initDb(dbPath)
    const db = createLocalHarbourDb(sqlite)

    seedDivisionRelease(
      sqlite,
      'overture-hk-2026-05-24.0-division',
      '2026-05',
      'staged',
    )

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
      createDivisionMessage(
        'overture-hk-2026-05-24.0-division',
        '2026-05',
        '2026-05-24.0',
      ),
      db as never,
    )

    const firstDivisionRow = sqlite
      .query("SELECT updatedAt FROM divisions WHERE id = 'division-hk-island'")
      .get() as { updatedAt: string }
    const firstChangedDivisionRow = sqlite
      .query("SELECT updatedAt FROM divisions WHERE id = 'division-central'")
      .get() as { updatedAt: string }
    const firstDivisionI18nRow = sqlite
      .query(
        "SELECT updatedAt FROM divisionsI18n WHERE divisionId = 'division-hk-island' AND locale = 'en'",
      )
      .get() as { updatedAt: string }
    const firstChangedDivisionI18nRow = sqlite
      .query(
        "SELECT updatedAt FROM divisionsI18n WHERE divisionId = 'division-central' AND locale = 'en'",
      )
      .get() as { updatedAt: string }

    const nextIslandRow = baseParquetBatches[0]?.[0]
    const nextCentralRow = baseParquetBatches[0]?.[1]

    if (!nextIslandRow || !nextCentralRow) {
      throw new Error('Missing division fixture rows.')
    }

    parquetBatches = [
      [
        nextIslandRow,
        {
          ...nextCentralRow,
          population: 42,
          version: 202,
        },
      ],
    ]

    seedDivisionRelease(
      sqlite,
      'overture-hk-2026-06-24.0-division',
      '2026-06',
      'staged',
    )

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
      createDivisionMessage(
        'overture-hk-2026-06-24.0-division',
        '2026-06',
        '2026-06-24.0',
      ),
      db as never,
    )

    const sourceCurrentRows = sqlite
      .query(
        'SELECT sourceRecordId, releaseId FROM sourceOvertureDivisions ORDER BY sourceRecordId',
      )
      .all() as Array<{
      sourceRecordId: string
      releaseId: string
    }>
    const currentRows = sqlite
      .query('SELECT id, updatedAt FROM divisions ORDER BY id')
      .all() as Array<{
      id: string
      updatedAt: string
    }>
    const currentI18nRows = sqlite
      .query(
        "SELECT divisionId, locale, updatedAt FROM divisionsI18n WHERE locale = 'en' ORDER BY divisionId",
      )
      .all() as Array<{
      divisionId: string
      locale: string
      updatedAt: string
    }>
    const sourceVersionCounts = sqlite
      .query(
        'SELECT sourceRecordId, count(*) AS count FROM sourceOvertureDivisionsVersions GROUP BY sourceRecordId ORDER BY sourceRecordId',
      )
      .all() as Array<{
      sourceRecordId: string
      count: number
    }>

    expect(sourceCurrentRows).toEqual([
      {
        sourceRecordId: 'division-central',
        releaseId: 'release-overture-hk-2026-06-24.0-division',
      },
      {
        sourceRecordId: 'division-hk-island',
        releaseId: 'release-overture-hk-2026-06-24.0-division',
      },
    ])
    expect(currentRows.map(row => row.id)).toEqual([
      'division-central',
      'division-hk-island',
    ])
    expect(currentI18nRows.map(row => row.divisionId)).toEqual([
      'division-central',
      'division-hk-island',
    ])
    expect(currentRows[1]?.updatedAt).toBe(firstDivisionRow.updatedAt)
    expect(currentI18nRows[1]?.updatedAt).toBe(firstDivisionI18nRow.updatedAt)
    expect(sourceVersionCounts).toEqual([
      {
        sourceRecordId: 'division-central',
        count: 2,
      },
      {
        sourceRecordId: 'division-hk-island',
        count: 1,
      },
    ])
    expect(currentRows[0]?.updatedAt).not.toBe(firstChangedDivisionRow.updatedAt)
    expect(currentI18nRows[0]?.updatedAt).not.toBe(
      firstChangedDivisionI18nRow.updatedAt,
    )
  })

  test('dedupes source overture division releases into current and version tables', async () => {
    const tempDir = createTempDir()
    const dbPath = join(tempDir, 'division-source.sqlite')
    const sqlite = initDb(dbPath)
    const db = createLocalHarbourDb(sqlite)

    seedDivisionRelease(
      sqlite,
      'overture-hk-2026-05-24.0-division',
      '2026-05',
      'staged',
    )

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
      createDivisionMessage(
        'overture-hk-2026-05-24.0-division',
        '2026-05',
        '2026-05-24.0',
      ),
      db as never,
    )

    const nextBaseRow = baseParquetBatches[0]?.[0]

    if (!nextBaseRow) {
      throw new Error('Missing base division fixture row.')
    }

    parquetBatches = [
      [
        {
          ...nextBaseRow,
          population: 654321,
          version: 201,
        },
      ],
    ]

    seedDivisionRelease(
      sqlite,
      'overture-hk-2026-06-24.0-division',
      '2026-06',
      'staged',
    )

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
      createDivisionMessage(
        'overture-hk-2026-06-24.0-division',
        '2026-06',
        '2026-06-24.0',
      ),
      db as never,
    )

    const currentRows = sqlite
      .query(
        "SELECT sourceRecordId, releaseId, population, version FROM sourceOvertureDivisions WHERE sourceRecordId = 'division-hk-island'",
      )
      .all() as Array<{
      sourceRecordId: string
      releaseId: string
      population: number | null
      version: number | null
    }>

    const versionRows = sqlite
      .query(
        "SELECT sourceRecordId, releaseId, validFromRelease, validToRelease, isCurrent, population, version FROM sourceOvertureDivisionsVersions WHERE sourceRecordId = 'division-hk-island' ORDER BY validFromRelease",
      )
      .all() as Array<{
      sourceRecordId: string
      releaseId: string
      validFromRelease: string
      validToRelease: string | null
      isCurrent: number
      population: number | null
      version: number | null
    }>

    expect(currentRows).toEqual([
      {
        sourceRecordId: 'division-hk-island',
        releaseId: 'release-overture-hk-2026-06-24.0-division',
        population: 654321,
        version: 201,
      },
    ])
    expect(versionRows).toEqual([
      {
        sourceRecordId: 'division-hk-island',
        releaseId: 'release-overture-hk-2026-05-24.0-division',
        validFromRelease: '2026-05-24.0',
        validToRelease: '2026-06-24.0',
        isCurrent: 0,
        population: 123456,
        version: 101,
      },
      {
        sourceRecordId: 'division-hk-island',
        releaseId: 'release-overture-hk-2026-06-24.0-division',
        validFromRelease: '2026-06-24.0',
        validToRelease: null,
        isCurrent: 1,
        population: 654321,
        version: 201,
      },
    ])
  })

  test('applies division dataset changes to current and versioned tables', async () => {
    const tempDir = createTempDir()
    const dbPath = join(tempDir, 'division.sqlite')
    const sqlite = initDb(dbPath)
    const db = createLocalHarbourDb(sqlite)
    const now = '2026-06-04T00:00:00.000Z'

    seedDivisionRelease(
      sqlite,
      'overture-hk-2026-04-24.0-division',
      '2026-04',
      'published',
      now,
    )

    sqlite.exec(`
      INSERT INTO divisions (
        id, level, type, subtype, class, wikidata,
        hierarchy, parentDivisionId, cartography, bbox, sources, createdAt, updatedAt
      ) VALUES (
        'division-obsolete', 1, 'area', 'region', 'region', null, null, null, null,
        null, null, '${now}', '${now}'
      );
    `)

    sqlite.exec(`
      INSERT INTO divisionsVersions (
        id, versionHash, regionCode, releaseId, validFromReleaseSetId, validToReleaseSetId,
        validFromMonth, validToMonth, isCurrent, level, type, subtype, class, wikidata,
        hierarchy, parentDivisionId, cartography, bbox, sources, createdAt, updatedAt
      ) VALUES (
        'division-obsolete', 'hash-obsolete', 'hk',
        'release-overture-hk-2026-04-24.0-division', 'api-release-set-ss-divisions-v0.1',
        null, '2026-04', null, 1, 1, 'area', 'region', 'region', null,
        null, null, null, null, null, '${now}', '${now}'
      );
    `)

    seedDivisionRelease(
      sqlite,
      'overture-hk-2026-05-24.0-division',
      '2026-05',
      'staged',
      now,
    )

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
      createDivisionMessage(
        'overture-hk-2026-05-24.0-division',
        '2026-05',
        '2026-05-24.0',
      ),
    )

    const divisionsRows = sqlite
      .query(
        "SELECT id, level, type, geometry, population, parentDivisionId, hierarchy, sources FROM divisions WHERE id != 'saanseoi-cn-prc' ORDER BY id",
      )
      .all() as Array<{
      id: string
      level: number
      type: string
      geometry: string | null
      population: number | null
      parentDivisionId: string | null
      hierarchy: string | null
      sources: string | null
    }>
    const i18nRows = sqlite
      .query(
        "SELECT divisionId, locale, name AS otName, isLocaleInferred FROM divisionsI18n WHERE divisionId != 'saanseoi-cn-prc' ORDER BY divisionId, locale",
      )
      .all() as Array<{
      divisionId: string
      locale: string
      otName: string | null
      isLocaleInferred: number
    }>
    const statsRows = sqlite
      .query(
        "SELECT s.dimension, s.metricUnit, s.groupValue, s.value FROM stats s INNER JOIN releases r ON r.id = s.releaseId WHERE r.code = 'overture-hk-2026-05-24.0-division' AND s.metric = 'completeness' ORDER BY s.dimension, s.groupValue",
      )
      .all() as Array<{
      dimension: string
      metricUnit: string
      groupValue: string | null
      value: number
    }>
    const churnStatsRows = sqlite
      .query(
        "SELECT s.dimension, s.groupBy, s.groupValue, s.value FROM stats s INNER JOIN releases r ON r.id = s.releaseId WHERE r.code = 'overture-hk-2026-05-24.0-division' AND s.metric = 'churn' ORDER BY s.groupBy, s.groupValue, s.dimension",
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
        level: 2,
        geometry: '{"type":"Point","coordinates":[114.15769,22.28171]}',
        population: null,
        hierarchy: '[{"ids":["division-hk-island","division-central"]}]',
        parentDivisionId: 'division-hk-island',
        sources: '{"overture":[{"dataset":"overture"}]}',
        type: 'district',
      },
      {
        id: 'division-hk-island',
        level: 1,
        geometry: '{"type":"Point","coordinates":[114.158229,22.281884]}',
        population: 123456,
        hierarchy: '[{"ids":["division-hk-island"]}]',
        parentDivisionId: null,
        sources: '{"overture":[{"dataset":"overture"}]}',
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

    seedDivisionRelease(
      sqlite,
      'overture-hk-2026-06-24.0-division',
      '2026-06',
      'staged',
    )

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
      createDivisionMessage(
        'overture-hk-2026-06-24.0-division',
        '2026-06',
        '2026-06-24.0',
      ),
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

    seedDivisionRelease(
      sqlite,
      'overture-hk-2026-05-24.0-division',
      '2026-05',
      'published',
      now,
    )

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
      createDivisionMessage(
        'overture-hk-2026-05-24.0-division',
        '2026-05',
        '2026-05-24.0',
      ),
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

    seedDivisionRelease(
      sqlite,
      'overture-hk-2026-06-24.0-division',
      '2026-06',
      'staged',
      now,
    )

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
      createDivisionMessage(
        'overture-hk-2026-06-24.0-division',
        '2026-06',
        '2026-06-24.0',
      ),
    )

    const churnRows = sqlite
      .query(
        "SELECT s.dimension, s.groupBy, s.groupValue, s.value FROM stats s INNER JOIN releases r ON r.id = s.releaseId WHERE r.code = 'overture-hk-2026-06-24.0-division' AND s.metric = 'churn' ORDER BY s.groupBy, s.groupValue, s.dimension",
      )
      .all()
    const qualityRows = sqlite
      .query(
        "SELECT s.dimension, s.value FROM stats s INNER JOIN releases r ON r.id = s.releaseId WHERE r.code = 'overture-hk-2026-06-24.0-division' AND s.metric = 'quality' ORDER BY s.dimension",
      )
      .all()

    sqlite.close()

    expect(result).toEqual({
      deletedRows: 1,
      insertedVersions: 2,
      localizedRows: 4,
      processedRows: 4,
      statsRows: 26,
      unchangedRows: 1,
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

    seedDivisionRelease(
      sqlite,
      'overture-hk-2026-09-24.0-division',
      '2026-09',
      'staged',
    )

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
      createDivisionMessage(
        'overture-hk-2026-09-24.0-division',
        '2026-09',
        '2026-09-24.0',
      ),
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

    seedDivisionRelease(
      sqlite,
      'overture-hk-2026-08-24.0-division',
      '2026-08',
      'staged',
    )

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
      createDivisionMessage(
        'overture-hk-2026-08-24.0-division',
        '2026-08',
        '2026-08-24.0',
      ),
    )

    const row = sqlite
      .query("SELECT hierarchy FROM divisions WHERE id = 'division-wrapped-hierarchy'")
      .get() as {
      hierarchy: string | null
    }

    sqlite.close()

    expect(row).toEqual({
      hierarchy: '[{"ids":["division-hk-island","division-wrapped-hierarchy"]}]',
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

    seedDivisionRelease(
      sqlite,
      'overture-hk-2026-07-24.0-division',
      '2026-07',
      'staged',
    )

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
      createDivisionMessage(
        'overture-hk-2026-07-24.0-division',
        '2026-07',
        '2026-07-24.0',
      ),
    )

    const i18nRows = sqlite
      .query(
        "SELECT divisionId, locale, name AS otName, nameAlts AS otNameAlts, nameVariant AS otNameVariantJson, nameRules AS otNameRulesJson, localType AS otLocalType, isLocaleInferred FROM divisionsI18n WHERE divisionId != 'saanseoi-cn-prc' ORDER BY divisionId, locale",
      )
      .all()
    const statsRows = sqlite
      .query(
        "SELECT s.dimension, s.groupValue, s.value FROM stats s INNER JOIN releases r ON r.id = s.releaseId WHERE r.code = 'overture-hk-2026-07-24.0-division' AND s.metric = 'completeness' ORDER BY s.dimension, s.groupValue",
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

    seedDivisionRelease(
      sqlite,
      'overture-hk-2026-07-24.0-division',
      '2026-07',
      'staged',
    )

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
      createDivisionMessage(
        'overture-hk-2026-07-24.0-division',
        '2026-07',
        '2026-07-24.0',
      ),
    )

    const i18nRows = sqlite
      .query(
        "SELECT divisionId, locale, name AS otName, nameAlts AS otNameAlts, nameVariant AS otNameVariantJson, nameRules AS otNameRulesJson FROM divisionsI18n WHERE divisionId != 'saanseoi-cn-prc' ORDER BY divisionId, locale",
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

    seedDivisionRelease(sqlite, previousDatasetId, '2026-04', 'published', now)

    sqlite.exec('BEGIN')

    for (let index = 0; index < existingDivisionCount; index += 1) {
      const divisionId = `division-existing-${index}`
      const versionHash = `hash-${index}`

      sqlite.exec(`
        INSERT INTO divisions (
          id, level, type, subtype, class, wikidata,
          hierarchy, parentDivisionId, cartography, bbox, sources, createdAt, updatedAt
        ) VALUES (
          '${divisionId}', 1, 'area', 'district', 'district', null, null, null,
          null, null, null, '${now}', '${now}'
        );
      `)

      sqlite.exec(`
        INSERT INTO divisionsI18n (
          divisionId, locale, name, nameAlts, nameVariant, nameRules,
          localType, isLocaleInferred, createdAt, updatedAt
        ) VALUES (
          '${divisionId}', 'en', 'Existing ${index}', null, '["Existing ${index}"]', null, null, 0,
          '${now}', '${now}'
        );
      `)

      sqlite.exec(`
        INSERT INTO divisionsVersions (
          id, versionHash, regionCode, releaseId, validFromReleaseSetId, validToReleaseSetId,
          validFromMonth, validToMonth, isCurrent, level, type, subtype, class, wikidata,
          hierarchy, parentDivisionId, cartography, bbox, sources, createdAt, updatedAt
        ) VALUES (
          '${divisionId}', '${versionHash}', 'hk',
          'release-${previousDatasetId}', 'api-release-set-ss-divisions-v0.1',
          null, '2026-04', null, 1, 1, 'area', 'district', 'district', null,
          null, null, null, null, null, '${now}', '${now}'
        );
      `)
    }

    sqlite.exec('COMMIT')

    seedDivisionRelease(sqlite, nextDatasetId, '2026-05', 'staged', now)

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
      createDivisionMessage(nextDatasetId, '2026-05', '2026-05-24.0'),
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
    const currentI18nVersions = sqlite
      .query(
        "SELECT count(*) as count FROM divisionsVersionsI18n WHERE isCurrent = 1 AND divisionId != 'saanseoi-cn-prc'",
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
    expect(currentI18nVersions.count).toBe(0)
  })
})
