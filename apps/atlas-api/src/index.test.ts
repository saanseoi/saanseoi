import { describe, expect, test } from 'bun:test'

import app from './index'
import type { AppBindings } from './types'

type MockDbOptions = {
  asset?: { assetKey: string } | null
  apiKey?: {
    id?: string
    revokedAt?: number | null
    requestsPerMinute?: number | null
    userRole?: 'user' | 'admin'
  } | null
  usageRequestCount?: number
  failOnAll?: (query: string, values: unknown[]) => boolean
  failOnFirst?: (query: string, values: unknown[]) => boolean
  failOnRaw?: (query: string, values: unknown[]) => boolean
  failOnRun?: (query: string, values: unknown[]) => boolean
  streetDetail?: boolean
}

function createMockDb(options: MockDbOptions = {}) {
  const operations: Array<{ query: string; values: unknown[] }> = []

  return {
    db: {
      prepare(query: string) {
        return {
          values: [] as unknown[],
          bind(...values: unknown[]) {
            this.values = values
            return this
          },
          async first<T>() {
            if (options.failOnFirst?.(query, this.values)) {
              const error = new Error('Failed query: transient read failure')
              error.cause = new Error(
                'D1_ERROR: Failed to parse body as JSON, got: Error: internal error; reference = abc123',
              )
              throw error
            }

            if (query.includes('SELECT 1 AS ok')) {
              return { ok: 1 } as T
            }

            if (query.includes('COUNT(*) AS "count"')) {
              return { count: 0 } as T
            }

            if (query.includes('FROM api_key')) {
              if (options.apiKey === null) return null as T

              return {
                id: options.apiKey?.id ?? 'api-key-1',
                name: 'Test key',
                userId: 'user-1',
                userEmail: 'test@example.com',
                userRole: options.apiKey?.userRole ?? 'user',
                revokedAt: options.apiKey?.revokedAt ?? null,
                requestsPerMinute: options.apiKey?.requestsPerMinute ?? null,
                requestsPerDay: null,
                requestsPerMonth: null,
              } as T
            }

            if (query.includes('INSERT INTO api_key_usage')) {
              return {
                requestCount: options.usageRequestCount ?? 1,
                softLimitNotifiedAt: options.usageRequestCount ? Date.now() : null,
              } as T
            }

            if (options.asset !== undefined) {
              return options.asset as T
            }

            return null as T
          },
          async run() {
            operations.push({
              query,
              values: this.values,
            })

            if (options.failOnRun?.(query, this.values)) {
              throw new Error('Mock DB write failed')
            }

            return {
              success: true,
              meta: { changes: 1 },
            }
          },
          async all<T>() {
            if (options.failOnAll?.(query, this.values)) {
              const error = new Error('Failed query: transient read failure')
              error.cause = new Error('SQLITE_BUSY: database is locked')
              throw error
            }

            if (options.asset !== undefined) {
              return { results: [options.asset] as T[], success: true }
            }

            return {
              results: [] as T[],
              success: true,
            }
          },
          async raw<T>() {
            if (options.failOnRaw?.(query, this.values)) {
              const error = new Error('Failed query: transient read failure')
              error.cause = new Error('SQLITE_BUSY: database is locked')
              throw error
            }

            if (options.asset) return [[options.asset.assetKey] as T]

            if (options.streetDetail) return streetRows(query) as T[][]

            return [] as T[]
          },
        }
      },
    } as unknown as D1Database,
    operations,
  }
}

