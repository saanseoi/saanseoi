import { afterEach, describe, expect, test } from 'bun:test'

import { createHarbourControlClient } from './harbourControl.ts'

const originalFetch = globalThis.fetch
const originalApiKey = process.env.HARBOUR_API_KEY

afterEach(() => {
  globalThis.fetch = originalFetch

  if (originalApiKey == null) {
    delete process.env.HARBOUR_API_KEY
  } else {
    process.env.HARBOUR_API_KEY = originalApiKey
  }
})

describe('harbour control client', () => {
  test('retries database lock responses with backoff', async () => {
    const calls: Array<{ body?: unknown; url: string }> = []
    const retries: Array<{ attempt: number; delayMs: number; path: string }> = []

    process.env.HARBOUR_API_KEY = 'test-api-key'
    globalThis.fetch = (async (input, init) => {
      calls.push({
        body: init?.body,
        url: String(input),
      })

      if (calls.length === 1) {
        return Response.json({ message: 'database is locked' }, { status: 500 })
      }

      return Response.json({ ok: true })
    }) as typeof fetch

    const client = createHarbourControlClient(
      {
        environment: 'dev',
        remote: false,
      },
      {
        onRetry(event) {
          retries.push({
            attempt: event.attempt,
            delayMs: event.delayMs,
            path: event.path,
          })
        },
      },
    )

    await client.stageRunning('release-id', 'processDataset')

    expect(calls).toHaveLength(2)
    expect(calls.map(call => call.url)).toEqual([
      'http://localhost:8788/v1/control/stageRunning',
      'http://localhost:8788/v1/control/stageRunning',
    ])
    expect(retries).toEqual([
      {
        attempt: 1,
        delayMs: 150,
        path: '/v1/control/stageRunning',
      },
    ])
  })

  test('stops retrying database lock responses after three retries', async () => {
    const calls: Array<{ url: string }> = []

    process.env.HARBOUR_API_KEY = 'test-api-key'
    globalThis.fetch = (async input => {
      calls.push({
        url: String(input),
      })

      return Response.json({ message: 'database is locked' }, { status: 500 })
    }) as typeof fetch

    const client = createHarbourControlClient({
      environment: 'dev',
      remote: false,
    })

    await expect(client.stageRunning('release-id', 'processDataset')).rejects.toThrow(
      'database is locked',
    )
    expect(calls).toHaveLength(4)
  })
})
