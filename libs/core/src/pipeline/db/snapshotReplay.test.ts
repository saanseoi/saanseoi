import { Database } from 'bun:sqlite'
import { describe, expect, test } from 'bun:test'
import { resolve } from 'node:path'
import { historySchema } from '@repo/db'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { loadMigrationSql } from '../../testing/metaFixtures'

import { resolveSnapshotVersionState } from './snapshotReplay'

describe('resolveSnapshotVersionState', () => {
  test('retains an inherited Kowloon row when the target snapshot is delta-only', async () => {
    const sqlite = new Database(':memory:')
    sqlite.exec(
      loadMigrationSql(resolve(import.meta.dir, '../../../../db/migrations'), [
        'history',
      ]),
    )

    const db = drizzle({ client: sqlite, schema: historySchema })
    await db
      .insert(historySchema.divisions)
      .values([
        {
          snapshotId: 'parent-snapshot',
          class: 'district',
          hierarchies: { full: [] },
          id: 'kowloon',
          versionHash: 'kowloon-v1',
          operation: 'upsert',
          sourceReleaseId: 'parent-release',
          createdAt: '2026-05-20T00:00:00.000Z',
          updatedAt: '2026-05-20T00:00:00.000Z',
        },
        {
          snapshotId: 'parent-snapshot',
          class: 'district',
          hierarchies: { full: [] },
          id: 'district-a',
          versionHash: 'district-a-v1',
          operation: 'upsert',
          sourceReleaseId: 'parent-release',
          createdAt: '2026-05-20T00:00:00.000Z',
          updatedAt: '2026-05-20T00:00:00.000Z',
        },
        {
          snapshotId: 'target-snapshot',
          class: 'district',
          hierarchies: { full: [] },
          id: 'district-a',
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

    const selected = await resolveSnapshotVersionState(
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
      ['kowloon'],
    )
    expect([...selected.values()].map(row => row.versionHash)).toEqual(['kowloon-v1'])

    sqlite.close()
  })
})

test('parent-ID selection includes composite components and honours parent deletion on one branch', async () => {
  const sqlite = new Database(':memory:')
  try {
    sqlite.exec(
      loadMigrationSql(resolve(import.meta.dir, '../../../../db/migrations'), [
        'history',
      ]),
    )
    sqlite.exec(`INSERT INTO address2d(id,snapshotId,versionHash,sourceReleaseId,granularity) VALUES('address','root','base','release','building');
      INSERT INTO address2dBuildingNumberLookup(addressId,buildingNumber,snapshotId,versionHash,sourceReleaseId,evidence) VALUES('address','12','root','lookup','release','source_endpoint');
      INSERT INTO address2d(id,snapshotId,operation) VALUES('address','deleted','delete');`)
    const db = drizzle({ client: sqlite, schema: historySchema })
    const step = (snapshotId: string, parentSnapshotId: string | null) => ({
      snapshotId,
      parentSnapshotId,
      shards: [{ dataShardId: 'h', bindingName: 'h' }],
    })
    const shards = new Map([['h', { bindingName: 'h', db: db as never }]])
    for (const selection of [['address'], [JSON.stringify(['address', '12'])]]) {
      const sibling = await resolveSnapshotVersionState(
        [step('root', null), step('sibling', 'root')],
        shards,
        ['address2dBuildingNumberLookup'],
        selection,
      )
      expect([...sibling.values()].map(row => row.recordId)).toEqual([
        '["address","12"]',
      ])
      const deleted = await resolveSnapshotVersionState(
        [step('root', null), step('deleted', 'root')],
        shards,
        ['address2dBuildingNumberLookup'],
        selection,
      )
      expect(deleted.size).toBe(0)
    }
  } finally {
    sqlite.close()
  }
})
