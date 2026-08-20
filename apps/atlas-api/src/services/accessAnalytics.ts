export type AccessSurface = 'source' | 'api_release_set'
export type AccessEventType = 'api_request' | 'download'
export type AccessAnalyticsScope = 'publisher' | 'source_release' | 'api_release_set'
export type AccessAnalyticsPeriod = string

export const ACCESS_ANALYTICS_ALL_TIME_PERIOD = 'all_time'

export type AccessAttribution = {
  surface: AccessSurface
  sourceReleaseId?: string
  sourceReleaseCode?: string
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
  requestIdentity: string
  httpStatus: number
  occurredAt?: string
}

type AccessRollupScope = {
  scope: AccessAnalyticsScope
  entityId: string
}

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
      sourceReleaseId: string
      sourceReleaseCode: string
      publisherCode: string
    }>()

  const first = result.results[0]
  if (!first) return null
  return {
    apiReleaseSetId: first.apiReleaseSetId,
    apiReleaseSetCode: first.apiReleaseSetCode,
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

/** Records a serving event without retaining the event itself. */
export async function recordAccessAnalyticsEvent(
  db: D1Database,
  input: AccessEvent,
): Promise<void> {
  const scopes = buildAccessAnalyticsScopes(input)
  if (scopes.length === 0) return

  const occurredAt = input.occurredAt ?? new Date().toISOString()
  const requestIdentity = await sha256(input.requestIdentity)
  const eligible = isSuccessfulStatus(input.httpStatus)
  const counted = !eligible
  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        `INSERT INTO accessAnalyticsIdempotency (
           requestIdentity, eventType, eligible, counted, createdAt, updatedAt
         ) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(requestIdentity) DO NOTHING`,
      )
      .bind(
        requestIdentity,
        input.eventType,
        eligible ? 1 : 0,
        counted ? 1 : 0,
        occurredAt,
        occurredAt,
      ),
  ]

  // API requests are counted at the serving boundary. Downloads remain
  // reserved in the ledger until completeAccessAnalyticsDownload runs.
  if (input.eventType === 'api_request' && eligible) {
    statements.push(
      ...buildMetricStatements(
        db,
        scopes,
        utcDay(occurredAt),
        'apiRequests',
        requestIdentity,
        input.eventType,
        occurredAt,
      ),
    )
    statements.push(
      buildMarkCountedStatement(db, requestIdentity, input.eventType, occurredAt),
    )
  }

  await db.batch(statements)
}

/** Marks a streamed download complete and increments it exactly once. */
export async function completeAccessAnalyticsDownload(
  db: D1Database,
  input: AccessEvent,
  completedAt = new Date().toISOString(),
): Promise<void> {
  if (input.eventType !== 'download') return

  const scopes = buildAccessAnalyticsScopes(input)
  if (scopes.length === 0) return

  const requestIdentity = await sha256(input.requestIdentity)
  const statements = buildMetricStatements(
    db,
    scopes,
    utcDay(completedAt),
    'downloads',
    requestIdentity,
    'download',
    completedAt,
  )
  statements.push(
    buildMarkCountedStatement(db, requestIdentity, 'download', completedAt),
  )
  await db.batch(statements)
}

