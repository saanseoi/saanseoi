import {
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
  requestsPerMinute: number | null
  requestsPerDay: number | null
  requestsPerMonth: number | null
  revokedAt: number | null
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
    if (inMemory && inMemory.nextCheckAt > now) return inMemory
    const cached = await this.env.PUBLIC_KEY_LEASES.get<PublicKeyLease>(
      storageKey,
      'json',
    )
    if (cached && cached.nextCheckAt > now) {
      this.#leases.set(digest, cached)
      return cached
    }

    const key = await this.env.DB_META.prepare(
      `SELECT id,
              requests_per_minute AS requestsPerMinute,
              requests_per_day AS requestsPerDay,
              requests_per_month AS requestsPerMonth,
              revoked_at AS revokedAt
       FROM api_key
       WHERE key_digest = ?
       LIMIT 1`,
    )
      .bind(digest)
      .first<ApiKeyRecord>()
    if (!key || key.revokedAt !== null) return null

    const originPolicy = await this.getOriginPolicy(key.id)
    const lease: PublicKeyLease = {
      keyId: key.id,
      status: 'active',
      nextCheckAt: now + LEASE_MS,
      originPolicy,
    }

    await Promise.all([
      this.env.PUBLIC_KEY_LEASES.put(storageKey, JSON.stringify(lease), {
        expiration: Math.floor((lease.nextCheckAt + PROPAGATION_BUFFER_MS) / 1_000),
      }),
      this.env.DB_META.prepare('UPDATE api_key SET last_used_at = ? WHERE id = ?')
        .bind(now, key.id)
        .run(),
    ])
    this.#leases.set(digest, lease)
    return lease
  }

  async getOriginPolicy(keyId: string) {
    const result = await this.env.DB_META.prepare(
      `SELECT hostname, action
       FROM api_key_origin_policy
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
