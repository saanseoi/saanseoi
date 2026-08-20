import { expect, test } from 'bun:test'
import { Database, type SQLQueryBindings } from 'bun:sqlite'

import {
  completeAccessAnalyticsDownload,
  getAccessMetrics,
  rebuildAccessAnalyticsAllTimeCache,
  recordAccessAnalyticsEvent,
  resolveApiReleaseSetAccessAttribution,
} from './accessAnalytics'

function createAnalyticsD1() {
  const sqlite = new Database(':memory:')
  sqlite.exec(`
    CREATE TABLE accessAnalyticsDaily (
      day TEXT NOT NULL,
      scope TEXT NOT NULL,
      entityId TEXT NOT NULL,
      metrics TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      PRIMARY KEY (day, scope, entityId)
    );
    CREATE TABLE accessAnalyticsIdempotency (
      eventType TEXT NOT NULL,
      requestIdentity TEXT PRIMARY KEY,
      eligible INTEGER NOT NULL,
      counted INTEGER NOT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
    CREATE TABLE accessAnalyticsRollups (
      period TEXT NOT NULL,
      scope TEXT NOT NULL,
      entityId TEXT NOT NULL,
      metrics TEXT NOT NULL,
      asOf TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      PRIMARY KEY (period, scope, entityId)
    );
  `)

  function statement(query: string) {
    const prepared = sqlite.query(query)
    let values: SQLQueryBindings[] = []
    const bound = {
      bind(...nextValues: SQLQueryBindings[]) {
        values = nextValues
        return bound
      },
      async all<T>() {
        return { results: prepared.all(...values) as T[] }
      },
      async first<T>() {
        return (prepared.get(...values) as T | null) ?? null
      },
      async run() {
        const result = prepared.run(...values)
        return { meta: { changes: result.changes } }
      },
    }
    return bound
  }

  return {
    db: {
      prepare: statement,
      async batch(statements: Array<{ run: () => Promise<unknown> }>) {
        sqlite.exec('BEGIN')
        try {
          const results = []
          for (const prepared of statements) results.push(await prepared.run())
          sqlite.exec('COMMIT')
          return results
        } catch (error) {
          sqlite.exec('ROLLBACK')
          throw error
        }
      },
    } as unknown as D1Database,
    close() {
      sqlite.close()
    },
  }
}

test('attributes an API ReleaseSet to distinct publishers and keeps source lineage', async () => {
  const queries: string[] = []
  const db = {
    prepare(query: string) {
      queries.push(query)
      return {
        bind() {
          return {
            async all() {
              return {
                results: [
                  {
                    apiReleaseSetId: 'set-1',
                    apiReleaseSetCode: 'api-divisions-2026.0',
                    sourceReleaseId: 'source-1',
                    sourceReleaseCode: 'dr-one',
                    publisherCode: 'hkgov',
                  },
                  {
                    apiReleaseSetId: 'set-1',
                    apiReleaseSetCode: 'api-divisions-2026.0',
                    sourceReleaseId: 'source-2',
                    sourceReleaseCode: 'dr-two',
                    publisherCode: 'hkgov',
                  },
                  {
                    apiReleaseSetId: 'set-1',
                    apiReleaseSetCode: 'api-divisions-2026.0',
                    sourceReleaseId: 'source-3',
                    sourceReleaseCode: 'dr-three',
                    publisherCode: 'overture',
                  },
                ],
              }
            },
          }
        },
      }
    },
    async batch(statements: Array<{ run: () => Promise<unknown> }>) {
      return Promise.all(statements.map(statement => statement.run()))
    },
  } as unknown as D1Database

  await expect(
    resolveApiReleaseSetAccessAttribution(db, 'api-divisions-2026.0'),
  ).resolves.toEqual({
    apiReleaseSetId: 'set-1',
    apiReleaseSetCode: 'api-divisions-2026.0',
    contributingSourceReleaseIds: ['source-1', 'source-2', 'source-3'],
    contributingSourceReleaseCodes: ['dr-one', 'dr-two', 'dr-three'],
    publisherCodes: ['hkgov', 'overture'],
    surface: 'api_release_set',
  })
  expect(queries[0]).toContain("snapshotSources.role <> 'lookup'")
})

test('deduplicates a serving retry without retaining the request event', async () => {
  const { db, close } = createAnalyticsD1()
  const event = {
    eventType: 'api_request' as const,
    httpStatus: 200,
    publisherCodes: ['overture'],
    requestIdentity: 'cf-ray:retry-1',
    sourceReleaseId: 'source-1',
    surface: 'source' as const,
    occurredAt: '2026-08-21T00:00:00.000Z',
  }

  try {
    await recordAccessAnalyticsEvent(db, event)
    await recordAccessAnalyticsEvent(db, event)

    await expect(getAccessMetrics(db, 'publisher', 'overture')).resolves.toEqual({
      metrics: { apiRequests: 1 },
      asOf: '2026-08-21T00:00:00.000Z',
    })
  } finally {
    close()
  }
})

