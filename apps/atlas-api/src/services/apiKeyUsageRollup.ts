import {
  asRollupJobError,
  RollupJobError,
  runWithTransientAnalyticsRetry,
  runWithTransientD1WriteRetry,
} from './rollupRetry'
import { runWithD1ReadRetry } from '../lib/d1'
import {
  commitUsageWindow,
  readUsageCheckpoint,
  type UsageMinute,
} from './apiKeyUsageStore'

const ANALYTICS_ENGINE_SQL_URL = (accountId: string) =>
  `https://api.cloudflare.com/client/v4/accounts/${accountId}/analytics_engine/sql`
const ROLLUP_DELAY_MS = 2 * 60_000
const ROLLUP_OVERLAP_MS = 20 * 60_000
const QUERY_ROW_LIMIT = 10_000
const SNAPSHOT_ROW_LIMIT = 50_000
const quoteDataset = (dataset: string) => `"${dataset}"`

type AnalyticsUsageRow = UsageMinute

type AnalyticsEngineResponse = {
  data?: unknown
  errors?: Array<{ message?: unknown }>
  success?: boolean
}

export type ApiKeyUsageRollupBindings = {
  ANALYTICS_ENGINE_ACCOUNT_ID: string
  ANALYTICS_ENGINE_READ_TOKEN: string
  DB_META: D1Database
  USAGE_ROLLUP_DATASETS: string
}

/**
 * Replays settled usage with a 20-minute overlap. A persisted checkpoint recovers
 * missed runs in bounded windows; each snapshot and its totals commit atomically.
 * Each invocation advances at most 20 minutes. The first checkpoint covers only
 * the current overlap; older history and dataset changes require reconciliation.
 */
export const rollUpApiKeyUsage = async (
  env: ApiKeyUsageRollupBindings,
  scheduledTime = Date.now(),
) => {
  const datasets = parseDatasets(env.USAGE_ROLLUP_DATASETS)
  const signature = JSON.stringify(datasets)
  const checkpoint = await runWithD1ReadRetry(() => readUsageCheckpoint(env.DB_META))
  if (checkpoint && checkpoint.datasets !== signature) {
    throw new RollupJobError(
      'd1_write',
      'Usage datasets differ from the replay checkpoint; reconcile historical usage before changing datasets.',
    )
  }
  const requestedEnd = startOfMinute(scheduledTime - ROLLUP_DELAY_MS)
  if (checkpoint && checkpoint.completedThrough > requestedEnd)
    return { apiKeys: 0, minuteWindows: 0 }
  const rollupEnd = Math.min(
    requestedEnd,
    (checkpoint?.completedThrough ?? requestedEnd) + ROLLUP_OVERLAP_MS,
  )
  const rollupStart = (checkpoint?.completedThrough ?? rollupEnd) - ROLLUP_OVERLAP_MS
  const rows = await Promise.all(
    datasets.map(dataset =>
      runWithTransientAnalyticsRetry(() =>
        queryUsage(env, dataset, rollupStart, rollupEnd),
      ),
    ),
  )
  assertSnapshotSize(rows.reduce((count, datasetRows) => count + datasetRows.length, 0))
  const minuteUsage = mergeUsageRows(rows.flat())
  const applied = await runWithTransientD1WriteRetry(() =>
    commitUsageWindow({
      db: env.DB_META,
      checkpoint,
      datasets: signature,
      start: rollupStart,
      end: rollupEnd,
      rows: [...minuteUsage.values()],
    }),
  )
  if (!applied) return { apiKeys: 0, minuteWindows: 0 }
  return {
    apiKeys: new Set([...minuteUsage.values()].map(row => row.apiKeyId)).size,
    minuteWindows: minuteUsage.size,
  }
}

