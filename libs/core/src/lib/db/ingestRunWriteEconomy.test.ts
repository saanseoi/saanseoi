import { Database } from 'bun:sqlite'
import { afterEach, describe, expect, test } from 'bun:test'
import { recordDatasetStage } from '../../pipeline/datasetStages'
import { createLocalHarbourDb } from '../../testing/localDb'
import {
  ensureIngestRunStarted,
  updateLatestOpenIngestRun,
  upsertIngestRunStatus,
} from './metaRegistry'

const opened: Database[] = []
const startedAt = '2026-09-12T00:00:00.000Z'
const phase = 'deliverAddressSql'

afterEach(() => {
  for (const sqlite of opened.splice(0)) sqlite.close()
})

function fixture() {
  const sqlite = new Database(':memory:')
  opened.push(sqlite)
  sqlite.exec(`CREATE TABLE ingestRuns (
    runId TEXT PRIMARY KEY,
    releaseId TEXT NOT NULL,
    phase TEXT NOT NULL,
    status TEXT NOT NULL,
    stats TEXT,
    error TEXT,
    startedAt TEXT NOT NULL,
    finishedAt TEXT,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL,
    UNIQUE(releaseId, phase)
  )`)
  const db = createLocalHarbourDb(sqlite)
  return {
    db,
    sqlite,
    row: () =>
      sqlite.query<Record<string, unknown>, []>('SELECT * FROM ingestRuns').get(),
    writes: () =>
      (sqlite.query('SELECT total_changes() AS count').get() as { count: number })
        .count,
    report: (stats: Record<string, unknown> | string | null = null, time = startedAt) =>
      ensureIngestRunStarted(db, 'release', phase, stats, time),
  }
}

describe('ingest phase write economy', () => {
  test('fresh phase inserts one row without a follow-up update', async () => {
    const { report, row, writes } = fixture()
    await report({ rowCount: 1 })
    expect(writes()).toBe(1)
    expect(row()).toEqual({
      runId: expect.any(String),
      releaseId: 'release',
      phase,
      status: 'running',
      stats: '{"rowCount":1}',
      error: null,
      startedAt,
      finishedAt: null,
      createdAt: startedAt,
      updatedAt: startedAt,
    })
  })

  test('unchanged reports write only at the one-minute heartbeat boundary', async () => {
    const { report, row, writes } = fixture()
    await report({ rowCount: 1 })
    const initial = row()
    await report('{ "rowCount": 1 }', '2026-09-12T00:00:59.999Z')
    expect(writes()).toBe(1)
    expect(row()).toEqual(initial)

    await report({ rowCount: 1 }, '2026-09-12T00:01:00.000Z')
    expect(writes()).toBe(2)
    expect(row()).toEqual({
      ...initial,
      updatedAt: '2026-09-12T00:01:00.000Z',
    })
    await report({ rowCount: 1 }, '2026-09-12T00:01:59.999Z')
    expect(writes()).toBe(2)
    await report({ rowCount: 1 }, '2026-09-12T00:02:00.000Z')
    expect(writes()).toBe(3)
  })

  test('progress and null transitions update immediately and retain the start', async () => {
    const { report, row, writes } = fixture()
    await report()
    await report(null, '2026-09-12T00:00:01.000Z')
    expect(writes()).toBe(1)
    const initial = row()

    for (const [index, stats] of [{ rowCount: 1 }, { rowCount: 2 }, null].entries()) {
      const time = `2026-09-12T00:00:0${index + 2}.000Z`
      await report(stats, time)
      expect(writes()).toBe(index + 2)
      expect(row()).toEqual({
        ...initial,
        stats: stats === null ? null : JSON.stringify(stats),
        updatedAt: time,
      })
    }
  })

  test('an error restart clears the failure and restarts timing on the same row', async () => {
    const { db, report, row, writes } = fixture()
    await report()
    const initial = row()
    expect(
      await updateLatestOpenIngestRun(
        db,
        'release',
        phase,
        'error',
        '2026-09-12T00:00:05.000Z',
        { rowCount: 1 },
        'failed',
      ),
    ).toBe(true)
    expect(row()).toMatchObject({ status: 'error', error: JSON.stringify('failed') })
    const retryTime = '2026-09-12T00:00:06.000Z'
    await report({ rowCount: 0 }, retryTime)
    expect(writes()).toBe(3)
    expect(row()).toEqual({
      ...initial,
      stats: '{"rowCount":0}',
      startedAt: retryTime,
      updatedAt: retryTime,
    })
    await report({ rowCount: 0 }, '2026-09-12T00:00:07.000Z')
    expect(writes()).toBe(3)
  })

  test('a running report clears residual error state immediately', async () => {
    const { sqlite, report, row, writes } = fixture()
    await report()
    sqlite.exec("UPDATE ingestRuns SET error = 'residual error'")
    await report(null, '2026-09-12T00:00:01.000Z')
    expect(writes()).toBe(3)
    expect(row()).toMatchObject({
      status: 'running',
      error: null,
      startedAt,
      updatedAt: '2026-09-12T00:00:01.000Z',
    })
  })

  test('completed phases retain their terminal report without further writes', async () => {
    const { db, report, row, writes } = fixture()
    await report()
    await recordDatasetStage(
      db,
      { releaseId: 'release', phase, stats: { rowCount: 2 } },
      'completed',
    )
    const completed = row()
    expect(completed).toMatchObject({
      status: 'completed',
      stats: '{"rowCount":2}',
      finishedAt: expect.any(String),
    })
    expect(writes()).toBe(2)
    await report({ rowCount: 3 }, '2026-09-13T00:00:00.000Z')
    expect(row()).toEqual(completed)
    expect(writes()).toBe(2)
  })

  test('explicitly reopening phases still accept a running report after completion', async () => {
    const { db, row, writes } = fixture()
    const reopeningPhase = 'normaliseAddressSql'
    await upsertIngestRunStatus(
      db,
      'release',
      reopeningPhase,
      'completed',
      startedAt,
      '2026-09-12T00:00:05.000Z',
      { rowCount: 2 },
    )
    await recordDatasetStage(
      db,
      { releaseId: 'release', phase: reopeningPhase, stats: { rowCount: 3 } },
      'running',
    )
    expect(writes()).toBe(2)
    expect(row()).toMatchObject({
      phase: reopeningPhase,
      status: 'running',
      stats: '{"rowCount":3}',
      finishedAt: null,
    })
  })
})
