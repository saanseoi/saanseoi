import { afterEach, describe, expect, test } from 'bun:test'
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

const { handleStageCompleted, handleStageFailed, handleStageStarted } = await import(
  './control'
)

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
        datasetId, regionCode, snapshotMonth, theme, type, source, sourceVersion,
        rawObjectKey, originalFileName, status, isActive, supersedesDatasetId, revokedAt,
        revocationReason, ingestedAt, createdAt, updatedAt
      ) VALUES (
        'overture-hk-2025-09-24.0-division', 'hk', '2025-09', 'divisions', 'division',
        'overture', '2025-09-24.0', 'hk/overture/2025-09-24.0/division.parquet',
        'division.parquet', 'staged', 0, null, null, null, '2026-06-05T00:00:00.000Z',
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
        'SELECT phase, status, statsJson, errorJson, finishedAt FROM ingestRuns WHERE datasetId = ? ORDER BY startedAt ASC',
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
})
