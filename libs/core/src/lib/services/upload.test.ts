import { afterEach, describe, expect, test } from 'bun:test'
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { Database } from 'bun:sqlite'

import {
  finalizeUpload,
  createSchemaFingerprint,
  inferRegionFromPath,
  inferSnapshotMonthFromPath,
  inferSourceVersionFromFilename,
  inferSourceFromFilename,
  inferSourceFromPath,
  inferThemeFromFilename,
  inferThemeFromPath,
  inferTypeFromFilename,
  inferTypeFromPath,
  requestUpload,
} from './upload'
import { planUpload, prepareUpload, registerUpload } from './upload-local'
import { createLocalHarbourDb } from '../../testing/local-db'

import { datasets } from '@repo/db/schema'
import type { ParquetInspection } from '../../types'

const migrationsDir = resolve(import.meta.dir, '../../../../../libs/db/migrations')
const migrationSql = readdirSync(migrationsDir)
  .filter(fileName => fileName.endsWith('.sql'))
  .sort()
  .map(fileName => readFileSync(join(migrationsDir, fileName), 'utf8'))
  .join('\n')
const tempDirs: string[] = []
const fixtureInspection: ParquetInspection = {
  rowCount: 3,
  schema: [
    { name: 'id', type: 'string', nullable: false },
    { name: 'theme', type: 'string', nullable: true },
    { name: 'type', type: 'string', nullable: true },
    { name: 'country', type: 'string', nullable: true },
    { name: 'region', type: 'string', nullable: true },
  ],
  distinctThemeValues: ['divisions'],
  distinctTypeValues: ['division'],
  distinctCountryValues: ['hk'],
  distinctRegionValues: ['hk'],
}

const fixtureInspectionWithAdminLevel: ParquetInspection = {
  ...fixtureInspection,
  schema: [
    ...fixtureInspection.schema,
    { name: 'admin_level', type: 'int_32', nullable: true },
  ],
}

function createTempDir() {
  const dir = mkdtempSync(join(tmpdir(), 'harbour-test-'))
  tempDirs.push(dir)
  return dir
}

function createOvertureStyleFixture(tempDir: string) {
  const targetDir = join(tempDir, 'data/2025-09-24.0/divisions/中国/Hong Kong SAR')
  const targetFile = join(targetDir, 'division.parquet')

  mkdirSync(targetDir, { recursive: true })
  writeFileSync(targetFile, 'fixture')

  return targetFile
}

function createFixturePath(tempDir: string) {
  const fixtureFile = join(tempDir, 'hk-division-2026-05.parquet')

  writeFileSync(fixtureFile, 'fixture')

  return fixtureFile
}

function initDb(dbPath: string) {
  const db = new Database(dbPath)
  db.exec(migrationSql.replaceAll('--> statement-breakpoint', ''))

  return db
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) {
      rmSync(dir, { recursive: true, force: true })
    }
  }
})

