import { describe, expect, test } from 'bun:test'

import { GET } from './+server'

function createMockDb() {
  return {
    prepare() {
      return {
        async first<T>() {
          return { ok: 1 } as T
        },
      }
    },
  } as unknown as D1Database
}

describe('atlas-app d1 placement probe', () => {
  test('GET returns per-binding timings for all D1 databases', async () => {
    const db = createMockDb()
    const response = await GET({
      platform: {
        caches: {} as CacheStorage,
        cf: {
          colo: 'HKG',
          country: 'HK',
          timezone: 'Asia/Hong_Kong',
        },
        ctx: {
          exports: {},
          passThroughOnException() {},
          props: {},
          waitUntil() {},
        } as unknown as ExecutionContext,
        env: {
          ASSETS: {} as Fetcher,
          BETTER_AUTH_SECRET: 'secret',
          DB_CURRENT: db,
          DB_HISTORY_HK_2025: db,
          DB_HISTORY_HK_2026: db,
          DB_META: db,
          DB_SOURCE_HK_2025: db,
          DB_SOURCE_HK_2026: db,
          PUBLIC_ATLAS_API_BASE_URL: 'https://api.saanseoi.hk',
        },
      },
      url: new URL('https://saanseoi.hk/api/d1-placement-probe?iterations=2'),
    } as Parameters<typeof GET>[0])

    const body = (await response.json()) as {
      bindings: Array<{ binding: string; timingsMs: number[] }>
      configuredPlacementRegion: string
      iterations: number
      ok: boolean
      request: {
        colo: string | null
        host: string
      }
      totalQueries: number
      worker: string
    }

    expect(response.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.worker).toBe('atlas-app')
    expect(body.configuredPlacementRegion).toBe('azure:eastasia')
    expect(body.iterations).toBe(2)
    expect(body.totalQueries).toBe(12)
    expect(body.request).toMatchObject({
      colo: 'HKG',
      host: 'saanseoi.hk',
    })
    expect(body.bindings).toHaveLength(6)
    expect(body.bindings.every(binding => binding.timingsMs.length === 2)).toBe(true)
  })

  test('GET rejects invalid iteration counts', async () => {
    const response = await GET({
      platform: {
        caches: {} as CacheStorage,
        ctx: {
          exports: {},
          passThroughOnException() {},
          props: {},
          waitUntil() {},
        } as unknown as ExecutionContext,
        env: {
          ASSETS: {} as Fetcher,
          BETTER_AUTH_SECRET: 'secret',
          DB_CURRENT: createMockDb(),
          DB_HISTORY_HK_2025: createMockDb(),
          DB_HISTORY_HK_2026: createMockDb(),
          DB_META: createMockDb(),
          DB_SOURCE_HK_2025: createMockDb(),
          DB_SOURCE_HK_2026: createMockDb(),
          PUBLIC_ATLAS_API_BASE_URL: 'https://api.saanseoi.hk',
        },
      },
      url: new URL('https://saanseoi.hk/api/d1-placement-probe?iterations=0'),
    } as Parameters<typeof GET>[0])

    expect(response.status).toBe(400)
  })
})
