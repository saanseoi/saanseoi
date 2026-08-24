import {
  asRollupJobError,
  RollupJobError,
  runWithTransientAnalyticsRetry,
  runWithTransientD1WriteRetry,
} from './rollupRetry'

const ANALYTICS_ENGINE_SQL_URL = (accountId: string) =>
  `https://api.cloudflare.com/client/v4/accounts/${accountId}/analytics_engine/sql`
const ROLLUP_DELAY_MS = 2 * 60_000
const ROLLUP_OVERLAP_MS = 20 * 60_000
const D1_BATCH_SIZE = 100
const quoteDataset = (dataset: string) => `"${dataset}"`

type AnalyticsUsageRow = {
  apiKeyId: string
  requestCount: number
  windowStartedAt: number
}

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
 * Copies settled Analytics Engine usage into D1. The roll-up deliberately
 * reprocesses a short overlap and overwrites minute totals, which makes cron
 * retries and duplicate deliveries harmless while accommodating ingestion lag.
 */
export const rollUpApiKeyUsage = async (
  env: ApiKeyUsageRollupBindings,
  scheduledTime = Date.now(),
) => {
  const rollupEnd = startOfMinute(scheduledTime - ROLLUP_DELAY_MS)
  const rollupStart = rollupEnd - ROLLUP_OVERLAP_MS
  const datasets = parseDatasets(env.USAGE_ROLLUP_DATASETS)
  const rows = await Promise.all(
    datasets.map(dataset =>
      runWithTransientAnalyticsRetry(() =>
        queryUsage(env, dataset, rollupStart, rollupEnd),
      ),
    ),
  )
  const minuteUsage = mergeUsageRows(rows.flat())
  if (minuteUsage.size === 0) return { apiKeys: 0, minuteWindows: 0 }

  await runWithTransientD1WriteRetry(() => writeMinuteUsage(env.DB_META, minuteUsage))
  await runWithTransientD1WriteRetry(() =>
    writeDerivedUsage(env.DB_META, minuteUsage.keys(), rollupEnd),
  )
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
      GROUP BY index1, windowStartedAt`,
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
  return payload.data.flatMap(parseUsageRow)
}

const parseUsageRow = (value: unknown): AnalyticsUsageRow[] => {
  if (!value || typeof value !== 'object') return []
  const row = value as Record<string, unknown>
  const apiKeyId = typeof row.apiKeyId === 'string' ? row.apiKeyId : null
  const requestCount = numberValue(row.requestCount)
  const windowStartedAt = timestampValue(row.windowStartedAt)
  if (
    !apiKeyId ||
    requestCount === null ||
    requestCount < 0 ||
    windowStartedAt === null
  ) {
    return []
  }
  return [{ apiKeyId, requestCount, windowStartedAt }]
}

const mergeUsageRows = (rows: AnalyticsUsageRow[]) => {
  const usage = new Map<string, AnalyticsUsageRow>()
  for (const row of rows) {
    const key = `${row.apiKeyId}:${row.windowStartedAt}`
    const current = usage.get(key)
    usage.set(key, {
      ...row,
      requestCount: (current?.requestCount ?? 0) + row.requestCount,
    })
  }
  return usage
}

const writeMinuteUsage = async (
  db: D1Database,
  usage: Map<string, AnalyticsUsageRow>,
) => {
  const statements = [...usage.values()].map(row =>
    db
      .prepare(
        `INSERT INTO api_key_usage (
           api_key_id, window, window_started_at, request_count
         )
         SELECT id, 'minute', ?, ?
         FROM api_key
         WHERE id = ?
         ON CONFLICT(api_key_id, window, window_started_at) DO UPDATE SET
           request_count = excluded.request_count`,
      )
      .bind(row.windowStartedAt, row.requestCount, row.apiKeyId),
  )
  await runBatches(db, statements)
}

const writeDerivedUsage = async (
  db: D1Database,
  keys: Iterable<string>,
  now: number,
) => {
  const dayStartedAt = startOfDay(now)
  const monthStartedAt = startOfMonth(now)
  const apiKeyIds = new Set<string>()
  for (const key of keys) {
    const [apiKeyId] = key.split(':', 1)
    if (apiKeyId) apiKeyIds.add(apiKeyId)
  }
  const statements = [...apiKeyIds].flatMap(apiKeyId => [
    derivedUsageStatement(db, apiKeyId, 'day', dayStartedAt, now),
    derivedUsageStatement(db, apiKeyId, 'month', monthStartedAt, now),
  ])
  await runBatches(db, statements)
}

const derivedUsageStatement = (
  db: D1Database,
  apiKeyId: string,
  window: 'day' | 'month',
  windowStartedAt: number,
  now: number,
) =>
  db
    .prepare(
      `INSERT INTO api_key_usage (
         api_key_id, window, window_started_at, request_count
       )
       SELECT api_key.id, ?, ?, COALESCE(SUM(minute.request_count), 0)
       FROM api_key
       LEFT JOIN api_key_usage AS minute
         ON minute.api_key_id = api_key.id
         AND minute.window = 'minute'
         AND minute.window_started_at >= ?
         AND minute.window_started_at < ?
       WHERE api_key.id = ?
       GROUP BY api_key.id
       ON CONFLICT(api_key_id, window, window_started_at) DO UPDATE SET
         request_count = excluded.request_count`,
    )
    .bind(window, windowStartedAt, windowStartedAt, now, apiKeyId)

const runBatches = async (db: D1Database, statements: D1PreparedStatement[]) => {
  for (let index = 0; index < statements.length; index += D1_BATCH_SIZE) {
    await db.batch(statements.slice(index, index + D1_BATCH_SIZE))
  }
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
  return datasets
}

const numberValue = (value: unknown) => {
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

const startOfDay = (value: number) => {
  const date = new Date(value)
  date.setUTCHours(0, 0, 0, 0)
  return date.getTime()
}

const startOfMonth = (value: number) => {
  const date = new Date(value)
  date.setUTCDate(1)
  date.setUTCHours(0, 0, 0, 0)
  return date.getTime()
}