describe('upload', () => {
  test('infers addresses theme from a singular filename', () => {
    expect(inferThemeFromFilename('address.parquet')).toBe('addresses')
    expect(inferTypeFromFilename('address.parquet')).toBe('address')
  })

  test('infers divisions theme from a singular filename', () => {
    expect(inferThemeFromFilename('division.parquet')).toBe('divisions')
    expect(inferTypeFromFilename('division.parquet')).toBe('division')
  })

  test('infers source from recognizable filename and path tokens', () => {
    expect(inferSourceFromFilename('hkgov-als-address.parquet')).toBe('hkgov')
    expect(inferSourceFromFilename('overture-address.parquet')).toBe('overture')
    expect(inferSourceFromPath('/tmp/hkgov/2026-05/address.parquet')).toBe('hkgov')
    expect(inferSourceFromPath('/tmp/overture/2026-05/address.parquet')).toBe(
      'overture',
    )
  })

  test('prefers the address filename signal over a broader parent theme folder', () => {
    const filePath =
      '/tmp/data/2025-09-24.0/divisions/中国/Hong Kong SAR/address.parquet'

    expect(inferTypeFromPath(filePath)).toBe('address')
    expect(inferThemeFromPath(filePath)).toBe('addresses')
    expect(inferRegionFromPath(filePath)).toBe('hk')
    expect(inferSnapshotMonthFromPath(filePath)).toBe('2025-09')
  })

  test('infers theme, region, and month from the full overture-style path', () => {
    const tempDir = createTempDir()
    const overtureFixturePath = createOvertureStyleFixture(tempDir)

    expect(inferTypeFromPath(overtureFixturePath)).toBe('division')
    expect(inferThemeFromPath(overtureFixturePath)).toBe('divisions')
    expect(inferRegionFromPath(overtureFixturePath)).toBe('hk')
    expect(inferSnapshotMonthFromPath(overtureFixturePath)).toBe('2025-09')
  })

  test('infers source version and snapshot month from the filename when needed', async () => {
    const tempDir = createTempDir()
    const fixtureFile = join(tempDir, 'hkgov-hk-2026-06-04.324-address.parquet')

    writeFileSync(fixtureFile, 'fixture')

    expect(inferSourceVersionFromFilename(fixtureFile)).toBe('2026-06-04.324')

    const planned = await prepareUpload({
      filePath: fixtureFile,
      inspection: {
        rowCount: 1,
        schema: fixtureInspection.schema,
        distinctThemeValues: ['addresses'],
        distinctTypeValues: ['address'],
        distinctCountryValues: ['hk'],
        distinctRegionValues: ['hk'],
      },
      source: 'hkgov-als',
    })

    expect(planned.plan.snapshotMonth).toBe('2026-06')
    expect(planned.plan.sourceVersion).toBe('2026-06-04.324')
    expect(planned.plan.datasetId).toBe('hkgov-hk-2026-06-04.324-address')
  })

  test('registers the first dataset upload against a provided raw object key', async () => {
    const tempDir = createTempDir()
    const dbPath = join(tempDir, 'harbour.sqlite')
    const fixtureFile = createFixturePath(tempDir)

    initDb(dbPath).close()
    const sqlite = new Database(dbPath)
    const db = createLocalHarbourDb(sqlite)

    const result = await registerUpload(db, {
      filePath: fixtureFile,
      snapshotMonth: '2026-05',
      source: 'overture',
      sourceVersion: '2026-05-24.0',
      inspection: fixtureInspection,
      rawObjectKey: 'hk/overture/2026-05-24.0/division.parquet',
    })
    sqlite.close()

    expect(result.plan.datasetId).toBe('overture-hk-2026-05-24.0-division')
    expect(result.plan.type).toBe('division')
    expect(result.plan.originalFileName).toBe('hk-division-2026-05.parquet')
    expect(result.rawObjectKey).toBe('hk/overture/2026-05-24.0/division.parquet')

    const sqliteCheck = new Database(dbPath)
    const dataset = sqliteCheck
      .query(
        'SELECT datasetId, status, rawObjectKey, originalFileName FROM datasets WHERE datasetId = ?',
      )
      .get('overture-hk-2026-05-24.0-division') as {
      datasetId: string
      status: string
      rawObjectKey: string
      originalFileName: string
    } | null
    const ingestRunCount = sqliteCheck
      .query(
        'SELECT COUNT(*) AS count FROM ingestRuns ir INNER JOIN datasets d ON d.id = ir.datasetRecordId WHERE d.datasetId = ?',
      )
      .get('overture-hk-2026-05-24.0-division') as { count: number }

    sqliteCheck.close()

    expect(dataset).not.toBeNull()
    expect(dataset?.status).toBe('staged')
    expect(dataset?.rawObjectKey).toBe(result.rawObjectKey ?? undefined)
    expect(dataset?.originalFileName).toBe('hk-division-2026-05.parquet')
    expect(ingestRunCount.count).toBe(2)
  })

  test('rejects non-chronological uploads for the same region/type', async () => {
    const tempDir = createTempDir()
    const dbPath = join(tempDir, 'harbour.sqlite')
    const fixtureFile = createFixturePath(tempDir)
    const sqlite = initDb(dbPath)
    const db = createLocalHarbourDb(sqlite)

    db.insert(datasets)
      .values({
        datasetId: 'overture-hk-2026-05-24.0-division',
        regionCode: 'hk',
        snapshotMonth: '2026-05',
        theme: 'divisions',
        type: 'division',
        source: 'overture',
        sourceVersion: '2026-05-24.0',
        originalFileName: 'division.parquet',
        rawObjectKey: fixtureFile,
        status: 'current',
        supersedesDatasetId: null,
        revokedAt: null,
        revocationReason: null,
        ingestedAt: '2026-06-02T00:00:00.000Z',
        createdAt: '2026-06-02T00:00:00.000Z',
        updatedAt: '2026-06-02T00:00:00.000Z',
      })
      .run()

    await expect(
      registerUpload(db, {
        filePath: fixtureFile,
        snapshotMonth: '2026-04',
        source: 'overture',
        sourceVersion: '2026-04-24.0',
        inspection: fixtureInspection,
        rawObjectKey: 'hk/overture/2026-04-24.0/division.parquet',
      }),
    ).rejects.toThrow('strictly newer source versions')
    sqlite.close()
  })

  test('can dry-run without staging files', async () => {
    const tempDir = createTempDir()
    const dbPath = join(tempDir, 'harbour.sqlite')
    const fixtureFile = createFixturePath(tempDir)
    const db = initDb(dbPath)
    const harbourDb = createLocalHarbourDb(db)

    const planned = await planUpload(harbourDb, {
      filePath: fixtureFile,
      snapshotMonth: '2026-05',
      source: 'overture',
      sourceVersion: '2026-05-24.0',
      inspection: fixtureInspection,
    })

    db.close()

    expect(planned.plan.datasetId).toBe('overture-hk-2026-05-24.0-division')
    expect(planned.plan.type).toBe('division')
    expect(planned.plan.fileName).toBe('division.parquet')
  })

  test('requires an explicit source when it cannot be inferred confidently', async () => {
    const tempDir = createTempDir()
    const dbPath = join(tempDir, 'harbour.sqlite')
    const fixtureFile = join(tempDir, 'address.parquet')

    writeFileSync(fixtureFile, 'fixture')
    const db = initDb(dbPath)
    const harbourDb = createLocalHarbourDb(db)

    await expect(
      planUpload(harbourDb, {
        filePath: fixtureFile,
        snapshotMonth: '2026-06',
        inspection: {
          rowCount: 1,
          schema: fixtureInspection.schema,
          distinctThemeValues: ['addresses'],
          distinctTypeValues: ['address'],
          distinctCountryValues: ['hk'],
          distinctRegionValues: ['hk'],
        },
      }),
    ).rejects.toThrow('Could not determine source.')

    db.close()
  })

  test('requires same-month overture addresses before hkgov address upload', async () => {
    const tempDir = createTempDir()
    const dbPath = join(tempDir, 'harbour.sqlite')
    const fixtureFile = join(tempDir, 'hkgov-als-address.parquet')

    writeFileSync(fixtureFile, 'fixture')
    const db = initDb(dbPath)
    const harbourDb = createLocalHarbourDb(db)

    await expect(
      planUpload(harbourDb, {
        filePath: fixtureFile,
        source: 'hkgov-als',
        snapshotMonth: '2026-06',
        sourceVersion: '2026-06-04.324',
        inspection: {
          rowCount: 1,
          schema: fixtureInspection.schema,
          distinctThemeValues: ['addresses'],
          distinctTypeValues: ['address'],
          distinctCountryValues: ['hk'],
          distinctRegionValues: ['hk'],
        },
      }),
    ).rejects.toThrow(
      'Upload the matching Overture address dataset for the same snapshot month first.',
    )

    db.close()
  })

  test('registers an already-uploaded remote object', async () => {
    const tempDir = createTempDir()
    const dbPath = join(tempDir, 'harbour.sqlite')
    const fixtureFile = createFixturePath(tempDir)
    const sqlite = initDb(dbPath)
    const db = createLocalHarbourDb(sqlite)

    const result = await registerUpload(db, {
      filePath: fixtureFile,
      snapshotMonth: '2026-05',
      source: 'overture',
      sourceVersion: '2026-05-24.0',
      inspection: fixtureInspection,
      rawObjectKey: 'hk/overture/2026-05-24.0/division.parquet',
    })

    const dataset = sqlite
      .query('SELECT datasetId, rawObjectKey FROM datasets WHERE datasetId = ?')
      .get('overture-hk-2026-05-24.0-division') as {
      datasetId: string
      rawObjectKey: string
    } | null

    sqlite.close()

    expect(result.rawObjectKey).toBe('hk/overture/2026-05-24.0/division.parquet')
    expect(dataset?.rawObjectKey).toBe(result.rawObjectKey ?? undefined)
  })

  test('allows re-registering a failed dataset id', async () => {
    const tempDir = createTempDir()
    const dbPath = join(tempDir, 'harbour.sqlite')
    const fixtureFile = createFixturePath(tempDir)
    const sqlite = initDb(dbPath)
    const db = createLocalHarbourDb(sqlite)

    db.insert(datasets)
      .values({
        datasetId: 'overture-hk-2026-05-24.0-division',
        regionCode: 'hk',
        snapshotMonth: '2026-05',
        theme: 'divisions',
        type: 'division',
        source: 'overture',
        sourceVersion: '2026-05-24.0',
        rawObjectKey: 'hk/overture/2026-05-24.0/division-old.parquet',
        originalFileName: 'division-old.parquet',
        status: 'failed',
        supersedesDatasetId: null,
        revokedAt: null,
        revocationReason: null,
        ingestedAt: '2026-06-02T00:00:00.000Z',
        createdAt: '2026-06-02T00:00:00.000Z',
        updatedAt: '2026-06-02T00:00:00.000Z',
      })
      .run()

    const result = await registerUpload(db, {
      filePath: fixtureFile,
      snapshotMonth: '2026-05',
      source: 'overture',
      sourceVersion: '2026-05-24.0',
      inspection: fixtureInspection,
      rawObjectKey: 'hk/overture/2026-05-24.0/division.parquet',
    })

    const dataset = sqlite
      .query(
        'SELECT datasetId, status, rawObjectKey, originalFileName FROM datasets WHERE datasetId = ?',
      )
      .get('overture-hk-2026-05-24.0-division') as {
      datasetId: string
      status: string
      rawObjectKey: string
      originalFileName: string
    } | null
    const ingestRunCount = sqlite
      .query(
        'SELECT COUNT(*) AS count FROM ingestRuns ir INNER JOIN datasets d ON d.id = ir.datasetRecordId WHERE d.datasetId = ?',
      )
      .get('overture-hk-2026-05-24.0-division') as { count: number }

    sqlite.close()

    expect(result.plan.datasetId).toBe('overture-hk-2026-05-24.0-division')
    expect(dataset).not.toBeNull()
    expect(dataset?.status).toBe('staged')
    expect(dataset?.rawObjectKey).toBe('hk/overture/2026-05-24.0/division.parquet')
    expect(dataset?.originalFileName).toBe('hk-division-2026-05.parquet')
    expect(ingestRunCount.count).toBe(2)
  })

  test('allows restarting a failed direct-upload session', async () => {
    const tempDir = createTempDir()
    const dbPath = join(tempDir, 'harbour.sqlite')
    const fixtureFile = createFixturePath(tempDir)
    const sqlite = initDb(dbPath)
    const db = createLocalHarbourDb(sqlite)

    db.insert(datasets)
      .values({
        datasetId: 'overture-hk-2026-05-24.0-division',
        regionCode: 'hk',
        snapshotMonth: '2026-05',
        theme: 'divisions',
        type: 'division',
        source: 'overture',
        sourceVersion: '2026-05-24.0',
        rawObjectKey: 'hk/overture/2026-05-24.0/division.parquet',
        originalFileName: 'division.parquet',
        status: 'failed',
        supersedesDatasetId: null,
        revokedAt: null,
        revocationReason: null,
        ingestedAt: '2026-06-02T00:00:00.000Z',
        createdAt: '2026-06-02T00:00:00.000Z',
        updatedAt: '2026-06-02T00:00:00.000Z',
      })
      .run()

    const result = await requestUpload(db, {
      filePath: fixtureFile,
      snapshotMonth: '2026-05',
      source: 'overture',
      sourceVersion: '2026-05-24.0',
      inspection: fixtureInspection,
    })

    const dataset = sqlite
      .query('SELECT status, rawObjectKey FROM datasets WHERE datasetId = ?')
      .get('overture-hk-2026-05-24.0-division') as {
      status: string
      rawObjectKey: string
    } | null

    sqlite.close()

    expect(result.plan.datasetId).toBe('overture-hk-2026-05-24.0-division')
    expect(result.rawObjectKey).toBe('hk/overture/2026-05-24.0/division.parquet')
    expect(dataset?.status).toBe('uploading')
    expect(dataset?.rawObjectKey).toBe('hk/overture/2026-05-24.0/division.parquet')
  })

  test('finalizes an uploading direct-upload session into staged', async () => {
    const tempDir = createTempDir()
    const dbPath = join(tempDir, 'harbour.sqlite')
    const fixtureFile = createFixturePath(tempDir)
    const sqlite = initDb(dbPath)
    const db = createLocalHarbourDb(sqlite)

    await requestUpload(db, {
      filePath: fixtureFile,
      snapshotMonth: '2026-05',
      source: 'overture',
      sourceVersion: '2026-05-24.0',
      inspection: fixtureInspection,
    })

    const result = await finalizeUpload(db, {
      filePath: fixtureFile,
      snapshotMonth: '2026-05',
      source: 'overture',
      sourceVersion: '2026-05-24.0',
      inspection: fixtureInspection,
    })

    const dataset = sqlite
      .query('SELECT status FROM datasets WHERE datasetId = ?')
      .get('overture-hk-2026-05-24.0-division') as {
      status: string
    } | null

    sqlite.close()

    expect(result.plan.datasetId).toBe('overture-hk-2026-05-24.0-division')
    expect(dataset?.status).toBe('staged')
  })

  test('uses injected schema metadata for remote chronology checks', async () => {
    const tempDir = createTempDir()
    const dbPath = join(tempDir, 'harbour.sqlite')
    const fixtureFile = createFixturePath(tempDir)
    const sqlite = initDb(dbPath)
    const db = createLocalHarbourDb(sqlite)
    const inspection = fixtureInspection

    db.insert(datasets)
      .values({
        datasetId: 'overture-hk-2026-05-24.0-division',
        regionCode: 'hk',
        snapshotMonth: '2026-05',
        theme: 'divisions',
        type: 'division',
        source: 'overture',
        sourceVersion: '2026-05-24.0',
        rawObjectKey: 'hk/overture/2026-05-24.0/division.parquet',
        originalFileName: 'division.parquet',
        status: 'current',
        supersedesDatasetId: null,
        revokedAt: null,
        revocationReason: null,
        ingestedAt: '2026-06-02T00:00:00.000Z',
        createdAt: '2026-06-02T00:00:00.000Z',
        updatedAt: '2026-06-02T00:00:00.000Z',
      })
      .run()

    await expect(
      planUpload(db, {
        filePath: fixtureFile,
        snapshotMonth: '2026-06',
        source: 'overture',
        sourceVersion: '2026-06-24.0',
        inspection,
        resolveSchemaFingerprint: async () => createSchemaFingerprint(inspection),
      }),
    ).resolves.toMatchObject({
      plan: {
        datasetId: 'overture-hk-2026-06-24.0-division',
        supersedesDatasetId: 'overture-hk-2026-05-24.0-division',
      },
    })

    sqlite.close()
  })

  test('allows the known overture division admin_level schema transition', async () => {
    const tempDir = createTempDir()
    const dbPath = join(tempDir, 'harbour.sqlite')
    const fixtureFile = createFixturePath(tempDir)
    const sqlite = initDb(dbPath)
    const db = createLocalHarbourDb(sqlite)

    db.insert(datasets)
      .values({
        datasetId: 'overture-hk-2026-01-21.0-division',
        regionCode: 'hk',
        snapshotMonth: '2026-01',
        theme: 'divisions',
        type: 'division',
        source: 'overture',
        sourceVersion: '2026-01-21.0',
        rawObjectKey: 'hk/overture/2026-01-21.0/division.parquet',
        originalFileName: 'division.parquet',
        status: 'current',
        supersedesDatasetId: null,
        revokedAt: null,
        revocationReason: null,
        ingestedAt: '2026-06-02T00:00:00.000Z',
        createdAt: '2026-06-02T00:00:00.000Z',
        updatedAt: '2026-06-02T00:00:00.000Z',
      })
      .run()

    await expect(
      planUpload(db, {
        filePath: fixtureFile,
        snapshotMonth: '2026-02',
        source: 'overture',
        sourceVersion: '2026-02-18.0',
        inspection: fixtureInspectionWithAdminLevel,
        resolveSchemaFingerprint: async () =>
          createSchemaFingerprint(fixtureInspection),
      }),
    ).resolves.toMatchObject({
      plan: {
        datasetId: 'overture-hk-2026-02-18.0-division',
        supersedesDatasetId: 'overture-hk-2026-01-21.0-division',
      },
    })

    sqlite.close()
  })

  test('still rejects unrelated schema drift', async () => {
    const tempDir = createTempDir()
    const dbPath = join(tempDir, 'harbour.sqlite')
    const fixtureFile = createFixturePath(tempDir)
    const sqlite = initDb(dbPath)
    const db = createLocalHarbourDb(sqlite)

    db.insert(datasets)
      .values({
        datasetId: 'overture-hk-2026-01-21.0-division',
        regionCode: 'hk',
        snapshotMonth: '2026-01',
        theme: 'divisions',
        type: 'division',
        source: 'overture',
        sourceVersion: '2026-01-21.0',
        rawObjectKey: 'hk/overture/2026-01-21.0/division.parquet',
        originalFileName: 'division.parquet',
        status: 'current',
        supersedesDatasetId: null,
        revokedAt: null,
        revocationReason: null,
        ingestedAt: '2026-06-02T00:00:00.000Z',
        createdAt: '2026-06-02T00:00:00.000Z',
        updatedAt: '2026-06-02T00:00:00.000Z',
      })
      .run()

    await expect(
      planUpload(db, {
        filePath: fixtureFile,
        snapshotMonth: '2026-02',
        source: 'overture',
        sourceVersion: '2026-02-18.0',
        inspection: {
          ...fixtureInspection,
          schema: [
            ...fixtureInspection.schema,
            { name: 'wrong_field', type: 'int_32', nullable: true },
          ],
        },
        resolveSchemaFingerprint: async () =>
          createSchemaFingerprint(fixtureInspection),
      }),
    ).rejects.toThrow(`Schema drift detected against overture-hk-2026-01-21.0-division.
Current upload schema has 6 fields; overture-hk-2026-01-21.0-division recorded 5 fields.
Field-level differences:
- added \`wrong_field\` (int_32, nullable=true)
Reconcile the schema before uploading this dataset.`)

    sqlite.close()
  })

  test('rejects re-upload when the dataset already exists in a non-failed state', async () => {
    const tempDir = createTempDir()
    const dbPath = join(tempDir, 'harbour.sqlite')
    const fixtureFile = createFixturePath(tempDir)
    const sqlite = initDb(dbPath)
    const db = createLocalHarbourDb(sqlite)

    db.insert(datasets)
      .values({
        datasetId: 'overture-hk-2026-05-24.0-division',
        regionCode: 'hk',
        snapshotMonth: '2026-05',
        theme: 'divisions',
        type: 'division',
        source: 'overture',
        sourceVersion: '2026-05-24.0',
        rawObjectKey: 'hk/overture/2026-05-24.0/division.parquet',
        originalFileName: 'division.parquet',
        status: 'processing',
        supersedesDatasetId: null,
        revokedAt: null,
        revocationReason: null,
        ingestedAt: '2026-06-02T00:00:00.000Z',
        createdAt: '2026-06-02T00:00:00.000Z',
        updatedAt: '2026-06-02T00:00:00.000Z',
      })
      .run()

    await expect(
      registerUpload(db, {
        filePath: fixtureFile,
        snapshotMonth: '2026-05',
        source: 'overture',
        sourceVersion: '2026-05-24.0',
        inspection: fixtureInspection,
        rawObjectKey: 'hk/overture/2026-05-24.0/division.parquet',
      }),
    ).rejects.toThrow(
      'Dataset already exists with status processing: overture-hk-2026-05-24.0-division',
    )

    sqlite.close()
  })

  test('keeps chronology checks scoped to the source', async () => {
    const tempDir = createTempDir()
    const dbPath = join(tempDir, 'harbour.sqlite')
    const fixtureFile = createFixturePath(tempDir)
    const sqlite = initDb(dbPath)
    const db = createLocalHarbourDb(sqlite)

    db.insert(datasets)
      .values({
        datasetId: 'overture-hk-2026-05-24.0-division',
        regionCode: 'hk',
        snapshotMonth: '2026-05',
        theme: 'divisions',
        type: 'division',
        source: 'overture',
        sourceVersion: '2026-05-24.0',
        rawObjectKey: 'hk/overture/2026-05-24.0/division.parquet',
        originalFileName: 'division.parquet',
        status: 'current',
        supersedesDatasetId: null,
        revokedAt: null,
        revocationReason: null,
        ingestedAt: '2026-06-02T00:00:00.000Z',
        createdAt: '2026-06-02T00:00:00.000Z',
        updatedAt: '2026-06-02T00:00:00.000Z',
      })
      .run()

    await expect(
      planUpload(db, {
        filePath: fixtureFile,
        snapshotMonth: '2026-05',
        source: 'hkgov',
        sourceVersion: '2026-01-20.0',
        inspection: fixtureInspection,
        resolveSchemaFingerprint: async () =>
          createSchemaFingerprint(fixtureInspection),
      }),
    ).resolves.toMatchObject({
      plan: {
        datasetId: 'hkgov-hk-2026-01-20.0-division',
        supersedesDatasetId: null,
      },
    })

    sqlite.close()
  })

  test('ignores failed and uploading datasets when selecting the latest upload baseline', async () => {
    const tempDir = createTempDir()
    const dbPath = join(tempDir, 'harbour.sqlite')
    const fixtureFile = createFixturePath(tempDir)
    const sqlite = initDb(dbPath)
    const db = createLocalHarbourDb(sqlite)

    db.insert(datasets)
      .values([
        {
          datasetId: 'overture-hk-2026-05-24.0-division',
          regionCode: 'hk',
          snapshotMonth: '2026-05',
          theme: 'divisions',
          type: 'division',
          source: 'overture',
          sourceVersion: '2026-05-24.0',
          rawObjectKey: 'hk/overture/2026-05-24.0/division.parquet',
          originalFileName: 'division.parquet',
          status: 'current',
          supersedesDatasetId: null,
          revokedAt: null,
          revocationReason: null,
          ingestedAt: '2026-06-02T00:00:00.000Z',
          createdAt: '2026-06-02T00:00:00.000Z',
          updatedAt: '2026-06-02T00:00:00.000Z',
        },
        {
          datasetId: 'overture-hk-2026-06-24.0-division',
          regionCode: 'hk',
          snapshotMonth: '2026-06',
          theme: 'divisions',
          type: 'division',
          source: 'overture',
          sourceVersion: '2026-06-24.0',
          rawObjectKey: 'hk/overture/2026-06-24.0/division.parquet',
          originalFileName: 'division.parquet',
          status: 'uploading',
          supersedesDatasetId: 'overture-hk-2026-05-24.0-division',
          revokedAt: null,
          revocationReason: null,
          ingestedAt: '2026-06-03T00:00:00.000Z',
          createdAt: '2026-06-03T00:00:00.000Z',
          updatedAt: '2026-06-03T00:00:00.000Z',
        },
        {
          datasetId: 'overture-hk-2026-07-24.0-division',
          regionCode: 'hk',
          snapshotMonth: '2026-07',
          theme: 'divisions',
          type: 'division',
          source: 'overture',
          sourceVersion: '2026-07-24.0',
          rawObjectKey: 'hk/overture/2026-07-24.0/division.parquet',
          originalFileName: 'division.parquet',
          status: 'failed',
          supersedesDatasetId: null,
          revokedAt: null,
          revocationReason: null,
          ingestedAt: '2026-06-04T00:00:00.000Z',
          createdAt: '2026-06-04T00:00:00.000Z',
          updatedAt: '2026-06-04T00:00:00.000Z',
        },
      ])
      .run()

    await expect(
      planUpload(db, {
        filePath: fixtureFile,
        snapshotMonth: '2026-08',
        source: 'overture',
        sourceVersion: '2026-08-24.0',
        inspection: fixtureInspection,
        resolveSchemaFingerprint: async () =>
          createSchemaFingerprint(fixtureInspection),
      }),
    ).resolves.toMatchObject({
      plan: {
        datasetId: 'overture-hk-2026-08-24.0-division',
        supersedesDatasetId: 'overture-hk-2026-05-24.0-division',
      },
    })

    sqlite.close()
  })
})
