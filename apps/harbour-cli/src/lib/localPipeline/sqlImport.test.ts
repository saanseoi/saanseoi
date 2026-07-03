import { describe, expect, test } from 'bun:test'

import { executeSqlText } from './sqlImport.ts'

describe('local SQL import execution', () => {
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
