import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { resolve } from 'node:path'
import { loadMigrationSql } from '../../../../../../libs/core/src/testing/metaFixtures.ts'
import {
  applyResolvedAddressRetirements,
  withAddressCandidateTransactions,
} from './resolvedAddressDelivery.ts'

test('retirements batch historical writes and preserve locale tombstones across shards', () => {
  const current = new Database(':memory:')
  const old = new Database(':memory:')
  const history = new Database(':memory:')
  try {
    for (const [db, family] of [
      [current, 'current'],
      [old, 'history'],
      [history, 'history'],
    ] as const) {
      db.exec(
        loadMigrationSql(
          resolve(import.meta.dir, '../../../../../../libs/db/migrations'),
          [family],
        ),
      )
    }
    old.exec(`INSERT INTO address2d(id,versionHash,sourceReleaseId,snapshotId,isCurrent) VALUES('retired','base','first','previous',1);
      INSERT INTO address2dI18n(addressId,locale,formattedAddress,versionHash,sourceReleaseId,snapshotId,isCurrent) VALUES('retired','zh-Hant','Address','text','first','previous',1);`)
    for (const db of [old, history]) {
      const query = db.query.bind(db)
      db.query = ((sql: string) => {
        if (/^\s*(UPDATE|INSERT)/i.test(sql)) expect(db.inTransaction).toBe(true)
        return query(sql)
      }) as typeof db.query
    }
    applyResolvedAddressRetirements(
      {
        DB_CURRENT: { db: current },
        DB_HISTORY_HK_2025: { db: old },
        DB_HISTORY_HK_2026: { db: history },
      },
      {
        retiredAddressIds: ['retired'],
        scopeId: 'scope',
        snapshotId: 'next',
        message: {
          datasetId: 'dataset',
          sourceVersion: '2026-04-03.0',
          releaseId: 'release',
          processingRunStartedAt: 'now',
        } as never,
        context: { historyBinding: { bindingName: 'DB_HISTORY_HK_2026' } } as never,
      },
    )
    expect(old.query('SELECT isCurrent FROM address2d').get()).toEqual({ isCurrent: 0 })
    expect(old.query('SELECT isCurrent FROM address2dI18n').get()).toEqual({
      isCurrent: 0,
    })
    expect(
      history
        .query(
          'SELECT recordType,locale,operation FROM snapshotVersionChanges ORDER BY recordType',
        )
        .all(),
    ).toEqual([
      { recordType: 'address2d', locale: '', operation: 'delete' },
      { recordType: 'address2dI18n', locale: 'zh-Hant', operation: 'delete' },
    ])
  } finally {
    for (const db of [current, old, history]) db.close()
  }
})

test('candidate transactions support nested batches and roll back failed asynchronous imports', async () => {
  const a = new Database(':memory:')
  const b = new Database(':memory:')
  const candidates = { a: { db: a }, b: { db: b } }
  try {
    for (const db of [a, b]) db.exec('CREATE TABLE records(id INTEGER PRIMARY KEY)')
    const write = async () => {
      for (const db of [a, b]) {
        db.transaction(() => db.exec('INSERT INTO records VALUES(1)'))()
        await Promise.resolve()
      }
    }
    await expect(
      withAddressCandidateTransactions(candidates, async () => {
        await write()
        throw new Error('invalid source')
      }),
    ).rejects.toThrow('invalid source')
    for (const db of [a, b]) {
      expect(db.inTransaction).toBe(false)
      expect(db.query('SELECT * FROM records').all()).toEqual([])
    }
    await withAddressCandidateTransactions(candidates, write)
    for (const db of [a, b]) {
      expect(db.inTransaction).toBe(false)
      expect(db.query('SELECT * FROM records').all()).toEqual([{ id: 1 }])
    }
  } finally {
    a.close()
    b.close()
  }
})
