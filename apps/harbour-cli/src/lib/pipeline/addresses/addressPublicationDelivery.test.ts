import { loadMigrationSql } from '../../../../../../libs/core/src/testing/metaFixtures'
import { resolve } from 'node:path'
import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { addressPublicationDelivery } from './addressPublicationDelivery.ts'
import type { AddressPublicationReceipt } from '@repo/core/pipeline/db/addressPublication'
import type { NetStatement } from '../local/netSqlitePlanTypes.ts'

function fixture() {
  const db = new Database(':memory:')
  db.exec(
    loadMigrationSql(resolve(import.meta.dir, '../../../../../../libs/db/migrations'), [
      'current',
    ]),
  )
  db.exec(`INSERT INTO address2d(scopeId,id,divisionSnapshotId,granularity) VALUES ('scope','a','division','old');
    INSERT INTO addressPublicationState(scopeId,snapshotId,status,publicationToken,preparedAt,createdAt,updatedAt) VALUES ('scope','old','current','old-token','ready','old','old');`)
  const state = () =>
    db
      .query<AddressPublicationReceipt, []>(
        "SELECT * FROM addressPublicationState WHERE scopeId='scope'",
      )
      .get()
  const plan = (snapshotId: string, publicationToken: string) => {
    const previous = state()
    const batches: NetStatement[][] = []
    const delivery = addressPublicationDelivery({
      owner: { scopeId: 'scope', snapshotId, publicationToken },
      target: { databaseId: 'current', bindingName: 'DB_CURRENT' },
      previous: () => previous,
      validation: () => "(SELECT count(*) FROM address2d WHERE scopeId='scope') = 1",
      capture: async (_target, bytes) => {
        batches.push(JSON.parse(new TextDecoder().decode(bytes)))
      },
    })
    return { ...delivery, batches }
  }
  const execute = (batch: NetStatement[]) =>
    db.transaction(() => {
      for (const statement of batch) db.query(statement.sql).run(...statement.params)
    })()
  const mutation = Buffer.from(
    JSON.stringify([
      {
        sql: "UPDATE address2d SET granularity = 'new' WHERE scopeId='scope'",
        params: [],
      },
    ]),
  )
  return { db, state, plan, execute, mutation }
}

test('Address delivery gates reads before mutation and records preparation only after all batches', async () => {
  const f = fixture()
  try {
    const p = f.plan('new', 'token')
    await p.append(
      { databaseId: 'current', bindingName: 'DB_CURRENT' },
      f.mutation,
      'bound',
    )
    await p.complete()
    expect(p.batches).toHaveLength(3)
    f.execute(p.batches[0]!)
    expect(f.state()).toMatchObject({
      snapshotId: 'new',
      status: 'publishing',
      preparedAt: null,
    })
    expect(
      f.db
        .query("SELECT granularity AS value FROM address2d WHERE scopeId='scope'")
        .get(),
    ).toEqual({ value: 'old' })
    f.execute(p.batches[1]!)
    expect(f.state()?.preparedAt).toBeNull()
    f.execute(p.batches[2]!)
    expect(f.state()?.preparedAt).not.toBeNull()
    expect(f.state()?.status).toBe('publishing')
  } finally {
    f.db.close()
  }
})

test('concurrent and stale Address deliveries cannot mutate or complete another owner', async () => {
  const f = fixture()
  try {
    const a = f.plan('new', 'one'),
      b = f.plan('other', 'two')
    for (const p of [a, b]) {
      await p.append(
        { databaseId: 'current', bindingName: 'DB_CURRENT' },
        f.mutation,
        'bound',
      )
      await p.complete()
    }
    f.execute(a.batches[0]!)
    for (const batch of b.batches)
      expect(() => f.execute(batch)).toThrow('integer overflow')
    expect(
      f.db
        .query("SELECT granularity AS value FROM address2d WHERE scopeId='scope'")
        .get(),
    ).toEqual({ value: 'old' })
    f.execute(a.batches[1]!)
    f.execute(a.batches[2]!)
    expect(() => f.execute(a.batches[1]!)).toThrow('integer overflow')
  } finally {
    f.db.close()
  }
})

test('empty and unchanged Address releases touch only publication metadata', async () => {
  const f = fixture()
  try {
    const same = f.plan('old', 'retry')
    await same.complete()
    expect(same.batches).toHaveLength(0)
    const next = f.plan('new', 'next')
    await next.complete()
    expect(next.batches).toHaveLength(2)
    for (const batch of next.batches) f.execute(batch)
    expect(
      f.db
        .query("SELECT granularity AS value FROM address2d WHERE scopeId='scope'")
        .get(),
    ).toEqual({ value: 'old' })
    expect(f.state()).toMatchObject({ snapshotId: 'new', status: 'publishing' })
  } finally {
    f.db.close()
  }
})

test('actual delivered projection validation aborts preparation atomically', async () => {
  const f = fixture()
  try {
    const p = f.plan('new', 'token')
    await p.append(
      { databaseId: 'current', bindingName: 'DB_CURRENT' },
      f.mutation,
      'bound',
    )
    await p.complete()
    f.execute(p.batches[0]!)
    f.execute(p.batches[1]!)
    f.db.exec('DELETE FROM address2d')
    expect(() => f.execute(p.batches[2]!)).toThrow('integer overflow')
    expect(f.state()).toMatchObject({ status: 'publishing', preparedAt: null })
  } finally {
    f.db.close()
  }
})

test('mirror replay timestamps and publication timing cannot invalidate the same acknowledged predecessor', async () => {
  const f = fixture()
  try {
    const p = f.plan('new', 'token')
    await p.complete()
    // The plan was sealed against a completed local replay; remote publication can
    // have different timestamps while retaining the exact same ownership token.
    f.db.exec(
      "UPDATE addressPublicationState SET updatedAt='remote-time',preparedAt='remote-ready',status='publishing'",
    )
    for (const batch of p.batches) f.execute(batch)
    expect(f.state()).toMatchObject({ snapshotId: 'new', publicationToken: 'token' })
  } finally {
    f.db.close()
  }
})

test('acknowledged prepared releases can advance while API publication is deferred', async () => {
  const f = fixture()
  try {
    const first = f.plan('first', 'one')
    await first.complete()
    for (const batch of first.batches) f.execute(batch)
    expect(f.state()?.status).toBe('publishing')
    const repeated = f.plan('first', 'unused')
    await repeated.complete()
    expect(repeated.batches).toHaveLength(0)
    const next = f.plan('second', 'two')
    await next.complete()
    for (const batch of next.batches) f.execute(batch)
    expect(f.state()).toMatchObject({
      snapshotId: 'second',
      status: 'publishing',
      publicationToken: 'two',
    })
    expect(f.state()?.preparedAt).not.toBeNull()
  } finally {
    f.db.close()
  }
})
