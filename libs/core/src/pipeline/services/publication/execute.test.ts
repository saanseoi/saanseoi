import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { sql } from '@repo/db'
import {
  beginSnapshotPublication,
  completeSnapshotPublication,
  guardSnapshotPublicationWrites,
} from './execute'

const rows = sqliteTable('divisions', {
  id: text('id').primaryKey(),
  snapshotId: text('snapshotId'),
})
const receipt = {
  table: 'divisionPublicationState' as const,
  scopeId: 'scope',
  snapshotId: 'snapshot',
  publicationToken: 'release',
  timestamp: '2026-09-11',
}
function database() {
  const client = new Database(':memory:')
  client.exec(
    'CREATE TABLE divisions(id TEXT PRIMARY KEY, snapshotId TEXT); CREATE TABLE divisionPublicationState(scopeId TEXT PRIMARY KEY, snapshotId TEXT UNIQUE NOT NULL, publicationToken TEXT, status TEXT, preparedAt TEXT, createdAt TEXT, updatedAt TEXT);',
  )
  return { client, db: drizzle({ client }) }
}

test('fluent and awaited Drizzle mutations enforce the preparation owner', async () => {
  const { client, db } = database()
  await beginSnapshotPublication(db, receipt)
  const guarded = guardSnapshotPublicationWrites(db, receipt)
  await guarded.insert(rows).values({ id: 'first', snapshotId: 'snapshot' }).run()
  await guarded.insert(rows).values({ id: 'second', snapshotId: 'snapshot' })
  await completeSnapshotPublication(db, receipt, '(SELECT count(*) FROM divisions) = 2')
  expect(() =>
    guarded.update(rows).set({ snapshotId: 'wrong' }).where(sql`id = 'first'`).run(),
  ).toThrow()
  await expect(
    Promise.resolve(guarded.delete(rows).where(sql`id = 'second'`)),
  ).rejects.toThrow()
  expect(
    client
      .query('SELECT count(*) AS count FROM divisions WHERE snapshotId = ?')
      .get('snapshot'),
  ).toEqual({ count: 2 })
  client.close()
})

test('failed validation rolls back preparation and keeps writes possible for the owner', async () => {
  const { client, db } = database()
  await beginSnapshotPublication(db, receipt)
  await expect(
    completeSnapshotPublication(db, receipt, '(SELECT count(*) FROM divisions) = 1'),
  ).rejects.toThrow()
  expect(client.query('SELECT preparedAt FROM divisionPublicationState').get()).toEqual(
    { preparedAt: null },
  )
  await guardSnapshotPublicationWrites(db, receipt).insert(rows).values({ id: 'later' })
  client.close()
})

test('Bun guarded returning preserves all, get, values, prepared and awaited result shapes', async () => {
  const { client, db } = database()
  try {
    await beginSnapshotPublication(db, receipt)
    const guarded = guardSnapshotPublicationWrites(db, receipt)
    const returning = { identifier: rows.id }
    expect(
      guarded.insert(rows).values({ id: 'all' }).returning(returning).all(),
    ).toEqual([{ identifier: 'all' }])
    expect(
      guarded.insert(rows).values({ id: 'get' }).returning(returning).get(),
    ).toEqual({ identifier: 'get' })
    expect(
      guarded.insert(rows).values({ id: 'values' }).returning(returning).values(),
    ).toEqual([['values']])
    expect(
      await guarded.insert(rows).values({ id: 'awaited' }).returning(returning),
    ).toEqual([{ identifier: 'awaited' }])
    expect(
      await guarded
        .insert(rows)
        .values({ id: 'executed' })
        .returning(returning)
        .execute(),
    ).toEqual([{ identifier: 'executed' }])
    const prepared = guarded
      .insert(rows)
      .values({ id: sql.placeholder('id') })
      .returning(returning)
      .prepare()
    expect(prepared.get({ id: 'prepared' })).toEqual({ identifier: 'prepared' })
    await completeSnapshotPublication(
      db,
      receipt,
      '(SELECT count(*) FROM divisions) = 6',
    )
    expect(() => prepared.get({ id: 'late' })).toThrow()
  } finally {
    client.close()
  }
})
