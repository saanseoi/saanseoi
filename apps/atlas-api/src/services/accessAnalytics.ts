import { recordProductUsage, type ProductUsageDataset } from '@repo/core/productUsage'

export type AccessSurface = 'source' | 'api_release_set'
export type AccessEventType = 'api_request' | 'download'
export type AccessAnalyticsScope =
  | 'publisher'
  | 'dataset'
  | 'source_release'
  | 'api_release_set'
export type AccessAnalyticsPeriod = string

export const ACCESS_ANALYTICS_ALL_TIME_PERIOD = 'all_time'

export type AccessAttribution = {
  surface: AccessSurface
  datasetId?: string
  sourceReleaseId?: string
  sourceReleaseCode?: string
  contributingDatasetIds?: string[]
  contributingSourceReleaseIds?: string[]
  contributingSourceReleaseCodes?: string[]
  apiReleaseSetId?: string
  apiReleaseSetCode?: string
  publisherCodes: string[]
}

export type AccessMetrics = {
  metrics: Record<string, number>
  asOf: string | null
}

type AccessEvent = AccessAttribution & {
  eventType: AccessEventType
  route: string
  httpStatus: number
}

type AccessRollupScope = {
  scope: AccessAnalyticsScope
  entityId: string
  metricKey: string
}

type AccessMetricKey = 'apiRequests' | 'downloads'
type AccessPath = 'direct' | 'via_api_release_set'

/**
 * Resolves publisher attribution from the immutable source membership of an
 * API ReleaseSet. Publisher names and registry rows are deliberately not used
 * here: the serving response has already selected this exact lineage.
 */
export async function resolveApiReleaseSetAccessAttribution(
  metaDb: D1Database,
  releaseSet: string,
): Promise<AccessAttribution | null> {
  const result = await metaDb
    .prepare(
      `SELECT DISTINCT
         apiReleaseSets.id AS apiReleaseSetId,
         apiReleaseSets.code AS apiReleaseSetCode,
         datasets.id AS datasetId,
         sourceReleases.id AS sourceReleaseId,
         sourceReleases.code AS sourceReleaseCode,
         publishers.code AS publisherCode
       FROM apiReleaseSets
       INNER JOIN apiReleaseSetSnapshots
         ON apiReleaseSetSnapshots.apiReleaseSetId = apiReleaseSets.id
       INNER JOIN snapshotSources
         ON snapshotSources.snapshotId = apiReleaseSetSnapshots.snapshotId
       INNER JOIN releases
         ON releases.id = snapshotSources.sourceReleaseId
       INNER JOIN sourceReleases
         ON sourceReleases.id = releases.sourceReleaseId
       INNER JOIN datasets
         ON datasets.id = sourceReleases.datasetId
       INNER JOIN publishers
         ON publishers.id = datasets.publisherId
       WHERE (apiReleaseSets.id = ? OR apiReleaseSets.code = ?)
         AND apiReleaseSets.status <> 'draft'
         AND snapshotSources.role <> 'lookup'
         AND releases.status IN ('published', 'superseded')
         AND releases.revokedAt IS NULL
         AND sourceReleases.status IN ('published', 'superseded')
         AND sourceReleases.revokedAt IS NULL
       ORDER BY publishers.code ASC, sourceReleases.code ASC`,
    )
    .bind(releaseSet, releaseSet)
    .all<{
      apiReleaseSetId: string
      apiReleaseSetCode: string
      datasetId: string
      sourceReleaseId: string
      sourceReleaseCode: string
      publisherCode: string
    }>()

  const first = result.results[0]
  if (!first) return null
  return {
    apiReleaseSetId: first.apiReleaseSetId,
    apiReleaseSetCode: first.apiReleaseSetCode,
    contributingDatasetIds: [...new Set(result.results.map(row => row.datasetId))],
    contributingSourceReleaseIds: [
      ...new Set(result.results.map(row => row.sourceReleaseId)),
    ],
    contributingSourceReleaseCodes: [
      ...new Set(result.results.map(row => row.sourceReleaseCode)),
    ],
    publisherCodes: [...new Set(result.results.map(row => row.publisherCode))],
    surface: 'api_release_set',
  }
}

