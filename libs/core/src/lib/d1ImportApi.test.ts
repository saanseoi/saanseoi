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

  test('does not poll when ingest completes without a bookmark', async () => {
    const requests: Array<unknown> = []
    const fetchImpl: D1ImportFetch = async (input, init) => {
      const url = String(input)
      const body =
        typeof init?.body === 'string' && url !== 'https://upload.example/import.sql'
          ? JSON.parse(init.body)
          : undefined

      requests.push(body)

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
            status: 'complete',
            success: true,
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

    expect(result.poll.status).toBe('complete')
    expect(requests).toEqual([
      { action: 'init', etag: 'abc123' },
      undefined,
      { action: 'ingest', etag: 'abc123', filename: 'import.sql' },
    ])
  })

  test('skips upload and ingest when init already returns an import bookmark', async () => {
    const requests: Array<{
      body?: unknown
      method?: string
      url: string
    }> = []
    const fetchImpl: D1ImportFetch = async (input, init) => {
      const url = String(input)
      const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined

      requests.push({
        body,
        method: init?.method,
        url,
      })

      if (body?.action === 'init') {
        return Response.json({
          success: true,
          result: {
            at_bookmark: 'bookmark-1',
            messages: ['already uploaded'],
            status: 'active',
            success: false,
          },
        })
      }

      if (body?.action === 'poll') {
        return Response.json({
          success: true,
          result: {
            at_bookmark: 'bookmark-1',
            status: 'complete',
            success: true,
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
      pollIntervalMs: 0,
      sql: 'SELECT 1;',
    })

    expect(result.filename).toBeNull()
    expect(result.uploadedEtag).toBeNull()
    expect(result.poll.success).toBe(true)
    expect(requests.map(request => request.body)).toEqual([
      { action: 'init', etag: 'abc123' },
      { action: 'poll', current_bookmark: 'bookmark-1' },
    ])
  })

  test('accepts completed init responses without an upload URL or bookmark', async () => {
    const requests: Array<unknown> = []
    const fetchImpl: D1ImportFetch = async (_input, init) => {
      const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined

      requests.push(body)

      return Response.json({
        success: true,
        result: {
          messages: ['already complete'],
          status: 'complete',
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

    const result = await client.importSql({
      etag: 'abc123',
      sql: 'SELECT 1;',
    })

    expect(result.filename).toBeNull()
    expect(result.uploadedEtag).toBeNull()
    expect(result.poll.status).toBe('complete')
    expect(requests).toEqual([{ action: 'init', etag: 'abc123' }])
  })

  test('reuses the previous bookmark when poll omits a replacement bookmark', async () => {
    const requests: Array<unknown> = []
    const fetchImpl: D1ImportFetch = async (_input, init) => {
      const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined

      requests.push(body)

      if (body?.action === 'init') {
        return Response.json({
          success: true,
          result: {
            at_bookmark: 'bookmark-1',
            status: 'active',
            success: false,
          },
        })
      }

      return Response.json({
        success: true,
        result: {
          status: 'complete',
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

    const result = await client.importSql({
      etag: 'abc123',
      pollIntervalMs: 0,
      sql: 'SELECT 1;',
    })

    expect(result.poll.success).toBe(true)
    expect(requests).toEqual([
      { action: 'init', etag: 'abc123' },
      { action: 'poll', current_bookmark: 'bookmark-1' },
    ])
  })

  test('retries init while D1 reports another long-running import is active', async () => {
    const requests: Array<unknown> = []
    let initAttempts = 0
    const fetchImpl: D1ImportFetch = async (input, init) => {
      const url = String(input)
      const body =
        typeof init?.body === 'string' && url !== 'https://upload.example/import.sql'
          ? JSON.parse(init.body)
          : undefined

      requests.push(body)

      if (body?.action === 'init') {
        initAttempts += 1

        if (initAttempts === 1) {
          return Response.json({
            success: true,
            result: {
              error:
                'Currently processing a long-running import. Cannot start another import until that completes or times out.',
              success: false,
            },
          })
        }

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
            status: 'complete',
            success: true,
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
      pollIntervalMs: 0,
      sql: 'SELECT 1;',
    })

    expect(result.uploadedEtag).toBe('abc123')
    expect(result.poll.success).toBe(true)
    expect(requests).toEqual([
      { action: 'init', etag: 'abc123' },
      { action: 'init', etag: 'abc123' },
      undefined,
      { action: 'ingest', etag: 'abc123', filename: 'import.sql' },
      { action: 'poll', current_bookmark: 'bookmark-1' },
    ])
  })

  test('restarts the import when D1 resets storage before returning a bookmark', async () => {
    const requests: Array<unknown> = []
    let ingestAttempts = 0
    const fetchImpl: D1ImportFetch = async (input, init) => {
      const url = String(input)
      const body =
        typeof init?.body === 'string' && url !== 'https://upload.example/import.sql'
          ? JSON.parse(init.body)
          : undefined

      requests.push(body)

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
        ingestAttempts += 1

        if (ingestAttempts === 1) {
          return Response.json({
            success: true,
            result: {
              error:
                'D1 DB storage operation exceeded timeout which caused object to be reset.',
              messages: [],
              status: null,
              success: false,
            },
          })
        }

        return Response.json({
          success: true,
          result: {
            at_bookmark: 'bookmark-1',
            success: false,
          },
        })
      }

      if (body?.action === 'poll') {
        return Response.json({
          success: true,
          result: {
            status: 'complete',
            success: true,
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
      pollIntervalMs: 0,
      sql: 'SELECT 1;',
    })

    expect(result.uploadedEtag).toBe('abc123')
    expect(result.poll.success).toBe(true)
    expect(requests).toEqual([
      { action: 'init', etag: 'abc123' },
      undefined,
      { action: 'ingest', etag: 'abc123', filename: 'import.sql' },
      { action: 'init', etag: 'abc123' },
      undefined,
      { action: 'ingest', etag: 'abc123', filename: 'import.sql' },
      { action: 'poll', current_bookmark: 'bookmark-1' },
    ])
  })
})
