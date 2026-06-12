import { afterEach, describe, expect, test } from 'bun:test'
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

const {
  handlePublishDataset,
  handleStageCompleted,
  handleStageFailed,
  handleStageStarted,
} = await import('./control')

const tempDirs: string[] = []

function createTempDir() {
  const dir = mkdtempSync(join(tmpdir(), 'harbour-control-test-'))
  tempDirs.push(dir)
  return dir
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

describe('control service', () => {
  test('updates the running ingest run in place when a phase completes or fails', async () => {
    const tempDir = createTempDir()
    const dbPath = join(tempDir, 'harbour-control.sqlite')
    const sqlite = initDb(dbPath)
    const db = createLocalHarbourDb(sqlite)

    sqlite.exec(`
      INSERT INTO datasets (
        id, datasetId, regionCode, snapshotMonth, theme, type, source, sourceVersion,
        rawObjectKey, originalFileName, status, supersedesDatasetId, revokedAt,
        revocationReason, ingestedAt, createdAt, updatedAt
      ) VALUES (
        'overture-hk-2025-09-24.0-division-row', 'overture-hk-2025-09-24.0-division', 'hk', '2025-09', 'divisions', 'division',
        'overture', '2025-09-24.0', 'hk/overture/2025-09-24.0/division.parquet',
        'division.parquet', 'staged', null, null, null, '2026-06-05T00:00:00.000Z',
        '2026-06-05T00:00:00.000Z', '2026-06-05T00:00:00.000Z'
      );
    `)

    await handleStageStarted(db, {
      datasetId: 'overture-hk-2025-09-24.0-division',
      phase: 'extractDivisions',
    })
    await handleStageCompleted(db, {
      datasetId: 'overture-hk-2025-09-24.0-division',
      phase: 'extractDivisions',
      stats: {
        processedRows: 1810,
      },
    })

    await handleStageStarted(db, {
      datasetId: 'overture-hk-2025-09-24.0-division',
      phase: 'publishDataset',
    })
    await handleStageFailed(db, {
      datasetId: 'overture-hk-2025-09-24.0-division',
      phase: 'publishDataset',
      error: 'Network connection lost.',
    })

    const ingestRuns = sqlite
      .query(
        'SELECT ir.phase, ir.status, ir.statsJson, ir.errorJson, ir.finishedAt FROM ingestRuns ir INNER JOIN datasets d ON d.id = ir.datasetRecordId WHERE d.datasetId = ? ORDER BY ir.startedAt ASC',
      )
      .all('overture-hk-2025-09-24.0-division') as Array<{
      phase: string
      status: string
      statsJson: string | null
      errorJson: string | null
      finishedAt: string | null
    }>
    const dataset = sqlite
      .query('SELECT status FROM datasets WHERE datasetId = ?')
      .get('overture-hk-2025-09-24.0-division') as {
      status: string
    }

    sqlite.close()

    expect(ingestRuns).toHaveLength(2)
    const extractRun = ingestRuns[0]
    const publishRun = ingestRuns[1]

    expect(extractRun).toBeDefined()
    expect(publishRun).toBeDefined()

    if (!extractRun || !publishRun) {
      throw new Error('Expected two ingest runs to be written.')
    }

    expect(extractRun.phase).toBe('extractDivisions')
    expect(extractRun.status).toBe('completed')
    expect(extractRun.statsJson).toBe('{"processedRows":1810}')
    expect(extractRun.finishedAt).not.toBeNull()
    expect(publishRun.phase).toBe('publishDataset')
    expect(publishRun.status).toBe('error')
    expect(publishRun.errorJson).toBe('{"message":"Network connection lost."}')
    expect(publishRun.finishedAt).not.toBeNull()
    expect(dataset.status).toBe('failed')
  })

  test('marks the superseded monthly dataset historic when publishing a new current dataset', async () => {
    const tempDir = createTempDir()
    const dbPath = join(tempDir, 'harbour-publish-historic.sqlite')
    const sqlite = initDb(dbPath)
    const db = createLocalHarbourDb(sqlite)

    sqlite.exec(`
      INSERT INTO datasets (
        id, datasetId, regionCode, snapshotMonth, theme, type, source, sourceVersion,
        rawObjectKey, originalFileName, status, supersedesDatasetId, revokedAt,
        revocationReason, ingestedAt, createdAt, updatedAt
      ) VALUES
      (
        'overture-hk-2026-01-21.0-division-row', 'overture-hk-2026-01-21.0-division', 'hk', '2026-01', 'divisions', 'division',
        'overture', '2026-01-21.0', 'hk/overture/2026-01-21.0/division.parquet',
        'division.parquet', 'current', null, null, null, '2026-06-05T00:00:00.000Z',
        '2026-06-05T00:00:00.000Z', '2026-06-05T00:00:00.000Z'
      ),
      (
        'overture-hk-2026-02-18.0-division-row', 'overture-hk-2026-02-18.0-division', 'hk', '2026-02', 'divisions', 'division',
        'overture', '2026-02-18.0', 'hk/overture/2026-02-18.0/division.parquet',
        'division.parquet', 'staged', 'overture-hk-2026-01-21.0-division', null, null,
        '2026-06-05T00:01:00.000Z', '2026-06-05T00:01:00.000Z', '2026-06-05T00:01:00.000Z'
      );
    `)

    const result = await handlePublishDataset(db, {
      datasetId: 'overture-hk-2026-02-18.0-division',
    })

    const rows = sqlite
      .query(
        "SELECT datasetId, status, revokedAt, revocationReason FROM datasets WHERE datasetId != 'saanseoi-cn-2026-01-01.01-division' ORDER BY datasetId",
      )
      .all() as Array<{
      datasetId: string
      status: string
      revokedAt: string | null
      revocationReason: string | null
    }>

    sqlite.close()

    expect(result).toEqual({
      datasetId: 'overture-hk-2026-02-18.0-division',
      phase: null,
      status: 'current',
    })
    expect(rows).toEqual([
      {
        datasetId: 'overture-hk-2026-01-21.0-division',
        status: 'historic',
        revokedAt: null,
        revocationReason: null,
      },
      {
        datasetId: 'overture-hk-2026-02-18.0-division',
        status: 'current',
        revokedAt: null,
        revocationReason: null,
      },
    ])
  })

  test('revokes the superseded dataset only for corrected same-release publishes', async () => {
    const tempDir = createTempDir()
    const dbPath = join(tempDir, 'harbour-publish-revoked.sqlite')
    const sqlite = initDb(dbPath)
    const db = createLocalHarbourDb(sqlite)

    sqlite.exec(`
      INSERT INTO datasets (
        id, datasetId, regionCode, snapshotMonth, theme, type, source, sourceVersion,
        rawObjectKey, originalFileName, status, supersedesDatasetId, revokedAt,
        revocationReason, ingestedAt, createdAt, updatedAt
      ) VALUES
      (
        'overture-hk-2026-02-18.0-division-row', 'overture-hk-2026-02-18.0-division', 'hk', '2026-02', 'divisions', 'division',
        'overture', '2026-02-18.0', 'hk/overture/2026-02-18.0/division.parquet',
        'division.parquet', 'current', null, null, null, '2026-06-05T00:00:00.000Z',
        '2026-06-05T00:00:00.000Z', '2026-06-05T00:00:00.000Z'
      ),
      (
        'overture-hk-2026-02-18.1-division-row', 'overture-hk-2026-02-18.1-division', 'hk', '2026-02', 'divisions', 'division',
        'overture', '2026-02-18.1', 'hk/overture/2026-02-18.1/division.parquet',
        'division.parquet', 'staged', 'overture-hk-2026-02-18.0-division', null, null,
        '2026-06-05T00:01:00.000Z', '2026-06-05T00:01:00.000Z', '2026-06-05T00:01:00.000Z'
      );
    `)

    const result = await handlePublishDataset(db, {
      datasetId: 'overture-hk-2026-02-18.1-division',
    })

    const rows = sqlite
      .query(
        'SELECT datasetId, status, revokedAt, revocationReason FROM datasets ORDER BY datasetId',
      )
      .all() as Array<{
      datasetId: string
      status: string
      revokedAt: string | null
      revocationReason: string | null
    }>

    sqlite.close()

    expect(result).toEqual({
      datasetId: 'overture-hk-2026-02-18.1-division',
      phase: null,
      status: 'current',
    })
    expect(rows[0]).toMatchObject({
      datasetId: 'overture-hk-2026-02-18.0-division',
      status: 'revoked',
      revocationReason:
        'Superseded by corrected release overture-hk-2026-02-18.1-division.',
    })
    expect(rows[0]?.revokedAt).not.toBeNull()
    expect(rows[1]).toEqual({
      datasetId: 'overture-hk-2026-02-18.1-division',
      status: 'current',
      revokedAt: null,
      revocationReason: null,
    })
  })
})
