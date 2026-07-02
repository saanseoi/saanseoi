import { describe, expect, test } from 'bun:test'

import { createD1ImportClient, type D1ImportFetch } from './d1ImportApi'

describe('createD1ImportClient', () => {
  test('runs init, upload, ingest, and poll with the expected payloads', async () => {
    const requests: Array<{
      body?: unknown
      method?: string
      url: string
    }> = []
    const fetchImpl: D1ImportFetch = async (input, init) => {
      const url = String(input)
      const body =
        typeof init?.body === 'string' && url !== 'https://upload.example/import.sql'
          ? JSON.parse(init.body)
          : undefined
      requests.push({
        body,
        method: init?.method,
        url,
      })

      if (body?.action === 'init') {
        return Response.json({
          success: true,
          result: {
            filename: 'import.sql',
            upload_url: 'https://upload.example/import.sql',
          },
        })
      }

      if (url === 'https://upload.example/import.sql') {
        return new Response(null, {
          headers: {
            ETag: '"abc123"',
          },
        })
      }

      if (body?.action === 'ingest') {
        return Response.json({
          success: true,
          result: {
            at_bookmark: 'bookmark-1',
          },
        })
      }

      if (body?.action === 'poll') {
        return Response.json({
          success: true,
          result: {
            success: true,
            status: 'complete',
          },
        })
      }

      return Response.json({ success: false, errors: [{ message: 'unexpected' }] })
    }

    const client = createD1ImportClient({
      accountId: 'account',
      apiToken: 'token',
      databaseId: 'database',
      fetch: fetchImpl,
    })

    const result = await client.importSql({
      etag: 'abc123',
      sql: 'SELECT 1;',
    })

    expect(result.filename).toBe('import.sql')
    expect(result.uploadedEtag).toBe('abc123')
    expect(result.poll.success).toBe(true)
    expect(requests.map(request => request.body)).toEqual([
      { action: 'init', etag: 'abc123' },
      undefined,
      { action: 'ingest', etag: 'abc123', filename: 'import.sql' },
      { action: 'poll', current_bookmark: 'bookmark-1' },
    ])
  })

  test('rejects mismatched upload ETags', async () => {
    const fetchImpl: D1ImportFetch = async (input, init) => {
      const url = String(input)
      const body =
        typeof init?.body === 'string' && url !== 'https://upload.example/import.sql'
          ? JSON.parse(init.body)
          : undefined

      if (body?.action === 'init') {
        return Response.json({
          success: true,
          result: {
            filename: 'import.sql',
            upload_url: 'https://upload.example/import.sql',
          },
        })
      }

      if (url === 'https://upload.example/import.sql') {
        return new Response(null, {
          headers: {
            ETag: '"different"',
          },
        })
      }

      return Response.json({
        success: true,
        result: {
          success: true,
        },
      })
    }

    const client = createD1ImportClient({
      accountId: 'account',
      apiToken: 'token',
      databaseId: 'database',
      fetch: fetchImpl,
    })

    await expect(
      client.importSql({
        etag: 'abc123',
        sql: 'SELECT 1;',
      }),
    ).rejects.toThrow('ETag mismatch')
  })
})
