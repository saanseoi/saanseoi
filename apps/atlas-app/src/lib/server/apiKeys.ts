import { and, desc, eq, isNull } from '@repo/db'
import { createMetaDb } from '@repo/db/client'
import { apiKey } from '@repo/db/metaSchema'

const encoder = new TextEncoder()

const toBase64Url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '')

const digestKey = async (key: string) => {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(key))
  return [...new Uint8Array(digest)]
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('')
}

export const listApiKeys = (d1: D1Database, userId: string) =>
  createMetaDb(d1)
    .select({
      id: apiKey.id,
      name: apiKey.name,
      prefix: apiKey.prefix,
      requestsPerMinute: apiKey.requestsPerMinute,
      requestsPerDay: apiKey.requestsPerDay,
      requestsPerMonth: apiKey.requestsPerMonth,
      lastUsedAt: apiKey.lastUsedAt,
      revokedAt: apiKey.revokedAt,
      createdAt: apiKey.createdAt,
    })
    .from(apiKey)
    .where(eq(apiKey.userId, userId))
    .orderBy(desc(apiKey.createdAt))

export const createApiKey = async (d1: D1Database, userId: string, name: string) => {
  const rawKey = `pk.${toBase64Url(crypto.getRandomValues(new Uint8Array(32)))}`
  const keyDigest = await digestKey(rawKey)
  const prefix = `${rawKey.slice(0, 13)}…`
  const db = createMetaDb(d1)

  await db.insert(apiKey).values({
    id: crypto.randomUUID(),
    userId,
    name,
    prefix,
    keyDigest,
  })

  return { rawKey, prefix }
}

export const revokeApiKey = (d1: D1Database, userId: string, keyId: string) =>
  createMetaDb(d1)
    .update(apiKey)
    .set({ revokedAt: new Date() })
    .where(
      and(eq(apiKey.id, keyId), eq(apiKey.userId, userId), isNull(apiKey.revokedAt)),
    )
