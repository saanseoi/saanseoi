import { Database } from 'bun:sqlite'
import { test, expect } from 'bun:test'
import { createLocalHarbourDb } from '../../testing/localDb'
import { recordProcessingRun, readProcessingCheckpoint } from './processingRuns'

test('composition runs reuse one row, retain failure checkpoints and reject changed inputs', async () => {
  const sqlite = new Database(':memory:')
  try {
    sqlite.exec(
      `CREATE TABLE processingRuns (runId TEXT PRIMARY KEY, resourceReleaseId TEXT, snapshotId TEXT, apiReleaseSetId TEXT, stage TEXT NOT NULL, phase TEXT NOT NULL, status TEXT NOT NULL, attempt INTEGER DEFAULT 1 NOT NULL, checkpoint TEXT, results TEXT, error TEXT, startedAt TEXT NOT NULL, finishedAt TEXT, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL, UNIQUE(resourceReleaseId,phase), UNIQUE(snapshotId,phase), UNIQUE(apiReleaseSetId,phase));`,
    )
    const db = createLocalHarbourDb(sqlite)
    const task = {
      apiReleaseSetId: 'api',
      stage: 'composition' as const,
      phase: 'compose',
    }
    const checkpoint = {
      version: 1 as const,
      identityHash: 'inputs-and-rules',
      artefact: 'plan.json',
    }
    await recordProcessingRun(db, {
      ...task,
      status: 'running',
      checkpoint,
      results: { selected: 3 },
    })
    await recordProcessingRun(db, { ...task, status: 'error', error: 'interrupted' })
    expect(
      await readProcessingCheckpoint(db, task, 'compose', 'inputs-and-rules'),
    ).toEqual(checkpoint)
    await expect(
      readProcessingCheckpoint(db, task, 'compose', 'other-inputs'),
    ).rejects.toThrow('different inputs')
    await recordProcessingRun(db, { ...task, status: 'running' })
    await recordProcessingRun(db, {
      ...task,
      status: 'completed',
      results: { selected: 3 },
    })
    expect(
      sqlite.query('SELECT stage, status, attempt, results FROM processingRuns').all(),
    ).toEqual([
      {
        stage: 'composition',
        status: 'completed',
        attempt: 2,
        results: '{"selected":3}',
      },
    ])
    const writes = sqlite.query('SELECT total_changes() AS n').get()
    await recordProcessingRun(db, {
      ...task,
      status: 'completed',
      results: { selected: 3 },
    })
    expect(sqlite.query('SELECT total_changes() AS n').get()).toEqual(writes)
  } finally {
    sqlite.close()
  }
})
