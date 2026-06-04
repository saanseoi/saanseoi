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

const tempDirs: string[] = []
let parquetBatches: Array<Array<Record<string, unknown>>> = [
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

const { __test__, processDatasetMessage } = await import('./harbour-worker')

function createTempDir() {
  const dir = mkdtempSync(join(tmpdir(), 'harbour-worker-test-'))
  tempDirs.push(dir)
  return dir
}

function initDb(dbPath: string) {
  const db = new Database(dbPath)
  db.exec(migrationSql.replaceAll('--> statement-breakpoint', ''))
  return db
}

afterEach(() => {
  parquetBatches = [
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

  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()

    if (dir) {
      rmSync(dir, { recursive: true, force: true })
    }
  }
})

describe('processDatasetMessage', () => {
  test('retries transient sqlite lock errors on writes', async () => {
    let attempts = 0

    const result = await __test__.runWithWriteRetry(async () => {
      attempts += 1

      if (attempts === 1) {
        throw new Error('Failed query', {
          cause: new Error('database is locked'),
        })
      }

      return 'ok'
    })

    expect(result).toBe('ok')
    expect(attempts).toBe(2)
    expect(
      __test__.isRetryableSqliteWriteError(
        new Error('wrapper', {
          cause: new Error('SQLITE_BUSY: database is locked'),
        }),
      ),
    ).toBe(true)
    expect(__test__.getMaxRowsPerInsert(7)).toBeLessThan(20)
    expect(__test__.chunkArray([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
  })

  test('processes division datasets and reports stage state through the control API', async () => {
    const tempDir = createTempDir()
    const dbPath = join(tempDir, 'harbour-worker.sqlite')
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

    const stageStarted = mock(async () => undefined)
    const stageCompleted = mock(async () => undefined)
    const stageFailed = mock(async () => undefined)
    const publishDataset = mock(async () => undefined)

    const result = await processDatasetMessage(
      {
        publishDataset,
        stageCompleted,
        stageFailed,
        stageStarted,
      },
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
        'SELECT divisionId, locale, otName FROM divisionsI18n ORDER BY divisionId, locale',
      )
      .all() as Array<{
      divisionId: string
      locale: string
      otName: string | null
    }>

    sqlite.close()

    expect(result).toEqual({
      deletedRows: 1,
      insertedVersions: 2,
      localizedRows: 4,
      processedRows: 2,
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
      },
      {
        divisionId: 'division-central',
        locale: 'zh-hk',
        otName: '中環',
      },
      {
        divisionId: 'division-hk-island',
        locale: 'en',
        otName: 'Hong Kong Island',
      },
      {
        divisionId: 'division-hk-island',
        locale: 'zh-hk',
        otName: '香港島',
      },
    ])
    expect(
      stageStarted.mock.calls.map(call => call.slice(0, 2)) as unknown as Array<
        [string, string]
      >,
    ).toEqual([
      ['overture-hk-2026-05-24.0-division', 'processDataset'],
      ['overture-hk-2026-05-24.0-division', 'extractDivisions'],
      ['overture-hk-2026-05-24.0-division', 'extractDivisionsI18n'],
      ['overture-hk-2026-05-24.0-division', 'publishDataset'],
    ])
    expect(
      stageCompleted.mock.calls.map(call => call.slice(0, 2)) as unknown as Array<
        [string, string]
      >,
    ).toEqual([
      ['overture-hk-2026-05-24.0-division', 'extractDivisions'],
      ['overture-hk-2026-05-24.0-division', 'extractDivisionsI18n'],
      ['overture-hk-2026-05-24.0-division', 'publishDataset'],
      ['overture-hk-2026-05-24.0-division', 'processDataset'],
    ])
    expect(publishDataset).toHaveBeenCalledWith('overture-hk-2026-05-24.0-division')
    expect(stageFailed).toHaveBeenCalledTimes(0)
  })

  test('splits large localized division inserts into smaller D1-safe chunks', async () => {
    const locales = Array.from({ length: 25 }, (_, index) => `lang-${index}`)
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
    const dbPath = join(tempDir, 'harbour-worker-many-locales.sqlite')
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

    await processDatasetMessage(
      {
        publishDataset: mock(async () => undefined),
        stageCompleted: mock(async () => undefined),
        stageFailed: mock(async () => undefined),
        stageStarted: mock(async () => undefined),
      },
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
})
