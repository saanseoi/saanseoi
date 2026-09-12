import { describe, expect, test } from 'bun:test'

import { executeSqlText } from './sqlImport.ts'
import { Database } from 'bun:sqlite'
import { createLocalExecBinding } from '../../dbCache/localDbCache.ts'

describe('local SQL import execution', () => {
  test('native execution surfaces an intermediate trigger failure and rolls back preceding writes', async () => {
    const sqlite = new Database(':memory:')
    try {
      sqlite.exec(
        'CREATE TABLE counter(n); INSERT INTO counter VALUES(0); CREATE TABLE blocked(n);',
      )
      sqlite.exec(
        "CREATE TRIGGER reject_insert BEFORE INSERT ON blocked BEGIN SELECT RAISE(ABORT, 'blocked insert'); END;",
      )
      await expect(
        executeSqlText(
          {
            databaseId: null,
            name: 'current',
            binding: createLocalExecBinding(sqlite),
          },
          'UPDATE counter SET n=1; INSERT INTO blocked VALUES(1); UPDATE counter SET n=2;',
          { isLocal: true, localWriteMaxRetries: 0 },
        ),
      ).rejects.toThrow('blocked insert')
      expect(sqlite.query('SELECT n FROM counter').get()).toEqual({ n: 0 })
    } finally {
      sqlite.close()
    }
  })
  test('native SQLite rolls back the entire payload beyond the fallback chunk boundary', async () => {
    const sqlite = new Database(':memory:')
    try {
      sqlite.exec('CREATE TABLE counter(n INTEGER); INSERT INTO counter VALUES(0);')
      const native = createLocalExecBinding(sqlite)
      let executions = 0
      const binding = {
        ...native,
        async executeSqlBatch(sql: string) {
          executions++
          await native.executeSqlBatch?.(sql)
        },
        async batch() {
          throw new Error('Native execution must not use fallback batches')
        },
      }
      const sql = 'UPDATE counter SET n = n + 1;'.repeat(60)
      const target = { databaseId: null, name: 'current' as const, binding }
      await expect(
        executeSqlText(target, `${sql} INSERT INTO missing VALUES(1);`, {
          isLocal: true,
          localWriteMaxRetries: 0,
        }),
      ).rejects.toThrow('missing')
      expect(sqlite.query('SELECT n FROM counter').get()).toEqual({ n: 0 })
      expect(await executeSqlText(target, sql, { isLocal: true })).toBe(60)
      expect(sqlite.query('SELECT n FROM counter').get()).toEqual({ n: 60 })
      expect(executions).toBe(2)
    } finally {
      sqlite.close()
    }
  })

  test('native payload retries preserve retry reporting', async () => {
    let executions = 0
    const retries: number[] = []
    await executeSqlText(
      {
        databaseId: null,
        name: 'history',
        binding: {
          prepare() {
            throw new Error('Unexpected preparation')
          },
          async executeSqlBatch() {
            if (++executions === 1) throw new Error('database is locked')
          },
        },
      },
      'SELECT 1;',
      {
        isLocal: true,
        retryDelayMs: 1,
        localWriteMaxRetries: 2,
        onRetry: event => {
          retries.push(event.attempt)
        },
      },
    )
    expect(executions).toBe(2)
    expect(retries).toEqual([1])
  })
  test('retries local D1 database locks and reports retry attempts', async () => {
    let runs = 0
    const retries: Array<{ attempt: number; delayMs: number; target: string }> = []

    const statement = {
      async run() {
        runs += 1

        if (runs === 1) {
          throw new Error('database is locked')
        }
      },
    }

    const count = await executeSqlText(
      {
        binding: {
          prepare() {
            return statement
          },
        },
        databaseId: null,
        name: 'source',
      },
      'INSERT INTO test VALUES (1);',
      {
        isLocal: true,
        localWriteMaxRetries: 2,
        onRetry(event) {
          retries.push({
            attempt: event.attempt,
            delayMs: event.delayMs,
            target: event.target,
          })
        },
        retryDelayMs: 1,
      },
    )

    expect(count).toBe(1)
    expect(runs).toBe(2)
    expect(retries).toEqual([
      {
        attempt: 1,
        delayMs: 1,
        target: 'source',
      },
    ])
  })

  test('passes retry options through local D1 batch execution', async () => {
    let batches = 0
    const retries: Array<{ attempt: number; delayMs: number; target: string }> = []

    const count = await executeSqlText(
      {
        binding: {
          async batch() {
            batches += 1

            if (batches === 1) {
              throw new Error('database is locked')
            }
          },
          prepare() {
            return {
              async run() {},
            }
          },
        },
        databaseId: null,
        name: 'source',
      },
      'INSERT INTO test VALUES (1);',
      {
        isLocal: true,
        localWriteMaxRetries: 2,
        onRetry(event) {
          retries.push({
            attempt: event.attempt,
            delayMs: event.delayMs,
            target: event.target,
          })
        },
        retryDelayMs: 1,
      },
    )

    expect(count).toBe(1)
    expect(batches).toBe(2)
    expect(retries).toEqual([
      {
        attempt: 1,
        delayMs: 1,
        target: 'source',
      },
    ])
  })
})