/** Rebuilds the all-time cache from canonical daily rows. */
export async function rebuildAccessAnalyticsAllTimeCache(
  db: D1Database,
): Promise<void> {
  const checkedAt = new Date().toISOString()
  await db.batch([
    db
      .prepare(`DELETE FROM accessAnalyticsRollups WHERE period = ?`)
      .bind(ACCESS_ANALYTICS_ALL_TIME_PERIOD),
    db
      .prepare(
        `INSERT INTO accessAnalyticsRollups (
           period, scope, entityId, metrics, asOf, createdAt, updatedAt
         )
         SELECT
           ?, scope, entityId,
           json_group_object(metricKey, metricValue),
           MAX(dayUpdatedAt), ?, ?
         FROM (
           SELECT
             accessAnalyticsDaily.scope AS scope,
             accessAnalyticsDaily.entityId AS entityId,
             json_each.key AS metricKey,
             SUM(CAST(json_each.value AS INTEGER)) AS metricValue,
             MAX(accessAnalyticsDaily.updatedAt) AS dayUpdatedAt
           FROM accessAnalyticsDaily, json_each(accessAnalyticsDaily.metrics)
           GROUP BY accessAnalyticsDaily.scope, accessAnalyticsDaily.entityId, json_each.key
         )
         GROUP BY scope, entityId`,
      )
      .bind(ACCESS_ANALYTICS_ALL_TIME_PERIOD, checkedAt, checkedAt),
  ])
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

function buildAccessAnalyticsScopes(input: AccessAttribution): AccessRollupScope[] {
  const publisherCodes = [...new Set(input.publisherCodes)].sort()
  return [
    ...(input.sourceReleaseId
      ? [{ scope: 'source_release' as const, entityId: input.sourceReleaseId }]
      : []),
    ...(input.apiReleaseSetId
      ? [{ scope: 'api_release_set' as const, entityId: input.apiReleaseSetId }]
      : []),
    ...publisherCodes.map(entityId => ({ scope: 'publisher' as const, entityId })),
  ]
}

function buildMetricStatements(
  db: D1Database,
  scopes: AccessRollupScope[],
  day: string,
  metricKey: string,
  requestIdentity: string,
  eventType: AccessEventType,
  updatedAt: string,
): D1PreparedStatement[] {
  return scopes.flatMap(scope => [
    buildDailyMetricStatement(
      db,
      scope,
      day,
      metricKey,
      requestIdentity,
      eventType,
      updatedAt,
    ),
    buildPeriodMetricStatement(
      db,
      scope,
      metricKey,
      requestIdentity,
      eventType,
      updatedAt,
    ),
  ])
}

function buildDailyMetricStatement(
  db: D1Database,
  { scope, entityId }: AccessRollupScope,
  day: string,
  metricKey: string,
  requestIdentity: string,
  eventType: AccessEventType,
  updatedAt: string,
) {
  return db
    .prepare(
      `INSERT INTO accessAnalyticsDaily (
         day, scope, entityId, metrics, createdAt, updatedAt
       )
       SELECT ?, ?, ?, json_object(?, 1), ?, ?
       WHERE EXISTS (
         SELECT 1 FROM accessAnalyticsIdempotency
         WHERE requestIdentity = ? AND eventType = ? AND eligible = 1 AND counted = 0
       )
       ON CONFLICT(day, scope, entityId) DO UPDATE SET
         metrics = json_set(
           accessAnalyticsDaily.metrics,
           '$.' || ?,
           COALESCE(json_extract(accessAnalyticsDaily.metrics, '$.' || ?), 0) + 1
         ),
         updatedAt = excluded.updatedAt`,
    )
    .bind(
      day,
      scope,
      entityId,
      metricKey,
      updatedAt,
      updatedAt,
      requestIdentity,
      eventType,
      metricKey,
      metricKey,
    )
}

function buildPeriodMetricStatement(
  db: D1Database,
  { scope, entityId }: AccessRollupScope,
  metricKey: string,
  requestIdentity: string,
  eventType: AccessEventType,
  updatedAt: string,
) {
  return db
    .prepare(
      `INSERT INTO accessAnalyticsRollups (
         period, scope, entityId, metrics, asOf, createdAt, updatedAt
       )
       SELECT ?, ?, ?, json_object(?, 1), ?, ?, ?
       WHERE EXISTS (
         SELECT 1 FROM accessAnalyticsIdempotency
         WHERE requestIdentity = ? AND eventType = ? AND eligible = 1 AND counted = 0
       )
       ON CONFLICT(period, scope, entityId) DO UPDATE SET
         metrics = json_set(
           accessAnalyticsRollups.metrics,
           '$.' || ?,
           COALESCE(json_extract(accessAnalyticsRollups.metrics, '$.' || ?), 0) + 1
         ),
         asOf = excluded.asOf,
         updatedAt = excluded.updatedAt`,
    )
    .bind(
      ACCESS_ANALYTICS_ALL_TIME_PERIOD,
      scope,
      entityId,
      metricKey,
      updatedAt,
      updatedAt,
      updatedAt,
      requestIdentity,
      eventType,
      metricKey,
      metricKey,
    )
}

function buildMarkCountedStatement(
  db: D1Database,
  requestIdentity: string,
  eventType: AccessEventType,
  updatedAt: string,
) {
  return db
    .prepare(
      `UPDATE accessAnalyticsIdempotency
       SET counted = 1, updatedAt = ?
       WHERE requestIdentity = ? AND eventType = ? AND eligible = 1 AND counted = 0`,
    )
    .bind(updatedAt, requestIdentity, eventType)
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

function utcDay(value: string) {
  return new Date(value).toISOString().slice(0, 10)
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(digest)]
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('')
}