const queryUsage = async (
  env: Pick<
    ApiKeyUsageRollupBindings,
    'ANALYTICS_ENGINE_ACCOUNT_ID' | 'ANALYTICS_ENGINE_READ_TOKEN'
  >,
  dataset: string,
  start: number,
  end: number,
): Promise<AnalyticsUsageRow[]> => {
  let response: Response
  try {
    response = await fetch(ANALYTICS_ENGINE_SQL_URL(env.ANALYTICS_ENGINE_ACCOUNT_ID), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.ANALYTICS_ENGINE_READ_TOKEN}`,
        'content-type': 'text/plain',
      },
      body: `SELECT
        index1 AS apiKeyId,
        toStartOfMinute(timestamp) AS windowStartedAt,
        SUM(_sample_interval * double1) AS requestCount
      FROM ${quoteDataset(dataset)}
        WHERE timestamp >= ${dateTime(start)} AND timestamp < ${dateTime(end)}
      GROUP BY index1, windowStartedAt
      LIMIT ${QUERY_ROW_LIMIT + 1}`,
    })
  } catch (error) {
    throw asRollupJobError('analytics_engine_query', error)
  }
  const payload = (await response
    .json()
    .catch(() => null)) as AnalyticsEngineResponse | null
  if (
    !response.ok ||
    !payload ||
    payload.success === false ||
    !Array.isArray(payload.data)
  ) {
    const message = payload?.errors
      ?.map(error =>
        typeof error.message === 'string' ? error.message : 'Unknown error',
      )
      .join('; ')
    throw new RollupJobError(
      'analytics_engine_query',
      `Analytics Engine usage query failed for ${dataset} (${response.status}): ${message ?? 'Invalid response'}`,
      response.status,
    )
  }
  if (payload.data.length > QUERY_ROW_LIMIT) {
    const middle = startOfMinute((start + end) / 2)
    if (middle <= start) {
      throw new RollupJobError(
        'analytics_engine_query',
        'Usage replay exceeded the bounded query size for one minute; the checkpoint has not advanced.',
      )
    }
    // Subdivide by time so groups cannot shift between pages while usage settles.
    const before = await queryUsage(env, dataset, start, middle)
    const after = await queryUsage(env, dataset, middle, end)
    assertSnapshotSize(before.length + after.length)
    return [...before, ...after]
  }
  const seen = new Set<string>()
  return payload.data.map(value => {
    const row = parseUsageRow(value)
    const key = row ? JSON.stringify([row.apiKeyId, row.windowStartedAt]) : ''
    if (
      !row ||
      row.windowStartedAt < start ||
      row.windowStartedAt >= end ||
      seen.has(key)
    ) {
      throw new RollupJobError(
        'analytics_engine_query',
        `Invalid or duplicate usage row from ${dataset}; the checkpoint has not advanced.`,
      )
    }
    seen.add(key)
    return row
  })
}

function assertSnapshotSize(count: number) {
  if (count > SNAPSHOT_ROW_LIMIT) {
    throw new RollupJobError(
      'analytics_engine_query',
      'Usage replay exceeded the bounded snapshot size; the checkpoint has not advanced.',
    )
  }
}

const parseUsageRow = (value: unknown): AnalyticsUsageRow | null => {
  if (!value || typeof value !== 'object') return null
  const row = value as Record<string, unknown>
  const apiKeyId = typeof row.apiKeyId === 'string' ? row.apiKeyId : null
  const requestCount = numberValue(row.requestCount)
  const windowStartedAt = timestampValue(row.windowStartedAt)
  if (
    !apiKeyId ||
    requestCount === null ||
    !Number.isSafeInteger(requestCount) ||
    requestCount < 0 ||
    windowStartedAt === null
  ) {
    return null
  }
  return { apiKeyId, requestCount, windowStartedAt }
}

const mergeUsageRows = (rows: AnalyticsUsageRow[]) => {
  const usage = new Map<string, AnalyticsUsageRow>()
  for (const row of rows) {
    const key = `${row.apiKeyId}:${row.windowStartedAt}`
    const current = usage.get(key)
    if (!Number.isSafeInteger((current?.requestCount ?? 0) + row.requestCount)) {
      throw new RollupJobError(
        'analytics_engine_query',
        'Usage total exceeds the safe integer range.',
      )
    }
    usage.set(key, {
      ...row,
      requestCount: (current?.requestCount ?? 0) + row.requestCount,
    })
  }
  return usage
}

const parseDatasets = (value: string) => {
  const datasets = value
    .split(',')
    .map(dataset => dataset.trim())
    .filter(Boolean)
  if (
    datasets.length === 0 ||
    datasets.some(dataset => !/^[A-Za-z0-9_-]+$/.test(dataset))
  ) {
    throw new RollupJobError(
      'analytics_engine_query',
      'USAGE_ROLLUP_DATASETS must list valid Analytics Engine datasets',
    )
  }
  return [...new Set(datasets)].sort()
}

const numberValue = (value: unknown) => {
  if (typeof value !== 'number' && (typeof value !== 'string' || value.trim() === ''))
    return null
  const number = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(number) ? number : null
}

const timestampValue = (value: unknown) => {
  const number = numberValue(value)
  if (number !== null)
    return startOfMinute(number < 1_000_000_000_000 ? number * 1_000 : number)
  if (typeof value !== 'string') return null
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? startOfMinute(parsed) : null
}

const dateTime = (value: number) =>
  `toDateTime('${new Date(value).toISOString().replace('T', ' ').replace('.000Z', '')}')`

const startOfMinute = (value: number) => Math.floor(value / 60_000) * 60_000
