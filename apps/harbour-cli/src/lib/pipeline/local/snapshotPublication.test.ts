import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { drizzle } from 'drizzle-orm/d1'
import { sql } from '@repo/db'
import { sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { createLocalExecBinding } from '../../dbCache/localDbCache.ts'
import {
  beginSnapshotPublication,
  completeSnapshotPublication,
  guardSnapshotPublicationWrites,
} from './snapshotPublication.ts'

const rows = sqliteTable('records', { id: text('id').primaryKey() })
test('D1 batching guards fluent, awaited and grouped writes and atomically prepares completion', async () => {
  const client = new Database(':memory:')
  client.exec(
    'CREATE TABLE records(id TEXT PRIMARY KEY); CREATE TABLE divisionPublicationState(scopeId TEXT, snapshotId TEXT PRIMARY KEY, publicationToken TEXT, status TEXT, preparedAt TEXT, createdAt TEXT, updatedAt TEXT);',
  )
  const db = drizzle(createLocalExecBinding(client) as never)
  const publication = {
    table: 'divisionPublicationState' as const,
    scopeId: 'scope',
    snapshotId: 'snapshot',
    publicationToken: 'release',
    timestamp: '2026-09-11',
  }
  try {
    await beginSnapshotPublication(db, publication)
    const guarded = guardSnapshotPublicationWrites(db, publication)
    await guarded.insert(rows).values({ id: 'one' }).run()
    await guarded.insert(rows).values({ id: 'two' })
    await guarded.batch([
      guarded.insert(rows).values({ id: 'three' }),
      guarded.insert(rows).values({ id: 'four' }),
    ])
    await expect(
      completeSnapshotPublication(
        db,
        publication,
        '(SELECT count(*) FROM records) = 5',
      ),
    ).rejects.toThrow()
    expect(
      client.query('SELECT preparedAt FROM divisionPublicationState').get(),
    ).toEqual({ preparedAt: null })
    await completeSnapshotPublication(
      db,
      publication,
      '(SELECT count(*) FROM records) = 4',
    )
    await expect(guarded.insert(rows).values({ id: 'late' }).run()).rejects.toThrow()
    expect(client.query('SELECT count(*) AS count FROM records').get()).toEqual({
      count: 4,
    })
  } finally {
    client.close()
  }
})

test('D1 guarded returning and batch results retain Drizzle shapes and bound placeholders', async () => {
  const client = new Database(':memory:')
  client.exec(
    'CREATE TABLE records(id TEXT PRIMARY KEY); CREATE TABLE divisionPublicationState(scopeId TEXT, snapshotId TEXT PRIMARY KEY, publicationToken TEXT, status TEXT, preparedAt TEXT, createdAt TEXT, updatedAt TEXT);',
  )
  const db = drizzle(createLocalExecBinding(client) as never)
  const publication = {
    table: 'divisionPublicationState' as const,
    scopeId: 'scope',
    snapshotId: 'snapshot',
    publicationToken: 'release',
    timestamp: '2026-09-11',
  }
  try {
    await beginSnapshotPublication(db, publication)
    const guarded = guardSnapshotPublicationWrites(db, publication)
    const returning = { identifier: rows.id }
    expect(
      await guarded.insert(rows).values({ id: 'all' }).returning(returning).all(),
    ).toEqual([{ identifier: 'all' }])
    expect(
      await guarded.insert(rows).values({ id: 'get' }).returning(returning).get(),
    ).toEqual({ identifier: 'get' })
    expect(
      await guarded.insert(rows).values({ id: 'values' }).returning(returning).values(),
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
    expect(await prepared.get({ id: 'prepared' })).toEqual({ identifier: 'prepared' })
    expect(
      await guarded.batch([
        guarded.insert(rows).values({ id: 'batch-a' }).returning(returning),
        guarded.insert(rows).values({ id: 'batch-b' }).returning(returning),
      ]),
    ).toEqual([[{ identifier: 'batch-a' }], [{ identifier: 'batch-b' }]])
    const run = await guarded
      .insert(rows)
      .values({ id: 'run' })
      .returning(returning)
      .run()
    expect(Array.isArray(run)).toBe(false)
    expect(run).toHaveProperty('success', true)
    await completeSnapshotPublication(
      db,
      publication,
      '(SELECT count(*) FROM records) = 9',
    )
    await expect(prepared.get({ id: 'late' })).rejects.toThrow()
  } finally {
    client.close()
  }
})
