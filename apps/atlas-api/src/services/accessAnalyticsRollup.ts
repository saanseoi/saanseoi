import {
  ACCESS_ANALYTICS_ALL_TIME_PERIOD,
  type AccessAnalyticsScope,
} from './accessAnalytics'

const ANALYTICS_ENGINE_SQL_URL = (accountId: string) =>
  `https://api.cloudflare.com/client/v4/accounts/${accountId}/analytics_engine/sql`
const ACCESS_ANALYTICS_EVENT = 'api.access'
const ROLLUP_DELAY_MS = 15 * 60_000
const ROLLUP_DAYS = 2
const D1_BATCH_SIZE = 50
const ACCESS_SCOPES = new Set<AccessAnalyticsScope>([
  'publisher',
  'dataset',
  'source_release',
  'api_release_set',
])

type AccessAnalyticsRollupBindings = {
  ANALYTICS_ENGINE_ACCOUNT_ID: string
  ANALYTICS_ENGINE_READ_TOKEN: string
  DB_META: D1Database
  PRODUCT_USAGE_DATASET: string
}

type AnalyticsEngineResponse = {
  data?: unknown
  errors?: Array<{ message?: unknown }>
  success?: boolean
}

type AccessDailyRow = {
  day: string
  scope: AccessAnalyticsScope
  entityId: string
  metricKey: string
  metricValue: number
}

/**
 * Copies settled access events from Analytics Engine into the canonical daily
 * D1 rows. Two complete UTC days are replaced so a missed cron or ingestion
 * delay can be recovered on the next run without double-counting.
 */
export async function rollUpAccessAnalyticsDaily(
  env: AccessAnalyticsRollupBindings,
  scheduledTime = Date.now(),
) {
  const rollupEnd = startOfDay(scheduledTime - ROLLUP_DELAY_MS)
  const rollupStart = rollupEnd - ROLLUP_DAYS * 24 * 60 * 60 * 1000
  const rows = await queryAccessUsage(env, rollupStart, rollupEnd)
  const dailyMetrics = mergeDailyRows(rows)
  const days = daysInRange(rollupStart, rollupEnd)

  await writeDailyRows(
    env.DB_META,
    days,
    dailyMetrics,
    new Date(scheduledTime).toISOString(),
  )
  await rebuildAccessAnalyticsAllTimeCache(env.DB_META)

  return { days: days.length, rows: dailyMetrics.size }
}

