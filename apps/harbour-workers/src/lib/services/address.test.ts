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

const { prepareAddressVersionInsertContext } = await import('../db/address')
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

function createHkgovAddressMessage(
  releaseCode: string,
  snapshotMonth: string,
  sourceVersion: string,
) {
  return {
    datasetId: releaseCode,
    releaseCode,
    releaseId: `release-${releaseCode}`,
    rawObjectKey: `hk/hkgov-als/${sourceVersion}/address.parquet`,
    regionCode: 'hk',
    snapshotMonth,
    source: 'hkgov-als',
    sourceVersion,
    theme: 'addresses',
    type: 'address',
  } as const
}

function getSnapshotId(sqlite: Database, code: string) {
  const row = sqlite
    .query(
      `
        SELECT s.id
        FROM snapshots s
        INNER JOIN snapshotSources ss ON ss.snapshotId = s.id
        INNER JOIN releases r ON r.id = ss.sourceReleaseId
        WHERE r.code = ?1
        ORDER BY s.createdAt DESC
        LIMIT 1
      `,
    )
    .get(code) as { id: string } | null

  if (!row) {
    throw new Error(`Snapshot not found for release ${code}.`)
  }

  return row.id
}

function publishSnapshotForRelease(
  sqlite: Database,
  releaseCode: string,
  publishedAt = '2026-06-04T00:00:00.000Z',
) {
  const snapshotId = getSnapshotId(sqlite, releaseCode)
  const release = sqlite
    .query('SELECT id AS releaseId, datasetId FROM releases WHERE code = ?1')
    .get(releaseCode) as { datasetId: string; releaseId: string } | null

  if (!release) {
    throw new Error(`Release not found for ${releaseCode}.`)
  }

  const publishedAtMs = new Date(publishedAt).getTime()

  sqlite
    .query(
      `
        UPDATE snapshots
        SET status = 'published',
            publishedAt = ?1,
            validFrom = ?1,
            updatedAt = ?1
        WHERE id = ?2
      `,
    )
    .run(publishedAtMs, snapshotId)
  sqlite
    .query(
      `
        INSERT OR IGNORE INTO snapshotSources (
          snapshotId,
          datasetId,
          sourceReleaseId,
          role,
          createdAt
        ) VALUES (
          ?1,
          ?2,
          ?3,
          'primary',
          ?4
        )
      `,
    )
    .run(snapshotId, release.datasetId, release.releaseId, publishedAtMs)

  return snapshotId
}