function streetRows(query: string): unknown[][] {
  const assetLinks = JSON.stringify([
    {
      assetId: '00000000-0000-4000-8000-000000000002',
      assetUrl:
        'https://preview.api.saanseoi.hk/v0/assets/00000000-0000-4000-8000-000000000002',
      contentHash: 'notice-hash',
      label: 'G.N.4034',
      manifest: {
        assetId: '00000000-0000-4000-8000-000000000012',
        assetUrl:
          'https://preview.api.saanseoi.hk/v0/assets/00000000-0000-4000-8000-000000000012',
        contentHash: 'manifest-hash',
        objectKey: 'manifest.json',
      },
      mediaType: 'application/pdf',
      objectKey: 'government-notice.pdf',
      originalUrl:
        'https://www.landsd.gov.hk/doc/en/street-name/egazette/2026/egn202630274034.pdf',
      publisherIdentifier: 'G.N. 4034',
      retrievedAt: '2026-07-03T00:00:00.000Z',
      role: 'governmentNotice',
    },
    {
      assetId: '00000000-0000-4000-8000-000000000003',
      assetUrl:
        'https://preview.api.saanseoi.hk/v0/assets/00000000-0000-4000-8000-000000000003',
      contentHash: 'plan-hash',
      label: 'HKRM52',
      manifest: {
        assetId: '00000000-0000-4000-8000-000000000013',
        assetUrl:
          'https://preview.api.saanseoi.hk/v0/assets/00000000-0000-4000-8000-000000000013',
        contentHash: 'plan-manifest-hash',
        objectKey: 'plan-manifest.json',
      },
      mediaType: 'application/pdf',
      objectKey: 'gazette-plan.pdf',
      originalUrl:
        'https://www.landsd.gov.hk/doc/en/street-name/gnplan/2026/HKRM52.pdf',
      publisherIdentifier: 'HKRM52',
      retrievedAt: '2026-07-03T00:00:00.000Z',
      role: 'gazettePlan',
    },
  ])
  const districtIds = JSON.stringify(['district-central-western'])
  const changelog = [
    assetLinks,
    null,
    0,
    'gazette',
    '2026-07-03',
    'G.N. 4034',
    'landsd-street-notice-example',
    'release-1',
    'history-shard-1',
    'landsd-street-notice-example',
  ]
  const localizations = (versionHash: string, description: string | null) =>
    [
      ['en', 'Central Wan Chai Bypass'],
      ['zh-Hant', '中環灣仔繞道'],
    ].map(([locale, name]) => [
      description,
      locale,
      name,
      'landsd-street-notice-example',
      versionHash,
    ])

  if (query.includes('from "streetChangelog"')) {
    return [changelog]
  }
  if (!query.includes('from "streets"') && !query.includes('from "streetsI18n"')) {
    return [['street-snapshot']]
  }
  if (query.includes('from "streets"') && query.includes('"snapshotId" = ?')) {
    return [
      [
        null,
        districtIds,
        'landsd-street-notice-example',
        '2026-07-03',
        JSON.stringify({
          hkgovLandsd: { sourceEventIds: ['landsd-street-notice-example'] },
        }),
        'active',
        1,
      ],
    ]
  }
  if (query.includes('from "streetsI18n"') && query.includes('"snapshotId" = ?')) {
    return localizations('street-version-1', null).map(row => [row[0], row[1], row[2]])
  }
  if (query.includes('from "streets"')) {
    return [
      [
        null,
        districtIds,
        'landsd-street-notice-example',
        '2026-07-03',
        'active',
        1,
        'street-version-1',
      ],
      [
        '2026-08-01',
        districtIds,
        'landsd-street-notice-example',
        '2026-08-01',
        'deleted',
        2,
        'street-version-2',
      ],
    ]
  }
  if (query.includes('from "streetsI18n"')) {
    return [
      ...localizations('street-version-1', null),
      ...localizations('street-version-2', 'Deleted by Government Notice.'),
    ]
  }
  return []
}

const testApiKey = `SS-${'a'.repeat(43)}`

function createAssetBucket() {
  const reads: string[] = []
  return {
    bucket: {
      async get(key: string) {
        reads.push(key)
        return {
          body: new Blob(['source-pdf']).stream(),
          httpEtag: '"asset-etag"',
          size: 10,
          writeHttpMetadata(headers: Headers) {
            headers.set('content-type', 'application/pdf')
          },
        }
      },
    } as unknown as R2Bucket,
    reads,
  }
}

function apiRequest(input: RequestInfo | URL, init?: RequestInit) {
  const request = new Request(input, init)
  request.headers.set('x-api-key', testApiKey)
  return request
}

function createEnv(
  overrides: Partial<AppBindings> = {},
  dbOptions: MockDbOptions = {},
) {
  const { db, operations } = createMockDb(dbOptions)

  return {
    env: {
      DB_META: db,
      DB_CURRENT: db,
      DB_HISTORY_HK_BEFORE: db,
      DB_HISTORY_HK_2025: db,
      DB_HISTORY_HK_2026: db,
      DB_SOURCE_HK_2025: db,
      DB_SOURCE_HK_BEFORE: db,
      DB_SOURCE_HK_2026: db,
      D1_PLACEMENT_PROBE_API_KEY: 'test-probe-api-key',
      ATLAS_BASE_URL: 'http://localhost:8787',
      HARBOUR_BASE_URL: 'http://localhost:8788',
      SUBSTACK_PUBLICATION: 'demo-publication',
      SUBSTACK_SESSION_COOKIE:
        'substack.sid=s%3ADYiS7mTGqE6SdTN-7rB_hI-FYbXML9sL.Uvo1ovQf1%2BmxoCaSrEeoCkovfDAC3HU2URRfswdJsEQ; _ga_TLW0DF6G5V=GS2.1.s1781075256$o4$g1$t1781075559$j52$l0$h0',
      TELEGRAM_BOT_TOKEN: 'telegram-token',
      TELEGRAM_ADMIN_ID: '-1001234567890',
      ...overrides,
    } as AppBindings,
    operations,
  }
}

