const API_KEY_PATTERN = /^SS-[A-Za-z0-9_-]{43}$/

export type AuthenticatedApiKey = { id: string; userId: string }

type ApiKeyRecord = AuthenticatedApiKey & { revokedAt: number | null }

export type ApiKeyAuthenticationResult =
  | { ok: true; apiKey: AuthenticatedApiKey }
  | {
      ok: false
      status: 401 | 403
      error: 'invalid_api_key' | 'revoked_api_key'
      message: string
    }

export const authenticateApiKey = async ({
  d1,
  rawKey,
}: {
  d1: D1Database
  rawKey: string | null
}): Promise<ApiKeyAuthenticationResult> => {
  if (!rawKey || !API_KEY_PATTERN.test(rawKey)) return invalidApiKey()
  const key = await d1
    .prepare(
      `SELECT id, user_id AS userId, revoked_at AS revokedAt
       FROM api_key WHERE key_digest = ? LIMIT 1`,
    )
    .bind(await sha256(rawKey))
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
  return { ok: true, apiKey: { id: key.id, userId: key.userId } }
}

const invalidApiKey = (): ApiKeyAuthenticationResult => ({
  ok: false,
  status: 401,
  error: 'invalid_api_key',
  message: 'A valid API key is required.',
})

const sha256 = async (value: string) => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(digest)]
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('')
}
