import {
  isCurrentPublicKeyLease,
  publicApiKeyDigest,
  publicApiKeyPattern,
  publicKeyLeaseStorageKey,
  type PublicKeyLease,
} from '@repo/core/publicApiKey'

import type { AppBindings } from './types'

const LEASE_MS = 15 * 60 * 1_000
const PROPAGATION_BUFFER_MS = 2 * 60 * 1_000

type ApiKeyRecord = {
  id: string
  revokedAt: number | null
  requestsPerDay: number | null
  requestsPerMonth: number | null
}

type OriginPolicyRecord = {
  action: 'allow' | 'block'
  hostname: string
}

/** Serialises stale lease refreshes; normal requests read the shared KV lease. */
export class PublicKeyLeaseCoordinator {
  #inFlight = new Map<string, Promise<PublicKeyLease | null>>()
  #leases = new Map<string, PublicKeyLease>()

  constructor(
    readonly _state: DurableObjectState,
    readonly env: AppBindings,
  ) {}

  async fetch(request: Request) {
    if (request.method !== 'POST' || new URL(request.url).pathname !== '/refresh') {
      return new Response('Not found', { status: 404 })
    }
    const body = await request.json<{ apiKey?: unknown }>().catch(() => null)
    if (typeof body?.apiKey !== 'string' || !publicApiKeyPattern.test(body.apiKey)) {
      return new Response('Invalid public key', { status: 401 })
    }

    const digest = await publicApiKeyDigest(body.apiKey)
    const inFlight = this.#inFlight.get(digest)
    const refresh = inFlight ?? this.refresh(digest)
    if (!inFlight) {
      this.#inFlight.set(digest, refresh)
      void refresh.then(
        () => this.#inFlight.delete(digest),
        () => this.#inFlight.delete(digest),
      )
    }

    const lease = await refresh
    return lease
      ? Response.json(lease)
      : new Response('Invalid or revoked public key', { status: 401 })
  }

  async refresh(digest: string): Promise<PublicKeyLease | null> {
    const storageKey = publicKeyLeaseStorageKey(digest)
    const now = Date.now()
    const inMemory = this.#leases.get(digest)
    if (isCurrentPublicKeyLease(inMemory, now)) return inMemory
    const cached = await this.env.PUBLIC_KEY_LEASES.get<PublicKeyLease>(
      storageKey,
      'json',
    )
    if (isCurrentPublicKeyLease(cached, now)) {
      this.#leases.set(digest, cached)
      return cached
    }

    const key = await this.env.DB_META.prepare(
      `SELECT id, revoked_at AS revokedAt,
         requests_per_day AS requestsPerDay, requests_per_month AS requestsPerMonth
       FROM apiKey
       WHERE key_digest = ?
       LIMIT 1`,
    )
      .bind(digest)
      .first<ApiKeyRecord>()
    if (!key || key.revokedAt !== null) return null

    const originPolicy = await this.getOriginPolicy(key.id)
    const quota = await this.getQuotaStatus(key, now)
    const lease: PublicKeyLease = {
      keyId: key.id,
      ...quota,
      nextCheckAt: Math.min(now + LEASE_MS, quota.resetAt ?? Infinity),
      originPolicy,
    }

    await Promise.all([
      this.env.PUBLIC_KEY_LEASES.put(storageKey, JSON.stringify(lease), {
        expiration: Math.floor((lease.nextCheckAt + PROPAGATION_BUFFER_MS) / 1_000),
      }),
      this.env.DB_META.prepare('UPDATE apiKey SET last_used_at = ? WHERE id = ?')
        .bind(now, key.id)
        .run(),
    ])
    this.#leases.set(digest, lease)
    return lease
  }

  /** Quotas use settled usage; edge rate limits remain the immediate abuse guard. */
  async getQuotaStatus(
    key: ApiKeyRecord,
    now: number,
  ): Promise<Pick<PublicKeyLease, 'status' | 'resetAt'>> {
    if (key.requestsPerDay == null && key.requestsPerMonth == null)
      return { status: 'active' }
    const day = new Date(now)
    day.setUTCHours(0, 0, 0, 0)
    const month = new Date(day)
    month.setUTCDate(1)
    const nextMonth = new Date(month)
    nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1)
    const usage = await this.env.DB_META.prepare(
      `SELECT window, request_count AS requestCount FROM apiKeyUsage
       WHERE api_key_id = ? AND (
         (window = 'day' AND window_started_at = ?) OR
         (window = 'month' AND window_started_at = ?)
       )`,
    )
      .bind(key.id, day.getTime(), month.getTime())
      .all<{ window: 'day' | 'month'; requestCount: number }>()
    let resetAt: number | undefined
    for (const [window, limit, reset] of [
      ['day', key.requestsPerDay, day.getTime() + 86_400_000],
      ['month', key.requestsPerMonth, nextMonth.getTime()],
    ] as const) {
      const count = usage.results.find(row => row.window === window)?.requestCount ?? 0
      if (limit != null && count >= limit) resetAt = Math.max(resetAt ?? 0, reset)
    }
    return resetAt === undefined
      ? { status: 'active' }
      : { status: 'exhausted', resetAt }
  }

  async getOriginPolicy(keyId: string) {
    const result = await this.env.DB_META.prepare(
      `SELECT hostname, action
       FROM apiKeyOriginPolicy
       WHERE api_key_id = ?`,
    )
      .bind(keyId)
      .all<OriginPolicyRecord>()
    const allowedHostnames: string[] = []
    const blockedHostnames: string[] = []
    for (const rule of result.results) {
      const hostname = rule.hostname.toLowerCase()
      if (rule.action === 'allow') allowedHostnames.push(hostname)
      if (rule.action === 'block') blockedHostnames.push(hostname)
    }
    return { allowedHostnames, blockedHostnames }
  }
}
