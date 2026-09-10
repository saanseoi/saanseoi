import { describe, expect, test } from 'bun:test'

import { createCloudflareD1QueryClient } from './remoteD1Client.ts'

describe('remote D1 query client', () => {
  test('retries D1 internal errors on read-only SELECT requests', async () => {
    let calls = 0
    const client = createCloudflareD1QueryClient({
      accountId: 'account-id',
      apiToken: 'token',
      databaseId: 'database-id',
      retryDelayMs: 0,
      fetch: async () => {
        calls += 1
        return Response.json(
          calls === 1
            ? {
                success: false,
                errors: [{ message: 'internal error; reference = test' }],
              }
            : { success: true, result: [{ success: true, results: [{ id: 1 }] }] },
        )
      },
    })
    await expect(client.query('SELECT id FROM divisions')).resolves.toEqual([{ id: 1 }])
    expect(calls).toBe(2)
  })

  test('uses one direct API request and returns object rows', async () => {
    let request: Request | undefined
    const client = createCloudflareD1QueryClient({
      accountId: 'account-id',
      apiToken: 'token',
      databaseId: 'database-id',
      retryLimit: 0,
      fetch: async (input, init) => {
        request =
          input instanceof Request
            ? new Request(input, init)
            : new Request(input.toString(), init)
        return new Response(
          JSON.stringify({
            result: [
              {
                meta: { duration: 1 },
                results: [{ id: 'one' }],
                success: true,
              },
            ],
            success: true,
          }),
          { headers: { 'Content-Type': 'application/json' } },
        )
      },
    })

    await expect(client.query('SELECT id FROM divisions')).resolves.toEqual([
      { id: 'one' },
    ])
    expect(request?.method).toBe('POST')
    expect(request?.url).toBe(
      'https://api.cloudflare.com/client/v4/accounts/account-id/d1/database/database-id/query',
    )
    await expect(request?.json()).resolves.toEqual({
      sql: 'SELECT id FROM divisions',
    })
  })

  test('does not retry a non-retryable SQL error', async () => {
    let calls = 0
    const client = createCloudflareD1QueryClient({
      accountId: 'account-id',
      apiToken: 'token',
      databaseId: 'database-id',
      fetch: async () => {
        calls += 1
        return new Response(
          JSON.stringify({
            errors: [{ message: 'no such table' }],
            success: false,
          }),
          { status: 400, headers: { 'Content-Type': 'application/json' } },
        )
      },
    })

    await expect(client.query('SELECT * FROM missing')).rejects.toThrow('no such table')
    expect(calls).toBe(1)
  })
})
