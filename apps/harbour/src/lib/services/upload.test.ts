import { afterEach, describe, expect, test } from 'bun:test'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { Database } from 'bun:sqlite'

import {
  inferRegionFromPath,
  inferSnapshotMonthFromPath,
  inferTypeFromFilename,
  inferTypeFromPath,
  inferThemeFromPath,
  inferThemeFromFilename,
  planUpload,
  registerUpload,
} from './upload'
import { createLocalHarbourDb } from '../db/local'
import { datasets } from '@repo/db/schema'
const migrationSql = readFileSync(
  resolve(
    import.meta.dir,
    '../../../../../libs/db/migrations/20260602105608_ordinary_true_believers.sql',
  ),
  'utf8',
)

const fixtureFile = resolve(import.meta.dir, '../../../../../data/division.parquet')
const tempDirs: string[] = []

function createTempDir() {
  const dir = mkdtempSync(join(tmpdir(), 'harbour-test-'))
  tempDirs.push(dir)
  return dir
}

function createOvertureStyleFixture(tempDir: string) {
  const targetDir = join(tempDir, 'data/2025-09-24.0/divisions/中国/Hong Kong SAR')
  const targetFile = join(targetDir, 'division.parquet')

  mkdirSync(targetDir, { recursive: true })
  copyFileSync(fixtureFile, targetFile)

  return targetFile
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
  test('infers divisions theme from a singular filename', () => {
    expect(inferThemeFromFilename('division.parquet')).toBe('divisions')
    expect(inferTypeFromFilename('division.parquet')).toBe('division')
  })

  test('infers theme, region, and month from the full overture-style path', () => {
    const tempDir = createTempDir()
    const overtureFixturePath = createOvertureStyleFixture(tempDir)

    expect(inferTypeFromPath(overtureFixturePath)).toBe('division')
    expect(inferThemeFromPath(overtureFixturePath)).toBe('divisions')
    expect(inferRegionFromPath(overtureFixturePath)).toBe('hk')
    expect(inferSnapshotMonthFromPath(overtureFixturePath)).toBe('2025-09')
  })

  test('registers the first dataset upload into local D1 and staging', async () => {
    const tempDir = createTempDir()
    const dbPath = join(tempDir, 'harbour.sqlite')
    const rawRoot = join(tempDir, 'raw')

    initDb(dbPath).close()
    const sqlite = new Database(dbPath)
    const db = createLocalHarbourDb(sqlite)

    const result = await registerUpload(db, {
      filePath: fixtureFile,
      snapshotMonth: '2026-05',
      localRawRoot: rawRoot,
    })
    sqlite.close()

    expect(result.plan.datasetId).toBe('hk-2026-05-division')
    expect(result.plan.type).toBe('division')
    expect(result.stagedFilePath).toContain(
      '/hk/divisions/division/2026-05/division.parquet',
    )
    expect(result.metadataPath).toContain('/hk/divisions/division/2026-05/upload.json')

    const sqliteCheck = new Database(dbPath)
    const dataset = sqliteCheck
      .query('SELECT datasetId, status, rawObjectKey FROM datasets WHERE datasetId = ?')
      .get('hk-2026-05-division') as {
      datasetId: string
      status: string
      rawObjectKey: string
    } | null
    const ingestRunCount = sqliteCheck
      .query('SELECT COUNT(*) AS count FROM ingestRuns WHERE datasetId = ?')
      .get('hk-2026-05-division') as { count: number }

    sqliteCheck.close()

    expect(dataset).not.toBeNull()
    expect(dataset?.status).toBe('staged')
    expect(dataset?.rawObjectKey).toBe(result.stagedFilePath ?? undefined)
    expect(ingestRunCount.count).toBe(2)
  })

  test('rejects non-chronological uploads for the same region/type', async () => {
    const tempDir = createTempDir()
    const dbPath = join(tempDir, 'harbour.sqlite')
    const sqlite = initDb(dbPath)
    const db = createLocalHarbourDb(sqlite)

    db.insert(datasets)
      .values({
        datasetId: 'hk-2026-05-division',
        regionCode: 'hk',
        snapshotMonth: '2026-05',
        theme: 'divisions',
        type: 'division',
        source: 'overture',
        sourceVersion: '2026-05',
        rawObjectKey: fixtureFile,
        status: 'active',
        isActive: true,
        supersedesDatasetId: null,
        revokedAt: null,
        revocationReason: null,
        ingestedAt: '2026-06-02T00:00:00.000Z',
      })
      .run()

    await expect(
      registerUpload(db, {
        filePath: fixtureFile,
        snapshotMonth: '2026-04',
        localRawRoot: join(tempDir, 'raw'),
      }),
    ).rejects.toThrow('strictly newer monthly uploads')
    sqlite.close()
  })

  test('can dry-run without staging files', async () => {
    const tempDir = createTempDir()
    const dbPath = join(tempDir, 'harbour.sqlite')
    const db = initDb(dbPath)
    const harbourDb = createLocalHarbourDb(db)

    const planned = await planUpload(harbourDb, {
      filePath: fixtureFile,
      snapshotMonth: '2026-05',
    })

    db.close()

    expect(planned.plan.datasetId).toBe('hk-2026-05-division')
    expect(planned.plan.type).toBe('division')
  })

  test('plans uploads from overture-style path metadata without explicit flags', async () => {
    const tempDir = createTempDir()
    const dbPath = join(tempDir, 'harbour.sqlite')
    const overtureFixturePath = createOvertureStyleFixture(tempDir)
    const db = initDb(dbPath)
    const harbourDb = createLocalHarbourDb(db)

    const planned = await planUpload(harbourDb, {
      filePath: overtureFixturePath,
    })

    db.close()

    expect(planned.plan.datasetId).toBe('hk-2025-09-division')
    expect(planned.plan.snapshotMonth).toBe('2025-09')
    expect(planned.plan.regionCode).toBe('hk')
    expect(planned.plan.theme).toBe('divisions')
    expect(planned.plan.type).toBe('division')
    expect(planned.plan.sourceVersion).toBe('2025-09-24.0')
    expect(planned.plan.inferredFrom.snapshotMonth).toBe('path')
    expect(planned.plan.inferredFrom.regionCode).toBe('path')
    expect(planned.plan.inferredFrom.theme).toBe('path')
    expect(planned.plan.inferredFrom.type).toBe('path')
  })
})
