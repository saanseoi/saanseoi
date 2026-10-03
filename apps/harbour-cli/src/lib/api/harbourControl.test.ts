import { afterEach, describe, expect, test } from 'bun:test'

import { createHarbourControlClient } from './harbourControl.ts'

const originalFetch = globalThis.fetch
const originalApiKey = process.env.HARBOUR_API_KEY
const originalCatalogDeferral = process.env.SAANSEOI_INIT_DEFER_DIVISIONS_CATALOG

afterEach(() => {
  globalThis.fetch = originalFetch
  if (originalCatalogDeferral == null) {
    delete process.env.SAANSEOI_INIT_DEFER_DIVISIONS_CATALOG
  } else {
    process.env.SAANSEOI_INIT_DEFER_DIVISIONS_CATALOG = originalCatalogDeferral
  }

  if (originalApiKey == null) {
    delete process.env.HARBOUR_API_KEY
  } else {
    process.env.HARBOUR_API_KEY = originalApiKey
  }
})

describe('harbour control client', () => {
  test.each(['1', '0', undefined])(
    'forwards initialiser catalogue deferral=%s without deferring release sets',
    async marker => {
      if (marker == null) delete process.env.SAANSEOI_INIT_DEFER_DIVISIONS_CATALOG
      else process.env.SAANSEOI_INIT_DEFER_DIVISIONS_CATALOG = marker
      process.env.HARBOUR_API_KEY = 'test-api-key'
      const requests: Record<string, unknown>[] = []
      globalThis.fetch = (async (_input, init) => {
        requests.push(JSON.parse(String(init?.body)))
        return Response.json({ status: 'current' })
      }) as typeof fetch
      const client = createHarbourControlClient({ environment: 'dev', remote: false })
      await client.publishDataset('release-id')
      expect(requests).toEqual([
        {
          resourceReleaseId: 'release-id',
          ...(marker === '1' ? { deferApiCatalogRevision: true } : {}),
        },
      ])
      await client.publishDataset('explicit-release', undefined, {
        deferApiCatalogRevision: true,
      })
      expect(requests[1]?.deferApiCatalogRevision).toBe(true)
    },
  )
  test('does not resend database lock responses', async () => {
    const calls: Array<{ body?: unknown; url: string }> = []

    process.env.HARBOUR_API_KEY = 'test-api-key'
    globalThis.fetch = (async (input, init) => {
      calls.push({
        body: init?.body,
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

    expect(calls).toHaveLength(1)
    expect(calls.map(call => call.url)).toEqual([
      'http://localhost:8788/v1/control/stageRunning',
    ])
  })

  test('does not resend failed network requests', async () => {
    const calls: Array<{ url: string }> = []

    process.env.HARBOUR_API_KEY = 'test-api-key'
    globalThis.fetch = (async (input: string | URL | Request) => {
      calls.push({
        url: String(input),
      })

      throw new Error('fetch failed')
    }) as unknown as typeof fetch

    const client = createHarbourControlClient({
      environment: 'dev',
      remote: false,
    })

    await expect(client.stageRunning('release-id', 'processDataset')).rejects.toThrow(
      'fetch failed',
    )
    expect(calls).toHaveLength(1)
  })

  test('retries a local stage update after Wrangler loses its proxy connection', async () => {
    let calls = 0

    process.env.HARBOUR_API_KEY = 'test-api-key'
    globalThis.fetch = (async () => {
      calls += 1
      return calls === 1
        ? Response.json({ error: 'Network connection lost.' }, { status: 500 })
        : Response.json({ status: 'running' })
    }) as unknown as typeof fetch

    const client = createHarbourControlClient({ environment: 'dev', remote: false })

    await expect(
      client.stageRunning('release-id', 'calculateApiReleaseSetStats'),
    ).resolves.toBeUndefined()
    expect(calls).toBe(2)
  })

  test.each([null, 'Network connection lost.'])(
    'retries local stage proxy failures with non-JSON body %s',
    async body => {
      let calls = 0
      process.env.HARBOUR_API_KEY = 'test-api-key'
      globalThis.fetch = (async () => {
        calls += 1
        return calls === 1
          ? new Response(body, { status: 500 })
          : Response.json({ status: 'running' })
      }) as unknown as typeof fetch
      const client = createHarbourControlClient({ environment: 'dev', remote: false })
      await expect(
        client.stageRunning('release-id', 'calculateApiReleaseSetStats'),
      ).resolves.toBeUndefined()
      expect(calls).toBe(2)
    },
  )

  test('caps local stage retries after repeated proxy connection loss', async () => {
    let calls = 0

    process.env.HARBOUR_API_KEY = 'test-api-key'
    globalThis.fetch = (async () => {
      calls += 1
      return Response.json({ error: 'Network connection lost.' }, { status: 500 })
    }) as unknown as typeof fetch

    const client = createHarbourControlClient({ environment: 'dev', remote: false })

    await expect(
      client.stageRunning('release-id', 'calculateApiReleaseSetStats'),
    ).rejects.toThrow('Network connection lost.')
    expect(calls).toBe(4)
  })

  test('retries one local publish after Wrangler reports a lost proxy connection', async () => {
    const calls: Array<{ body?: unknown; url: string }> = []

    process.env.HARBOUR_API_KEY = 'test-api-key'
    globalThis.fetch = (async (
      input: Parameters<typeof fetch>[0],
      init?: Parameters<typeof fetch>[1],
    ) => {
      calls.push({
        body: init?.body,
        url: String(input),
      })

      return calls.length === 1
        ? new Response(null, { status: 500 })
        : Response.json({ resourceReleaseId: 'release-id', status: 'current' })
    }) as unknown as typeof fetch

    const client = createHarbourControlClient({
      environment: 'dev',
      remote: false,
    })

    await expect(
      client.publishDataset('release-id', undefined, {
        deferStatsReleaseSet: true,
      }),
    ).resolves.toMatchObject({ resourceReleaseId: 'release-id', status: 'current' })

    expect(calls).toHaveLength(2)
    expect(calls.map(call => call.url)).toEqual([
      'http://localhost:8788/v1/control/publishDataset',
      'http://localhost:8788/v1/control/publishDataset',
    ])
  })

  test('retries a local source-deferred publish after proxy connection loss', async () => {
    let calls = 0

    process.env.HARBOUR_API_KEY = 'test-api-key'
    globalThis.fetch = (async () => {
      calls += 1
      return calls === 1
        ? Response.json({ error: 'Network connection lost.' }, { status: 500 })
        : Response.json({ resourceReleaseId: 'release-id', status: 'current' })
    }) as unknown as typeof fetch

    const client = createHarbourControlClient({ environment: 'dev', remote: false })

    await expect(
      client.publishDataset('release-id', undefined, {
        deferSourcePublish: true,
      }),
    ).resolves.toMatchObject({ resourceReleaseId: 'release-id', status: 'current' })
    expect(calls).toBe(2)
  })

  test('does not retry a remote publish after a proxy-shaped response', async () => {
    let calls = 0

    process.env.HARBOUR_API_KEY = 'test-api-key'
    globalThis.fetch = (async () => {
      calls += 1
      return Response.json({ error: 'Network connection lost.' }, { status: 500 })
    }) as unknown as typeof fetch

    const client = createHarbourControlClient({
      environment: 'preview',
      remote: true,
    })

    await expect(client.publishDataset('release-id')).rejects.toThrow(
      'Network connection lost.',
    )
    expect(calls).toBe(1)
  })

  test('does not retry a local release-set publication after proxy loss', async () => {
    let calls = 0

    process.env.HARBOUR_API_KEY = 'test-api-key'
    globalThis.fetch = (async () => {
      calls += 1
      return Response.json({ error: 'Network connection lost.' }, { status: 500 })
    }) as unknown as typeof fetch

    const client = createHarbourControlClient({
      environment: 'dev',
      remote: false,
    })

    await expect(client.publishDataset('release-id')).rejects.toThrow(
      'Network connection lost.',
    )
    expect(calls).toBe(1)
  })
})
