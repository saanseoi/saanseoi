import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import type { SnapshotReplayStep } from '@repo/core/db/metaRegistry'
import type { ReplayShard } from '@repo/core/pipeline/db/snapshotReplay.ts'
import { historySchema } from '@repo/db'
import { countSnapshotRecords } from './snapshotRecordCount'

function fixture() {
  const databases: Database[] = []
  const shards = new Map<string, ReplayShard>()
  const plan: SnapshotReplayStep[] = []
  function step(snapshotId: string, bindingName: string) {
    if (!shards.has(bindingName)) {
      const sqlite = new Database(':memory:')
      sqlite.exec(`create table address2d (
        id text, snapshotId text, operation text,
        primary key (id, snapshotId))`)
      databases.push(sqlite)
      shards.set(bindingName, {
        bindingName,
        db: drizzle({ client: sqlite }) as unknown as ReplayShard['db'],
      })
    }
    plan.push({
      snapshotId,
      resourceReleaseId: 'source',
      parentSnapshotId: plan.at(-1)?.snapshotId ?? null,
      shards: [{ bindingName, dataShardId: bindingName }],
    })
    const sqlite = databases[[...shards.keys()].indexOf(bindingName)]!
    return (id: string, operation = 'upsert') =>
      sqlite
        .query('insert into address2d values (?, ?, ?)')
        .run(id, snapshotId, operation)
  }
  return {
    shards,
    plan,
    step,
    close: () => {
      for (const db of databases) db.close()
    },
  }
}

test('counts only the latest base event on the selected branch, including resurrection', async () => {
  const f = fixture()
  try {
    const root = f.step('root', '2026')
    root('retained')
    root('removed')
    root('resurrected')
    const delta = f.step('delta', '2026')
    delta('removed', 'delete')
    delta('resurrected', 'delete')
    delta('added')
    const leaf = f.step('leaf', '2026')
    leaf('resurrected')
    leaf('retained')
    const other = f.step('other-branch', '2026')
    other('unrelated')
    other('retained', 'delete')
    f.plan.pop()
    expect(await countSnapshotRecords(f.plan, f.shards, historySchema.address2d)).toBe(
      3,
    )
  } finally {
    f.close()
  }
})

test('merges annual shards using branch order, not binding order or snapshot names', async () => {
  const f = fixture()
  try {
    const root = f.step('z-root', 'BEFORE')
    root('retained')
    root('removed')
    root('resurrected')
    const delta = f.step('a-delta', '2025')
    delta('removed', 'delete')
    delta('resurrected', 'delete')
    delta('added')
    const leaf = f.step('b-leaf', '2026')
    leaf('resurrected')
    leaf('retained')
    const reversed = new Map([...f.shards].reverse())
    expect(await countSnapshotRecords(f.plan, reversed, historySchema.address2d)).toBe(
      3,
    )
  } finally {
    f.close()
  }
})

test('merges multiple identity windows without dropping boundary records or double counting', async () => {
  const f = fixture()
  try {
    const root = f.step('root', '2025')
    for (let i = 0; i < 8200; i++) root(String(i).padStart(5, '0'))
    const delta = f.step('delta', '2026')
    for (let i = 0; i < 8200; i++)
      delta(String(i).padStart(5, '0'), i % 2 ? 'upsert' : 'delete')
    delta('new')
    expect(await countSnapshotRecords(f.plan, f.shards, historySchema.address2d)).toBe(
      4101,
    )
  } finally {
    f.close()
  }
})

test('missing history bindings fail instead of returning an incomplete count', async () => {
  const f = fixture()
  try {
    f.step('root', '2026')('one')
    f.shards.clear()
    await expect(
      countSnapshotRecords(f.plan, f.shards, historySchema.address2d),
    ).rejects.toThrow('Unavailable history binding')
  } finally {
    f.close()
  }
})
