import { describe, expect, test } from 'bun:test'

import app, { sortOperations } from './index'
import type { AppBindings } from './types'

type MockDbOptions = {
  asset?: {
    assetKey: string
    datasetId?: string
    publisherCode?: string
    sourceReleaseCode?: string
    sourceReleaseId?: string
  } | null
  apiKey?: {
    id?: string
    revokedAt?: number | null
    requestsPerMinute?: number | null
    userRole?: 'user' | 'admin'
  } | null
  failOnAll?: (query: string, values: unknown[]) => boolean
  failOnFirst?: (query: string, values: unknown[]) => boolean
  failOnRaw?: (query: string, values: unknown[]) => boolean
  failOnRun?: (query: string, values: unknown[]) => boolean
  newsletterSubscription?: {
    status: 'failed' | 'pending' | 'subscribed' | 'unsubscribed'
    updatedAt: string
  } | null
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

            if (query.includes('FROM apiKeyUsageRollup')) return null as T

            if (query.includes('FROM apiKey')) {
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

            if (options.asset && query.includes('from "assets"')) {
              return [
                [
                  options.asset.assetKey,
                  options.asset.datasetId ?? null,
                  options.asset.publisherCode ?? null,
                  options.asset.sourceReleaseCode ?? null,
                  options.asset.sourceReleaseId ?? null,
                ] as T,
              ]
            }

            if (options.asset) return [[options.asset.assetKey] as T]

            if (
              options.newsletterSubscription !== undefined &&
              query.includes('from "newsletterSubscription"')
            ) {
              const subscription = options.newsletterSubscription
              return subscription
                ? [[subscription.status, subscription.updatedAt] as T]
                : []
            }

            if (options.streetDetail) return streetRows(query) as T[][]

            return [] as T[]
          },
        }
      },
      async batch(statements: Array<{ run: () => Promise<unknown> }>) {
        return Promise.all(statements.map(statement => statement.run()))
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

  if (query.includes('from "snapshotVersionChanges"')) {
    return [
      [
        'street',
        'landsd-street-notice-example',
        '',
        'street-version-1',
        'upsert',
        'release-1',
      ],
      [
        'street',
        'landsd-street-notice-example',
        '',
        'street-version-2',
        'upsert',
        'release-1',
      ],
      [
        'streetI18n',
        'landsd-street-notice-example',
        'en',
        'street-version-1',
        'upsert',
        'release-1',
      ],
      [
        'streetI18n',
        'landsd-street-notice-example',
        'zh-Hant',
        'street-version-1',
        'upsert',
        'release-1',
      ],
      [
        'streetI18n',
        'landsd-street-notice-example',
        'en',
        'street-version-2',
        'upsert',
        'release-1',
      ],
      [
        'streetI18n',
        'landsd-street-notice-example',
        'zh-Hant',
        'street-version-2',
        'upsert',
        'release-1',
      ],
      [
        'streetChangelog',
        'street-changelog-version-1',
        '',
        'street-changelog-version-1',
        'upsert',
        'release-1',
      ],
    ]
  }
  if (query.includes('from "snapshots"')) return [['street-snapshot', null]]
  if (query.includes('from "snapshotShardAssignments"')) {
    return [['history-shard-1', 'DB_HISTORY_HK_2026']]
  }
  if (query.includes('from "streetChangelog"')) {
    if (query.includes('"versionHash"')) {
      return [
        [
          'landsd-street-notice-example',
          'landsd-street-notice-example',
          'gazette',
          0,
          '2026-07-03',
          null,
          'history-shard-1',
          'G.N. 4034',
          assetLinks,
          'street-changelog-version-1',
          'release-1',
          'street-snapshot',
          1,
          '2026-07-03T00:00:00.000Z',
          '2026-07-03T00:00:00.000Z',
        ],
        [
          'landsd-street-notice-example',
          'landsd-street-notice-example-future',
          'gazette',
          0,
          '2026-09-01',
          null,
          'history-shard-1',
          'G.N. 9999',
          assetLinks,
          'street-changelog-version-3',
          'release-2',
          'future-street-snapshot',
          1,
          '2026-09-01T00:00:00.000Z',
          '2026-09-01T00:00:00.000Z',
        ],
      ]
    }
    return [changelog]
  }
  if (query.includes('from "streets"') && query.includes('"versionHash"')) {
    const sources = JSON.stringify({ hkgovLandsd: { noticeRecordKeys: [] } })
    return [
      [
        'landsd-street-notice-example',
        1,
        'active',
        null,
        districtIds,
        '2026-07-03',
        null,
        '[]',
        assetLinks,
        sources,
        'street-version-1',
        'release-1',
        'street-snapshot',
        1,
        '2026-07-03T00:00:00.000Z',
        '2026-07-03T00:00:00.000Z',
      ],
      [
        'landsd-street-notice-example',
        2,
        'deleted',
        '2026-08-01',
        districtIds,
        '2026-08-01',
        null,
        '[]',
        assetLinks,
        sources,
        'street-version-2',
        'release-1',
        'street-snapshot',
        1,
        '2026-08-01T00:00:00.000Z',
        '2026-08-01T00:00:00.000Z',
      ],
      [
        'landsd-street-notice-example',
        3,
        'active',
        null,
        districtIds,
        '2026-09-01',
        null,
        '[]',
        assetLinks,
        sources,
        'street-version-3',
        'release-2',
        'future-street-snapshot',
        1,
        '2026-09-01T00:00:00.000Z',
        '2026-09-01T00:00:00.000Z',
      ],
    ]
  }
  if (query.includes('from "streetsI18n"') && query.includes('"versionHash"')) {
    return [
      ...localizations('street-version-1', null).map(row => [
        'landsd-street-notice-example',
        row[1],
        row[2],
        null,
        null,
        null,
        null,
        'central wan chai bypass',
        row[0],
        'street-version-1',
        'release-1',
        'street-snapshot',
        1,
        '2026-07-03T00:00:00.000Z',
        '2026-07-03T00:00:00.000Z',
      ]),
      ...localizations('street-version-2', 'Deleted by Government Notice.').map(row => [
        'landsd-street-notice-example',
        row[1],
        row[2],
        null,
        null,
        null,
        null,
        'central wan chai bypass',
        row[0],
        'street-version-2',
        'release-1',
        'street-snapshot',
        1,
        '2026-08-01T00:00:00.000Z',
        '2026-08-01T00:00:00.000Z',
      ]),
      ...localizations(
        'street-version-3',
        'Published after the selected snapshot.',
      ).map(row => [
        'landsd-street-notice-example',
        row[1],
        row[2],
        null,
        null,
        null,
        null,
        'central wan chai bypass',
        row[0],
        'street-version-3',
        'release-2',
        'future-street-snapshot',
        1,
        '2026-09-01T00:00:00.000Z',
        '2026-09-01T00:00:00.000Z',
      ]),
    ]
  }
  if (!query.includes('from "streets"') && !query.includes('from "streetsI18n"')) {
    return [['street-snapshot']]
  }
  if (query.includes('from "streets"') && query.includes('"snapshotId" = ?')) {
    return [
      [null, districtIds, 'landsd-street-notice-example', '2026-07-03', 'active', 1],
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

const testApiKey = `pk.${'a'.repeat(43)}`

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
      AUTH_MODE: 'disabled',
      ENVIRONMENT: 'local',
      API_RATE_LIMIT: { limit: async () => ({ success: true }) } as RateLimit,
      NEWSLETTER_RATE_LIMIT: {
        limit: async () => ({ success: true }),
      } as RateLimit,
      API_USAGE: { writeDataPoint: () => {} } as AnalyticsEngineDataset,
      PRODUCT_USAGE: { writeDataPoint: () => {} } as AnalyticsEngineDataset,
      PRODUCT_USAGE_DATASET: 'test-product-usage',
      PUBLIC_KEY_LEASES: {
        get: async () => ({
          keyId: 'api-key-1',
          status: 'active' as const,
          nextCheckAt: Date.now() + 60_000,
        }),
      } as unknown as KVNamespace,
      PUBLIC_KEY_LEASE_COORDINATOR: {
        getByName: () => ({
          fetch: async () => Response.json({ status: 'active' }),
        }),
      } as unknown as DurableObjectNamespace,
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

function createAuthenticatedEnv(
  overrides: Partial<AppBindings> = {},
  dbOptions: MockDbOptions = {},
) {
  return createEnv(
    {
      AUTH_MODE: 'required',
      ENVIRONMENT: 'local',
      ...overrides,
    },
    dbOptions,
  )
}

describe('atlas-api', () => {
  test('every data-family operation documents and validates the optional region filter', async () => {
    const { env } = createEnv()
    const paths = {}
    for (const family of ['addresses', 'divisions', 'places', 'stats', 'streets']) {
      const response = await app.fetch(
        new Request(`http://localhost/openapi/${family}/v0.1`),
        env,
      )
      expect(response.status).toBe(200)
      Object.assign(paths, ((await response.json()) as { paths: object }).paths)
    }
    const document = { paths } as {
      paths: Record<
        string,
        {
          get?: {
            parameters?: Array<{
              name: string
              in: string
              required?: boolean
              schema: { enum?: string[]; default?: string }
            }>
          }
        }
      >
    }
    let operations = 0
    for (const [path, entry] of Object.entries(document.paths)) {
      if (!/^\/(addresses|divisions|places|stats|streets)\//.test(path) || !entry.get)
        continue
      const parameter = entry.get.parameters?.find(
        parameter => parameter.name === 'region',
      )
      expect(parameter, path).toMatchObject({
        in: 'query',
        required: false,
        schema: { enum: ['hk', 'mo', 'gba'], default: 'hk' },
      })
      expect(path).not.toContain('{region}')
      operations++
    }
    expect(operations).toBeGreaterThan(20)
    for (const path of [
      '/addresses/v0.1',
      '/divisions/v0.1',
      '/places/v0.1',
      '/places/v0',
      '/stats/v0.1',
      '/streets/v0.1/changelog',
      '/stats/v0.1/registry',
      '/divisions/v0.1/source-releases',
    ]) {
      const invalid = await app.fetch(
        apiRequest(`http://localhost${path}?region=invalid`),
        env,
      )
      expect(invalid.status, path).toBe(422)
    }
  })

  test('dispatches both scheduled roll-ups with their matching cron', async () => {
    const originalFetch = globalThis.fetch
    const queries: string[] = []
    globalThis.fetch = (async (_input, init) => {
      queries.push(String(init?.body))
      return Response.json({ success: true, data: [] })
    }) as typeof fetch

    const { env } = createEnv({
      ANALYTICS_ENGINE_ACCOUNT_ID: 'a6eeace4b6d9f8e07ab307964e74d801',
      ANALYTICS_ENGINE_READ_TOKEN: 'read-token',
      USAGE_ROLLUP_DATASETS: 'ss-api-usage-local',
    })
    const tasks: Promise<unknown>[] = []
    const ctx = {
      waitUntil(task: Promise<unknown>) {
        tasks.push(task)
      },
    } as ExecutionContext

    try {
      await app.scheduled(
        {
          cron: '*/5 * * * *',
          scheduledTime: Date.parse('2026-08-21T00:05:00Z'),
        } as ScheduledController,
        env,
        ctx,
      )
      await app.scheduled(
        {
          cron: '15 0 * * *',
          scheduledTime: Date.parse('2026-08-21T00:15:00Z'),
        } as ScheduledController,
        env,
        ctx,
      )

      await expect(Promise.all(tasks)).resolves.toEqual([
        { apiKeys: 0, minuteWindows: 0 },
        { days: 2, rows: 0 },
      ])
      expect(queries).toHaveLength(2)
      expect(queries).toEqual(
        expect.arrayContaining([
          expect.stringContaining('SUM(_sample_interval * double1)'),
          expect.stringContaining("index1 = 'api.access'"),
        ]),
      )
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test('logs sanitised scheduled roll-up failures with job context', async () => {
    const originalFetch = globalThis.fetch
    const originalConsoleError = console.error
    const logs: unknown[][] = []
    globalThis.fetch = (async () =>
      Response.json(
        {
          success: false,
          errors: [{ message: 'Authorization: Bearer read-token' }],
        },
        { status: 401 },
      )) as unknown as typeof fetch
    console.error = (...args: unknown[]) => {
      logs.push(args)
    }

    const { env } = createEnv({
      ANALYTICS_ENGINE_ACCOUNT_ID: 'a6eeace4b6d9f8e07ab307964e74d801',
      ANALYTICS_ENGINE_READ_TOKEN: 'read-token',
    })
    const tasks: Promise<unknown>[] = []
    const ctx = {
      waitUntil(task: Promise<unknown>) {
        tasks.push(task)
      },
    } as ExecutionContext

    try {
      await app.scheduled(
        {
          cron: '15 0 * * *',
          scheduledTime: Date.parse('2026-08-21T00:15:00Z'),
        } as ScheduledController,
        env,
        ctx,
      )

      await expect(tasks[0]).rejects.toMatchObject({
        phase: 'analytics_engine_query',
        httpStatus: 401,
      })
      expect(logs).toHaveLength(1)
      expect(JSON.parse(String(logs[0]?.[0]))).toEqual({
        job: 'access_analytics_daily_rollup',
        cron: '15 0 * * *',
        scheduledTime: '2026-08-21T00:15:00.000Z',
        phase: 'analytics_engine_query',
        httpStatus: 401,
        message:
          'Analytics Engine access query failed (401): Authorization: [REDACTED]',
      })
    } finally {
      globalThis.fetch = originalFetch
      console.error = originalConsoleError
    }
  })

  test('GET / redirects to the OpenAPI document', async () => {
    const res = await app.request('http://localhost/')

    expect(res.status).toBe(302)
    expect(res.headers.get('x-powered-by')).toBe('Hono')
    expect(res.headers.get('location')).toBe('/openapi')
  })

  test('sorts API operations as lists, entities, sources, then source releases', () => {
    const paths = [
      '/divisions/v0.1/source-releases',
      '/divisions/v0.1/{id}',
      '/divisions/v0.1',
      '/divisions/v0.1/{id}',
      '/divisions/v0.1/sources',
      '/divisions/v0.1',
    ]

    expect(
      paths.toSorted((first, second) =>
        sortOperations({ path: first }, { path: second }),
      ),
    ).toEqual([
      '/divisions/v0.1',
      '/divisions/v0.1',
      '/divisions/v0.1/{id}',
      '/divisions/v0.1/{id}',
      '/divisions/v0.1/sources',
      '/divisions/v0.1/source-releases',
    ])
    expect(
      ['/v0.1/api/sources/{id}', '/v0.1/api/sources'].toSorted((first, second) =>
        sortOperations({ path: first }, { path: second }),
      ),
    ).toEqual(['/v0.1/api/sources', '/v0.1/api/sources/{id}'])
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

  test('GET /v0.1/meta/datasets has been retired', async () => {
    const { env } = createEnv()
    const res = await app.fetch(new Request('http://localhost/v0.1/meta/datasets'), env)

    expect(res.status).toBe(404)
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

  test('records successful and failed asset downloads without changing API_USAGE', async () => {
    const productEvents: AnalyticsEngineDataPoint[] = []
    const { bucket } = createAssetBucket()
    const { env } = createEnv(
      {
        PRODUCT_USAGE: {
          writeDataPoint: event => productEvents.push(event ?? {}),
        } as AnalyticsEngineDataset,
        R2_ASSETS: bucket,
      },
      { asset: { assetKey: 'source-archives/example.zip' } },
    )
    const assetId = '00000000-0000-4000-8000-000000000001'
    const success = await app.fetch(
      new Request(`http://localhost/v0/assets/${assetId}`),
      env,
    )
    expect(success.status).toBe(200)

    const missing = await app.fetch(
      new Request('http://localhost/v0/assets/00000000-0000-4000-8000-000000000002'),
      createEnv(
        {
          PRODUCT_USAGE: {
            writeDataPoint: event => productEvents.push(event ?? {}),
          } as AnalyticsEngineDataset,
          R2_ASSETS: { get: async () => null } as unknown as R2Bucket,
        },
        { asset: { assetKey: 'source-archives/example.zip' } },
      ).env,
    )
    expect(missing.status).toBe(404)
    expect(productEvents.map(event => event.blobs)).toEqual([
      [
        'v1',
        'api.asset_download',
        'atlas-api',
        'asset_request',
        '/v0/assets/:id',
        'asset',
        assetId,
        '',
        'success',
        '200',
      ],
      [
        'v1',
        'api.asset_download',
        'atlas-api',
        'asset_request',
        '/v0/assets/:id',
        'asset',
        '00000000-0000-4000-8000-000000000002',
        '',
        'failure',
        '404',
      ],
    ])
  })

  test('does not block serving when Analytics Engine telemetry fails', async () => {
    const { bucket } = createAssetBucket()
    let telemetryWrites = 0
    const { env, operations } = createEnv(
      {
        PRODUCT_USAGE: {
          writeDataPoint: () => {
            telemetryWrites += 1
            throw new Error('Analytics Engine unavailable')
          },
        } as AnalyticsEngineDataset,
        R2_ASSETS: bucket,
      },
      {
        asset: {
          assetKey: 'source-archives/example.zip',
          datasetId: 'dataset-1',
          publisherCode: 'hkgov',
          sourceReleaseCode: 'landsd-archive-2026.1',
          sourceReleaseId: 'source-archive-2026.1',
        },
      },
    )

    const res = await app.fetch(
      new Request('http://localhost/v0/assets/00000000-0000-4000-8000-000000000001', {
        headers: { 'x-request-id': 'analytics-failure-request' },
      }),
      env,
    )

    expect(telemetryWrites).toBeGreaterThan(0)
    expect(
      operations.some(operation => operation.query.includes('accessAnalytics')),
    ).toBe(false)
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('source-pdf')
  })

  test('records first-party API requests separately from API_USAGE billing events', async () => {
    const productEvents: AnalyticsEngineDataPoint[] = []
    const { env } = createAuthenticatedEnv({
      PRODUCT_USAGE: {
        writeDataPoint: event => productEvents.push(event ?? {}),
      } as AnalyticsEngineDataset,
    })
    const res = await app.fetch(
      new Request('http://localhost/divisions/v0.1', {
        headers: { origin: 'https://saanseoi.hk' },
      }),
      env,
    )
    expect(res.status).toBe(503)
    expect(productEvents[0]?.blobs).toEqual([
      'v1',
      'api.request',
      'atlas-api',
      'api',
      '/divisions/v0.1',
      '',
      '',
      '',
      'failure',
      '503',
    ])
  })

  test('GET /v0/styles streams public immutable style artefacts from R2', async () => {
    const reads: string[] = []
    const productEvents: AnalyticsEngineDataPoint[] = []
    const { env } = createAuthenticatedEnv({
      PRODUCT_USAGE: {
        writeDataPoint: event => productEvents.push(event ?? {}),
      } as AnalyticsEngineDataset,
      R2_ASSETS: {
        async get(key: string) {
          reads.push(key)
          return {
            body: new Blob(['{"version":8}']).stream(),
            httpEtag: '"style-etag"',
            writeHttpMetadata(headers: Headers) {
              headers.set('content-type', 'application/json')
            },
          }
        },
      } as unknown as R2Bucket,
    })
    const res = await app.fetch(
      new Request('http://localhost/v0/styles/midnight/1.0.0.json'),
      env,
    )

    expect(res.status).toBe(200)
    expect(await res.text()).toBe('{"version":8}')
    expect(reads).toEqual(['styles/midnight/1.0.0.json'])
    expect(res.headers.get('access-control-allow-origin')).toBe('*')
    expect(res.headers.get('cache-control')).toBe('public, max-age=31536000, immutable')
    expect(res.headers.get('etag')).toBe('"style-etag"')
    const missing = await app.fetch(
      new Request('http://localhost/v0/styles/midnight/9.9.9.json'),
      createAuthenticatedEnv({
        PRODUCT_USAGE: {
          writeDataPoint: event => productEvents.push(event ?? {}),
        } as AnalyticsEngineDataset,
        R2_ASSETS: { get: async () => null } as unknown as R2Bucket,
      }).env,
    )
    expect(missing.status).toBe(404)
    expect(productEvents.map(event => event.blobs)).toEqual([
      [
        'v1',
        'api.style_request',
        'atlas-api',
        'style_request',
        '/v0/styles/midnight/1.0.0.json',
        'style',
        'midnight:1.0.0',
        '',
        'success',
        '200',
      ],
      [
        'v1',
        'api.style_request',
        'atlas-api',
        'style_request',
        '/v0/styles/midnight/9.9.9.json',
        'style',
        'midnight:9.9.9',
        '',
        'failure',
        '404',
      ],
    ])
  })

  test('records newsletter subscription outcomes without recording the email', async () => {
    const productEvents: AnalyticsEngineDataPoint[] = []
    const { env } = createEnv({
      PRODUCT_USAGE: {
        writeDataPoint: event => productEvents.push(event ?? {}),
      } as AnalyticsEngineDataset,
      SUBSTACK_SESSION_COOKIE: '',
    })
    const res = await app.fetch(
      new Request('http://localhost/v0/meta/substack', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'subscriber@example.com' }),
      }),
      env,
    )

    expect(res.status).toBe(500)
    expect(productEvents[0]?.blobs).toEqual([
      'v1',
      'newsletter.subscription',
      'atlas-api',
      'newsletter',
      '/v0/meta/substack',
      '',
      '',
      '',
      'failure',
      '500',
    ])
    expect(JSON.stringify(productEvents)).not.toContain('subscriber@example.com')
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

  test('GET /divisions/v0.1 rejects an absent public API key', async () => {
    const { env } = createAuthenticatedEnv()
    const res = await app.fetch(new Request('http://localhost/divisions/v0.1'), env)

    expect(res.status).toBe(401)
    expect((await res.json()) as unknown).toEqual({
      error: 'invalid_api_key',
      message: 'A valid SaanSeoi public API key is required.',
    })
  })

  test('forwarded family aliases consume one rate-limit slot and usage event', async () => {
    for (const family of ['places', 'streets']) {
      const charges: string[] = []
      const events: unknown[] = []
      const { env } = createEnv({
        AUTH_MODE: 'required',
        API_RATE_LIMIT: {
          limit: async ({ key }: { key: string }) => {
            charges.push(key)
            return { success: charges.length === 1 }
          },
        } as RateLimit,
        API_USAGE: {
          writeDataPoint: event => events.push(event),
        } as AnalyticsEngineDataset,
      })
      const response = await app.fetch(
        apiRequest(`http://localhost/${family}/v0/missing`),
        env,
      )
      expect(response.status).not.toBe(429)
      expect(charges).toEqual(['api-key-1'])
      expect(events).toHaveLength(1)
    }
  })

  test('protected responses cannot be reused by downstream caches', async () => {
    const { env } = createEnv({ AUTH_MODE: 'required' })
    for (const request of [
      new Request('http://localhost/divisions/v0.1'),
      apiRequest('http://localhost/divisions/v0.1'),
      new Request('http://localhost/divisions/v0.1', {
        headers: { origin: 'https://saanseoi.hk' },
      }),
    ]) {
      const response = await app.fetch(request, env)
      expect(response.headers.get('cache-control')).toBe('no-store')
    }
  })

  test('an exhausted public-key lease is rejected before metering', async () => {
    let charges = 0
    const { env } = createEnv({
      AUTH_MODE: 'required',
      PUBLIC_KEY_LEASES: {
        get: async () => ({
          keyId: 'api-key-1',
          status: 'exhausted',
          nextCheckAt: Date.now() + 60_000,
        }),
      } as unknown as KVNamespace,
      API_RATE_LIMIT: {
        limit: async () => {
          charges++
          return { success: true }
        },
      } as RateLimit,
    })
    const response = await app.fetch(apiRequest('http://localhost/divisions/v0.1'), env)
    expect(response.status).toBe(429)
    expect(await response.json()).toMatchObject({ error: 'quota_exceeded' })
    expect(charges).toBe(0)
  })

  test('URL-shaped Origin values do not qualify for the first-party exemption', async () => {
    const { env } = createEnv({ AUTH_MODE: 'required' })
    for (const origin of [
      'https://saanseoi.hk/path',
      'https://user@saanseoi.hk',
      'https://saanseoi.hk?other',
    ]) {
      const response = await app.fetch(
        new Request('http://localhost/divisions/v0.1', { headers: { origin } }),
        env,
      )
      expect(response.status).toBe(401)
    }
  })

  test('GET /divisions/v0.1 returns 503 when public-key validation is unavailable', async () => {
    const { env } = createAuthenticatedEnv({
      PUBLIC_KEY_LEASES: {
        get: async () => {
          throw new Error('KV unavailable')
        },
      } as unknown as KVNamespace,
    })
    const res = await app.fetch(apiRequest('http://localhost/divisions/v0.1'), env)

    expect(res.status).toBe(503)
    expect((await res.json()) as unknown).toEqual({
      error: 'public_key_validation_unavailable',
      message: 'Public API key validation is temporarily unavailable. Please retry.',
    })
  })

  test('GET /divisions/v0.1 enforces public-key origin rules at the edge', async () => {
    const { env } = createAuthenticatedEnv({
      PUBLIC_KEY_LEASES: {
        get: async () => ({
          keyId: 'api-key-1',
          status: 'active' as const,
          nextCheckAt: Date.now() + 60_000,
          originPolicy: {
            allowedHostnames: ['maps.example.com'],
            blockedHostnames: ['rogue.example.com'],
          },
        }),
      } as unknown as KVNamespace,
    })
    const res = await app.fetch(
      apiRequest('http://localhost/divisions/v0.1', {
        headers: { origin: 'https://rogue.example.com' },
      }),
      env,
    )

    expect(res.status).toBe(403)
    expect((await res.json()) as unknown).toEqual({
      error: 'api_key_origin_not_allowed',
      message: 'This public API key is not allowed from this origin.',
    })
  })

  test('GET /divisions/v0.1 permits an absent API key when the local bypass is enabled', async () => {
    const { env } = createEnv({ AUTH_MODE: 'disabled' })
    const res = await app.fetch(new Request('http://localhost/divisions/v0.1'), env)
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

  test('GET /divisions/v0.1 permits keyless requests from saanseoi.hk', async () => {
    const { env } = createAuthenticatedEnv()
    const res = await app.fetch(
      new Request('http://localhost/divisions/v0.1', {
        headers: { origin: 'https://saanseoi.hk' },
      }),
      env,
    )
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

  test('GET /divisions/v0.1 keeps other origins behind public-key authentication', async () => {
    const { env } = createAuthenticatedEnv()
    const res = await app.fetch(
      new Request('http://localhost/divisions/v0.1', {
        headers: { origin: 'https://saanseoi.hk.example.com' },
      }),
      env,
    )

    expect(res.status).toBe(401)
    expect((await res.json()) as unknown).toEqual({
      error: 'invalid_api_key',
      message: 'A valid SaanSeoi public API key is required.',
    })
  })

  test('GET /divisions/v0.1 accepts preflight requests from saanseoi.hk', async () => {
    const { env } = createAuthenticatedEnv()
    const res = await app.fetch(
      new Request('http://localhost/divisions/v0.1', {
        method: 'OPTIONS',
        headers: {
          origin: 'https://saanseoi.hk',
          'access-control-request-method': 'GET',
        },
      }),
      env,
    )

    expect(res.status).toBe(204)
    expect(res.headers.get('access-control-allow-origin')).toBe('*')
  })

  test('GET /streets/v0/:id resolves to the latest minor and requires a public API key', async () => {
    const { env } = createAuthenticatedEnv()
    const res = await app.fetch(
      new Request('http://localhost/streets/v0/landsd-street-notice-example'),
      env,
    )

    expect(res.status).toBe(401)
    expect((await res.json()) as unknown).toEqual({
      error: 'invalid_api_key',
      message: 'A valid SaanSeoi public API key is required.',
    })
  })

  test('street history endpoints require a public API key', async () => {
    const { env } = createAuthenticatedEnv()
    for (const path of [
      '/streets/v0.1/landsd-street-notice-example/versions',
      '/streets/v0.1/landsd-street-notice-example/versions/1',
    ]) {
      const res = await app.fetch(new Request(`http://localhost${path}`), env)
      expect(res.status).toBe(401)
    }
  })

  test('GET /streets/v0.1/:id returns the latest PDF-evidenced materialised state', async () => {
    const { env } = createEnv({}, { streetDetail: true })
    const res = await app.fetch(
      apiRequest('http://localhost/streets/v0.1/landsd-street-notice-example'),
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
      version: 'http://localhost/streets/v0.1/landsd-street-notice-example/versions/1',
      versions: 'http://localhost/streets/v0.1/landsd-street-notice-example/versions',
    })
  })

  test('response links do not reflect query-string API credentials', async () => {
    const { env } = createAuthenticatedEnv({}, { streetDetail: true })
    const res = await app.fetch(
      new Request(
        `http://localhost/streets/v0.1/landsd-street-notice-example?access_token=${encodeURIComponent(testApiKey)}&view=full`,
      ),
      env,
    )

    expect(res.status).toBe(200)
    const body = await res.text()
    expect(body).not.toContain('access_token')
    expect(body).not.toContain(testApiKey)
    expect(body).toContain('view=full')
  })

  test('Places endpoints reject unbounded limits', async () => {
    const { env } = createEnv()
    for (const path of [
      '/places/v0?page[limit]=101',
      '/places/v0/by-cell/9/89283470cdbffff?limit=101',
      '/places/v0/search?q=sushi&limit=101',
    ]) {
      const res = await app.fetch(apiRequest(`http://localhost${path}`), env)
      expect(res.status).toBe(422)
      expect(await res.json()).toMatchObject({ error: 'validation_error' })
    }
  })

  test('GET /streets/v0.1/changelog replays LandsD events', async () => {
    const { env } = createEnv({}, { streetDetail: true })
    const res = await app.fetch(
      apiRequest('http://localhost/streets/v0.1/changelog'),
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

  test('GET /streets/v0.1/:id/versions exposes crawlable previous and next links', async () => {
    const { env } = createEnv({}, { streetDetail: true })
    const list = await app.fetch(
      apiRequest('http://localhost/streets/v0.1/landsd-street-notice-example/versions'),
      env,
    )
    const version = await app.fetch(
      apiRequest(
        'http://localhost/streets/v0.1/landsd-street-notice-example/versions/1',
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
      next: 'http://localhost/streets/v0.1/landsd-street-notice-example/versions/2',
      version: 'http://localhost/streets/v0.1/landsd-street-notice-example/versions/1',
      versions: 'http://localhost/streets/v0.1/landsd-street-notice-example/versions',
    })
    expect(versionBody.links).not.toHaveProperty('previous')
  })

  test('GET /divisions/v0.1 rejects a malformed public API key', async () => {
    const { env } = createAuthenticatedEnv()
    const res = await app.fetch(
      new Request('http://localhost/divisions/v0.1', {
        headers: { 'x-api-key': 'not-an-api-key' },
      }),
      env,
    )

    expect(res.status).toBe(401)
    expect((await res.json()) as unknown).toEqual({
      error: 'invalid_api_key',
      message: 'A valid SaanSeoi public API key is required.',
    })
  })

  test('GET /divisions/v0.1 accepts a public key and tracks usage by origin', async () => {
    const events: AnalyticsEngineDataPoint[] = []
    const { env, operations } = createAuthenticatedEnv({
      API_USAGE: {
        writeDataPoint: event => events.push(event ?? {}),
      } as AnalyticsEngineDataset,
    })
    const res = await app.fetch(
      new Request('http://localhost/divisions/v0.1', {
        headers: {
          'x-api-key': testApiKey,
          origin: 'https://example.com',
        },
      }),
      env,
    )

    expect(res.status).toBe(503)
    expect(operations).toEqual([])
    expect(events).toEqual([
      {
        indexes: ['api-key-1'],
        blobs: ['/divisions/v0.1', 'example.com'],
        doubles: [1],
      },
    ])
  })

  test('OPTIONS /divisions/v0.1 allows public-key browser requests', async () => {
    const { env } = createAuthenticatedEnv()
    const res = await app.fetch(
      new Request('http://localhost/divisions/v0.1', {
        method: 'OPTIONS',
        headers: {
          origin: 'https://example.com',
          'access-control-request-method': 'GET',
          'access-control-request-headers': 'x-api-key',
        },
      }),
      env,
    )

    expect(res.status).toBe(204)
    expect(res.headers.get('access-control-allow-origin')).toBe('*')
    expect(res.headers.get('access-control-allow-headers')?.toLowerCase()).toContain(
      'x-api-key',
    )
  })

  test('GET /divisions/v0.1 rate-limits a public key at the edge', async () => {
    const { env } = createAuthenticatedEnv({
      API_RATE_LIMIT: { limit: async () => ({ success: false }) } as RateLimit,
    })
    const res = await app.fetch(
      new Request('http://localhost/divisions/v0.1', {
        headers: { 'x-api-key': testApiKey },
      }),
      env,
    )

    expect(res.status).toBe(429)
    expect((await res.json()) as unknown).toEqual({
      error: 'rate_limit_exceeded',
      message: 'The API rate limit has been exceeded.',
    })
  })

  test('GET /v0/api API Endpoints resolve to the current minor without an API key', async () => {
    const { env } = createEnv()

    for (const path of [
      '/v0/api/releases',
      '/v0/api/families',
      '/v0/api/fields',
      '/v0/api/sources',
      '/v0/api/sourcePublishers',
    ]) {
      const res = await app.fetch(new Request(`http://localhost${path}`), env)

      expect(res.status).toBe(200)
      expect((await res.json()) as unknown).toEqual({ data: [] })
    }

    const legacyRes = await app.fetch(
      new Request('http://localhost/v0.1/api/apis'),
      env,
    )
    expect(legacyRes.status).toBe(404)

    const legacyFieldsRes = await app.fetch(
      new Request('http://localhost/v0.1/api/apiFields'),
      env,
    )
    expect(legacyFieldsRes.status).toBe(404)
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

  test('GET /divisions/v0.1 returns snapshot_not_ready when no division release set is published', async () => {
    const { env } = createEnv()
    const res = await app.fetch(apiRequest('http://localhost/divisions/v0.1'), env)
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

  test('GET /addresses/v0.1 returns snapshot_not_ready when no address release set is published', async () => {
    const { env } = createEnv()
    const res = await app.fetch(apiRequest('http://localhost/addresses/v0.1'), env)
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

  test('GET /addresses/v0.1/search validates matching-mode component requirements', async () => {
    const { env } = createEnv()

    const missingComponent = await app.fetch(
      apiRequest('http://localhost/addresses/v0.1/search?q=Harbour&match=component'),
      env,
    )
    const unexpectedComponent = await app.fetch(
      apiRequest(
        'http://localhost/addresses/v0.1/search?q=Harbour&match=prefix&component=street',
      ),
      env,
    )

    expect(missingComponent.status).toBe(422)
    expect(unexpectedComponent.status).toBe(422)
  })

  test('GET /addresses/v0.1/search returns snapshot_not_ready before searching', async () => {
    const { env } = createEnv()
    const res = await app.fetch(
      apiRequest('http://localhost/addresses/v0.1/search?q=Harbour&match=full-text'),
      env,
    )

    expect(res.status).toBe(503)
    const body = (await res.json()) as {
      httpStatus: number
      error: string
      message: string
    }
    expect(body).toEqual({
      httpStatus: 503,
      error: 'snapshot_not_ready',
      message: 'No active address snapshot is published.',
    })
  })

  test('GET /divisions/v0.1 returns 503 when atlas hits a transient D1 read failure', async () => {
    const productEvents: AnalyticsEngineDataPoint[] = []
    const { env } = createEnv(
      {
        PRODUCT_USAGE: {
          writeDataPoint: event => productEvents.push(event ?? {}),
        } as AnalyticsEngineDataset,
      },
      {
        failOnAll: () => true,
        failOnFirst: () => true,
        failOnRaw: () => true,
      },
    )
    const res = await app.fetch(
      new Request('http://localhost/divisions/v0.1', {
        headers: { origin: 'https://saanseoi.hk' },
      }),
      env,
    )
    const body = (await res.json()) as {
      error: string
      message: string
    }

    expect(res.status).toBe(503)
    expect(body).toEqual({
      error: 'service_unavailable',
      message: 'The atlas API is temporarily unavailable.',
    })
    expect(productEvents[0]?.blobs).toEqual([
      'v1',
      'api.request',
      'atlas-api',
      'api',
      '/divisions/v0.1',
      '',
      '',
      '',
      'failure',
      '503',
    ])
  })

  test('GET /divisions/v0.1 rejects invalid locale syntax', async () => {
    const { env } = createEnv()
    const res = await app.fetch(
      apiRequest('http://localhost/divisions/v0.1?locales=en,zh-hk-extra-piece'),
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

  test('GET /divisions/v0.1 accepts arbitrary valid locale tags and wildcard controls', async () => {
    const { env } = createEnv()

    for (const locales of ['fr-ca', 'EN,ZH_HANT', '*', 'null']) {
      const res = await app.fetch(
        apiRequest(
          `http://localhost/divisions/v0.1?locales=${encodeURIComponent(locales)}`,
        ),
        env,
      )

      expect(res.status).toBe(503)
    }
  })

  test('GET /openapi documents the stable registry routes', async () => {
    const { env } = createEnv()
    const res = await app.fetch(new Request('http://localhost/openapi'), env)
    const body = (await res.json()) as {
      paths: Record<string, Record<string, { operationId?: string }>>
      servers: Array<{ url: string }>
      'x-tagGroups': Array<{ name: string; tags: string[] }>
      components?: {
        schemas?: Record<
          string,
          { pattern?: string; required?: string[]; minimum?: number; maximum?: number }
        >
      }
    }

    expect(res.status).toBe(200)
    expect(body.paths['/v0.1/api/families']?.get?.operationId).toBe('listRegistryApis')
    expect(body.paths['/v0.1/api/endpoints/{id}']?.get?.operationId).toBe(
      'getRegistryEndpoint',
    )
    expect(body.paths['/v0.1/assets/{assetId}']).toBeDefined()
    expect(body.paths['/v0.1/styles/{style}/{version}']).toBeDefined()
    expect(body.paths['/v0.1/meta/health']).toBeDefined()
    expect(body.paths['/v0.1/meta/d1-placement-probe']).toBeUndefined()
    expect(body.paths['/divisions/v0.1']).toBeUndefined()
    expect(body.components?.schemas?.DivisionRelationships?.required).toContain(
      'hierarchy',
    )
    expect(body.components?.schemas?.Id?.pattern).toBe('^\\S+$')
    expect(body.components?.schemas).toHaveProperty('OvertureSourceItem')
    expect(body.components?.schemas).toHaveProperty('OtherSourceTypeItem')
    expect(body.components?.schemas).toHaveProperty('Sources')
    expect(body.paths['/latest/divisions']).toBeUndefined()
    expect(body.servers).toEqual([{ url: 'http://localhost:8787' }])
    expect(body['x-tagGroups']).toEqual([
      {
        name: 'Registry',
        tags: [
          'API Families',
          'API Releases',
          'API Fields',
          'API Endpoints',
          'Sources',
          'Source Versions',
          'Source Publishers',
        ],
      },
      { name: 'Assets', tags: ['Source assets'] },
      { name: 'Styles', tags: ['Map styles'] },
      { name: 'System', tags: ['Meta'] },
    ])
  })

  test('product OpenAPI documents expose one independently versioned API family', async () => {
    const { env } = createEnv()
    const divisionsRes = await app.fetch(
      new Request('http://localhost/openapi/divisions/v0.1'),
      env,
    )
    const addressesRes = await app.fetch(
      new Request('http://localhost/openapi/addresses/v0.1'),
      env,
    )
    const statisticsRes = await app.fetch(
      new Request('http://localhost/openapi/stats/v0.1'),
      env,
    )
    const placesRes = await app.fetch(
      new Request('http://localhost/openapi/places/v0.1'),
      env,
    )
    const divisionsCurrentRes = await app.fetch(
      new Request('http://localhost/openapi/divisions/v0'),
      env,
    )
    const divisions = (await divisionsRes.json()) as {
      paths: Record<string, unknown>
      tags?: Array<{ name: string }>
      'x-tagGroups'?: Array<{ name: string; tags: string[] }>
      info: { description?: string }
      components?: { schemas?: Record<string, unknown> }
    }
    const addresses = (await addressesRes.json()) as {
      paths: Record<string, unknown>
      components?: { schemas?: Record<string, unknown> }
    }
    const statistics = (await statisticsRes.json()) as {
      paths: Record<string, unknown>
      tags?: Array<{ name: string }>
      'x-tagGroups'?: Array<{ name: string; tags: string[] }>
      components?: { schemas?: Record<string, unknown> }
    }
    const places = (await placesRes.json()) as {
      paths: Record<string, unknown>
      tags?: Array<{ name: string }>
      components?: { schemas?: Record<string, unknown> }
    }
    const divisionsCurrent = (await divisionsCurrentRes.json()) as {
      paths: Record<string, unknown>
    }

    expect(divisionsRes.status).toBe(200)
    expect(divisions.paths['/divisions/v0.1']).toBeDefined()
    expect(divisions.paths['/addresses/v0.1']).toBeUndefined()
    expect(divisions.paths['/v0/meta/health']).toBeUndefined()
    expect(divisions.tags?.map(tag => tag.name)).toEqual(['Divisions', 'Sources'])
    expect(divisions['x-tagGroups']).toBeUndefined()
    expect(divisions.info.description).toContain('versions independently')
    expect(divisions.info.description).toContain('Registry')

    expect(addressesRes.status).toBe(200)
    expect(addresses.paths['/addresses/v0.1']).toBeDefined()
    expect(addresses.paths['/addresses/v0.1/search']).toBeDefined()
    expect(addresses.paths['/divisions/v0.1']).toBeUndefined()
    expect(addresses.paths['/v0.1/api/families']).toBeUndefined()
    expect(addresses.components?.schemas).toHaveProperty('Address')
    const address = addresses.components?.schemas?.Address as
      | { properties?: Record<string, unknown> }
      | undefined
    expect(address?.properties?.meta).toBeUndefined()
    const addressPointGeometry = addresses.components?.schemas?.AddressPointGeometry as
      | {
          description?: string
          properties?: Record<
            string,
            { enum?: string[]; maxItems?: number; minItems?: number }
          >
        }
      | undefined
    expect(addressPointGeometry?.description).toBe(
      'The address position as a WGS84 GeoJSON Point, when requested and available.',
    )
    expect(addressPointGeometry?.properties?.type?.enum).toEqual(['Point'])
    expect(addressPointGeometry?.properties?.coordinates).toMatchObject({
      minItems: 2,
      maxItems: 3,
    })
    expect(addresses.components?.schemas).not.toHaveProperty('Geometry')
    const addressAttributes = addresses.components?.schemas?.AddressAttributes as {
      properties: Record<string, { enum?: string[]; description?: string }>
    }
    expect(addressAttributes.properties.granularity?.enum).toEqual([
      'unknown',
      'site',
      'complex',
      'phase',
      'building',
      'section',
      'floor',
      'unit',
      'room',
      'room_part',
    ])
    expect(addressAttributes.properties).not.toHaveProperty('granularityProvenance')
    expect(addresses.components?.schemas).not.toHaveProperty('Division')
    const addressI18n = addresses.components?.schemas?.AddressI18n as
      | { description?: string; 'x-recordKeyName'?: string }
      | undefined
    const addressI18nAttributes = addresses.components?.schemas
      ?.AddressI18nAttributes as
      | {
          description?: string
          properties?: Record<
            string,
            { description?: string; enum?: unknown[]; examples?: unknown[] }
          >
        }
      | undefined
    expect(addressI18n?.description).toBe(
      'Localised address text and parsed components, keyed by requested locale.',
    )
    expect(addressI18n?.['x-recordKeyName']).toBe('en, zh-hant, …')
    expect(addressI18nAttributes?.description).toBe(
      'Address text and parsed components for one locale. Optional components are null when the source did not supply them.',
    )
    const addressI18nExamples = {
      formattedAddress: [
        "BLK A, PEARL COURT, 13 BELCHER'S STREET, CENTRAL & WESTERN DISTRICT, HK",
        'TOWER 1, ISLAND CREST, 8 FIRST STREET, CENTRAL & WESTERN DISTRICT, HK',
        'HOUSE 2, 35 BARKER ROAD, CENTRAL & WESTERN DISTRICT, HK',
        "ON NING BUILDING, 427 KING'S ROAD, EASTERN DISTRICT, HK",
      ],
      buildingName: [
        'FU TOR LOY SHOPPING CENTRE',
        'ON NING BUILDING',
        'GOLDEN MANSION',
        'LUCKY BUILDING',
        'WING WAH BUILDING',
      ],
      buildingNumberExpression: ['1', '8', '1A', '19B', '1000A'],
      buildingNumberFrom: ['1', '6'],
      buildingNumberTo: ['3', '6A'],
      buildingNumberConnector: [null],
      blockExpression: [
        'BLK A',
        'BLK B',
        'TWR 1',
        'HSE 2',
        'APT D1',
        'FLAT A',
        'MANSION A',
        'GARAGE A',
        'COMMERCIAL CENTRE',
        'TWR 1&2',
      ],
      blockType: [
        'block',
        'building',
        'tower',
        'house',
        'villa',
        'mansion',
        'apartment',
        'flat',
        'unit',
        'quarters',
        'phase',
        'stage',
        'commercial',
        'retail',
        'parking',
        'garage',
        'other',
      ],
      blockRef: ['A', 'B', '1', 'D1', '1&2'],
      blockTypeBeforeNumber: [true, null],
      phaseExpression: [
        'PHASE I',
        'PHASE 2',
        'PHASE IIIB',
        'THE HIGHLAND',
        'CHONG CHIEN COURT',
        null,
      ],
      phaseName: ['PHASE', 'THE HIGHLAND', 'STAGE', null],
      phaseRef: ['I', 'II', 'IIIB', '3', null],
      estateName: [
        'FAIRVIEW PARK',
        'HONG LOK YUEN',
        'PALM SPRINGS',
        'DISCOVERY BAY',
        'MARINA COVE',
        'WHAMPOA ESTATE',
      ],
      streetName: [
        'CASTLE PEAK ROAD',
        "KING'S ROAD",
        'NATHAN ROAD',
        'CANTON ROAD',
        "QUEEN'S ROAD WEST",
        'LAI CHI KOK ROAD',
      ],
    }
    for (const [field, example] of Object.entries(addressI18nExamples)) {
      expect(addressI18nAttributes?.properties?.[field]?.description).toBeTruthy()
      expect(addressI18nAttributes?.properties?.[field]?.examples).toEqual(example)
    }
    expect(addressI18nAttributes?.properties?.blockType?.enum).toEqual([
      ...addressI18nExamples.blockType,
      null,
    ])
    expect(divisions.components?.schemas).toHaveProperty('Division')
    expect(divisions.components?.schemas).not.toHaveProperty('Address')
    const divisionAttributes = divisions.components?.schemas?.DivisionAttributes as
      | { description?: string; properties?: Record<string, unknown> }
      | undefined
    const divisionRelationships = divisions.components?.schemas
      ?.DivisionRelationships as { description?: string } | undefined
    const divisionI18n = divisions.components?.schemas?.DivisionI18n as
      | { description?: string; 'x-recordKeyName'?: string }
      | undefined
    const divisionHierarchyIdentifier =
      divisions.components?.schemas?.DivisionHierarchyIdentifier
    const sources = divisions.components?.schemas?.Sources as
      | {
          'x-additionalPropertiesName'?: string
          additionalProperties?: { description?: string }
          properties?: Record<string, { description?: string }>
        }
      | undefined
    const jsonApiLinkMap = divisions.components?.schemas?.JsonApiLinkMap as
      | {
          additionalProperties?: { description?: string }
          properties?: Record<string, { description?: string }>
        }
      | undefined
    const divisionResource = divisions.components?.schemas?.Division as
      | {
          properties?: Record<string, { allOf?: Array<{ description?: string }> }>
        }
      | undefined
    expect(divisionAttributes?.properties).not.toHaveProperty('sourceKeys')
    expect(divisionAttributes?.properties).not.toHaveProperty('overture')
    expect(divisionAttributes?.properties).toHaveProperty('wikidataId')
    expect(divisionAttributes?.properties).not.toHaveProperty('wikidata')
    const divisionsOpenApi = JSON.stringify(divisions)
    expect(divisions.components?.schemas).not.toHaveProperty('Geometry')
    expect(divisionsOpenApi).toContain('division-areas')
    expect(divisionsOpenApi).toContain('division-boundaries')
    expect(divisionsOpenApi).toContain('MultiPolygon')
    expect(divisionsOpenApi).toContain('MultiLineString')
    expect(divisionsOpenApi).not.toContain('GeometryCollection')
    expect(divisionsOpenApi).not.toContain('MultiPoint')
    expect(divisionAttributes?.properties?.wikidataId).toMatchObject({
      examples: ['Q55621441', 'Q7820922', 'Q16923583', null],
    })
    expect(divisionsOpenApi).toContain('hkgov-censtatd-landclipped')
    expect(divisionsOpenApi).toContain('hkgov-pland-new-town')
    expect(divisionResource?.properties).not.toHaveProperty('meta')
    expect(divisionAttributes?.description).toBe(
      'Canonical data for this resource, excluding its relationships.',
    )
    expect(divisionRelationships?.description).toBe(
      "Resource linkage to related SaanSeoi records. Use `include` to return those records in the document's `included` array.",
    )
    expect(divisionI18n?.description).toBe(
      'Localised names and naming data, keyed by requested locale (for example `en` or `zh-Hant`).',
    )
    expect(divisionI18n?.['x-recordKeyName']).toBe('en, zh-hant, …')
    expect(JSON.stringify(divisionHierarchyIdentifier)).toContain(
      'Summary details for the ancestor division, provided with the resource linkage.',
    )
    expect(JSON.stringify(divisionHierarchyIdentifier)).toContain(
      "The ancestor division's available display name.",
    )
    expect(JSON.stringify(divisionHierarchyIdentifier)).toContain(
      "The ancestor division's source classification, such as `country`, `dependency` or `region`.",
    )
    expect(sources?.properties?.overture?.description).toBe(
      'Attribution provided by Overture Maps. Each item identifies the source record for this property.',
    )
    expect(sources?.additionalProperties?.description).toBe(
      "Attribution from another source provider. The property key is that provider's identifier, and each item follows that provider's source-item structure.",
    )
    expect(sources?.['x-additionalPropertiesName']).toBe('another source provider')
    expect(divisionResource?.properties?.links?.allOf?.[1]?.description).toBe(
      'Links for this division resource, including its canonical URL.',
    )
    expect(jsonApiLinkMap?.properties?.self?.description).toBe(
      'The URL of this resource or response.',
    )
    expect(jsonApiLinkMap?.properties?.first?.description).toBe(
      'The first page of a paginated collection, when available.',
    )
    expect(jsonApiLinkMap?.properties?.prev?.description).toBe(
      'The preceding page of a paginated collection, when one exists.',
    )
    expect(jsonApiLinkMap?.properties?.next?.description).toBe(
      'The following page of a paginated collection, when one exists.',
    )
    expect(jsonApiLinkMap?.additionalProperties?.description).toBe(
      'An additional named link supplied by SaanSeoi. Its value depends on the link name.',
    )

    expect(placesRes.status).toBe(200)
    expect(places.paths['/places/v0.1']).toBeDefined()
    expect(places.paths['/places/v0.1/{id}']).toBeDefined()
    expect(places.paths['/places/v0.1/by-cell/{h3Level}/{h3Cell}']).toBeDefined()
    expect(places.paths['/places/v0.1/search']).toBeDefined()
    expect(places.paths['/divisions/v0.1']).toBeUndefined()
    expect(places.tags?.map(tag => tag.name)).toEqual(['Places', 'Sources'])
    expect(places.components?.schemas).toHaveProperty('Place')
    expect(places.components?.schemas).toHaveProperty('PlacesListResponse')
    expect(places.components?.schemas).toHaveProperty('PlaceCollectionResource')
    expect(places.components?.schemas).toHaveProperty('PlaceGeometry')
    expect(places.components?.schemas).toHaveProperty('PlaceTaxonomy')
    expect(JSON.stringify(places.components?.schemas?.Place)).toContain('geometry')
    expect(JSON.stringify(places.components?.schemas?.Place)).toContain('taxonomy')
    expect(JSON.stringify(places.components?.schemas?.Place)).not.toContain(
      'taxonomyPrimary',
    )
    expect(JSON.stringify(places.components?.schemas?.Place)).not.toContain(
      'taxonomyHierarchy',
    )
    expect(JSON.stringify(places.components?.schemas?.Place)).not.toContain(
      'taxonomyAlternates',
    )
    expect(JSON.stringify(places.components?.schemas?.Place)).not.toContain('"lng"')
    expect(JSON.stringify(places.components?.schemas?.Place)).not.toContain('"lat"')
    expect(places.components?.schemas).not.toHaveProperty('PlaceAddress')
    expect(places.components?.schemas).not.toHaveProperty('PlaceSourceKeys')
    expect(places.components?.schemas).not.toHaveProperty('OverturePlaceSourceKeys')
    expect(places.components?.schemas).toHaveProperty('PlaceI18n')
    expect(JSON.stringify(places.components?.schemas?.PlaceI18n)).toContain(
      'freeformAddress',
    )
    expect(places.components?.schemas).toHaveProperty('PlaceSource')
    expect(places.components?.schemas).toHaveProperty('PlaceDivision')
    expect(places.components?.schemas).toHaveProperty('PlaceCellResult')
    expect(places.components?.schemas).toHaveProperty('PlaceSearchResult')
    expect(places.components?.schemas).toHaveProperty('ConfidenceScore')
    expect(places.components?.schemas).toHaveProperty('HttpUrl')
    expect(places.components?.schemas).toHaveProperty('EmailStr')
    expect(places.components?.schemas).toHaveProperty('PhoneNumber')
    expect(JSON.stringify(places.components?.schemas?.Place)).toContain(
      '#/components/schemas/ConfidenceScore',
    )
    expect(JSON.stringify(places.components?.schemas?.Place)).toContain(
      '#/components/schemas/HttpUrl',
    )
    expect(JSON.stringify(places.components?.schemas?.Place)).toContain(
      '#/components/schemas/EmailStr',
    )
    expect(JSON.stringify(places.components?.schemas?.Place)).toContain(
      '#/components/schemas/PhoneNumber',
    )
    expect(JSON.stringify(places.components?.schemas?.ConfidenceScore)).toContain(
      'Confidence score between 0.0 and 1.0.',
    )
    expect(JSON.stringify(places.components?.schemas?.HttpUrl)).toContain(
      'A type that will accept any http or https URL.',
    )
    expect(JSON.stringify(places.components?.schemas?.EmailStr)).toContain(
      'Validate email addresses.',
    )
    expect(JSON.stringify(places.components?.schemas?.PhoneNumber)).toContain(
      'An international phone number.',
    )
    expect(JSON.stringify(places.components?.schemas?.Place)).toContain(
      'The requested Place record.',
    )
    expect(JSON.stringify(places.components?.schemas?.Place)).toContain(
      'The basic level category of a place.',
    )
    expect(JSON.stringify(places.components?.schemas?.Place)).not.toContain(
      '"addresses":',
    )
    expect(JSON.stringify(places.components?.schemas?.Place)).toContain('sources')

    type OpenApiField = {
      description?: string
      allOf?: Array<{ description?: string; examples?: unknown[] }>
      enum?: unknown[]
      examples?: unknown[]
    }
    type OpenApiObjectSchema = {
      description?: string
      properties?: Record<string, OpenApiField>
    }
    const placeSchemas = places.components?.schemas as
      | Record<string, OpenApiObjectSchema>
      | undefined
    const expectPlaceFieldsDescribed = (schemaName: string, fields: string[]) => {
      const properties = placeSchemas?.[schemaName]?.properties
      for (const field of fields) {
        const property = properties?.[field]
        expect(
          property?.description ??
            property?.allOf?.find(item => item.description)?.description,
        ).toBeTruthy()
      }
    }
    expect(placeSchemas?.PlaceSource?.description).toBe(
      'Information about the source data used to assemble the place feature.',
    )
    expectPlaceFieldsDescribed('PlaceSource', [
      'property',
      'dataset',
      'license',
      'record_id',
      'update_time',
      'confidence',
      'provider',
      'resource',
      'version',
      'between',
    ])
    expectPlaceFieldsDescribed('PlaceI18n', [
      'snapshotId',
      'placeId',
      'locale',
      'name',
      'nameVariant',
      'nameAlts',
      'brandName',
      'brandNameVariant',
      'brandNameAlts',
      'freeformAddress',
      'provenance',
    ])
    expectPlaceFieldsDescribed('PlaceCollectionAttributes', [
      'referenceName',
      'basicCategory',
      'operatingStatus',
      'wikidataId',
      'websites',
      'socials',
      'emails',
      'phones',
      'confidence',
      'firstSeenMonth',
      'lastSeenMonth',
      'createdAt',
      'updatedAt',
      'snapshotId',
      'releaseId',
      'addressSnapshotId',
      'address2dId',
      'address3dId',
      'sources',
    ])
    expect(placeSchemas?.PlaceCollectionI18nValue?.properties?.name?.examples).toEqual([
      "Ebeneezer's Kebabs & Pizzeria",
      '百佳超級市場',
      null,
    ])
    expect(
      placeSchemas?.PlaceCollectionI18nValue?.properties?.freeformAddress?.examples,
    ).toEqual(['Shop 10, Ngong Ping 360, Lantau Island', '74 San Hing St', null])
    expect(placeSchemas?.PlaceDivision?.properties?.level?.examples).toEqual([
      0,
      1,
      2,
      4,
      6,
      null,
    ])
    expect(placeSchemas?.PlaceDivision?.properties?.locale?.examples).toEqual([
      'en',
      'zh-hant',
      'zh-hans',
      null,
    ])
    for (const schemaName of [
      'Place',
      'PlaceI18n',
      'PlaceSource',
      'PlaceTaxonomy',
      'PlaceCollectionTaxonomy',
      'PlaceCollectionI18n',
      'PlaceCollectionI18nValue',
      'PlaceCollectionAttributes',
      'PlaceCollectionResource',
      'PlaceResponse',
      'PlacesListResponse',
    ]) {
      expect(placeSchemas?.[schemaName]?.description).toBeTruthy()
    }

    expect(statisticsRes.status).toBe(200)
    expect(statistics.paths['/stats/v0.1/registry']).toBeDefined()
    expect(statistics.paths['/stats/v0.1/registry/fields']).toBeDefined()
    expect(statistics.paths['/stats/v0.1/registry/search']).toBeDefined()
    const statisticsRegistryPaths = Object.entries(statistics.paths).filter(([path]) =>
      path.startsWith('/stats/v0.1/registry'),
    )
    expect(statisticsRegistryPaths.length).toBeGreaterThan(0)
    for (const [, pathItem] of statisticsRegistryPaths) {
      const parameters = (
        pathItem as {
          get?: {
            parameters?: Array<{
              in?: string
              name?: string
              description?: string
            }>
          }
        }
      ).get?.parameters
      for (const parameter of parameters ?? []) {
        if (parameter.in === 'query') {
          expect(parameter.name).toBeTruthy()
          expect(parameter.description).toBeTruthy()
        }
      }
    }
    expect(statistics.paths['/divisions/v0.1']).toBeUndefined()
    expect(statistics.tags?.map(tag => tag.name)).toEqual([
      'Registry',
      'Statistics',
      'Sources',
    ])
    expect(statistics['x-tagGroups']).toBeUndefined()
    type StatisticField = OpenApiField & {
      properties?: Record<string, OpenApiField>
    }
    type StatisticSchema = OpenApiObjectSchema & {
      properties?: Record<string, StatisticField>
    }
    const statisticSchemas = statistics.components?.schemas as
      | Record<string, StatisticSchema>
      | undefined
    const expectStatisticFieldsDescribed = (schemaName: string, fields: string[]) => {
      const properties = statisticSchemas?.[schemaName]?.properties
      for (const field of fields) {
        const property = properties?.[field]
        expect(
          property?.description ??
            property?.allOf?.find(item => item.description)?.description,
        ).toBeTruthy()
      }
    }
    expectStatisticFieldsDescribed('Statistic', [
      'type',
      'id',
      'attributes',
      'relationships',
      'links',
    ])
    expectStatisticFieldsDescribed('StatisticField', ['type', 'id', 'attributes'])
    const statisticAttributes = statisticSchemas?.Statistic?.properties?.attributes
    const statisticId = statisticSchemas?.Statistic?.properties?.id
    expect(
      statisticId?.examples ??
        statisticId?.allOf?.find(item => item.examples)?.examples,
    ).toEqual([
      'stats:2650b1e3a7fe8a269919d9b2e97e54304d0e3db607748f2c51e03ce1b2f0f5dd',
      'stats:2e16ff6629a00669a571b4e514b3d6a9a6063b56964d6bec3981780dd4e219e4',
    ])
    expect(statisticAttributes?.properties?.datasetCode?.examples).toEqual([
      'ds-hk-hkgov-censtatd-division-statistic-permanent-living-quarters',
      'ds-hk-hkgov-censtatd-division-statistic-major-housing-estates',
    ])
    const statisticFieldAttributes =
      statisticSchemas?.StatisticField?.properties?.attributes
    expect(statisticFieldAttributes?.properties?.statisticKind?.enum).toEqual([
      'count',
      'quantity',
      'proportion',
      'ratio',
      'rate',
      'density',
      'index',
      'unreviewed',
    ])
    expect(statisticFieldAttributes?.properties?.aggregation?.enum).toEqual([
      'none',
      'total',
      'mean',
      'median',
      'minimum',
      'maximum',
      'percentile',
      'unreviewed',
    ])
    expect(statisticAttributes?.description).toBeTruthy()
    for (const field of [
      'datasetCode',
      'referencePeriod',
      'geography',
      'dimensions',
      'values',
      'comparability',
      'sourceReleaseId',
      'sourceFeatureRef',
      'createdAt',
      'updatedAt',
    ]) {
      expect(
        statisticAttributes?.properties?.[field]?.description ??
          statisticAttributes?.properties?.[field]?.allOf?.find(
            item => item.description,
          )?.description,
      ).toBeTruthy()
    }
    expect(statisticSchemas?.Statistic?.description).toBeTruthy()
    expect(statisticSchemas?.StatisticField?.description).toBeTruthy()
    expect(
      statisticSchemas?.StatisticsGeographiesResponse?.properties?.meta?.description,
    ).toBeTruthy()
    expect(
      statisticSchemas?.StatisticsGeographiesResponse?.properties?.values?.description,
    ).toBeTruthy()
    expect(
      statisticSchemas?.StatisticsSeriesResponse?.properties?.meta?.description,
    ).toBeTruthy()
    expect(
      statisticSchemas?.StatisticsSeriesResponse?.properties?.valuesByReferencePeriod
        ?.description,
    ).toBeTruthy()

    expect(divisionsCurrentRes.status).toBe(200)
    expect(divisionsCurrent.paths['/divisions/v0']).toBeDefined()
    expect(divisionsCurrent.paths['/divisions/v0.1']).toBeUndefined()
  })

  test('OpenAPI documents use the requested documentation locale', async () => {
    const { env } = createEnv()
    const [res, divisionsRes] = await Promise.all([
      app.fetch(
        new Request('http://localhost/openapi/registry/v0.1?locale=zh-Hant'),
        env,
      ),
      app.fetch(
        new Request('http://localhost/openapi/divisions/v0.1?locale=zh-Hant'),
        env,
      ),
    ])
    const body = (await res.json()) as {
      info: { description?: string }
      paths?: Record<
        string,
        {
          get?: {
            parameters?: Array<{ name?: string; description?: string }>
            responses?: Record<string, { description?: string }>
          }
        }
      >
      tags?: Array<{
        description?: string
        name: string
        'x-displayName'?: string
      }>
      'x-tagGroups'?: Array<{ name: string }>
    }
    const divisions = (await divisionsRes.json()) as {
      components?: {
        schemas?: Record<
          string,
          {
            description?: string
            properties?: Record<
              string,
              {
                description?: string
                enum?: Array<string | number | boolean | null>
                maxItems?: number
                minItems?: number
              }
            >
            anyOf?: Array<{
              description?: string
              properties?: Record<
                string,
                {
                  description?: string
                  enum?: Array<string | number | boolean | null>
                  maxItems?: number
                  minItems?: number
                }
              >
            }>
          }
        >
      }
      paths?: Record<
        string,
        {
          get?: {
            parameters?: Array<{ name?: string; description?: string }>
            responses?: Record<string, { description?: string }>
          }
        }
      >
      tags?: Array<{ name: string; 'x-displayName'?: string }>
    }

    expect(res.status).toBe(200)
    expect(body.info.description).toContain('SaanSeoi API 的目錄')
    expect(body.info.description).not.toContain('__saanseoi_openapi_i18n__')
    expect(body.tags?.find(tag => tag.name === 'API Releases')?.description).toContain(
      '歷史發布版本',
    )
    expect(body.tags?.find(tag => tag.name === 'Map styles')?.description).toContain(
      'MapLibre 樣式規格',
    )
    expect(body.tags?.find(tag => tag.name === 'Sources')?.['x-displayName']).toBe(
      '來源',
    )
    expect(
      body.paths?.['/v0.1/api/families']?.get?.responses?.['200']?.description,
    ).toBe('列出API 家族。')
    expect(body.paths?.['/v0.1/api/families']?.get?.parameters?.[0]?.description).toBe(
      '整數。',
    )
    expect(body['x-tagGroups']?.map(group => group.name)).toEqual([
      '目錄',
      '資產',
      '樣式',
      '系統',
    ])
    expect(divisionsRes.status).toBe(200)
    expect(
      divisions.paths?.['/divisions/v0.1']?.get?.parameters?.find(
        parameter => parameter.name === 'catalogRevision',
      )?.description,
    ).toBe('不可變的 API 家族及區域目錄檢查點。')
    expect(
      divisions.tags?.find(tag => tag.name === 'Divisions')?.['x-displayName'],
    ).toBe('分區')
    expect(divisions.tags?.find(tag => tag.name === 'Sources')?.['x-displayName']).toBe(
      '來源',
    )
    expect(divisions.components?.schemas?.DivisionGeometry?.description).toBe(
      '分區的地理形狀。如有提供，會以 WGS 84 的 Point、Polygon 或 MultiPolygon 表示。',
    )
    const pointGeometry = divisions.components?.schemas?.DivisionGeometry?.anyOf?.find(
      schema => schema.properties?.type?.enum?.includes('Point'),
    )
    expect(pointGeometry?.properties?.coordinates?.description).toBe(
      'WGS 84 座標。其巢狀層級由幾何類型決定。',
    )
    expect(pointGeometry?.properties?.coordinates?.minItems).toBe(2)
    expect(pointGeometry?.properties?.coordinates?.maxItems).toBe(3)
    expect(
      divisions.components?.schemas?.DivisionAttributes?.properties?.level?.description,
    ).toBe('此分區在標準層級中的位置。較低的層級代表較廣闊的區域。')
    expect(
      divisions.components?.schemas?.DivisionAttributes?.properties?.geometry
        ?.description,
    ).toBe(
      '分區的地理形狀。如有提供，會以 WGS 84 的 Point、Polygon 或 MultiPolygon 表示。',
    )
    expect(
      divisions.components?.schemas?.DivisionGeometry?.anyOf
        ?.map(schema => schema.properties?.type?.enum?.[0])
        .sort(),
    ).toEqual(['MultiPolygon', 'Point', 'Polygon'])
    expect(
      divisions.components?.schemas?.DivisionGeometry?.anyOf?.find(schema =>
        schema.properties?.type?.enum?.includes('Point'),
      )?.description,
    ).toBe('單一座標位置；用於以一個位置而非區域表示的分區。')
    expect(
      divisions.paths?.['/divisions/v0.1/sources']?.get?.parameters?.find(
        parameter => parameter.name === 'sourceRelease',
      )?.description,
    ).toBe('全域唯一的來源發布版本代碼。')
    expect(
      divisions.paths?.['/divisions/v0.1/sources']?.get?.responses?.['200']
        ?.description,
    ).toBe('列出一個確切來源發布版本的來源記錄，或以 NDJSON 串流傳回。')
    expect(
      divisions.components?.schemas?.SourceRecordPin?.properties?.apiReleaseSetCode
        ?.description,
    ).toBe(
      '若為標準 sourceRelease 固定版本則為 null；該固定版本刻意獨立於 API 發布集合。',
    )
  })

  test('major-version OpenAPI documents resolve to the current minor contract', async () => {
    const { env } = createEnv()
    const [registryRes, placesRes, streetsRes] = await Promise.all([
      app.fetch(new Request('http://localhost/openapi/registry/v0'), env),
      app.fetch(new Request('http://localhost/openapi/places/v0'), env),
      app.fetch(new Request('http://localhost/openapi/streets/v0'), env),
    ])
    const registry = (await registryRes.json()) as { paths: Record<string, unknown> }
    const places = (await placesRes.json()) as { paths: Record<string, unknown> }
    const streets = (await streetsRes.json()) as { paths: Record<string, unknown> }

    expect(registryRes.status).toBe(200)
    expect(registry.paths['/v0/api/families']).toBeDefined()
    expect(registry.paths['/v0.1/api/families']).toBeUndefined()

    expect(placesRes.status).toBe(200)
    expect(places.paths['/places/v0']).toBeDefined()
    expect(places.paths['/places/v0/{id}']).toBeDefined()
    expect(places.paths['/places/v0.1']).toBeUndefined()
    expect(places.paths['/places/v0.1/{id}']).toBeUndefined()

    expect(streetsRes.status).toBe(200)
    expect(streets.paths['/streets/v0/{id}']).toBeDefined()
    expect(streets.paths['/streets/v0.1/{id}']).toBeUndefined()
  })

  test('GET /docs scopes the version selector to the requested API family', async () => {
    const { env } = createEnv()
    const res = await app.fetch(
      new Request('http://localhost/docs?family=divisions'),
      env,
    )
    const html = await res.text()

    expect(res.status).toBe(200)
    expect(html).toContain('/openapi/divisions/v0')
    expect(html).toContain('/openapi/divisions/v0.1')
    expect(html).not.toContain('/openapi/addresses/v0.1')
  })

  test('GET /divisions/v0.1/sources requires one exact source release', async () => {
    const { env } = createEnv()
    const res = await app.fetch(
      apiRequest('http://localhost/divisions/v0.1/sources'),
      env,
    )

    expect(res.status).toBe(422)
    expect(await res.json()).toMatchObject({ error: 'validation_error' })
  })

  test('Places exposes source discovery and validates JSON and NDJSON on both versions', async () => {
    const { env } = createEnv()
    const response = await app.fetch(
      new Request('http://localhost/openapi/places/v0.1'),
      env,
    )
    const document = (await response.json()) as { paths: Record<string, unknown> }
    expect(document.paths['/places/v0.1/source-releases']).toBeDefined()
    expect(document.paths['/places/v0.1/sources']).toBeDefined()
    for (const version of ['v0', 'v0.1']) {
      for (const format of ['json', 'ndjson']) {
        const res = await app.fetch(
          apiRequest(`http://localhost/places/${version}/sources?format=${format}`),
          env,
        )
        expect(res.status).toBe(422)
        expect(await res.json()).toMatchObject({ error: 'validation_error' })
      }
    }
  })

  test('GET /divisions/v0.1/sources validates NDJSON requests before streaming', async () => {
    const { env } = createEnv()
    const res = await app.fetch(
      apiRequest('http://localhost/divisions/v0.1/sources?format=ndjson'),
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

  test('POST /v0/meta/substack applies its dedicated abuse limit before side effects', async () => {
    const originalFetch = globalThis.fetch
    const fetchCalls: Array<RequestInfo | URL> = []
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      fetchCalls.push(input)
      return Response.json({ ok: true })
    }) as typeof fetch

    try {
      const { env, operations } = createEnv({
        NEWSLETTER_RATE_LIMIT: {
          limit: async () => ({ success: false }),
        } as RateLimit,
      })
      const res = await app.fetch(
        new Request('http://localhost/v0/meta/substack', {
          method: 'POST',
          headers: {
            'cf-connecting-ip': '203.0.113.10',
            'content-type': 'application/json',
          },
          body: JSON.stringify({ email: 'hello@example.com' }),
        }),
        env,
      )

      expect(res.status).toBe(429)
      expect(res.headers.get('retry-after')).toBe('60')
      expect(await res.json()).toMatchObject({ error: 'rate_limit_exceeded' })
      expect(operations).toHaveLength(0)
      expect(fetchCalls).toHaveLength(0)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test('POST /v0/meta/substack is idempotent for subscribed addresses', async () => {
    const originalFetch = globalThis.fetch
    const fetchCalls: Array<RequestInfo | URL> = []
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      fetchCalls.push(input)
      return Response.json({ ok: true })
    }) as typeof fetch

    try {
      const { env, operations } = createEnv(
        {},
        {
          newsletterSubscription: {
            status: 'subscribed',
            updatedAt: new Date().toISOString(),
          },
        },
      )
      const res = await app.fetch(
        new Request('http://localhost/v0/meta/substack', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ email: 'HELLO@example.com' }),
        }),
        env,
      )

      expect(res.status).toBe(200)
      expect((await res.json()) as unknown).toEqual({
        ok: true,
        message: 'This email address is already subscribed.',
        subscriptionState: 'subscribed',
      })
      expect(operations).toHaveLength(0)
      expect(fetchCalls).toHaveLength(0)
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
