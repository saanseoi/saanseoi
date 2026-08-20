import { expect, test } from 'bun:test'
import type { ProductUsageDataset } from '@repo/core/productUsage'

import {
  completeAccessAnalyticsDownload,
  getAccessMetrics,
  recordAccessAnalyticsEvent,
  resolveApiReleaseSetAccessAttribution,
} from './accessAnalytics'

function createDataset() {
  const points: AnalyticsEngineDataPoint[] = []
  return {
    points,
    dataset: {
      writeDataPoint(point: AnalyticsEngineDataPoint) {
        points.push(point)
      },
    } as unknown as ProductUsageDataset,
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

test('emits one successful API hit for every attributed dimension', () => {
  const { dataset, points } = createDataset()
  recordAccessAnalyticsEvent(dataset, {
    eventType: 'api_request',
    httpStatus: 200,
    publisherCodes: ['overture', 'hkgov', 'hkgov'],
    route: '/v0.1/divisions',
    sourceReleaseId: 'source-1',
    apiReleaseSetId: 'set-1',
    surface: 'api_release_set',
  })

  expect(points).toHaveLength(4)
  expect(points.map(point => point.blobs?.slice(5))).toEqual([
    ['source_release', 'source-1', '', 'success', '200', 'apiRequests'],
    ['api_release_set', 'set-1', '', 'success', '200', 'apiRequests'],
    ['publisher', 'hkgov', '', 'success', '200', 'apiRequests'],
    ['publisher', 'overture', '', 'success', '200', 'apiRequests'],
  ])
})

test('does not emit failed or unconsumed downloads', () => {
  const { dataset, points } = createDataset()
  const download = {
    eventType: 'download' as const,
    httpStatus: 200,
    publisherCodes: ['hkgov'],
    route: '/v0/assets/:id',
    sourceReleaseId: 'source-1',
    surface: 'source' as const,
  }

  recordAccessAnalyticsEvent(dataset, download)
  expect(points).toHaveLength(0)

  completeAccessAnalyticsDownload(dataset, download)
  expect(points).toHaveLength(2)
  expect(points.every(point => point.blobs?.[10] === 'downloads')).toBe(true)

  recordAccessAnalyticsEvent(dataset, {
    ...download,
    httpStatus: 500,
  })
  expect(points).toHaveLength(2)
})

test('reads metrics from a selected periodised D1 cache', async () => {
  let query = ''
  const db = {
    prepare(value: string) {
      query = value
      return {
        bind() {
          return {
            async first() {
              return {
                metrics: JSON.stringify({ apiRequests: 4, downloads: 2 }),
                asOf: '2026-08-21T00:00:00.000Z',
              }
            },
          }
        },
      }
    },
  } as unknown as D1Database

  await expect(
    getAccessMetrics(db, 'publisher', 'hkgov', 'week:2026-W34'),
  ).resolves.toEqual({
    metrics: { apiRequests: 4, downloads: 2 },
    asOf: '2026-08-21T00:00:00.000Z',
  })
  expect(query).toContain('period = ?')
})
