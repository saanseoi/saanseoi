import { sendTelegramAdminMessage } from './telegram'

const API_KEY_PATTERN = /^SS-[A-Za-z0-9_-]{43}$/
const LAST_USED_UPDATE_INTERVAL_MS = 5 * 60 * 1000

export const defaultApiKeyLimits = {
  minute: 120,
  day: 100_000,
  month: 1_000_000,
} as const

type ApiKeyLimitWindow = keyof typeof defaultApiKeyLimits

type ApiKeyRecord = {
  id: string
  name: string
  userId: string
  userEmail: string
  userRole: 'user' | 'admin'
  revokedAt: number | null
  requestsPerMinute: number | null
  requestsPerDay: number | null
  requestsPerMonth: number | null
}

type UsageWindow = {
  window: ApiKeyLimitWindow
  startedAt: number
  retryAfterSeconds: number
}

export type AuthenticatedApiKey = {
  id: string
  userId: string
  limits: Record<ApiKeyLimitWindow, number>
}

type AuthenticateApiKeyInput = {
  d1: D1Database
  rawKey: string | null
  telegram: {
    botToken: string
    chatId: string
  }
  notify: (promise: Promise<unknown>) => void
}

export type ApiKeyAuthenticationResult =
  | { ok: true; apiKey: AuthenticatedApiKey }
  | {
      ok: false
      status: 401 | 403 | 429
      error: 'invalid_api_key' | 'revoked_api_key' | 'rate_limit_exceeded'
      message: string
      retryAfterSeconds?: number
    }

export async function authenticateApiKey(
  input: AuthenticateApiKeyInput,
): Promise<ApiKeyAuthenticationResult> {
  if (!input.rawKey || !API_KEY_PATTERN.test(input.rawKey)) return invalidApiKey()

  const keyDigest = await sha256(input.rawKey)
  const key = await input.d1
    .prepare(
      `SELECT
        api_key.id AS id,
        api_key.name AS name,
        api_key.user_id AS userId,
        user.email AS userEmail,
        user.role AS userRole,
        api_key.revoked_at AS revokedAt,
        api_key.requests_per_minute AS requestsPerMinute,
        api_key.requests_per_day AS requestsPerDay,
        api_key.requests_per_month AS requestsPerMonth
      FROM api_key
      INNER JOIN user ON user.id = api_key.user_id
      WHERE api_key.key_digest = ?
      LIMIT 1`,
    )
    .bind(keyDigest)
    .first<ApiKeyRecord>()

  if (!key) return invalidApiKey()
  if (key.revokedAt !== null) {
    return {
      ok: false,
      status: 403,
      error: 'revoked_api_key',
      message: 'This API key has been revoked.',
    }
  }

  const limits = resolveLimits(key)
  const usageWindows = getUsageWindows(new Date())
  const usage = await Promise.all(
    usageWindows.map(window => incrementUsage(input.d1, key.id, window)),
  )

  for (const item of usage) {
    const limit = limits[item.window.window]
    if (item.requestCount > limit && item.softLimitNotifiedAt === null) {
      const notified = await markSoftLimitNotified(input.d1, key.id, item.window)
      if (notified) {
        input.notify(
          sendTelegramAdminMessage({
            botToken: input.telegram.botToken,
            chatId: input.telegram.chatId,
            text: [
              'API key exceeded a soft limit.',
              `Key: ${key.name} (${key.id})`,
              `Account: ${key.userEmail} (${key.userId})`,
              `Window: ${item.window.window}`,
              `Usage: ${item.requestCount}/${limit}`,
              `Time: ${new Date().toISOString()}`,
            ].join('\n'),
          }),
        )
      }
    }
  }

  const exceededHardLimit = usage
    .map(item => ({
      ...item,
      limit: limits[item.window.window],
    }))
    .find(item => item.requestCount > Math.floor(item.limit * 1.25))

  if (exceededHardLimit) {
    return {
      ok: false,
      status: 429,
      error: 'rate_limit_exceeded',
      message: 'This API key has exceeded its current usage limit.',
      retryAfterSeconds: exceededHardLimit.window.retryAfterSeconds,
    }
  }

  input.notify(updateLastUsedAt(input.d1, key.id))

  return {
    ok: true,
    apiKey: {
      id: key.id,
      userId: key.userId,
      limits,
    },
  }
}

