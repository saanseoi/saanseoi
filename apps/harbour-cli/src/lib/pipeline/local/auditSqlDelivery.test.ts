import { expect, test } from 'bun:test'
import {
  AUDIT_COMMIT_START,
  AUDIT_COMMIT_END,
} from '@repo/core/pipeline/db/processingActionSqlGroups'
import { executeSqlText } from './sqlImport'
import { captureSqlDeliveryBatches } from './sqlDeliveryBatchCapture'

const updates = Array.from({ length: 30 }, (_, index) => `UPDATE audit SET n=${index};`)
const commit = [AUDIT_COMMIT_START, ...updates, AUDIT_COMMIT_END].join('\n')

test('local D1 delivery preserves an audit commit larger than the normal batch', async () => {
  const batches: string[][] = []
  await executeSqlText(
    {
      name: 'meta',
      databaseId: null,
      binding: {
        prepare(sql: string) {
          return { sql, async run() {} }
        },
        async batch(statements) {
          batches.push(
            statements.map(statement => (statement as unknown as { sql: string }).sql),
          )
        },
      },
    },
    `SELECT 1;\n${commit}\nSELECT 2;`,
    { isLocal: true },
  )
  expect(batches).toEqual([['SELECT 1;'], updates, ['SELECT 2;']])
})

test('large SQL capture splits around the whole audit commit', async () => {
  const captured: string[] = []
  const sql = [
    ...Array.from({ length: 10 }, () => `SELECT '${'x'.repeat(150)}';`),
    commit,
  ].join('\n')
  await captureSqlDeliveryBatches(
    async (_target, bytes) => {
      captured.push(new TextDecoder().decode(bytes))
    },
    async () => {
      await executeSqlText({ name: 'meta', databaseId: 'isolated' }, sql, {
        isLocal: false,
      })
    },
    1000,
  )
  expect(captured.length).toBeGreaterThan(1)
  expect(captured.filter(part => part.includes(AUDIT_COMMIT_START))).toHaveLength(1)
  expect(captured.find(part => part.includes(AUDIT_COMMIT_START))).toContain(commit)
  expect(captured.every(part => new TextEncoder().encode(part).length <= 1000)).toBe(
    true,
  )
})

test('audit replay refuses a nontransactional adapter before any writes', async () => {
  let writes = 0
  await expect(
    executeSqlText(
      {
        name: 'meta',
        databaseId: null,
        binding: {
          prepare() {
            return {
              async run() {
                writes++
              },
            }
          },
        },
      },
      commit,
      { isLocal: true },
    ),
  ).rejects.toThrow('transactional')
  expect(writes).toBe(0)
})
