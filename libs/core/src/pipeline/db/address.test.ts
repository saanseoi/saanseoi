import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { resolve } from 'node:path'
import { historySchema } from '@repo/db'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { loadMigrationSql } from '../../testing/metaFixtures'
import { getReplayedAddressVersionMap } from './address'

test('Address replay uses the chosen ancestor even when a later shard contains another branch', async () => {
  const clients = [new Database(':memory:'), new Database(':memory:')]
  try {
    for (const client of clients)
      client.exec(
        loadMigrationSql(resolve(import.meta.dir, '../../../../db/migrations'), [
          'history',
        ]),
      )
    clients[0]!.exec(
      "INSERT INTO address2d(id,snapshotId,versionHash,sourceReleaseId,granularity) VALUES ('a','root','h1','release','building')",
    )
    clients[1]!.exec(
      "INSERT INTO address2d(id,snapshotId,versionHash,sourceReleaseId,granularity) VALUES ('a','other-branch','h2','release','building')",
    )
    const shards = new Map(
      clients.map((client, index) => [
        String(index),
        {
          bindingName: String(index),
          db: drizzle({ client, schema: historySchema }) as never,
        },
      ]),
    )
    const result = await getReplayedAddressVersionMap(
      {} as never,
      'child',
      shards,
      {
        buildAddressBaseHashInput: base => base,
        buildMatchKey: () => null,
        normaliseAddressI18nSnapshotRow: row => row,
      },
      {
        plan: [
          {
            snapshotId: 'root',
            parentSnapshotId: null,
            shards: [{ dataShardId: '0', bindingName: '0' }],
          },
          {
            snapshotId: 'child',
            parentSnapshotId: 'root',
            shards: [{ dataShardId: '1', bindingName: '1' }],
          },
        ],
      },
    )
    expect(result.get('a')?.versionHash).toBe('h1')
  } finally {
    for (const client of clients) client.close()
  }
})
