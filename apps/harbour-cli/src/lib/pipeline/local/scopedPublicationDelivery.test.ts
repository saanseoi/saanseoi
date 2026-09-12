import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import {
  scopedPublicationDelivery,
  type ScopedPublicationReceipt,
} from './scopedPublicationDelivery.ts'
import type { NetStatement } from './netSqlitePlanTypes.ts'

function fixture() {
  const db = new Database(':memory:')
  db.exec(`CREATE TABLE placePublicationState(scopeId TEXT PRIMARY KEY,snapshotId TEXT UNIQUE,status TEXT NOT NULL,
    publicationToken TEXT NOT NULL,preparedAt TEXT,createdAt TEXT NOT NULL,updatedAt TEXT NOT NULL);
    CREATE TABLE places(id TEXT PRIMARY KEY,value TEXT);
    INSERT INTO places VALUES ('a','old');
    INSERT INTO placePublicationState VALUES ('scope','old','current','old-token','ready','old','old');`)
  const state = () =>
    db
      .query<ScopedPublicationReceipt & { status: string }, []>(
        'SELECT * FROM placePublicationState',
      )
      .get()
  const plan = (snapshotId: string, token = 'token') => {
    const previous = state()
    const batches: NetStatement[][] = []
    const delivery = scopedPublicationDelivery({
      preparation: () => ({
        table: 'placePublicationState',
        scopeId: 'scope',
        snapshotId,
        publicationToken: token,
        timestamp: 'now',
      }),
      previous: () => previous,
      target: { databaseId: 'current', bindingName: 'DB_CURRENT' },
      validation: () => '(SELECT count(*) FROM places) = 1',
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
  const append = (p: ReturnType<typeof plan>) =>
    p.append(
      { databaseId: 'current', bindingName: 'DB_CURRENT' },
      Buffer.from(
        JSON.stringify([{ sql: "UPDATE places SET value='new'", params: [] }]),
      ),
      'bound',
    )
  return { db, state, plan, execute, append }
}

test('scoped net delivery gates each mutation and certifies completion separately', async () => {
  const f = fixture()
  try {
    const p = f.plan('new')
    await f.append(p)
    await p.complete()
    expect(p.batches).toHaveLength(3)
    f.execute(p.batches[0]!)
    expect(f.state()).toMatchObject({
      snapshotId: 'new',
      status: 'publishing',
      preparedAt: null,
    })
    expect(f.db.query('SELECT value FROM places').get()).toEqual({ value: 'old' })
    f.execute(p.batches[1]!)
    expect(f.state()?.preparedAt).toBeNull()
    f.execute(p.batches[2]!)
    expect(f.state()).toMatchObject({ preparedAt: 'now', status: 'publishing' })
    expect(() => f.execute(p.batches[1]!)).toThrow('integer overflow')
  } finally {
    f.db.close()
  }
})

test('competing scoped owners cannot mutate or certify another delivery', async () => {
  const f = fixture()
  try {
    const first = f.plan('new', 'first'),
      second = f.plan('other', 'second')
    for (const p of [first, second]) {
      await f.append(p)
      await p.complete()
    }
    f.execute(first.batches[0]!)
    for (const batch of second.batches)
      expect(() => f.execute(batch)).toThrow('integer overflow')
    expect(f.db.query('SELECT value FROM places').get()).toEqual({ value: 'old' })
  } finally {
    f.db.close()
  }
})

test('unchanged releases advance only the receipt and acknowledged retries do nothing', async () => {
  const f = fixture()
  try {
    const retry = f.plan('old')
    await retry.complete()
    expect(retry.batches).toHaveLength(0)
    const next = f.plan('new')
    await next.complete()
    expect(next.batches).toHaveLength(2)
    // Deferred publication and differing local/remote clocks retain the exact predecessor.
    f.db.exec(
      "UPDATE placePublicationState SET preparedAt='remote',updatedAt='remote',status='publishing'",
    )
    for (const batch of next.batches) f.execute(batch)
    expect(f.state()).toMatchObject({ snapshotId: 'new', preparedAt: 'now' })
    const repeated = f.plan('new')
    await repeated.complete()
    expect(repeated.batches).toHaveLength(0)
  } finally {
    f.db.close()
  }
})

test('target validation failure leaves the scoped projection unavailable', async () => {
  const f = fixture()
  try {
    const p = f.plan('new')
    await p.complete()
    f.execute(p.batches[0]!)
    f.db.exec('DELETE FROM places')
    expect(() => f.execute(p.batches[1]!)).toThrow('integer overflow')
    expect(f.state()?.preparedAt).toBeNull()
  } finally {
    f.db.close()
  }
})
