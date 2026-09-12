import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { splitSqlStatements } from '../addresses/sqlImportStages'
import {
  buildBeginPublicationSql,
  buildCompletePublicationSql,
  buildPublicationGuardSql,
  buildPublicationRowCountSql,
} from './sql'

const execute = (db: Database, text: string) =>
  db.transaction(() => {
    for (const statement of splitSqlStatements(text)) db.query(statement).run()
  })()

const receipt = {
  table: 'divisionPublicationState' as const,
  scopeId: 'lineage',
  snapshotId: 'snapshot',
  publicationToken: 'release',
  timestamp: '2026-09-11T00:00:00Z',
}
function database() {
  const db = new Database(':memory:')
  db.exec(
    `CREATE TABLE divisionPublicationState(scopeId TEXT PRIMARY KEY, snapshotId TEXT UNIQUE NOT NULL, status TEXT NOT NULL, publicationToken TEXT NOT NULL, preparedAt TEXT, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL); CREATE TABLE divisions(snapshotId TEXT, id TEXT);`,
  )
  return db
}

test('a complete empty snapshot gets a preparation receipt without becoming published', () => {
  const db = database()
  execute(db, buildBeginPublicationSql(receipt))
  execute(
    db,
    buildCompletePublicationSql({
      ...receipt,
      validationSql: buildPublicationRowCountSql('divisions', receipt.snapshotId, 0),
    }),
  )
  expect(
    db.query('SELECT status, preparedAt FROM divisionPublicationState').get(),
  ).toEqual({ status: 'publishing', preparedAt: receipt.timestamp })
  db.close()
})

test('incomplete snapshots and competing deliveries cannot complete or mutate the receipt', () => {
  const db = database()
  execute(db, buildBeginPublicationSql(receipt))
  expect(() =>
    execute(
      db,
      buildCompletePublicationSql({
        ...receipt,
        validationSql: buildPublicationRowCountSql('divisions', receipt.snapshotId, 2),
      }),
    ),
  ).toThrow()
  expect(() =>
    execute(
      db,
      buildBeginPublicationSql({ ...receipt, publicationToken: 'other-release' }),
    ),
  ).toThrow()
  expect(() =>
    execute(
      db,
      buildPublicationGuardSql({ ...receipt, publicationToken: 'other-release' }),
    ),
  ).toThrow()
  expect(
    db.query('SELECT preparedAt, publicationToken FROM divisionPublicationState').get(),
  ).toEqual({ preparedAt: null, publicationToken: 'release' })
  db.close()
})

test('preparation retries do not write and cannot re-open a published snapshot', () => {
  const db = database()
  execute(db, buildBeginPublicationSql(receipt))
  execute(db, buildBeginPublicationSql(receipt))
  expect(db.query('SELECT changes() AS count').get()).toEqual({ count: 0 })
  execute(db, buildCompletePublicationSql(receipt))
  db.exec("UPDATE divisionPublicationState SET status='current'")
  expect(() => execute(db, buildBeginPublicationSql(receipt))).toThrow()
  expect(() => execute(db, buildPublicationGuardSql(receipt))).toThrow()
  db.close()
})

test('advancing a scope gates its stable rows and rejects stale predecessor tokens', () => {
  const db = database()
  execute(db, buildBeginPublicationSql(receipt))
  execute(db, buildCompletePublicationSql(receipt))
  const next = {
    ...receipt,
    snapshotId: 'next',
    publicationToken: 'next',
    previous: {
      snapshotId: receipt.snapshotId,
      publicationToken: receipt.publicationToken,
    },
  }
  execute(db, buildBeginPublicationSql(next))
  expect(
    db.query('SELECT snapshotId, status FROM divisionPublicationState').all(),
  ).toEqual([{ snapshotId: 'next', status: 'publishing' }])
  expect(() =>
    execute(
      db,
      buildBeginPublicationSql({
        ...next,
        snapshotId: 'stale',
        publicationToken: 'stale',
      }),
    ),
  ).toThrow()
  execute(db, buildCompletePublicationSql(next))
  expect(() =>
    execute(
      db,
      buildBeginPublicationSql({
        ...next,
        snapshotId: 'stale',
        publicationToken: 'stale',
      }),
    ),
  ).toThrow()
  db.close()
})
