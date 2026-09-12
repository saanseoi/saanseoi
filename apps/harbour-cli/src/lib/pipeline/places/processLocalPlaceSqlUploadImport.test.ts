import { afterEach, expect, spyOn, test } from 'bun:test'
import { createHash } from 'node:crypto'
import {
  chunkStatements,
  importPlaceSqlChunks,
} from './processLocalPlaceSqlUploadImport.ts'
import { MAX_SQL_BYTES } from './processLocalPlaceSqlUploadConfig.ts'

afterEach(() => {
  globalThis.fetch = originalFetch
})
const originalFetch = globalThis.fetch

test('remote Places combines small chunks and preserves database and statement order', async () => {
  const uploads: string[] = []
  const databases: string[] = []
  let etag = ''
  spyOn(globalThis, 'fetch').mockImplementation(
    Object.assign(
      async (_input: string | URL | Request, init?: RequestInit) => {
        if (init?.method === 'PUT') {
          const sql = new TextDecoder().decode(init.body as Uint8Array)
          uploads.push(sql)
          return new Response(null, {
            headers: { ETag: createHash('md5').update(sql).digest('hex') },
          })
        }
        const body = JSON.parse(init?.body as string)
        if (body.action === 'init') {
          databases.push(String(_input).split('/database/')[1]?.split('/')[0] ?? '')
          etag = body.etag
          return Response.json({
            success: true,
            result: { filename: etag, upload_url: 'https://upload.example/sql' },
          })
        }
        expect(body.action).toBe('ingest')
        expect(body.etag).toBe(etag)
        return Response.json({
          success: true,
          result: { success: true, status: 'complete' },
        })
      },
      { preconnect: originalFetch.preconnect },
    ),
  )
  const statements = Array.from(
    { length: 8 },
    (_, i) => `INSERT INTO t VALUES (${i}, '${'香港'.repeat(5000)}');`,
  )
  expect([...chunkStatements(statements)].length).toBeGreaterThan(1)
  const target = (name: 'source' | 'history' | 'current') => ({
    name,
    databaseId: name,
  })
  const targets = {
    sourceByBinding: new Map([['source', target('source')]]),
    historyByBinding: new Map([['history', target('history')]]),
    history: target('history'),
    current: target('current'),
  } as Parameters<typeof importPlaceSqlChunks>[0]
  const progress: number[][] = []
  await importPlaceSqlChunks(
    targets,
    {
      sourceSqlByBinding: new Map([['source', statements]]),
      historySqlByBinding: new Map([['history', ['SELECT 2;']]]),
      currentSql: ['SELECT 3;'],
      changes: ['SELECT 4;'],
    } as Parameters<typeof importPlaceSqlChunks>[1],
    {
      isLocal: false,
      accountId: 'account',
      apiToken: 'token',
      pollIntervalMs: 0,
    },
    (completed, total) => progress.push([completed, total]),
  )
  expect(databases).toEqual(['source', 'history', 'current', 'history'])
  expect(uploads).toEqual([statements.join(''), 'SELECT 2;', 'SELECT 3;', 'SELECT 4;'])
  expect(progress.at(-1)).toEqual([4, 4])
})

test('batching counts UTF-8 bytes and permits exact boundaries', () => {
  const statement = "SELECT '香港; O''Brien';"
  const limit = Buffer.byteLength(statement) * 2
  expect([...chunkStatements([statement, statement, statement], limit)]).toEqual([
    statement + statement,
    statement,
  ])
  expect([...chunkStatements([], limit)]).toEqual([])
})

test('a large upload limit cannot admit an oversized individual statement', () => {
  expect(() => [
    ...chunkStatements(['x'.repeat(MAX_SQL_BYTES + 1)], 16 * 1024 * 1024),
  ]).toThrow('statement or batch byte limit')
  expect(() => [...chunkStatements(['SELECT 1;'], 0)]).toThrow('positive safe integer')
})
