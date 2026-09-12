export type UsageMinute = {
  apiKeyId: string
  requestCount: number
  windowStartedAt: number
}

export type UsageCheckpoint = {
  datasets: string
  revision: string
  completedThrough: number
}

export const readUsageCheckpoint = (db: D1Database) =>
  db
    .prepare(`SELECT datasets, revision, completed_through AS completedThrough
    FROM apiKeyUsageRollup WHERE id = 'public-api-usage'`)
    .first<UsageCheckpoint>()

const ownsRevision = `(SELECT revision FROM apiKeyUsageRollup WHERE id = 'public-api-usage') = ?`

/** Every statement shares one D1 transaction, including its optimistic revision claim. */
export async function commitUsageWindow(args: {
  db: D1Database
  checkpoint: UsageCheckpoint | null
  datasets: string
  start: number
  end: number
  rows: UsageMinute[]
}) {
  const { db, checkpoint, datasets, start, end, rows } = args
  const revision = crypto.randomUUID()
  const statements = [
    db
      .prepare(`INSERT INTO apiKeyUsageRollup (id, datasets, revision, completed_through)
      VALUES ('public-api-usage', ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET revision = excluded.revision
      WHERE apiKeyUsageRollup.revision = ? AND apiKeyUsageRollup.datasets = excluded.datasets`)
      .bind(datasets, revision, start, checkpoint?.revision ?? null),
    // Retain zero minute rows so their keys still participate in the aggregate rebuild.
    db
      .prepare(`UPDATE apiKeyUsage SET request_count = 0
      WHERE window = 'minute' AND window_started_at >= ? AND window_started_at < ?
        AND ${ownsRevision}`)
      .bind(start, end, revision),
  ]
  // JSON payloads keep SQL text and parameter counts bounded independently of row count.
  for (let offset = 0; offset < rows.length; offset += 250) {
    statements.push(
      db
        .prepare(`INSERT INTO apiKeyUsage (api_key_id, window, window_started_at, request_count)
      SELECT apiKey.id, 'minute', json_extract(value, '$.windowStartedAt'), json_extract(value, '$.requestCount')
      FROM json_each(?) JOIN apiKey ON apiKey.id = json_extract(value, '$.apiKeyId')
      WHERE ${ownsRevision}
      ON CONFLICT(api_key_id, window, window_started_at) DO UPDATE SET request_count = excluded.request_count`)
        .bind(JSON.stringify(rows.slice(offset, offset + 250)), revision),
    )
  }

  const periods = new Map<
    string,
    { window: 'day' | 'month'; start: number; end: number }
  >()
  const day = new Date(start)
  day.setUTCHours(0, 0, 0, 0)
  for (; day.getTime() < end; day.setUTCDate(day.getUTCDate() + 1)) {
    periods.set(`day:${day.getTime()}`, {
      window: 'day',
      start: day.getTime(),
      end: day.getTime() + 86_400_000,
    })
    const month = new Date(day)
    month.setUTCDate(1)
    const nextMonth = new Date(month)
    nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1)
    periods.set(`month:${month.getTime()}`, {
      window: 'month',
      start: month.getTime(),
      end: nextMonth.getTime(),
    })
  }
  for (const period of periods.values()) {
    statements.push(
      db
        .prepare(`INSERT INTO apiKeyUsage (api_key_id, window, window_started_at, request_count)
      SELECT apiKey.id, ?, ?, COALESCE(SUM(minute.request_count), 0)
      FROM apiKey LEFT JOIN apiKeyUsage AS minute
        ON minute.api_key_id = apiKey.id AND minute.window = 'minute'
        AND minute.window_started_at >= ? AND minute.window_started_at < ?
      WHERE ${ownsRevision} AND apiKey.id IN (
        SELECT api_key_id FROM apiKeyUsage WHERE window = 'minute'
          AND window_started_at >= ? AND window_started_at < ?
      )
      GROUP BY apiKey.id
      ON CONFLICT(api_key_id, window, window_started_at) DO UPDATE SET request_count = excluded.request_count`)
        .bind(
          period.window,
          period.start,
          period.start,
          period.end,
          revision,
          start,
          end,
        ),
    )
  }
  statements.push(
    db
      .prepare(`UPDATE apiKeyUsageRollup SET completed_through = ?
    WHERE id = 'public-api-usage' AND revision = ?`)
      .bind(Math.max(checkpoint?.completedThrough ?? start, end), revision),
  )
  const results = await db.batch(statements)
  return results.at(-1)?.meta.changes === 1
}