async function queryAccessUsage(
  env: Pick<
    AccessAnalyticsRollupBindings,
    | 'ANALYTICS_ENGINE_ACCOUNT_ID'
    | 'ANALYTICS_ENGINE_READ_TOKEN'
    | 'PRODUCT_USAGE_DATASET'
  >,
  start: number,
  end: number,
): Promise<AccessDailyRow[]> {
  const dataset = env.PRODUCT_USAGE_DATASET
  if (!/^[A-Za-z0-9_-]+$/.test(dataset)) {
    throw new Error('PRODUCT_USAGE_DATASET must be a valid Analytics Engine dataset')
  }

  const response = await fetch(
    ANALYTICS_ENGINE_SQL_URL(env.ANALYTICS_ENGINE_ACCOUNT_ID),
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.ANALYTICS_ENGINE_READ_TOKEN}`,
        'content-type': 'text/plain',
      },
      body: `SELECT
        toStartOfDay(timestamp) AS day,
        blob6 AS scope,
        blob7 AS entityId,
        blob11 AS metricKey,
        SUM(_sample_interval * double2) AS metricValue
      FROM ${dataset}
      WHERE index1 = '${ACCESS_ANALYTICS_EVENT}'
        AND timestamp >= '${timestamp(start)}'
        AND timestamp < '${timestamp(end)}'
      GROUP BY day, scope, entityId, metricKey
      HAVING metricValue > 0`,
    },
  )
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
    throw new Error(
      `Analytics Engine access query failed (${response.status}): ${message ?? 'Invalid response'}`,
    )
  }
  return payload.data.flatMap(parseAccessDailyRow)
}

function parseAccessDailyRow(value: unknown): AccessDailyRow[] {
  if (!value || typeof value !== 'object') return []
  const row = value as Record<string, unknown>
  const day = dayValue(row.day)
  const scope = typeof row.scope === 'string' ? row.scope : null
  const entityId = typeof row.entityId === 'string' ? row.entityId : null
  const metricKey = typeof row.metricKey === 'string' ? row.metricKey : null
  const metricValue = numberValue(row.metricValue)
  if (
    !day ||
    !scope ||
    !ACCESS_SCOPES.has(scope as AccessAnalyticsScope) ||
    !entityId ||
    !metricKey ||
    !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(metricKey) ||
    metricValue === null ||
    metricValue <= 0
  ) {
    return []
  }
  return [
    {
      day,
      scope: scope as AccessAnalyticsScope,
      entityId,
      metricKey,
      metricValue,
    },
  ]
}

function mergeDailyRows(rows: AccessDailyRow[]) {
  const dailyMetrics = new Map<
    string,
    {
      day: string
      scope: AccessAnalyticsScope
      entityId: string
      metrics: Record<string, number>
    }
  >()
  for (const row of rows) {
    const key = `${row.day}:${row.scope}:${row.entityId}`
    const current = dailyMetrics.get(key) ?? {
      day: row.day,
      scope: row.scope,
      entityId: row.entityId,
      metrics: {},
    }
    current.metrics[row.metricKey] =
      (current.metrics[row.metricKey] ?? 0) + row.metricValue
    dailyMetrics.set(key, current)
  }
  return dailyMetrics
}

async function writeDailyRows(
  db: D1Database,
  days: string[],
  dailyMetrics: Map<
    string,
    {
      day: string
      scope: AccessAnalyticsScope
      entityId: string
      metrics: Record<string, number>
    }
  >,
  checkedAt: string,
) {
  const statements = [
    ...days.map(day =>
      db.prepare(`DELETE FROM accessAnalyticsDaily WHERE day = ?`).bind(day),
    ),
    ...[...dailyMetrics.values()].map(row =>
      db
        .prepare(
          `INSERT INTO accessAnalyticsDaily (
             day, scope, entityId, metrics, createdAt, updatedAt
           ) VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(day, scope, entityId) DO UPDATE SET
             metrics = excluded.metrics,
             updatedAt = excluded.updatedAt`,
        )
        .bind(
          row.day,
          row.scope,
          row.entityId,
          JSON.stringify(row.metrics),
          checkedAt,
          checkedAt,
        ),
    ),
  ]
  for (let index = 0; index < statements.length; index += D1_BATCH_SIZE) {
    await db.batch(statements.slice(index, index + D1_BATCH_SIZE))
  }
}

async function rebuildAccessAnalyticsAllTimeCache(db: D1Database) {
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
             SUM(CAST(json_each.value AS REAL)) AS metricValue,
             MAX(accessAnalyticsDaily.updatedAt) AS dayUpdatedAt
           FROM accessAnalyticsDaily, json_each(accessAnalyticsDaily.metrics)
           GROUP BY accessAnalyticsDaily.scope, accessAnalyticsDaily.entityId, json_each.key
         )
         GROUP BY scope, entityId`,
      )
      .bind(ACCESS_ANALYTICS_ALL_TIME_PERIOD, checkedAt, checkedAt),
  ])
}

function daysInRange(start: number, end: number) {
  const days: string[] = []
  for (let value = start; value < end; value += 24 * 60 * 60 * 1000) {
    days.push(new Date(value).toISOString().slice(0, 10))
  }
  return days
}

function dayValue(value: unknown) {
  if (typeof value === 'string') {
    if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10)
    const parsed = Date.parse(value)
    return Number.isFinite(parsed) ? new Date(parsed).toISOString().slice(0, 10) : null
  }
  const number = numberValue(value)
  if (number === null) return null
  const milliseconds = number < 1_000_000_000_000 ? number * 1_000 : number
  return new Date(milliseconds).toISOString().slice(0, 10)
}

function numberValue(value: unknown) {
  const number = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(number) ? number : null
}

const timestamp = (value: number) =>
  new Date(value).toISOString().replace('T', ' ').replace('.000Z', '')

const startOfDay = (value: number) => {
  const date = new Date(value)
  date.setUTCHours(0, 0, 0, 0)
  return date.getTime()
}