describe('atlas-api', () => {
  test('GET / redirects to the OpenAPI document', async () => {
    const res = await app.request('http://localhost/')

    expect(res.status).toBe(302)
    expect(res.headers.get('x-powered-by')).toBe('Hono')
    expect(res.headers.get('location')).toBe('/openapi')
  })

  test('GET /v0/meta/health checks DB access', async () => {
    const { env } = createEnv()
    const res = await app.fetch(apiRequest('http://localhost/v0/meta/health'), env)
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

  test('GET /v0/assets is public but resolves only registered assets', async () => {
    const { env } = createEnv()
    const res = await app.fetch(
      new Request('http://localhost/v0/assets/00000000-0000-4000-8000-000000000001'),
      env,
    )

    expect(res.status).toBe(404)
    expect((await res.json()) as unknown).toEqual({
      httpStatus: 404,
      error: 'asset_not_found',
      message: 'Managed asset not found.',
    })
  })

  test('GET /v0/assets streams registered immutable assets with cacheable metadata', async () => {
    const { bucket, reads } = createAssetBucket()
    const assetKey =
      'by-source/hk/hkgov-landsd/street-naming/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-notice.pdf'
    const { env } = createEnv({ R2_ASSETS: bucket }, { asset: { assetKey } })
    const res = await app.fetch(
      new Request('http://localhost/v0/assets/00000000-0000-4000-8000-000000000001', {
        headers: { Range: 'bytes=0-2' },
      }),
      env,
    )

    expect(res.status).toBe(200)
    expect(await res.text()).toBe('source-pdf')
    expect(reads).toEqual([assetKey])
    expect(res.headers.get('accept-ranges')).toBe('bytes')
    expect(res.headers.get('cache-control')).toBe('public, max-age=31536000, immutable')
    expect(res.headers.get('content-type')).toBe('application/pdf')
    expect(res.headers.get('etag')).toBe('"asset-etag"')
    expect(res.headers.get('content-disposition')).toBe(
      'attachment; filename="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-notice.pdf"',
    )
  })

  test('GET /v0/meta/d1-placement-probe returns timings for all D1 bindings', async () => {
    const { env } = createEnv()
    const res = await app.fetch(
      new Request('http://localhost/v0/meta/d1-placement-probe?iterations=2', {
        headers: { 'x-api-key': 'test-probe-api-key' },
      }),
      env,
    )
    const body = (await res.json()) as {
      bindings: Array<{ timingsMs: number[] }>
      configuredPlacementRegion: string
      iterations: number
      ok: boolean
      totalQueries: number
      worker: string
    }

    expect(res.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.worker).toBe('atlas-api')
    expect(body.configuredPlacementRegion).toBe('azure:eastasia')
    expect(body.iterations).toBe(2)
    expect(body.totalQueries).toBe(16)
    expect(body.bindings).toHaveLength(8)
    expect(body.bindings.every(binding => binding.timingsMs.length === 2)).toBe(true)
  })

  test('GET /v0/meta/d1-placement-probe requires the probe API key', async () => {
    const { env } = createEnv()
    const res = await app.fetch(
      new Request('http://localhost/v0/meta/d1-placement-probe?iterations=2'),
      env,
    )

    expect(res.status).toBe(401)
    expect((await res.json()) as unknown).toEqual({
      error: 'unauthorized',
      message: 'Missing or invalid API key.',
    })
  })

  test('GET /v0/meta/d1-placement-probe rejects invalid iteration counts', async () => {
    const { env } = createEnv()
    const res = await app.fetch(
      new Request('http://localhost/v0/meta/d1-placement-probe?iterations=0', {
        headers: { 'x-api-key': 'test-probe-api-key' },
      }),
      env,
    )

    expect(res.status).toBe(400)
  })

  test('GET /v0/divisions rejects an absent API key', async () => {
    const { env } = createEnv()
    const res = await app.fetch(new Request('http://localhost/v0/divisions'), env)

    expect(res.status).toBe(401)
    expect((await res.json()) as unknown).toEqual({
      error: 'invalid_api_key',
      message: 'A valid API key is required.',
    })
  })

  test('GET /v0/divisions permits an absent API key when the local bypass is enabled', async () => {
    const { env } = createEnv({ BYPASS_API_KEY_AUTH: 'true' })
    const res = await app.fetch(new Request('http://localhost/v0/divisions'), env)
    const body = (await res.json()) as {
      httpStatus: number
      error: string
      message: string
    }

    expect(res.status).toBe(503)
    expect(body).toEqual({
      httpStatus: 503,
      error: 'snapshot_not_ready',
      message: 'No active division snapshot is published.',
    })
  })

  test('GET /v0/hk/streets/:id requires an API key', async () => {
    const { env } = createEnv()
    const res = await app.fetch(
      new Request('http://localhost/v0/hk/streets/landsd-street-notice-example'),
      env,
    )

    expect(res.status).toBe(401)
    expect((await res.json()) as unknown).toEqual({
      error: 'invalid_api_key',
      message: 'A valid API key is required.',
    })
  })

  test('street history endpoints require an API key', async () => {
    const { env } = createEnv()
    for (const path of [
      '/v0/hk/streets/landsd-street-notice-example/versions',
      '/v0/hk/streets/landsd-street-notice-example/versions/1',
    ]) {
      const res = await app.fetch(new Request(`http://localhost${path}`), env)
      expect(res.status).toBe(401)
    }
  })

  test('GET /v0/hk/streets/:id returns the latest PDF-evidenced materialised state', async () => {
    const { env } = createEnv({}, { streetDetail: true })
    const res = await app.fetch(
      apiRequest('http://localhost/v0/hk/streets/landsd-street-notice-example'),
      env,
    )
    const body = (await res.json()) as {
      data: {
        attributes: {
          districtIds: string[]
          i18n: {
            en: {
              name: string
            }
            'zh-Hant': { name: string }
          }
          gazetteDate: string | null
          status: string
          version: number
          changelog: Array<{
            evidenceAssets: Array<{ publisherIdentifier: string | null; role: string }>
            kind: string
            source: {
              recordKey: string
              releaseId: string | null
              shardId: string | null
            }
          }>
        }
        links: Record<string, string>
      }
    }

    expect(res.status).toBe(200)
    expect(body.data.attributes).toMatchObject({
      districtIds: ['district-central-western'],
      gazetteDate: '2026-07-03',
      status: 'active',
      version: 1,
    })
    expect(body.data.attributes.changelog[0]?.evidenceAssets).toMatchObject([
      {
        assetUrl:
          'https://preview.api.saanseoi.hk/v0/assets/00000000-0000-4000-8000-000000000002',
        label: 'G.N.4034',
        originalUrl:
          'https://www.landsd.gov.hk/doc/en/street-name/egazette/2026/egn202630274034.pdf',
        role: 'governmentNotice',
      },
      {
        label: 'HKRM52',
        originalUrl:
          'https://www.landsd.gov.hk/doc/en/street-name/gnplan/2026/HKRM52.pdf',
        role: 'gazettePlan',
      },
    ])
    expect(Object.keys(body.data.attributes.i18n.en).sort()).toEqual([
      'description',
      'name',
    ])
    expect(body.data.attributes.i18n['zh-Hant']).toMatchObject({
      name: '中環灣仔繞道',
    })
    expect(body.data.attributes).not.toHaveProperty('governmentNoticeUrl')
    expect(body.data.attributes).not.toHaveProperty('governmentNoticeLabel')
    expect(body.data.attributes).not.toHaveProperty('gazettePlanUrls')
    expect(body.data.attributes.changelog).toEqual([
      expect.objectContaining({
        kind: 'gazette',
        source: {
          recordKey: 'landsd-street-notice-example',
          releaseId: 'release-1',
          shardId: 'history-shard-1',
        },
      }),
    ])
    expect(body.data.links).toMatchObject({
      version: 'http://localhost/v0/hk/streets/landsd-street-notice-example/versions/1',
      versions: 'http://localhost/v0/hk/streets/landsd-street-notice-example/versions',
    })
  })

  test('GET /v0/hk/streets/changelog replays LandsD events', async () => {
    const { env } = createEnv({}, { streetDetail: true })
    const res = await app.fetch(
      apiRequest('http://localhost/v0/hk/streets/changelog'),
      env,
    )
    const body = (await res.json()) as {
      data: Array<{
        id: string
        type: string
        attributes: { kind: string; source: { recordKey: string } }
      }>
    }

    expect(res.status).toBe(200)
    expect(body.data).toEqual([
      expect.objectContaining({
        id: 'landsd-street-notice-example:landsd-street-notice-example',
        type: 'street-changelog',
        attributes: expect.objectContaining({
          kind: 'gazette',
          source: expect.objectContaining({
            recordKey: 'landsd-street-notice-example',
          }),
        }),
      }),
    ])
  })

  test('GET /v0/hk/streets/:id/versions exposes crawlable previous and next links', async () => {
    const { env } = createEnv({}, { streetDetail: true })
    const list = await app.fetch(
      apiRequest(
        'http://localhost/v0/hk/streets/landsd-street-notice-example/versions',
      ),
      env,
    )
    const version = await app.fetch(
      apiRequest(
        'http://localhost/v0/hk/streets/landsd-street-notice-example/versions/1',
      ),
      env,
    )
    const listBody = (await list.json()) as {
      data: Array<{ attributes: { version: number } }>
    }
    const versionBody = (await version.json()) as {
      data: {
        attributes: { deletedAt: string | null; status: string; version: number }
      }
      links: Record<string, string>
    }

    expect(list.status).toBe(200)
    expect(listBody.data.map(item => item.attributes.version)).toEqual([1, 2])
    expect(version.status).toBe(200)
    expect(versionBody.data.attributes).toMatchObject({
      deletedAt: null,
      status: 'active',
      version: 1,
    })
    expect(versionBody.links).toMatchObject({
      next: 'http://localhost/v0/hk/streets/landsd-street-notice-example/versions/2',
      version: 'http://localhost/v0/hk/streets/landsd-street-notice-example/versions/1',
      versions: 'http://localhost/v0/hk/streets/landsd-street-notice-example/versions',
    })
    expect(versionBody.links).not.toHaveProperty('previous')
  })

  test('GET /v0/divisions rejects a malformed API key', async () => {
    const { env } = createEnv()
    const res = await app.fetch(
      new Request('http://localhost/v0/divisions', {
        headers: { 'x-api-key': 'not-an-api-key' },
      }),
      env,
    )

    expect(res.status).toBe(401)
    expect((await res.json()) as unknown).toEqual({
      error: 'invalid_api_key',
      message: 'A valid API key is required.',
    })
  })

  test('GET /v0/divisions rejects an unknown API key', async () => {
    const { env } = createEnv({}, { apiKey: null })
    const res = await app.fetch(apiRequest('http://localhost/v0/divisions'), env)

    expect(res.status).toBe(401)
    expect((await res.json()) as unknown).toEqual({
      error: 'invalid_api_key',
      message: 'A valid API key is required.',
    })
  })

  test('GET /v0/divisions rejects a revoked API key', async () => {
    const { env } = createEnv({}, { apiKey: { revokedAt: Date.now() } })
    const res = await app.fetch(apiRequest('http://localhost/v0/divisions'), env)

    expect(res.status).toBe(403)
    expect((await res.json()) as unknown).toEqual({
      error: 'revoked_api_key',
      message: 'This API key has been revoked.',
    })
  })

  test('GET /v0/divisions rate-limits a key after 25% over its minute soft limit', async () => {
    const { env } = createEnv({}, { usageRequestCount: 151 })
    const res = await app.fetch(apiRequest('http://localhost/v0/divisions'), env)

    expect(res.status).toBe(429)
    expect(Number(res.headers.get('Retry-After'))).toBeGreaterThan(0)
    expect((await res.json()) as unknown).toEqual({
      error: 'rate_limit_exceeded',
      message: 'This API key has exceeded its current usage limit.',
    })
  })

  test('GET /v0/api registry endpoints do not require an API key', async () => {
    const { env } = createEnv()

    for (const path of [
      '/v0/api/releases',
      '/v0/api/apis',
      '/v0/api/sources',
      '/v0/api/sourcePublishers',
    ]) {
      const res = await app.fetch(new Request(`http://localhost${path}`), env)

      expect(res.status).toBe(200)
      expect((await res.json()) as unknown).toEqual({ data: [] })
    }
  })

  test('OPTIONS /v0/meta/substack allows cross-origin JSON subscriptions', async () => {
    const { env } = createEnv()
    const res = await app.fetch(
      new Request('http://localhost/v0/meta/substack', {
        method: 'OPTIONS',
        headers: {
          origin: 'http://localhost:5173',
          'access-control-request-method': 'POST',
          'access-control-request-headers': 'content-type',
        },
      }),
      env,
    )

    expect(res.status).toBe(204)
    expect(res.headers.get('access-control-allow-origin')).toBe('*')
    expect(res.headers.get('access-control-allow-methods')).toContain('POST')
    expect(res.headers.get('access-control-allow-headers')).toContain('Content-Type')
  })

  test('GET /v0/divisions returns snapshot_not_ready when no division release set is published', async () => {
    const { env } = createEnv()
    const res = await app.fetch(apiRequest('http://localhost/v0/divisions'), env)
    const body = (await res.json()) as {
      httpStatus: number
      error: string
      message: string
    }

    expect(res.status).toBe(503)
    expect(body).toEqual({
      httpStatus: 503,
      error: 'snapshot_not_ready',
      message: 'No active division snapshot is published.',
    })
  })

  test('GET /v0/addresses returns snapshot_not_ready when no address release set is published', async () => {
    const { env } = createEnv()
    const res = await app.fetch(apiRequest('http://localhost/v0/addresses'), env)
    const body = (await res.json()) as {
      httpStatus: number
      error: string
      message: string
    }

    expect(res.status).toBe(503)
    expect(body).toEqual({
      httpStatus: 503,
      error: 'snapshot_not_ready',
      message: 'No active address snapshot is published.',
    })
  })

  test('GET /v0/divisions returns 503 when atlas hits a transient D1 read failure', async () => {
    const { env } = createEnv(
      {},
      {
        failOnAll: () => true,
        failOnFirst: () => true,
        failOnRaw: () => true,
      },
    )
    const res = await app.fetch(apiRequest('http://localhost/v0/divisions'), env)
    const body = (await res.json()) as {
      error: string
      message: string
    }

    expect(res.status).toBe(503)
    expect(body).toEqual({
      error: 'service_unavailable',
      message: 'The atlas API is temporarily unavailable.',
    })
  })

  test('GET /v0/divisions rejects invalid locale syntax', async () => {
    const { env } = createEnv()
    const res = await app.fetch(
      apiRequest('http://localhost/v0/divisions?locales=en,zh-hk-extra-piece'),
      env,
    )
    const body = (await res.json()) as {
      error: string
      message: string
      details: Array<{ path: string }>
      target: string
    }

    expect(res.status).toBe(422)
    expect(body.error).toBe('validation_error')
    expect(body.target).toBe('query')
    expect(body.details.some(detail => detail.path === 'locales')).toBe(true)
  })

  test('GET /v0/divisions accepts arbitrary valid locale tags and wildcard controls', async () => {
    const { env } = createEnv()

    for (const locales of ['fr-ca', 'EN,ZH_HANT', '*', 'null']) {
      const res = await app.fetch(
        apiRequest(
          `http://localhost/v0/divisions?locales=${encodeURIComponent(locales)}`,
        ),
        env,
      )

      expect(res.status).toBe(503)
    }
  })

  test('GET /openapi documents the versioned division, address, and street endpoints', async () => {
    const { env } = createEnv()
    const res = await app.fetch(new Request('http://localhost/openapi'), env)
    const body = (await res.json()) as {
      paths: Record<string, Record<string, { operationId?: string }>>
      servers: Array<{ url: string }>
      components?: {
        schemas?: Record<
          string,
          { pattern?: string; required?: string[]; minimum?: number; maximum?: number }
        >
      }
    }

    expect(res.status).toBe(200)
    expect(body.paths['/v0/divisions']?.get?.operationId).toBe('listDivisionsV0')
    expect(body.paths['/v0.1/divisions/{id}']?.get?.operationId).toBe(
      'getDivisionByIdV01',
    )
    expect(body.paths['/v0.1/divisions/source-releases']?.get?.operationId).toBe(
      'listDivisionSourceReleasesV01',
    )
    expect(body.paths['/v0.1/divisions/sources']?.get?.operationId).toBe(
      'listDivisionSourceRecordsV01',
    )
    expect(body.paths['/v0/addresses']?.get?.operationId).toBe('listAddressesV0')
    expect(body.paths['/v0.1/addresses/{id}']?.get?.operationId).toBe(
      'getAddressByIdV01',
    )
    expect(body.paths['/v0/hk/streets/{id}']?.get?.operationId).toBe(
      'getHongKongStreetByIdV0',
    )
    expect(body.paths['/v0/hk/streets/changelog']?.get?.operationId).toBe(
      'replayHongKongStreetChangelogV0',
    )
    expect(body.paths['/v0/hk/streets/{id}/versions']?.get?.operationId).toBe(
      'listHongKongStreetVersionsV0',
    )
    expect(body.paths['/v0/hk/streets/{id}/versions/{version}']?.get?.operationId).toBe(
      'getHongKongStreetVersionV0',
    )
    expect(body.components?.schemas?.DivisionRelationships?.required).toContain(
      'hierarchy',
    )
    expect(body.components?.schemas?.Id?.pattern).toBe('^\\S+$')
    expect(body.components?.schemas).toHaveProperty('OverturePlaceType')
    expect(body.components?.schemas).toHaveProperty('OvertureDivisionClass')
    expect(body.components?.schemas).toHaveProperty('FeatureVersion')
    expect(body.components?.schemas).toHaveProperty('OvertureSourceItem')
    expect(body.components?.schemas).toHaveProperty('OtherSourceTypeItem')
    expect(body.components?.schemas).toHaveProperty('Sources')
    expect(body.components?.schemas?.FeatureVersion?.minimum).toBe(0)
    expect(body.components?.schemas?.FeatureVersion?.maximum).toBe(2_147_483_647)
    expect(body.paths['/latest/divisions']).toBeUndefined()
    expect(body.servers).toEqual([{ url: 'http://localhost:8787' }])
  })

  test('GET /v0.1/divisions/sources requires one exact source release', async () => {
    const { env } = createEnv()
    const res = await app.fetch(
      apiRequest('http://localhost/v0.1/divisions/sources'),
      env,
    )

    expect(res.status).toBe(422)
    expect(await res.json()).toMatchObject({ error: 'validation_error' })
  })

  test('GET /v0.1/divisions/sources validates NDJSON requests before streaming', async () => {
    const { env } = createEnv()
    const res = await app.fetch(
      apiRequest('http://localhost/v0.1/divisions/sources?format=ndjson'),
      env,
    )

    expect(res.status).toBe(422)
    expect(await res.json()).toMatchObject({ error: 'validation_error' })
  })

  test('POST /v0/meta/substack forwards the subscription request to Substack', async () => {
    const originalFetch = globalThis.fetch
    const fetchCalls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = []

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      fetchCalls.push({ input, init })

      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: {
          'content-type': 'application/json',
        },
      })
    }) as typeof fetch

    try {
      const { env, operations } = createEnv()
      const res = await app.fetch(
        new Request('http://localhost/v0/meta/substack', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            email: 'hello@example.com',
          }),
        }),
        env,
      )

      const body = (await res.json()) as {
        ok: boolean
        message: string
        subscriptionState: 'subscribed' | 'pending'
      }

      expect(res.status).toBe(200)
      expect(body).toEqual({
        ok: true,
        message: 'Subscription request accepted.',
        subscriptionState: 'subscribed',
      })
      expect(fetchCalls).toHaveLength(2)
      expect(String(fetchCalls[0]?.input)).toBe(
        'https://demo-publication.substack.com/api/v1/subscriber/add',
      )
      expect(String(fetchCalls[1]?.input)).toBe(
        'https://api.telegram.org/bottelegram-token/sendMessage',
      )
      expect(fetchCalls[0]?.init?.method).toBe('POST')
      expect(fetchCalls[0]?.init?.headers).toMatchObject({
        accept: 'application/json',
        'cache-control': 'no-cache',
        'content-type': 'application/json',
        cookie:
          'substack.sid=s%3ADYiS7mTGqE6SdTN-7rB_hI-FYbXML9sL.Uvo1ovQf1%2BmxoCaSrEeoCkovfDAC3HU2URRfswdJsEQ',
        origin: 'https://demo-publication.substack.com',
        pragma: 'no-cache',
        referer: 'https://demo-publication.substack.com/publish/subscribers/add',
      })
      expect(fetchCalls[0]?.init?.body).toBe(
        JSON.stringify({
          email: 'hello@example.com',
          subscription: false,
          sendEmail: true,
        }),
      )
      expect(
        operations.some(
          operation =>
            operation.query.includes('insert into "newsletterSubscription"') &&
            operation.values.includes('hello@example.com') &&
            operation.values.includes('pending'),
        ),
      ).toBe(true)
      expect(
        operations.some(
          operation =>
            operation.query.includes('insert into "newsletterSubscription"') &&
            operation.query.includes('on conflict') &&
            operation.values.includes('subscribed') &&
            operation.values.includes('hello@example.com'),
        ),
      ).toBe(true)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test('POST /v0/meta/substack still returns 200 and notifies Telegram when subscribed persistence fails', async () => {
    const originalFetch = globalThis.fetch
    const originalConsoleError = console.error
    const fetchCalls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = []
    const consoleErrors: unknown[] = []

    console.error = (...args: unknown[]) => {
      consoleErrors.push(args)
    }

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      fetchCalls.push({ input, init })

      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: {
          'content-type': 'application/json',
        },
      })
    }) as typeof fetch

    try {
      const { env } = createEnv(
        {},
        {
          failOnRun: (query, values) =>
            query.includes('insert into "newsletterSubscription"') &&
            query.includes('on conflict') &&
            values.includes('subscribed'),
        },
      )
      const res = await app.fetch(
        new Request('http://localhost/v0/meta/substack', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            email: 'hello@example.com',
          }),
        }),
        env,
      )

      const body = (await res.json()) as {
        ok: boolean
      }

      expect(res.status).toBe(200)
      expect(body.ok).toBe(true)
      expect(fetchCalls).toHaveLength(2)
      expect(String(fetchCalls[1]?.input)).toBe(
        'https://api.telegram.org/bottelegram-token/sendMessage',
      )
      expect(
        consoleErrors.some(
          entry =>
            Array.isArray(entry) &&
            String(entry[0]).includes('Failed to mark newsletter as subscribed'),
        ),
      ).toBe(true)
    } finally {
      globalThis.fetch = originalFetch
      console.error = originalConsoleError
    }
  })

  test('POST /v0/meta/substack returns 500 when the session cookie is missing', async () => {
    const originalFetch = globalThis.fetch
    const fetchCalls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = []

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      fetchCalls.push({ input, init })

      return new Response(JSON.stringify({ ok: true, result: {} }), {
        status: 200,
        headers: {
          'content-type': 'application/json',
        },
      })
    }) as typeof fetch

    try {
      const { env, operations } = createEnv({
        SUBSTACK_SESSION_COOKIE: '',
      })
      const res = await app.fetch(
        new Request('http://localhost/v0/meta/substack', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            email: 'hello@example.com',
          }),
        }),
        env,
      )

      const body = (await res.json()) as {
        httpStatus: number
        error: string
        message: string
      }

      expect(res.status).toBe(500)
      expect(body).toEqual({
        httpStatus: 500,
        error: 'substack_not_configured',
        message: 'SUBSTACK_SESSION_COOKIE is not configured.',
      })
      expect(fetchCalls).toHaveLength(1)
      expect(String(fetchCalls[0]?.input)).toBe(
        'https://api.telegram.org/bottelegram-token/sendMessage',
      )
      expect(
        operations.some(
          operation =>
            operation.query.includes('insert into "newsletterSubscription"') &&
            operation.query.includes('on conflict') &&
            operation.values.includes('failed') &&
            operation.values.includes('SUBSTACK_SESSION_COOKIE is not configured.') &&
            operation.values.includes('hello@example.com'),
        ),
      ).toBe(true)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test('POST /v0/meta/substack returns 200 and notifies Telegram when Substack rejects the request after persistence', async () => {
    const originalFetch = globalThis.fetch
    const fetchCalls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = []

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      fetchCalls.push({ input, init })

      if (String(input).includes('api.telegram.org')) {
        return new Response(JSON.stringify({ ok: true, result: {} }), {
          status: 200,
          headers: {
            'content-type': 'application/json',
          },
        })
      }

      return new Response(JSON.stringify({ error: 'Too Many Requests' }), {
        status: 429,
        headers: {
          'content-type': 'application/json',
        },
      })
    }) as typeof fetch

    try {
      const { env, operations } = createEnv()
      const res = await app.fetch(
        new Request('http://localhost/v0/meta/substack', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            email: 'hello@example.com',
          }),
        }),
        env,
      )

      const body = (await res.json()) as {
        ok: boolean
        message: string
        subscriptionState: 'subscribed' | 'pending'
      }

      expect(res.status).toBe(200)
      expect(body).toEqual({
        ok: true,
        message: 'Subscription recorded. We will retry delivery with Substack.',
        subscriptionState: 'pending',
      })
      expect(fetchCalls).toHaveLength(2)
      expect(String(fetchCalls[1]?.input)).toBe(
        'https://api.telegram.org/bottelegram-token/sendMessage',
      )
      expect(
        operations.some(
          operation =>
            operation.query.includes('insert into "newsletterSubscription"') &&
            operation.query.includes('on conflict') &&
            operation.values.includes('failed') &&
            operation.values.includes('Too Many Requests') &&
            operation.values.includes('hello@example.com'),
        ),
      ).toBe(true)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test('POST /v0/meta/substack still returns 200 and notifies Telegram when failed persistence logging fails', async () => {
    const originalFetch = globalThis.fetch
    const originalConsoleError = console.error
    const fetchCalls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = []
    const consoleErrors: unknown[] = []

    console.error = (...args: unknown[]) => {
      consoleErrors.push(args)
    }

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      fetchCalls.push({ input, init })

      if (String(input).includes('api.telegram.org')) {
        return new Response(JSON.stringify({ ok: true, result: {} }), {
          status: 200,
          headers: {
            'content-type': 'application/json',
          },
        })
      }

      return new Response(JSON.stringify({ error: 'Too Many Requests' }), {
        status: 429,
        headers: {
          'content-type': 'application/json',
        },
      })
    }) as typeof fetch

    try {
      const { env } = createEnv(
        {},
        {
          failOnRun: (query, values) =>
            query.includes('insert into "newsletterSubscription"') &&
            query.includes('on conflict') &&
            values.includes('Too Many Requests'),
        },
      )
      const res = await app.fetch(
        new Request('http://localhost/v0/meta/substack', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            email: 'hello@example.com',
          }),
        }),
        env,
      )

      const body = (await res.json()) as {
        ok: boolean
        message: string
        subscriptionState: 'subscribed' | 'pending'
      }

      expect(res.status).toBe(200)
      expect(body).toEqual({
        ok: true,
        message: 'Subscription recorded. We will retry delivery with Substack.',
        subscriptionState: 'pending',
      })
      expect(fetchCalls).toHaveLength(2)
      expect(String(fetchCalls[1]?.input)).toBe(
        'https://api.telegram.org/bottelegram-token/sendMessage',
      )
      expect(
        consoleErrors.some(
          entry =>
            Array.isArray(entry) &&
            String(entry[0]).includes('Failed to mark newsletter as failed'),
        ),
      ).toBe(true)
    } finally {
      globalThis.fetch = originalFetch
      console.error = originalConsoleError
    }
  })
})