function seedDivisionLookups(sqlite: Database) {
  const now = '2026-06-04T00:00:00.000Z'
  const timestamp = 1780531200000
  const snapshotId = 'snapshot-published-hk-division'

  sqlite.exec(`
    INSERT INTO snapshots (
      id, resourceType, code, status, publishedAt, validFrom, validTo, notes, createdAt, updatedAt
    ) VALUES (
      '${snapshotId}',
      'division',
      'hk-division-published',
      'published',
      ${timestamp},
      ${timestamp},
      null,
      null,
      ${timestamp},
      ${timestamp}
    );

    INSERT INTO divisions (
      snapshotId, id, level, type, subtype, class, wikidata,
      hierarchy, parentDivisionId, cartography, bbox, sources, createdAt, updatedAt
    ) VALUES
      ('${snapshotId}', 'country-cn', 0, 'country', 'country', 'country', null, null, null, null, null, null, '${now}', '${now}'),
      ('${snapshotId}', 'area-hk', 1, 'area', 'region', 'region', null, null, 'country-cn', null, null, null, '${now}', '${now}'),
      ('${snapshotId}', 'district-central', 2, 'district', 'district', 'district', null, null, 'area-hk', null, null, null, '${now}', '${now}');

    INSERT INTO divisionsI18n (
      snapshotId, divisionId, locale, name, nameVariant, nameAlts, nameRules, localType, isLocaleInferred, createdAt, updatedAt
    ) VALUES
      ('${snapshotId}', 'country-cn', 'en', 'China', null, null, null, null, 0, '${now}', '${now}'),
      ('${snapshotId}', 'area-hk', 'en', 'Hong Kong', null, null, null, null, 0, '${now}', '${now}'),
      ('${snapshotId}', 'district-central', 'en', 'Central District', null, null, null, null, 0, '${now}', '${now}');
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
  test('marks hkgov-als address releases as primary snapshot sources', async () => {
    const tempDir = createTempDir()
    const dbPath = join(tempDir, 'address-hkgov-role.sqlite')
    const sqlite = initDb(dbPath)
    const db = createLocalHarbourDb(sqlite)
    const releaseCode = 'hkgov-als-hk-2026-06-24.0-address'

    insertFixtureRelease(sqlite, {
      releaseId: `release-${releaseCode}`,
      releaseCode,
      source: 'hkgov-als',
      regionCode: 'hk',
      snapshotMonth: '2026-06',
      type: 'address',
      sourceVersion: '2026-06-24.0',
      rawObjectKey: 'hk/hkgov-als/2026-06-24.0/address.parquet',
      originalFileName: 'address.parquet',
      status: 'staged',
      ingestedAt: '2026-06-04T00:00:00.000Z',
      createdAt: '2026-06-04T00:00:00.000Z',
      updatedAt: '2026-06-04T00:00:00.000Z',
    })

    const context = await prepareAddressVersionInsertContext(
      db as never,
      createHkgovAddressMessage(releaseCode, '2026-06', '2026-06-24.0'),
      'preview',
    )

    const snapshotSource = sqlite
      .query(
        `
          SELECT role
          FROM snapshotSources
          WHERE snapshotId = ?1 AND sourceReleaseId = ?2
          LIMIT 1
        `,
      )
      .get(context.snapshotId, `release-${releaseCode}`) as { role: string } | null

    expect(context.releaseRole).toBe('primary')
    expect(snapshotSource).toEqual({ role: 'primary' })
  })

  test('clones unchanged canonical address rows into later snapshots without rewriting history', async () => {
    const tempDir = createTempDir()
    const dbPath = join(tempDir, 'address-unchanged.sqlite')
    const sqlite = initDb(dbPath)
    const db = createLocalHarbourDb(sqlite)

    seedDivisionLookups(sqlite)
    seedAddressRelease(sqlite, 'overture-hk-2026-05-24.0-address', '2026-05', 'staged')

    const initialResult = await processAddressDataset(
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
    publishSnapshotForRelease(sqlite, 'overture-hk-2026-05-24.0-address')

    seedAddressRelease(sqlite, 'overture-hk-2026-06-24.0-address', '2026-06', 'staged')

    const unchangedResult = await processAddressDataset(
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

    const secondSnapshotId = getSnapshotId(sqlite, 'overture-hk-2026-06-24.0-address')
    const currentRows = sqlite
      .query('SELECT snapshotId, id FROM address2d WHERE snapshotId = ?1 ORDER BY id')
      .all(secondSnapshotId) as Array<{
      id: string
      snapshotId: string
    }>
    const currentI18nRows = sqlite
      .query(
        'SELECT snapshotId, addressId, locale FROM address2dI18n WHERE snapshotId = ?1 ORDER BY addressId, locale',
      )
      .all(secondSnapshotId) as Array<{
      addressId: string
      locale: string
      snapshotId: string
    }>
    const canonicalVersionRows = sqlite
      .query(
        "SELECT id, sourceReleaseId, snapshotId, validFromSnapshotId, validToSnapshotId, isCurrent FROM address2dVersions WHERE id = 'ovt-address-1' ORDER BY createdAt",
      )
      .all() as Array<{
      id: string
      isCurrent: number
      snapshotId: string
      sourceReleaseId: string
      validFromSnapshotId: string
      validToSnapshotId: string | null
    }>
    const canonicalI18nVersionRows = sqlite
      .query(
        "SELECT addressId, locale, sourceReleaseId, snapshotId, validFromSnapshotId, validToSnapshotId, isCurrent FROM address2dVersionsI18n WHERE addressId = 'ovt-address-1' ORDER BY locale",
      )
      .all() as Array<{
      addressId: string
      isCurrent: number
      locale: string
      snapshotId: string
      sourceReleaseId: string
      validFromSnapshotId: string
      validToSnapshotId: string | null
    }>
    const currentSourceRows = sqlite
      .query(
        "SELECT sourceRecordId, releaseId FROM sourceOvertureAddresses2d WHERE sourceRecordId = 'ovt-address-1'",
      )
      .all() as Array<{
      releaseId: string
      sourceRecordId: string
    }>
    const sourceVersionRows = sqlite
      .query(
        "SELECT sourceRecordId, releaseId, validFromRelease, validToRelease, isCurrent FROM sourceOvertureAddresses2dVersions WHERE sourceRecordId = 'ovt-address-1' ORDER BY validFromRelease",
      )
      .all() as Array<{
      isCurrent: number
      releaseId: string
      sourceRecordId: string
      validFromRelease: string
      validToRelease: string | null
    }>

    expect(initialResult.insertedVersions).toBe(1)
    expect(initialResult.unchangedRows).toBe(0)
    expect(unchangedResult.insertedVersions).toBe(0)
    expect(unchangedResult.unchangedRows).toBe(1)
    expect(currentRows).toEqual([{ snapshotId: secondSnapshotId, id: 'ovt-address-1' }])
    expect(currentI18nRows).toEqual([
      {
        snapshotId: secondSnapshotId,
        addressId: 'ovt-address-1',
        locale: 'en',
      },
    ])
    expect(canonicalVersionRows).toHaveLength(1)
    expect(canonicalVersionRows[0]).toMatchObject({
      id: 'ovt-address-1',
      isCurrent: 1,
      sourceReleaseId: 'release-overture-hk-2026-05-24.0-address',
      validToSnapshotId: null,
    })
    expect(canonicalI18nVersionRows).toEqual([
      {
        addressId: 'ovt-address-1',
        locale: 'en',
        sourceReleaseId: 'release-overture-hk-2026-05-24.0-address',
        snapshotId: canonicalVersionRows[0]?.snapshotId ?? '',
        validFromSnapshotId: canonicalVersionRows[0]?.validFromSnapshotId ?? '',
        validToSnapshotId: null,
        isCurrent: 1,
      },
    ])
    expect(currentSourceRows).toEqual([
      {
        sourceRecordId: 'ovt-address-1',
        releaseId: 'release-overture-hk-2026-06-24.0-address',
      },
    ])
    expect(sourceVersionRows).toEqual([
      {
        sourceRecordId: 'ovt-address-1',
        releaseId: 'release-overture-hk-2026-05-24.0-address',
        validFromRelease: '2026-05-24.0',
        validToRelease: null,
        isCurrent: 1,
      },
    ])
  })

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
      firstReleaseRows.map(row => {
        const [lng, lat] = row.geometry.coordinates
        if (lng === undefined || lat === undefined) {
          throw new Error(`Missing geometry coordinates for ${row.id}`)
        }
        return {
          ...row,
          geometry: {
            type: 'Point',
            coordinates: [lng + 0.001, lat],
          },
          version: 2,
        }
      }),
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

  test('removes stale current address rows when retrying the same release snapshot', async () => {
    const tempDir = createTempDir()
    const dbPath = join(tempDir, 'address-retry-stale-current.sqlite')
    const sqlite = initDb(dbPath)
    const db = createLocalHarbourDb(sqlite)
    const releaseCode = 'overture-hk-2026-05-24.0-address'
    const sourceVersion = '2026-05-24.0'

    seedDivisionLookups(sqlite)
    seedAddressRelease(sqlite, releaseCode, '2026-05', 'staged')

    parquetBatches = [
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
        {
          id: 'ovt-address-stale',
          address_levels: ['Hong Kong', 'Central District'],
          street: 'Queensway',
          number: '12',
          geometry: {
            type: 'Point',
            coordinates: [114.167, 22.279],
          },
          bbox: { minX: 114.166, minY: 22.278, maxX: 114.168, maxY: 22.28 },
          sources: [{ dataset: 'overture', recordId: 'ovt-address-stale' }],
          version: 1,
        },
      ],
    ]

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
      createAddressMessage(releaseCode, '2026-05', sourceVersion),
      db as never,
    )

    parquetBatches = [
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

    const result = await processAddressDataset(
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
      createAddressMessage(releaseCode, '2026-05', sourceVersion),
      db as never,
    )

    const currentRows = sqlite
      .query('SELECT id FROM address2d ORDER BY id')
      .all() as Array<{ id: string }>
    const currentI18nRows = sqlite
      .query('SELECT addressId, locale FROM address2dI18n ORDER BY addressId, locale')
      .all() as Array<{ addressId: string; locale: string }>

    expect(result.deletedRows).toBe(1)
    expect(currentRows).toEqual([{ id: 'ovt-address-1' }])
    expect(currentI18nRows).toEqual([{ addressId: 'ovt-address-1', locale: 'en' }])
  })

  test('reports batch progress even when no source database is available', async () => {
    const tempDir = createTempDir()
    const dbPath = join(tempDir, 'address-progress-no-source.sqlite')
    const sqlite = initDb(dbPath)
    const db = createLocalHarbourDb(sqlite)
    const progress = mock(async () => undefined)

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
      undefined,
      progress,
    )

    sqlite.close()

    expect(progress).toHaveBeenCalledTimes(1)
    const [firstProgressCall] = progress.mock.calls as unknown as Array<
      [{ localizedRows: number; processedRows: number }]
    >
    expect(firstProgressCall?.[0]).toMatchObject({
      processedRows: 1,
    })
  })
})
