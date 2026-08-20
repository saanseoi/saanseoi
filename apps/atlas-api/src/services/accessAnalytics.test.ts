import { expect, test } from 'bun:test'
import type { ProductUsageDataset } from '@repo/core/productUsage'

import {
  completeAccessAnalyticsDownload,
  getAccessMetrics,
  recordAccessAnalyticsEvent,
  resolveApiReleaseSetAccessAttribution,
  resolveOptionalApiReleaseSetAccessAttribution,
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
                    datasetId: 'dataset-1',
                    apiReleaseSetId: 'set-1',
                    apiReleaseSetCode: 'api-divisions-2026.0',
                    sourceReleaseId: 'source-1',
                    sourceReleaseCode: 'dr-one',
                    publisherCode: 'hkgov',
                  },
                  {
                    datasetId: 'dataset-1',
                    apiReleaseSetId: 'set-1',
                    apiReleaseSetCode: 'api-divisions-2026.0',
                    sourceReleaseId: 'source-2',
                    sourceReleaseCode: 'dr-two',
                    publisherCode: 'hkgov',
                  },
                  {
                    datasetId: 'dataset-2',
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
    contributingDatasetIds: ['dataset-1', 'dataset-2'],
    contributingSourceReleaseIds: ['source-1', 'source-2', 'source-3'],
    contributingSourceReleaseCodes: ['dr-one', 'dr-two', 'dr-three'],
    publisherCodes: ['hkgov', 'overture'],
    surface: 'api_release_set',
  })
  expect(queries[0]).toContain("snapshotSources.role <> 'lookup'")
})

test('retries optional attribution reads and fails open when they remain unavailable', async () => {
  let transientAttempts = 0
  const attribution = {
    apiReleaseSetId: 'set-1',
    apiReleaseSetCode: 'api-divisions-2026.0',
    publisherCodes: ['hkgov'],
    surface: 'api_release_set' as const,
  }

  await expect(
    resolveOptionalApiReleaseSetAccessAttribution(async () => {
      transientAttempts += 1
      if (transientAttempts < 5) throw new Error('D1_ERROR: database is locked')
      return attribution
    }),
  ).resolves.toEqual(attribution)
  expect(transientAttempts).toBe(5)

  let permanentAttempts = 0
  await expect(
    resolveOptionalApiReleaseSetAccessAttribution(async () => {
      permanentAttempts += 1
      throw new Error('metadata unavailable')
    }),
  ).resolves.toBeNull()
  expect(permanentAttempts).toBe(1)
})

test('does not record failed download metrics', () => {
  const { dataset, points } = createDataset()

  completeAccessAnalyticsDownload(dataset, {
    eventType: 'download',
    httpStatus: 500,
    publisherCodes: ['hkgov'],
    route: '/v0/assets/asset-1',
    sourceReleaseId: 'source-1',
    surface: 'source',
  })

  expect(points).toHaveLength(0)
})

test('emits one successful API hit for every attributed dimension', () => {
  const { dataset, points } = createDataset()
  recordAccessAnalyticsEvent(dataset, {
    eventType: 'api_request',
    httpStatus: 200,
    publisherCodes: ['overture', 'hkgov', 'hkgov'],
    route: '/v0.1/divisions',
    contributingDatasetIds: ['dataset-1', 'dataset-2'],
    contributingSourceReleaseIds: ['source-2', 'source-1', 'source-1'],
    apiReleaseSetId: 'set-1',
    surface: 'api_release_set',
  })

  expect(points).toHaveLength(7)
  expect(points.map(point => point.blobs?.slice(5))).toEqual([
    [
      'source_release',
      'source-1',
      '',
      'success',
      '200',
      'apiRequests.via_api_release_set',
    ],
    [
      'source_release',
      'source-2',
      '',
      'success',
      '200',
      'apiRequests.via_api_release_set',
    ],
    [
      'api_release_set',
      'set-1',
      '',
      'success',
      '200',
      'apiRequests.via_api_release_set',
    ],
    ['dataset', 'dataset-1', '', 'success', '200', 'apiRequests.via_api_release_set'],
    ['dataset', 'dataset-2', '', 'success', '200', 'apiRequests.via_api_release_set'],
    ['publisher', 'hkgov', '', 'success', '200', 'apiRequests.via_api_release_set'],
    ['publisher', 'overture', '', 'success', '200', 'apiRequests.via_api_release_set'],
  ])
})

test('keeps direct source access separate from composition access', () => {
  const { dataset, points } = createDataset()
  recordAccessAnalyticsEvent(dataset, {
    eventType: 'api_request',
    httpStatus: 200,
    publisherCodes: ['hkgov'],
    route: '/v0/sources',
    datasetId: 'dataset-1',
    sourceReleaseId: 'source-1',
    surface: 'source',
  })

  expect(points.map(point => point.blobs?.slice(5))).toEqual([
    ['source_release', 'source-1', '', 'success', '200', 'apiRequests.direct'],
    ['dataset', 'dataset-1', '', 'success', '200', 'apiRequests.direct'],
    ['publisher', 'hkgov', '', 'success', '200', 'apiRequests.direct'],
  ])
})

test('does not emit failed or unconsumed downloads', () => {
  const { dataset, points } = createDataset()
  const download = {
    eventType: 'download' as const,
    httpStatus: 200,
    publisherCodes: ['hkgov'],
    route: '/v0/assets/:id',
    datasetId: 'dataset-1',
    sourceReleaseId: 'source-1',
    surface: 'source' as const,
  }

  recordAccessAnalyticsEvent(dataset, download)
  expect(points).toHaveLength(0)

  completeAccessAnalyticsDownload(dataset, download)
  expect(points).toHaveLength(3)
  expect(points.every(point => point.blobs?.[10] === 'downloads.direct')).toBe(true)

  recordAccessAnalyticsEvent(dataset, {
    ...download,
    httpStatus: 500,
  })
  expect(points).toHaveLength(3)
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
