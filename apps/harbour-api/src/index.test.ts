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
        async all<T>() {
          if (query.includes('FROM releases r')) {
            if (query.includes('d.type')) {
              throw new Error('Dataset type is no longer stored on datasets.')
            }

            return {
              results: [
                {
                  id: 'release-id',
                  datasetId: 'dataset-id',
                  datasetCode: 'hk-streets',
                  regionCode: 'hk',
                  theme: 'transport',
                  type: 'street',
                  source: 'hkgov-hyd',
                  code: 'rel-hk-streets-2026-07',
                  sourceVersion: '2026-07',
                  sourceSchemaVersion: null,
                  cohortKey: null,
                  publicationDate: null,
                  status: 'published',
                  notes: null,
                  createdAt: '2026-07-24T00:00:00.000Z',
                  updatedAt: '2026-07-24T00:00:00.000Z',
                } as T,
              ],
            }
          }

          return { results: [] as T[] }
        },
      }
    },
  } as unknown as D1Database
}

function createDbBindings() {
  const db = createMockDb()

  return {
    DB_CURRENT: db,
    DB_HISTORY_HK_BEFORE: db,
    DB_HISTORY_HK_2025: db,
    DB_HISTORY_HK_2026: db,
    DB_META: db,
    DB_SOURCE_HK_BEFORE: db,
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

  test('GET /openapi documents control selectors as required releaseId or releaseCode', async () => {
    const res = await app.request('http://localhost/openapi')
    const document = (await res.json()) as {
      components: {
        schemas: Record<string, { anyOf?: unknown; required?: string[] }>
      }
    }
    const controlStageSchema = document.components.schemas.HarbourControlStageRequest
    const publishDatasetSchema =
      document.components.schemas.HarbourPublishDatasetRequest

    expect(res.status).toBe(200)
    if (!controlStageSchema || !publishDatasetSchema) {
      throw new Error('Missing control request schemas in OpenAPI document')
    }
    expect(controlStageSchema.anyOf).toEqual([
      { required: ['releaseId'] },
      { required: ['releaseCode'] },
    ])
    expect(controlStageSchema.required).toContain('phase')
    expect(publishDatasetSchema.anyOf).toEqual([
      { required: ['releaseId'] },
      { required: ['releaseCode'] },
    ])
  })

  test('GET /v1/meta/health checks DB access', async () => {
    const res = await app.fetch(new Request('http://localhost/v1/meta/health'), {
      ...createDbBindings(),
      DATA_SHARD_ENV: 'preview',
      DATASET_QUEUE: createMockQueue(),
      HARBOUR_API_KEY: 'test-api-key',
      R2_ASSETS: createMockBucket(),
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

  test('GET /api/v1/meta/docs/releases reads the resource type from the release', async () => {
    const res = await app.fetch(
      new Request('http://localhost/api/v1/meta/docs/releases', {
        headers: { 'x-api-key': 'test-api-key' },
      }),
      {
        ...createDbBindings(),
        DATA_SHARD_ENV: 'preview',
        DATASET_QUEUE: createMockQueue(),
        D1_PLACEMENT_PROBE_API_KEY: 'test-probe-api-key',
        HARBOUR_API_KEY: 'test-api-key',
        R2_ASSETS: createMockBucket(),
      },
    )
    const body = (await res.json()) as { rows: Array<{ type: string }> }

    expect(res.status).toBe(200)
    expect(body.rows).toEqual([expect.objectContaining({ type: 'street' })])
  })

  test('GET /api/v1/meta/d1-placement-probe returns timings for all D1 bindings', async () => {
    const res = await app.fetch(
      new Request('http://localhost/api/v1/meta/d1-placement-probe?iterations=2', {
        headers: {
          'x-api-key': 'test-probe-api-key',
        },
      }),
      {
        ...createDbBindings(),
        DATA_SHARD_ENV: 'preview',
        DATASET_QUEUE: createMockQueue(),
        D1_PLACEMENT_PROBE_API_KEY: 'test-probe-api-key',
        HARBOUR_API_KEY: 'test-api-key',
        R2_ASSETS: createMockBucket(),
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
    expect(body.totalQueries).toBe(16)
    expect(body.bindings).toHaveLength(8)
    expect(body.bindings.every(binding => binding.timingsMs.length === 2)).toBe(true)
  })

  test('GET /api/v1/meta/d1-placement-probe requires the probe API key', async () => {
    const res = await app.fetch(
      new Request('http://localhost/api/v1/meta/d1-placement-probe?iterations=2'),
      {
        ...createDbBindings(),
        DATA_SHARD_ENV: 'preview',
        DATASET_QUEUE: createMockQueue(),
        D1_PLACEMENT_PROBE_API_KEY: 'test-probe-api-key',
        HARBOUR_API_KEY: 'test-api-key',
        R2_ASSETS: createMockBucket(),
        TELEGRAM_ADMIN_ID: '-1001234567890',
        TELEGRAM_BOT_TOKEN: 'telegram-token',
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

  test('POST /v1/registerUpload requires an API key', async () => {
    const res = await app.fetch(
      new Request('http://localhost/v1/registerUpload', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: '{}',
      }),
      {
        ...createDbBindings(),
        DATA_SHARD_ENV: 'preview',
        DATASET_QUEUE: createMockQueue(),
        D1_PLACEMENT_PROBE_API_KEY: 'test-probe-api-key',
        HARBOUR_API_KEY: 'test-api-key',
        R2_ASSETS: createMockBucket(),
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
