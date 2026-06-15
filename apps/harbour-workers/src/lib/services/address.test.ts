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
import { insertSourceOvertureAddress2dI18nVersions } from '../db/source'

const migrationsDir = resolve(import.meta.dir, '../../../../../libs/db/migrations')
const migrationSql = loadMigrationSql(migrationsDir)

const baseParquetBatches: Array<Array<Record<string, unknown>>> = [
  [
    {
      id: 'ovt-address-1',
      address_levels: ['Hong Kong', 'Central District'],
      street: 'Queensway',
      number: '10',
      geometry: {
        type: 'Point',
        coordinates: [114.165, 22.278],
      },
      bbox: { minX: 114.164, minY: 22.277, maxX: 114.166, maxY: 22.279 },
      sources: [{ dataset: 'overture', recordId: 'ovt-address-1' }],
      version: 1,
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

const { processAddressDataset } = await import('./address')

function createTempDir() {
  const dir = mkdtempSync(join(tmpdir(), 'address-test-'))
  tempDirs.push(dir)
  return dir
}

function initDb(dbPath: string) {
  const db = new Database(dbPath)
  db.exec(migrationSql.replaceAll('--> statement-breakpoint', ''))
  seedFixtureCatalog(db)
  return db
}

function seedAddressRelease(
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
    type: 'address',
    sourceVersion,
    rawObjectKey: `hk/overture/${sourceVersion}/address.parquet`,
    originalFileName: 'address.parquet',
    status,
    ingestedAt,
    createdAt: ingestedAt,
    updatedAt: ingestedAt,
  })
}

function createAddressMessage(
  releaseCode: string,
  snapshotMonth: string,
  sourceVersion: string,
) {
  return {
    datasetId: releaseCode,
    releaseCode,
    releaseId: `release-${releaseCode}`,
    rawObjectKey: `hk/overture/${sourceVersion}/address.parquet`,
    regionCode: 'hk',
    snapshotMonth,
    source: 'overture',
    sourceVersion,
    theme: 'addresses',
    type: 'address',
  } as const
}

function seedDivisionLookups(sqlite: Database) {
  const now = '2026-06-04T00:00:00.000Z'

  sqlite.exec(`
    INSERT INTO divisions (
      id, level, type, subtype, class, wikidata,
      hierarchy, parentDivisionId, cartography, bbox, sources, createdAt, updatedAt
    ) VALUES
      ('country-cn', 0, 'country', 'country', 'country', null, null, null, null, null, null, '${now}', '${now}'),
      ('area-hk', 1, 'area', 'region', 'region', null, null, 'country-cn', null, null, null, '${now}', '${now}'),
      ('district-central', 2, 'district', 'district', 'district', null, null, 'area-hk', null, null, null, '${now}', '${now}');

    INSERT INTO divisionsI18n (
      divisionId, locale, name, nameVariant, nameAlts, nameRules, localType, isLocaleInferred, createdAt, updatedAt
    ) VALUES
      ('country-cn', 'en', 'China', null, null, null, null, 0, '${now}', '${now}'),
      ('area-hk', 'en', 'Hong Kong', null, null, null, null, 0, '${now}', '${now}'),
      ('district-central', 'en', 'Central District', null, null, null, null, 0, '${now}', '${now}');
  `)
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

describe('processAddressDataset', () => {
  test('dedupes source overture address releases into current and version tables', async () => {
    const tempDir = createTempDir()
    const dbPath = join(tempDir, 'address.sqlite')
    const sqlite = initDb(dbPath)
    const db = createLocalHarbourDb(sqlite)

    seedDivisionLookups(sqlite)
    seedAddressRelease(sqlite, 'overture-hk-2026-05-24.0-address', '2026-05', 'staged')

    await processAddressDataset(
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
      createAddressMessage(
        'overture-hk-2026-05-24.0-address',
        '2026-05',
        '2026-05-24.0',
      ),
      db as never,
    )

    const nextBaseRow = baseParquetBatches[0]?.[0]

    if (!nextBaseRow) {
      throw new Error('Missing base address fixture row.')
    }

    parquetBatches = [
      [
        {
          ...nextBaseRow,
          geometry: {
            type: 'Point',
            coordinates: [114.166, 22.279],
          },
          version: 2,
        },
      ],
    ]

    seedAddressRelease(sqlite, 'overture-hk-2026-06-24.0-address', '2026-06', 'staged')

    await processAddressDataset(
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
      createAddressMessage(
        'overture-hk-2026-06-24.0-address',
        '2026-06',
        '2026-06-24.0',
      ),
      db as never,
    )

    const currentRows = sqlite
      .query(
        'SELECT sourceRecordId, releaseId, version, geometry FROM sourceOvertureAddresses2d ORDER BY sourceRecordId',
      )
      .all() as Array<{
      sourceRecordId: string
      releaseId: string
      version: number | null
      geometry: string | null
    }>

    const versionRows = sqlite
      .query(
        'SELECT sourceRecordId, releaseId, validFromRelease, validToRelease, isCurrent, version FROM sourceOvertureAddresses2dVersions ORDER BY validFromRelease',
      )
      .all() as Array<{
      sourceRecordId: string
      releaseId: string
      validFromRelease: string
      validToRelease: string | null
      isCurrent: number
      version: number | null
    }>

    expect(currentRows).toHaveLength(1)
    expect(currentRows[0]).toMatchObject({
      sourceRecordId: 'ovt-address-1',
      releaseId: 'release-overture-hk-2026-06-24.0-address',
      version: 2,
    })
    expect(currentRows[0]?.geometry).toContain('114.166')

    expect(versionRows).toEqual([
      {
        sourceRecordId: 'ovt-address-1',
        releaseId: 'release-overture-hk-2026-05-24.0-address',
        validFromRelease: '2026-05-24.0',
        validToRelease: '2026-06-24.0',
        isCurrent: 0,
        version: 1,
      },
      {
        sourceRecordId: 'ovt-address-1',
        releaseId: 'release-overture-hk-2026-06-24.0-address',
        validFromRelease: '2026-06-24.0',
        validToRelease: null,
        isCurrent: 1,
        version: 2,
      },
    ])
  })

  test('chunks large changed source address batches below the D1 variable limit', async () => {
    const tempDir = createTempDir()
    const dbPath = join(tempDir, 'address-large-source-batch.sqlite')
    const sqlite = initDb(dbPath)
    const db = createLocalHarbourDb(sqlite)

    seedDivisionLookups(sqlite)

    const firstReleaseRows = Array.from({ length: 96 }, (_, index) => ({
      id: `ovt-address-${index + 1}`,
      address_levels: ['Hong Kong', 'Central District'],
      street: 'Queensway',
      number: String(index + 1),
      geometry: {
        type: 'Point',
        coordinates: [114.165 + index / 10000, 22.278 + index / 10000],
      },
      bbox: {
        minX: 114.164 + index / 10000,
        minY: 22.277 + index / 10000,
        maxX: 114.166 + index / 10000,
        maxY: 22.279 + index / 10000,
      },
      sources: [{ dataset: 'overture', recordId: `ovt-address-${index + 1}` }],
      version: 1,
    }))

    parquetBatches = [firstReleaseRows]
    seedAddressRelease(sqlite, 'overture-hk-2026-05-24.0-address', '2026-05', 'staged')

    await processAddressDataset(
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
      createAddressMessage(
        'overture-hk-2026-05-24.0-address',
        '2026-05',
        '2026-05-24.0',
      ),
      db as never,
    )

    parquetBatches = [
      firstReleaseRows.map(row => ({
        ...row,
        geometry: {
          type: 'Point',
          coordinates: [
            row.geometry.coordinates[0] + 0.001,
            row.geometry.coordinates[1],
          ],
        },
        version: 2,
      })),
    ]
    seedAddressRelease(sqlite, 'overture-hk-2026-06-24.0-address', '2026-06', 'staged')

    await processAddressDataset(
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
      createAddressMessage(
        'overture-hk-2026-06-24.0-address',
        '2026-06',
        '2026-06-24.0',
      ),
      db as never,
    )

    const versionCounts = sqlite
      .query(
        `SELECT
          sum(CASE WHEN isCurrent = 1 THEN 1 ELSE 0 END) as currentCount,
          sum(CASE WHEN isCurrent = 0 THEN 1 ELSE 0 END) as closedCount
        FROM sourceOvertureAddresses2dVersions`,
      )
      .get() as {
      closedCount: number
      currentCount: number
    }

    expect(versionCounts).toEqual({
      currentCount: 96,
      closedCount: 96,
    })
  })

  test('chunks overture address i18n version inserts below the D1 variable limit', async () => {
    const tempDir = createTempDir()
    const dbPath = join(tempDir, 'address-i18n-versions.sqlite')
    const sqlite = initDb(dbPath)
    const db = createLocalHarbourDb(sqlite)

    const rows = Array.from({ length: 9 }, (_, index) => ({
      sourceRecordId: `ovt-address-${index + 1}`,
      versionHash: `hash-${index + 1}`,
      releaseId: 'release-overture-hk-2026-06-24.0-address',
      validFromRelease: '2026-06-24.0',
      validToRelease: null,
      isCurrent: true,
      locale: index % 2 === 0 ? 'en' : 'zh-hant',
      streetName: `Street ${index + 1}`,
      locality: null,
      region: null,
      country: null,
    }))

    await insertSourceOvertureAddress2dI18nVersions(db as never, rows)

    const insertedCount = sqlite
      .query('SELECT count(*) as count FROM sourceOvertureAddress2dI18nVersions')
      .get() as { count: number }

    expect(insertedCount.count).toBe(9)
  })
})
