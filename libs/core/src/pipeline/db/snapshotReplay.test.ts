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

          createdAt: '2026-05-20T00:00:00.000Z',
        },
        {
          snapshotId: 'parent-snapshot',
          class: 'district',
          hierarchies: { full: [] },
          id: 'district-a',
          versionHash: 'district-a-v1',
          operation: 'upsert',

          createdAt: '2026-05-20T00:00:00.000Z',
        },
        {
          snapshotId: 'target-snapshot',
          class: 'district',
          hierarchies: { full: [] },
          id: 'district-a',
          versionHash: 'district-a-v2',
          operation: 'upsert',

          createdAt: '2026-06-17T00:00:00.000Z',
        },
      ])
      .run()

    const state = await resolveSnapshotVersionState(
      [
        {
          resourceReleaseId: 'parent-release',
          snapshotId: 'parent-snapshot',
          parentSnapshotId: null,
          shards: [{ dataShardId: 'history', bindingName: 'history' }],
        },
        {
          resourceReleaseId: 'target-release',
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

    expect(state.get('division\u0000kowloon\u0000')?.sourceReleaseId).toBe(
      'parent-release',
    )
    expect(state.get('division\u0000district-a\u0000')?.sourceReleaseId).toBe(
      'target-release',
    )

    const selected = await resolveSnapshotVersionState(
      [
        {
          resourceReleaseId: 'parent-release',
          snapshotId: 'parent-snapshot',
          parentSnapshotId: null,
          shards: [{ dataShardId: 'history', bindingName: 'history' }],
        },
        {
          resourceReleaseId: 'target-release',
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
    sqlite.exec(`INSERT INTO address2d(id,snapshotId,versionHash,granularity) VALUES('address','root','base','building');
      INSERT INTO address2dBuildingNumberLookup(addressId,buildingNumber,snapshotId,versionHash,evidence) VALUES('address','12','root','lookup','source_endpoint');
      INSERT INTO address2d(id,snapshotId,operation) VALUES('address','deleted','delete');`)
    const db = drizzle({ client: sqlite, schema: historySchema })
    const step = (snapshotId: string, parentSnapshotId: string | null) => ({
      resourceReleaseId: 'release',
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

test('bulk parent withdrawals clear locales and composite children without reviving them on restoration', async () => {
  const sqlite = new Database(':memory:')
  try {
    sqlite.exec(
      loadMigrationSql(resolve(import.meta.dir, '../../../../db/migrations'), [
        'history',
      ]),
    )
    const parent = sqlite.query(
      "INSERT INTO address2d(id,snapshotId,versionHash,granularity) VALUES(?,'root','base','building')",
    )
    const locale = sqlite.query(
      "INSERT INTO address2dI18n(addressId,locale,snapshotId,versionHash,formattedAddress) VALUES(?,'en','root','locale','12 Example Road')",
    )
    const lookup = sqlite.query(
      "INSERT INTO address2dBuildingNumberLookup(addressId,buildingNumber,snapshotId,versionHash,evidence) VALUES(?,'12','root','lookup','source_endpoint')",
    )
    const deletion = sqlite.query(
      "INSERT INTO address2d(id,snapshotId,operation) VALUES(?,'deleted','delete')",
    )
    sqlite.transaction(() => {
      for (let index = 0; index < 2000; index++) {
        const id = `address-${index}`
        parent.run(id)
        locale.run(id)
        lookup.run(id)
        if (index < 1000) deletion.run(id)
      }
      sqlite.exec(
        "INSERT INTO address2d(id,snapshotId,versionHash,granularity) VALUES('address-0','restored','base','building'); INSERT INTO address2dI18n(addressId,locale,snapshotId,versionHash,formattedAddress) VALUES('address-0','zh-hant','restored','fresh','新地址')",
      )
    })()
    const db = drizzle({ client: sqlite, schema: historySchema })
    const state = await resolveSnapshotVersionState(
      ['root', 'deleted', 'restored'].map((snapshotId, index, ids) => ({
        resourceReleaseId: 'release',
        snapshotId,
        parentSnapshotId: index ? ids[index - 1]! : null,
        shards: [{ dataShardId: 'h', bindingName: 'h' }],
      })),
      new Map([['h', { bindingName: 'h', db: db as never }]]),
      ['address2d', 'address2dI18n', 'address2dBuildingNumberLookup'],
    )
    expect(state.size).toBe(3002)
    expect(state.has('address2d\u0000address-0\u0000')).toBe(true)
    expect(state.get('address2dI18n\u0000address-0\u0000zh-hant')?.versionHash).toBe(
      'fresh',
    )
    expect(state.has('address2dI18n\u0000address-0\u0000en')).toBe(false)
    expect(
      state.has('address2dBuildingNumberLookup\u0000["address-0","12"]\u0000'),
    ).toBe(false)
    expect(state.has('address2dI18n\u0000address-1999\u0000en')).toBe(true)
    expect(
      state.has('address2dBuildingNumberLookup\u0000["address-1999","12"]\u0000'),
    ).toBe(true)
  } finally {
    sqlite.close()
  }
})

test('mixed geometry snapshots resolve dataset owners and reject an unspecified or unknown producer', async () => {
  const sqlite = new Database(':memory:')
  try {
    sqlite.exec(
      loadMigrationSql(resolve(import.meta.dir, '../../../../db/migrations'), [
        'history',
      ]),
    )
    sqlite.exec(`INSERT INTO divisionAreas(id,snapshotId,divisionId,variant,type,versionHash,producerDatasetCode) VALUES
      ('a','mixed','division','censtatd','land','a1','dataset-a'),
      ('b','mixed','division','censtatd','land','b1','dataset-b');`)
    const db = drizzle({ client: sqlite }) as never
    const shards = new Map([['history', { bindingName: 'history', db }]])
    const plan = [
      {
        snapshotId: 'mixed',
        parentSnapshotId: null,
        resourceReleaseId: null,
        producerReleases: { 'dataset-a': 'release-a', 'dataset-b': 'release-b' },
        shards: [{ dataShardId: 'history', bindingName: 'history' }],
      },
    ]
    const state = await resolveSnapshotVersionState(plan, shards, ['divisionArea'])
    expect([...state.values()].map(row => [row.recordId, row.sourceReleaseId])).toEqual(
      [
        ['a', 'release-a'],
        ['b', 'release-b'],
      ],
    )
    sqlite.exec(
      `INSERT INTO divisionAreas(id,snapshotId,divisionId,variant,type,versionHash) VALUES('unspecified','mixed','division','censtatd','land','u1');`,
    )
    await expect(
      resolveSnapshotVersionState(plan, shards, ['divisionArea']),
    ).rejects.toThrow('unambiguous HISTORY producer')
    sqlite.exec(
      `UPDATE divisionAreas SET producerDatasetCode='unknown' WHERE id='unspecified';`,
    )
    await expect(
      resolveSnapshotVersionState(plan, shards, ['divisionArea']),
    ).rejects.toThrow('unknown')
  } finally {
    sqlite.close()
  }
})

test('Statistics use their existing dataset identity to resolve combined producers', async () => {
  const sqlite = new Database(':memory:')
  try {
    sqlite.exec(
      loadMigrationSql(resolve(import.meta.dir, '../../../../db/migrations'), [
        'history',
      ]),
    )
    sqlite.exec(
      `INSERT INTO statsMeasures(datasetCode,measureCode,snapshotId,versionHash) VALUES ('a','count','mixed','a1'),('b','count','mixed','b1');`,
    )
    const db = drizzle({ client: sqlite }) as never
    const state = await resolveSnapshotVersionState(
      [
        {
          snapshotId: 'mixed',
          parentSnapshotId: null,
          resourceReleaseId: null,
          producerReleases: { a: 'release-a', b: 'release-b' },
          shards: [{ dataShardId: 'history', bindingName: 'history' }],
        },
      ],
      new Map([['history', { bindingName: 'history', db }]]),
      ['statsMeasure'],
    )
    expect([...state.values()].map(row => row.sourceReleaseId)).toEqual([
      'release-a',
      'release-b',
    ])
  } finally {
    sqlite.close()
  }
})
