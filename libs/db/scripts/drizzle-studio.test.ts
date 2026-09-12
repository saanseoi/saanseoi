import { expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { runInNewContext } from 'node:vm'

// Exercise the installed dependency so upgrades also verify that the patch applies.
const cli = readFileSync(
  resolve(import.meta.dir, '../../../node_modules/drizzle-kit/bin.cjs'),
  'utf8',
)
const start = cli.indexOf('const remoteCallback = async (sql, params, method) => {')
const end = cli.indexOf('const remoteBatchCallback', start)
const callback = cli.slice(start, end)
const count = (table: string) =>
  `SELECT 'public' AS "schema", '${table}' AS "table", COUNT(*) as "count" FROM "${table}"`

function setup(raw: boolean, fail = false) {
  const requests: { sql: string; params: unknown[]; url: string }[] = []
  const query = runInNewContext(`${callback}; remoteCallback`, {
    credentials: { accountId: 'test', databaseId: 'test', token: 'test' },
    QueryError: Error,
    fetch$1: async (url: string, options: { body: string }) => {
      const request = JSON.parse(options.body)
      requests.push({ ...request, url })
      if (request.sql.includes(' UNION ALL ') || fail) {
        return {
          json: async () => ({
            success: false,
            errors: [
              {
                code: 7500,
                message: fail ? 'no such table' : 'too many terms in compound SELECT',
              },
            ],
          }),
        }
      }
      const table = request.sql.match(/FROM "([^"]+)"/)?.[1]
      const rows = raw
        ? [['public', table, 42]]
        : [{ schema: 'public', table, count: 42 }]
      return {
        json: async () => ({
          success: true,
          result: [
            { results: raw ? { columns: ['schema', 'table', 'count'], rows } : rows },
          ],
        }),
      }
    },
  }) as (sql: string, params: unknown[], method: string) => Promise<{ rows: unknown[] }>
  return { query, requests }
}

for (const raw of [false, true]) {
  test(`Studio counts preserve ordered ${raw ? 'array' : 'object'} rows without compound queries`, async () => {
    const { query, requests } = setup(raw)
    const tables = ['overturePlaces', 'hkgovAlsAddresses2d', 'stagingAddresses2d']
    const result = await query(
      tables.map(count).join(' UNION ALL '),
      [],
      raw ? 'values' : 'all',
    )
    expect(result.rows).toEqual(
      tables.map(table =>
        raw ? ['public', table, 42] : { schema: 'public', table, count: 42 },
      ),
    )
    expect(requests.map(request => request.sql)).toEqual(tables.map(count))
    expect(
      requests.every(request => request.url.endsWith(raw ? '/raw' : '/query')),
    ).toBe(true)
  })
}

test('unrelated and parameterised compound queries remain untouched', async () => {
  for (const sql of [
    'SELECT 1 UNION ALL SELECT 2',
    [count('a'), count('b')].join(' UNION ALL '),
  ]) {
    const { query, requests } = setup(false)
    await expect(query(sql, [1], 'all')).rejects.toThrow('too many terms')
    expect(requests).toHaveLength(1)
    expect(requests[0]?.sql).toBe(sql)
    expect(requests[0]?.params).toEqual([1])
  }
})

test('missing tables remain visible as errors', async () => {
  const { query, requests } = setup(false, true)
  await expect(
    query([count('missing'), count('b')].join(' UNION ALL '), [], 'all'),
  ).rejects.toThrow('no such table')
  expect(requests).toHaveLength(1)
})
