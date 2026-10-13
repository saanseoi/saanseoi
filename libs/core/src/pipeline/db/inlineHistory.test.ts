import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { resolve } from 'node:path'
import { historyDeletionSql, historyEventTables, historySchema } from '@repo/db'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { loadMigrationSql } from '../../testing/metaFixtures'
import { resolveSnapshotVersionState } from './snapshotReplay'

function fixture() {
  const client = new Database(':memory:')
  client.exec(
    loadMigrationSql(resolve(import.meta.dir, '../../../../db/migrations'), [
      'history',
    ]),
  )
  return { client, db: drizzle({ client, schema: historySchema }) }
}

test('every canonical HISTORY table accepts an identity-only deletion event', () => {
  const { client } = fixture()
  try {
    for (const [recordType, definition] of Object.entries(historyEventTables)) {
      const recordId =
        definition.keys.length === 1
          ? 'record'
          : JSON.stringify(definition.keys.map(key => key))
      client.exec(
        historyDeletionSql({ recordType, recordId, locale: 'en', snapshotId: 'child' }),
      )
      expect(
        client.query(`SELECT operation,versionHash FROM "${definition.table}"`).get(),
      ).toEqual({ operation: 'delete', versionHash: null })
    }
    expect(
      client.query("SELECT type FROM sqlite_schema WHERE name='historyEvents'").get(),
    ).toEqual({ type: 'view' })
    expect(
      client
        .query("SELECT name FROM sqlite_schema WHERE name='snapshotVersionChanges'")
        .get(),
    ).toBeNull()
  } finally {
    client.close()
  }
})

test('inline events inherit on branches and preserve deletion and restoration with one row per change', async () => {
  const { client, db } = fixture()
  try {
    const insert = client.query(
      `INSERT INTO divisions(id,snapshotId,operation,versionHash,sourceReleaseId,class,hierarchies) VALUES ('a',?,'upsert',?,'release','district','{}')`,
    )
    insert.run('root', 'h1')
    insert.run('changed', 'h2')
    client.exec(
      historyDeletionSql({
        recordType: 'division',
        recordId: 'a',
        snapshotId: 'deleted',
      }),
    )
    insert.run('restored', 'h1')
    const parents: Record<string, string | null> = {
      root: null,
      changed: 'root',
      sibling: 'root',
      deleted: 'changed',
      restored: 'deleted',
    }
    const state = async (id: string) => {
      const ancestors = []
      for (let node: string | null = id; node; node = parents[node]!)
        ancestors.unshift({
          snapshotId: node,
          parentSnapshotId: parents[node]!,
          shards: [{ bindingName: 'history', dataShardId: 'history' }],
        })
      return resolveSnapshotVersionState(
        ancestors,
        new Map([['history', { bindingName: 'history', db: db as never }]]),
        ['division'],
      )
    }
    expect(
      [...(await state('sibling')).values()].map(row => [
        row.snapshotId,
        row.versionHash,
      ]),
    ).toEqual([['root', 'h1']])
    expect([...(await state('changed')).values()].map(row => row.versionHash)).toEqual([
      'h2',
    ])
    expect((await state('deleted')).size).toBe(0)
    expect(
      [...(await state('restored')).values()].map(row => [
        row.snapshotId,
        row.versionHash,
      ]),
    ).toEqual([['restored', 'h1']])
    expect(client.query('SELECT count(*) AS n FROM divisions').get()).toEqual({ n: 4 })
    expect(
      client.query("SELECT count(*) AS n FROM divisions WHERE versionHash='h1'").get(),
    ).toEqual({ n: 2 })
    expect(() =>
      client.exec(
        "INSERT INTO divisions(id,snapshotId,versionHash,sourceReleaseId) VALUES ('broken','root','hash','release')",
      ),
    ).toThrow()
  } finally {
    client.close()
  }
})

test('base deletion prevents inherited locales returning after a restoration', async () => {
  const { client, db } = fixture()
  try {
    client.exec(`INSERT INTO divisions(id,snapshotId,versionHash,sourceReleaseId,class,hierarchies) VALUES ('a','root','h','release','district','{"full":[]}'),('a','restored','h','release','district','{"full":[]}');
      INSERT INTO divisionsI18n(divisionId,snapshotId,locale,versionHash,sourceReleaseId,name,isLocaleInferred) VALUES ('a','root','en','n','release','Original',0);`)
    client.exec(
      historyDeletionSql({
        recordType: 'division',
        recordId: 'a',
        snapshotId: 'deleted',
      }),
    )
    const step = (snapshotId: string, parentSnapshotId: string | null) => ({
      snapshotId,
      parentSnapshotId,
      shards: [{ bindingName: 'history', dataShardId: 'history' }],
    })
    const shards = new Map([['history', { bindingName: 'history', db: db as never }]])
    const state = await resolveSnapshotVersionState(
      [step('root', null), step('deleted', 'root'), step('restored', 'deleted')],
      shards,
      ['division', 'divisionI18n'],
    )
    expect([...state.values()].map(row => row.recordType)).toEqual(['division'])
    const sibling = await resolveSnapshotVersionState(
      [step('root', null), step('sibling', 'root')],
      shards,
      ['divisionI18n'],
    )
    expect([...sibling.values()].map(row => row.versionHash)).toEqual(['n'])
    expect(client.query('SELECT count(*) AS n FROM divisionsI18n').get()).toEqual({
      n: 1,
    })
  } finally {
    client.close()
  }
})
