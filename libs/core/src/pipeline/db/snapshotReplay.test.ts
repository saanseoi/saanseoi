import { Database } from 'bun:sqlite'
import { describe, expect, test } from 'bun:test'
import { drizzle } from 'drizzle-orm/bun-sqlite'

import { historySchema } from '@repo/db'

import { resolveSnapshotVersionState } from './snapshotReplay'

describe('resolveSnapshotVersionState', () => {
  test('retains an inherited Kowloon row when the target snapshot is delta-only', async () => {
    const sqlite = new Database(':memory:')
    sqlite.exec(`
      CREATE TABLE snapshotVersionChanges (
        snapshotId TEXT NOT NULL,
        recordType TEXT NOT NULL,
        recordId TEXT NOT NULL,
        locale TEXT NOT NULL,
        versionHash TEXT,
        operation TEXT NOT NULL,
        sourceReleaseId TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        PRIMARY KEY (snapshotId, recordType, recordId, locale)
      );
    `)

    const db = drizzle({ client: sqlite, schema: historySchema })
    await db
      .insert(historySchema.snapshotVersionChanges)
      .values([
        {
          snapshotId: 'parent-snapshot',
          recordType: 'division',
          recordId: 'kowloon',
          locale: '',
          versionHash: 'kowloon-v1',
          operation: 'upsert',
          sourceReleaseId: 'parent-release',
          createdAt: '2026-05-20T00:00:00.000Z',
          updatedAt: '2026-05-20T00:00:00.000Z',
        },
        {
          snapshotId: 'parent-snapshot',
          recordType: 'division',
          recordId: 'district-a',
          locale: '',
          versionHash: 'district-a-v1',
          operation: 'upsert',
          sourceReleaseId: 'parent-release',
          createdAt: '2026-05-20T00:00:00.000Z',
          updatedAt: '2026-05-20T00:00:00.000Z',
        },
        {
          snapshotId: 'target-snapshot',
          recordType: 'division',
          recordId: 'district-a',
          locale: '',
          versionHash: 'district-a-v2',
          operation: 'upsert',
          sourceReleaseId: 'target-release',
          createdAt: '2026-06-17T00:00:00.000Z',
          updatedAt: '2026-06-17T00:00:00.000Z',
        },
      ])
      .run()

    const state = await resolveSnapshotVersionState(
      [
        {
          snapshotId: 'parent-snapshot',
          parentSnapshotId: null,
          shards: [{ dataShardId: 'history', bindingName: 'history' }],
        },
        {
          snapshotId: 'target-snapshot',
          parentSnapshotId: 'parent-snapshot',
          shards: [{ dataShardId: 'history', bindingName: 'history' }],
        },
      ],
      new Map([['history', { bindingName: 'history', db: db as never }]]),
      ['division'],
    )

    expect(state.get('division\u0000kowloon\u0000')?.versionHash).toBe('kowloon-v1')
    expect(state.get('division\u0000district-a\u0000')?.versionHash).toBe(
      'district-a-v2',
    )

    sqlite.close()
  })
})
