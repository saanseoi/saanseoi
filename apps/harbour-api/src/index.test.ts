import { describe, expect, test } from 'bun:test'

import app from './index'

function createMockDb() {
  return {
    prepare(query: string) {
      return {
        bind() {
          return this
        },
        async first<T>() {
          if (query.includes('SELECT 1 AS ok')) {
            return { ok: 1 } as T
          }

          if (query.includes('COUNT(*) AS "count"')) {
            return { count: 0 } as T
          }

          return null as T
        },
      }
    },
  } as unknown as D1Database
}

function createDbBindings() {
  const db = createMockDb()

  return {
    DB_CURRENT: db,
    DB_HISTORY_HK_2025: db,
    DB_HISTORY_HK_2026: db,
    DB_META: db,
    DB_SOURCE_HK_2025: db,
    DB_SOURCE_HK_2026: db,
  }
}

function createMockBucket() {
  return {
    async head() {
      return null
    },
    async get() {
      return null
    },
    async put() {
      return null
    },
    async delete() {
      return undefined
    },
  } as unknown as R2Bucket
}

function createMockQueue() {
  return {
    async send() {
      return undefined
    },
  } as unknown as Queue
}

describe('harbour-api', () => {
  test('GET / redirects to the OpenAPI document', async () => {
    const res = await app.request('http://localhost/')

    expect(res.status).toBe(302)
    expect(res.headers.get('x-powered-by')).toBe('Hono')
    expect(res.headers.get('location')).toBe('/openapi')
  })

  test('GET /v1/meta/health checks DB access', async () => {
    const res = await app.fetch(new Request('http://localhost/v1/meta/health'), {
      ...createDbBindings(),
      DATASET_QUEUE: createMockQueue(),
      HARBOUR_API_KEY: 'test-api-key',
      R2_ACCOUNT_ID: 'test-account',
      R2_RAW: createMockBucket(),
      R2_RAW_ACCESS_KEY_ID: 'test-access-key',
      R2_RAW_BUCKET_NAME: 'ss-raw-preview',
      R2_RAW_SECRET_ACCESS_KEY: 'test-secret-key',
    })
    const body = (await res.json()) as {
      ok: boolean
      datasetCount: number
    }

    expect(res.status).toBe(200)
    expect(body).toEqual({
      ok: true,
      datasetCount: 0,
    })
  })

  test('GET /api/v1/meta/d1-placement-probe returns timings for all D1 bindings', async () => {
    const res = await app.fetch(
      new Request('http://localhost/api/v1/meta/d1-placement-probe?iterations=2'),
      {
        ...createDbBindings(),
        DATASET_QUEUE: createMockQueue(),
        HARBOUR_API_KEY: 'test-api-key',
        R2_ACCOUNT_ID: 'test-account',
        R2_RAW: createMockBucket(),
        R2_RAW_ACCESS_KEY_ID: 'test-access-key',
        R2_RAW_BUCKET_NAME: 'ss-raw-preview',
        R2_RAW_SECRET_ACCESS_KEY: 'test-secret-key',
        TELEGRAM_ADMIN_ID: '-1001234567890',
        TELEGRAM_BOT_TOKEN: 'telegram-token',
      },
    )
    const body = (await res.json()) as {
      bindings: Array<{ binding: string; timingsMs: number[] }>
      configuredPlacementRegion: string
      iterations: number
      ok: boolean
      totalQueries: number
      worker: string
    }

    expect(res.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.worker).toBe('harbour-api')
    expect(body.configuredPlacementRegion).toBe('azure:eastasia')
    expect(body.iterations).toBe(2)
    expect(body.totalQueries).toBe(12)
    expect(body.bindings).toHaveLength(6)
    expect(body.bindings.every(binding => binding.timingsMs.length === 2)).toBe(true)
  })

  test('POST /v1/signUpload requires an API key', async () => {
    const res = await app.fetch(
      new Request('http://localhost/v1/signUpload', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: '{}',
      }),
      {
        ...createDbBindings(),
        DATASET_QUEUE: createMockQueue(),
        HARBOUR_API_KEY: 'test-api-key',
        R2_ACCOUNT_ID: 'test-account',
        R2_RAW: createMockBucket(),
        R2_RAW_ACCESS_KEY_ID: 'test-access-key',
        R2_RAW_BUCKET_NAME: 'ss-raw-preview',
        R2_RAW_SECRET_ACCESS_KEY: 'test-secret-key',
      },
    )
    const body = (await res.json()) as {
      httpStatus: number
      error: string
      message: string
    }

    expect(res.status).toBe(401)
    expect(body).toEqual({
      error: 'unauthorized',
      message: 'Missing or invalid API key.',
      httpStatus: 401,
    })
  })
})
