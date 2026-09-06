import { expect, test } from 'bun:test'
import { captureSqlDeliveryBatches } from './sqlDeliveryBatchCapture.ts'
import {
  captureSqlDeliveryBytes,
  withSqlDeliveryCapture,
} from './sqlDeliveryCapture.ts'
import { executeSqlText } from './sqlImport.ts'

test('capture intercepts both SQL paths without credentials or local writes', async () => {
  const captured: string[] = []
  const target = {
    databaseId: 'db',
    name: 'current' as const,
    binding: {
      prepare() {
        throw new Error('Local writes must not run during preparation')
      },
    },
  }
  await captureSqlDeliveryBatches(
    async (_, bytes) => {
      captured.push(new TextDecoder().decode(bytes))
    },
    async () => {
      await executeSqlText(target, 'SELECT 1;', { isLocal: true })
      await executeSqlText(target, 'SELECT 1;', { isLocal: false })
      await executeSqlText(target, 'SELECT 2;', { isLocal: false })
    },
  )
  expect(captured).toEqual(['SELECT 1;\nSELECT 2;\n'])
  expect(await captureSqlDeliveryBytes(target, new Uint8Array(), true)).toBe(false)
})

test('oversized artefacts split at statements and preserve quoted semicolons and Unicode', async () => {
  const sql = "SELECT 'a;''中';\nSELECT 2;\nSELECT 3;"
  const captured: string[] = []
  await captureSqlDeliveryBatches(
    async (_, bytes) => {
      expect(bytes.byteLength).toBeLessThanOrEqual(24)
      captured.push(new TextDecoder().decode(bytes))
    },
    () =>
      executeSqlText({ databaseId: 'db', name: 'current' }, sql, { isLocal: false }),
    24,
  )
  expect(captured.join('')).toBe("SELECT 'a;''中';\nSELECT 2;\nSELECT 3;\n")
})

test('capture preserves concurrent submission and target order', async () => {
  const captured: string[] = []
  await captureSqlDeliveryBatches(
    async (target, bytes) => {
      captured.push(`${target.databaseId}:${new TextDecoder().decode(bytes)}`)
    },
    async () => {
      await Promise.all(
        ['a', 'a', 'b', 'a'].map((databaseId, index) =>
          executeSqlText({ databaseId, name: 'current' }, `SELECT ${index};`, {
            isLocal: false,
          }),
        ),
      )
    },
  )
  expect(captured).toEqual([
    'a:SELECT 0;\nSELECT 1;\n',
    'b:SELECT 2;\n',
    'a:SELECT 3;\n',
  ])
})

test('capture rejects nested scopes, oversized statements and transactions', async () => {
  await expect(
    withSqlDeliveryCapture(
      async () => {},
      () =>
        withSqlDeliveryCapture(
          async () => {},
          async () => {},
        ),
    ),
  ).rejects.toThrow('Nested')
  for (const sql of ["SELECT 'this exceeds the budget';", 'BEGIN;SELECT 1;COMMIT;']) {
    await expect(
      captureSqlDeliveryBatches(
        async () => {},
        () =>
          executeSqlText({ databaseId: 'db', name: 'current' }, sql, {
            isLocal: false,
          }),
        16,
      ),
    ).rejects.toThrow()
  }
})

test('failed generation does not flush the remaining payload', async () => {
  let flushed = false
  await expect(
    captureSqlDeliveryBatches(
      async () => {
        flushed = true
      },
      async () => {
        await executeSqlText({ databaseId: 'db', name: 'current' }, 'SELECT 1;', {
          isLocal: false,
        })
        throw new Error('generation failed')
      },
    ),
  ).rejects.toThrow('generation failed')
  expect(flushed).toBe(false)
})

test('detached work cannot escape a closed capture scope', async () => {
  let release!: () => void
  const gate = new Promise<void>(resolve => {
    release = resolve
  })
  let late!: Promise<boolean>
  await withSqlDeliveryCapture(
    async () => {},
    async () => {
      late = gate.then(() =>
        captureSqlDeliveryBytes({ databaseId: 'db' }, new Uint8Array(), false),
      )
    },
  )
  release()
  await expect(late).rejects.toThrow('already stopped')
})