export async function resolveApiReleaseSetAccessAttributionForSnapshot(
  metaDb: D1Database,
  snapshotId: string,
) {
  const releaseSet = await metaDb
    .prepare(
      `SELECT apiReleaseSets.id AS id
       FROM apiReleaseSetSnapshots
       INNER JOIN apiReleaseSets
         ON apiReleaseSets.id = apiReleaseSetSnapshots.apiReleaseSetId
       WHERE apiReleaseSetSnapshots.snapshotId = ?
         AND apiReleaseSets.status <> 'draft'
       ORDER BY apiReleaseSets.publishedAt DESC, apiReleaseSets.createdAt DESC
       LIMIT 1`,
    )
    .bind(snapshotId)
    .first<{ id: string }>()
  return releaseSet
    ? resolveApiReleaseSetAccessAttribution(metaDb, releaseSet.id)
    : null
}

/** Emits a successful API access hit to the shared Product Usage dataset. */
export function recordAccessAnalyticsEvent(
  dataset: ProductUsageDataset | undefined,
  input: AccessEvent,
): void {
  if (input.eventType !== 'api_request' || !isSuccessfulStatus(input.httpStatus)) return
  writeAccessMetrics(dataset, input, 'apiRequests')
}

/** Emits a download hit only after its response stream has been consumed. */
export function completeAccessAnalyticsDownload(
  dataset: ProductUsageDataset | undefined,
  input: AccessEvent,
): void {
  if (input.eventType !== 'download') return
  writeAccessMetrics(dataset, input, 'downloads')
}

function writeAccessMetrics(
  dataset: ProductUsageDataset | undefined,
  input: AccessEvent,
  metricKey: AccessMetricKey,
) {
  const scopes = buildAccessAnalyticsScopes(input, metricKey)
  for (const { scope, entityId, metricKey: scopedMetricKey } of scopes) {
    recordProductUsage(dataset, {
      event: 'api.access',
      producer: 'atlas-api',
      surface: 'access',
      route: input.route,
      entityType: scope,
      entityId,
      outcome: 'success',
      httpStatus: input.httpStatus,
      metricKey: scopedMetricKey,
      count: 1,
    })
  }
}

export async function getAccessMetrics(
  db: D1Database,
  scope: AccessAnalyticsScope,
  entityId: string,
  period = ACCESS_ANALYTICS_ALL_TIME_PERIOD,
): Promise<AccessMetrics | null> {
  const result = await db
    .prepare(
      `SELECT metrics, asOf
       FROM accessAnalyticsRollups
       WHERE period = ? AND scope = ? AND entityId = ?`,
    )
    .bind(period, scope, entityId)
    .first<{ metrics: string | Record<string, number>; asOf: string | null }>()

  if (!result || result.asOf === null) return null
  return {
    metrics: parseMetrics(result.metrics),
    asOf: result.asOf,
  }
}

function buildAccessAnalyticsScopes(
  input: AccessAttribution,
  metricKey: AccessMetricKey,
): AccessRollupScope[] {
  const path: AccessPath =
    input.surface === 'api_release_set' ? 'via_api_release_set' : 'direct'
  const scopedMetricKey = `${metricKey}.${path}`
  const publisherCodes = [...new Set(input.publisherCodes)].sort()
  const sourceReleaseIds =
    path === 'via_api_release_set'
      ? [...new Set(input.contributingSourceReleaseIds ?? [])].sort()
      : input.sourceReleaseId
        ? [input.sourceReleaseId]
        : []
  const datasetIds =
    path === 'via_api_release_set'
      ? [...new Set(input.contributingDatasetIds ?? [])].sort()
      : input.datasetId
        ? [input.datasetId]
        : []
  return [
    ...sourceReleaseIds.map(entityId => ({
      scope: 'source_release' as const,
      entityId,
      metricKey: scopedMetricKey,
    })),
    ...(input.apiReleaseSetId
      ? [
          {
            scope: 'api_release_set' as const,
            entityId: input.apiReleaseSetId,
            metricKey: scopedMetricKey,
          },
        ]
      : []),
    ...datasetIds.map(entityId => ({
      scope: 'dataset' as const,
      entityId,
      metricKey: scopedMetricKey,
    })),
    ...publisherCodes.map(entityId => ({
      scope: 'publisher' as const,
      entityId,
      metricKey: scopedMetricKey,
    })),
  ]
}

function parseMetrics(value: string | Record<string, number>): Record<string, number> {
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value) as Record<string, number>
    } catch {
      return {}
    }
  }
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, metricValue]) =>
      typeof metricValue === 'number' && Number.isFinite(metricValue)
        ? [[key, metricValue]]
        : [],
    ),
  )
}

function isSuccessfulStatus(status: number) {
  return status >= 200 && status < 300
}
