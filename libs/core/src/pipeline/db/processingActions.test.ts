import { describe, expect, test } from 'bun:test'

import { Database as SQLiteDatabase } from 'bun:sqlite'

import { createLocalHarbourDb } from '../../testing/localDb'
import { replaceReleaseProcessingActions } from './processingActions'

function createProcessingActionsDb() {
  const sqlite = new SQLiteDatabase(':memory:')
  sqlite.exec(`
    CREATE TABLE releases (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL
    );
    CREATE TABLE releaseProcessingActions (
      id TEXT PRIMARY KEY,
      releaseId TEXT NOT NULL,
      action TEXT NOT NULL,
      mode TEXT NOT NULL,
      summary TEXT NOT NULL,
      affectedRecordCount INTEGER NOT NULL,
      evidence TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
    CREATE TABLE stats (
      id TEXT PRIMARY KEY,
      releaseId TEXT,
      snapshotId TEXT,
      apiReleaseSetId TEXT,
      type TEXT NOT NULL,
      dimension TEXT,
      metric TEXT,
      metricUnit TEXT,
      groupBy TEXT,
      groupValue TEXT,
      value REAL NOT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
  `)

  return { sqlite, db: createLocalHarbourDb(sqlite) }
}

describe('replaceReleaseProcessingActions', () => {
  test('allows retries before publication and preserves published action evidence', async () => {
    const { sqlite, db } = createProcessingActionsDb()
    sqlite.exec("INSERT INTO releases (id, status) VALUES ('release-1', 'staged')")

    await replaceReleaseProcessingActions(db, 'release-1', [
      {
        action: 'division_code_mapped',
        mode: 'automatic',
        summary: 'Mapped district codes.',
        affectedRecordCount: 18,
        evidence: { bridge: 'districts-v1' },
      },
    ])

    sqlite.exec("UPDATE releases SET status = 'published' WHERE id = 'release-1'")

    await expect(replaceReleaseProcessingActions(db, 'release-1', [])).rejects.toThrow(
      'published releases are immutable',
    )
    expect(
      sqlite
        .query('SELECT action, affectedRecordCount FROM releaseProcessingActions')
        .all(),
    ).toEqual([{ action: 'division_code_mapped', affectedRecordCount: 18 }])
  })
})
