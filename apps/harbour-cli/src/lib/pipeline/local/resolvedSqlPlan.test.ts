import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  buildBeginPublicationSql,
  buildCompletePublicationSql,
} from '@repo/core/pipeline/services/publication/sql.ts'
import { captureResolvedSqlPlan } from './resolvedSqlPlan.ts'
import type { NetStatement } from './netSqlitePlanTypes.ts'

async function fixture(run: (db: Database, path: string) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), 'resolved-sql-'))
  const path = join(root, 'current.sqlite')
  const db = new Database(path)
  try {
    db.exec(`CREATE TABLE divisions(snapshotId TEXT,id TEXT,name TEXT,payload BLOB,updatedAt TEXT,PRIMARY KEY(snapshotId,id));
      CREATE TABLE divisionsI18n(snapshotId TEXT,divisionId TEXT,locale TEXT,name TEXT,updatedAt TEXT,PRIMARY KEY(snapshotId,divisionId,locale));
      CREATE TABLE unrelated(id TEXT PRIMARY KEY,value TEXT);
      INSERT INTO unrelated VALUES('other','preserved');
      INSERT INTO divisions VALUES('scope','a','A',NULL,'old'),('other','b','B',NULL,'old');
      INSERT INTO divisionsI18n VALUES('scope','a','en','A','old'),('scope','a','zh-Hant','甲','old');
      CREATE TABLE divisionPublicationState(scopeId TEXT PRIMARY KEY,snapshotId TEXT UNIQUE,publicationToken TEXT,status TEXT,preparedAt TEXT,createdAt TEXT,updatedAt TEXT);
      INSERT INTO divisionPublicationState VALUES('scope','old','old-token','current','old','old','old');`)
    await run(db, path)
  } finally {
    db.close()
    await rm(root, { recursive: true, force: true })
  }
}

const preparation = {
  table: 'divisionPublicationState' as const,
  scopeId: 'scope',
  snapshotId: 'new',
  publicationToken: 'new-token',
  timestamp: 'new',
  previous: { snapshotId: 'old', publicationToken: 'old-token' },
}
const targets = (path: string) => ({
  DB_CURRENT: {
    path,
    schema: {},
    tables: ['divisions', 'divisionsI18n'].map(name => ({
      name,
      ignoredColumns: ['updatedAt'],
    })),
  },
})

function currentClient(candidates: { DB_CURRENT?: { db: Database } }): Database {
  const client = candidates.DB_CURRENT?.db
  if (!client) throw new Error('Missing DB_CURRENT test candidate')
  return client
}

test('resolved release delivers only one changed locale and separate publication transitions', async () => {
  await fixture(async (db, path) => {
    const batches: NetStatement[][] = []
    const plan = await captureResolvedSqlPlan({
      targets: targets(path),
      publicationTables: ['divisionPublicationState'],
      append: async (_target, bytes) => {
        batches.push(JSON.parse(new TextDecoder().decode(bytes)))
      },
      generate: async candidates => {
        const copy = currentClient(candidates)
        copy.exec(buildBeginPublicationSql(preparation))
        copy.exec(
          "UPDATE divisions SET updatedAt='new' WHERE snapshotId='scope'; UPDATE divisionsI18n SET name='Revised',updatedAt='new' WHERE snapshotId='scope' AND locale='en';",
        )
        copy.exec(buildCompletePublicationSql(preparation))
      },
    })
    expect(plan.mutationSummary.tables.DB_CURRENT?.divisions?.updated).toBe(0)
    expect(plan.mutationSummary.tables.DB_CURRENT?.divisionsI18n?.updated).toBe(1)
    expect(db.query("SELECT name FROM divisionsI18n WHERE locale='en'").get()).toEqual({
      name: 'A',
    })
    for (const batch of batches)
      db.transaction(() => {
        for (const statement of batch) db.query(statement.sql).run(...statement.params)
      })()
    expect(db.query("SELECT name FROM divisionsI18n WHERE locale='en'").get()).toEqual({
      name: 'Revised',
    })
    expect(
      db.query("SELECT name,updatedAt FROM divisions WHERE snapshotId='other'").get(),
    ).toEqual({ name: 'B', updatedAt: 'old' })
    expect(
      db.query('SELECT status,preparedAt FROM divisionPublicationState').get(),
    ).toEqual({ status: 'publishing', preparedAt: 'new' })
  })
})

for (const change of [
  "UPDATE divisions SET name='bad' WHERE snapshotId='other'",
  "UPDATE unrelated SET value='bad'",
])
  test(`resolved preparation rejects unowned changes before append: ${change}`, async () => {
    await fixture(async (_db, path) => {
      let emitted = false
      await expect(
        captureResolvedSqlPlan({
          targets: targets(path),
          publicationTables: ['divisionPublicationState'],
          append: async () => {
            emitted = true
          },
          generate: async candidates => {
            const copy = currentClient(candidates)
            copy.exec(buildBeginPublicationSql(preparation))
            copy.exec(change)
            copy.exec(buildCompletePublicationSql(preparation))
          },
        }),
      ).rejects.toThrow(/owned scope|unowned table/)
      expect(emitted).toBe(false)
    })
  })

test('large binary geometry binds as bounded SQL and replays one changed row', async () => {
  await fixture(async (db, path) => {
    const expected = new Uint8Array(200_000).fill(173)
    const payloads: NetStatement[][] = []
    const result = await captureResolvedSqlPlan({
      targets: targets(path),
      publicationTables: ['divisionPublicationState'],
      append: async (_target, bytes) => {
        payloads.push(JSON.parse(new TextDecoder().decode(bytes)))
      },
      generate: async candidates => {
        const copy = currentClient(candidates)
        copy.exec(buildBeginPublicationSql(preparation))
        copy
          .query("UPDATE divisions SET payload=? WHERE snapshotId='scope'")
          .run(expected)
        copy.exec(buildCompletePublicationSql(preparation))
      },
    })
    expect(result.mutationSummary.tables.DB_CURRENT?.divisions?.updated).toBe(1)
    for (const batch of payloads)
      db.transaction(() => {
        for (const statement of batch) {
          expect(Buffer.byteLength(statement.sql)).toBeLessThan(100_000)
          db.query(statement.sql).run(...statement.params)
        }
      })()
    expect(
      db
        .query<{ payload: Uint8Array }, []>(
          "SELECT payload FROM divisions WHERE snapshotId='scope'",
        )
        .get()?.payload,
    ).toEqual(expected)
  })
})