function invalidApiKey(): ApiKeyAuthenticationResult {
  return {
    ok: false,
    status: 401,
    error: 'invalid_api_key',
    message: 'A valid API key is required.',
  }
}

function resolveLimits(key: ApiKeyRecord): Record<ApiKeyLimitWindow, number> {
  if (key.userRole !== 'admin') return { ...defaultApiKeyLimits }

  return {
    minute: validLimit(key.requestsPerMinute) ?? defaultApiKeyLimits.minute,
    day: validLimit(key.requestsPerDay) ?? defaultApiKeyLimits.day,
    month: validLimit(key.requestsPerMonth) ?? defaultApiKeyLimits.month,
  }
}

function validLimit(value: number | null) {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
    ? value
    : null
}

function getUsageWindows(now: Date): UsageWindow[] {
  const currentTime = now.getTime()
  const minuteStartedAt = Math.floor(currentTime / 60_000) * 60_000
  const dayStartedAt = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  )
  const monthStartedAt = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)

  return [
    {
      window: 'minute',
      startedAt: minuteStartedAt,
      retryAfterSeconds: secondsUntil(minuteStartedAt + 60_000, currentTime),
    },
    {
      window: 'day',
      startedAt: dayStartedAt,
      retryAfterSeconds: secondsUntil(dayStartedAt + 86_400_000, currentTime),
    },
    {
      window: 'month',
      startedAt: monthStartedAt,
      retryAfterSeconds: secondsUntil(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
        currentTime,
      ),
    },
  ]
}

function secondsUntil(endsAt: number, currentTime: number) {
  return Math.max(1, Math.ceil((endsAt - currentTime) / 1000))
}

async function incrementUsage(d1: D1Database, apiKeyId: string, window: UsageWindow) {
  const row = await d1
    .prepare(
      `INSERT INTO api_key_usage (api_key_id, window, window_started_at, request_count)
       VALUES (?, ?, ?, 1)
       ON CONFLICT(api_key_id, window, window_started_at)
       DO UPDATE SET request_count = request_count + 1
       RETURNING request_count AS requestCount, soft_limit_notified_at AS softLimitNotifiedAt`,
    )
    .bind(apiKeyId, window.window, window.startedAt)
    .first<{ requestCount: number; softLimitNotifiedAt: number | null }>()

  if (!row) throw new Error('Failed to record API key usage.')

  return {
    window,
    requestCount: row.requestCount,
    softLimitNotifiedAt: row.softLimitNotifiedAt,
  }
}

async function markSoftLimitNotified(
  d1: D1Database,
  apiKeyId: string,
  window: UsageWindow,
) {
  const result = await d1
    .prepare(
      `UPDATE api_key_usage
       SET soft_limit_notified_at = ?
       WHERE api_key_id = ?
         AND window = ?
         AND window_started_at = ?
         AND soft_limit_notified_at IS NULL`,
    )
    .bind(Date.now(), apiKeyId, window.window, window.startedAt)
    .run()

  return result.meta.changes === 1
}

async function updateLastUsedAt(d1: D1Database, apiKeyId: string) {
  const now = Date.now()
  await d1
    .prepare(
      `UPDATE api_key
       SET last_used_at = ?
       WHERE id = ?
         AND (last_used_at IS NULL OR last_used_at < ?)`,
    )
    .bind(now, apiKeyId, now - LAST_USED_UPDATE_INTERVAL_MS)
    .run()
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(digest)]
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('')
}