test('metrics count successful requests and completed downloads only', async () => {
  let query = ''
  const db = {
    prepare(value: string) {
      query = value
      return {
        bind() {
          return {
            async first() {
              return {
                metrics: JSON.stringify({ requests: 4, downloads: 2 }),
                asOf: '2026-08-21T00:00:00.000Z',
              }
            },
          }
        },
      }
    },
  } as unknown as D1Database

  await expect(getAccessMetrics(db, 'publisher', 'hkgov')).resolves.toEqual({
    metrics: { requests: 4, downloads: 2 },
    asOf: '2026-08-21T00:00:00.000Z',
  })
  expect(query).toContain('FROM accessAnalyticsRollups')
})

test('records a direct source request once for its publisher and source release', async () => {
  const { db, close } = createAnalyticsD1()
  try {
    await recordAccessAnalyticsEvent(db, {
      eventType: 'api_request',
      httpStatus: 200,
      publisherCodes: ['hkgov'],
      requestIdentity: 'request-direct-source',
      sourceReleaseCode: 'landsd-2026.1',
      sourceReleaseId: 'source-landsd-2026.1',
      surface: 'source',
    })

    await expect(getAccessMetrics(db, 'publisher', 'hkgov')).resolves.toMatchObject({
      metrics: { apiRequests: 1 },
    })
    await expect(
      getAccessMetrics(db, 'source_release', 'source-landsd-2026.1'),
    ).resolves.toMatchObject({ metrics: { apiRequests: 1 } })
  } finally {
    close()
  }
})

test('attributes one API ReleaseSet request to each distinct publisher', async () => {
  const { db, close } = createAnalyticsD1()
  try {
    await recordAccessAnalyticsEvent(db, {
      apiReleaseSetCode: 'api-divisions-2026.1',
      apiReleaseSetId: 'set-divisions-2026.1',
      contributingSourceReleaseCodes: [
        'landsd-2026.1',
        'landsd-2026.1',
        'overture-2026.1',
      ],
      contributingSourceReleaseIds: ['source-1', 'source-1', 'source-2'],
      eventType: 'api_request',
      httpStatus: 200,
      publisherCodes: ['hkgov', 'hkgov', 'overture'],
      requestIdentity: 'request-release-set',
      surface: 'api_release_set',
    })

    await expect(getAccessMetrics(db, 'publisher', 'hkgov')).resolves.toMatchObject({
      metrics: { apiRequests: 1 },
    })
    await expect(getAccessMetrics(db, 'publisher', 'overture')).resolves.toMatchObject({
      metrics: { apiRequests: 1 },
    })
    await expect(
      getAccessMetrics(db, 'api_release_set', 'set-divisions-2026.1'),
    ).resolves.toMatchObject({ metrics: { apiRequests: 1 } })
  } finally {
    close()
  }
})

test('excludes failed, incomplete, and unconsumed downloads', async () => {
  const { db, close } = createAnalyticsD1()
  try {
    const download = {
      eventType: 'download' as const,
      httpStatus: 200,
      publisherCodes: ['hkgov'],
      requestIdentity: 'request-completed-download',
      sourceReleaseCode: 'landsd-archive-2026.1',
      sourceReleaseId: 'source-archive-2026.1',
      surface: 'source' as const,
    }
    await recordAccessAnalyticsEvent(db, download)
    await expect(getAccessMetrics(db, 'publisher', 'hkgov')).resolves.toBeNull()

    await completeAccessAnalyticsDownload(db, download, '2026-08-21T01:00:00.000Z')
    await expect(getAccessMetrics(db, 'publisher', 'hkgov')).resolves.toMatchObject({
      metrics: { downloads: 1 },
    })

    await completeAccessAnalyticsDownload(db, download, '2026-08-21T01:00:00.000Z')
    await expect(getAccessMetrics(db, 'publisher', 'hkgov')).resolves.toMatchObject({
      metrics: { downloads: 1 },
    })

    await recordAccessAnalyticsEvent(db, {
      ...download,
      httpStatus: 500,
      requestIdentity: 'request-failed-download',
    })
    await recordAccessAnalyticsEvent(db, {
      ...download,
      requestIdentity: 'request-unconsumed-download',
    })
    await expect(getAccessMetrics(db, 'publisher', 'hkgov')).resolves.toMatchObject({
      metrics: { downloads: 1 },
    })
  } finally {
    close()
  }
})

test('rebuilds the periodised all-time cache from daily canonical data', async () => {
  const { db, close } = createAnalyticsD1()
  try {
    await recordAccessAnalyticsEvent(db, {
      eventType: 'api_request',
      httpStatus: 200,
      publisherCodes: ['hkgov'],
      requestIdentity: 'request-day-one',
      surface: 'source',
      sourceReleaseId: 'source-1',
      occurredAt: '2026-08-20T23:59:00.000Z',
    })
    await recordAccessAnalyticsEvent(db, {
      eventType: 'api_request',
      httpStatus: 200,
      publisherCodes: ['hkgov'],
      requestIdentity: 'request-day-two',
      surface: 'source',
      sourceReleaseId: 'source-1',
      occurredAt: '2026-08-21T00:01:00.000Z',
    })

    await rebuildAccessAnalyticsAllTimeCache(db)

    await expect(getAccessMetrics(db, 'publisher', 'hkgov')).resolves.toMatchObject({
      metrics: { apiRequests: 2 },
    })
    await expect(
      getAccessMetrics(db, 'publisher', 'hkgov', 'week:2026-W34'),
    ).resolves.toBeNull()
  } finally {
    close()
  }
})
