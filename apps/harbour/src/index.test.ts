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

function createMockBucket() {
  return {
    async head() {
      return null
    },
    async put() {
      return null
    },
    async delete() {},
  } as unknown as R2Bucket
}

describe('harbour', () => {
  test('GET / returns harbour metadata', async () => {
    const res = await app.request('http://localhost/')
    const body = (await res.json()) as {
      service: string
      version: number
      routes: string[]
    }

    expect(res.status).toBe(200)
    expect(res.headers.get('x-powered-by')).toBe('Hono')
    expect(body).toEqual({
      service: 'harbour',
      version: 1,
      routes: ['/v1/meta/health', '/v1/uploads'],
    })
  })

  test('GET /v1/meta/health checks DB access', async () => {
    const res = await app.fetch(new Request('http://localhost/v1/meta/health'), {
      DB: createMockDb(),
      R2_RAW: createMockBucket(),
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
})
