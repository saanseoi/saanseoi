import { sql } from 'drizzle-orm'
import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'

import { defaultIsoTimestamp, isoTimestamp, toIsoTimestamp } from '../shared'

const betterAuthTimestamp = (name: string) => integer(name, { mode: 'timestamp_ms' })

const defaultBetterAuthTimestamp = (name: string) =>
  betterAuthTimestamp(name).default(
    sql`(cast(unixepoch('subsecond') * 1000 as integer))`,
  )

export const substackStatuses = [
  'failed',
  'pending',
  'subscribed',
  'unsubscribed',
] as const

export type SubstackStatus = (typeof substackStatuses)[number]

export const userRoles = ['user', 'admin'] as const

export type UserRole = (typeof userRoles)[number]

export const user = sqliteTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: integer('email_verified', { mode: 'boolean' })
    .default(false)
    .notNull(),
  image: text('image'),
  role: text('role', { enum: userRoles }).default('user').notNull(),
  substack: text('substack', {
    enum: substackStatuses,
  }),
  createdAt: defaultBetterAuthTimestamp('created_at').notNull(),
  updatedAt: defaultBetterAuthTimestamp('updated_at')
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
})

export const newsletterSubscription = sqliteTable(
  'newsletterSubscription',
  {
    email: text('email').primaryKey(),
    status: text('status', {
      enum: substackStatuses,
    })
      .default('pending')
      .notNull(),
    lastError: text('last_error'),
    subscribedAt: isoTimestamp('subscribed_at'),
    createdAt: defaultIsoTimestamp('created_at').notNull(),
    updatedAt: defaultIsoTimestamp('updated_at')
      .$onUpdate(() => /* @__PURE__ */ toIsoTimestamp())
      .notNull(),
  },
  table => [index('newsletterSubscription_status_idx').on(table.status)],
)

export const session = sqliteTable(
  'session',
  {
    id: text('id').primaryKey(),
    expiresAt: betterAuthTimestamp('expires_at').notNull(),
    token: text('token').notNull().unique(),
    createdAt: defaultBetterAuthTimestamp('created_at').notNull(),
    updatedAt: betterAuthTimestamp('updated_at')
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
  },
  table => [index('session_userId_idx').on(table.userId)],
)

export const account = sqliteTable(
  'account',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: betterAuthTimestamp('access_token_expires_at'),
    refreshTokenExpiresAt: betterAuthTimestamp('refresh_token_expires_at'),
    scope: text('scope'),
    password: text('password'),
    createdAt: defaultBetterAuthTimestamp('created_at').notNull(),
    updatedAt: betterAuthTimestamp('updated_at')
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  table => [index('account_userId_idx').on(table.userId)],
)

export const verification = sqliteTable(
  'verification',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: betterAuthTimestamp('expires_at').notNull(),
    createdAt: defaultBetterAuthTimestamp('created_at').notNull(),
    updatedAt: defaultBetterAuthTimestamp('updated_at')
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  table => [index('verification_identifier_idx').on(table.identifier)],
)

export const apiKey = sqliteTable(
  'api_key',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    prefix: text('prefix').notNull(),
    keyDigest: text('key_digest').notNull().unique(),
    requestsPerMinute: integer('requests_per_minute'),
    requestsPerDay: integer('requests_per_day'),
    requestsPerMonth: integer('requests_per_month'),
    lastUsedAt: betterAuthTimestamp('last_used_at'),
    revokedAt: betterAuthTimestamp('revoked_at'),
    createdAt: defaultBetterAuthTimestamp('created_at').notNull(),
    updatedAt: defaultBetterAuthTimestamp('updated_at')
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  table => [
    index('api_key_userId_idx').on(table.userId),
    index('api_key_userId_revokedAt_idx').on(table.userId, table.revokedAt),
  ],
)

export const apiKeyUsageWindows = ['minute', 'day', 'month'] as const

export type ApiKeyUsageWindow = (typeof apiKeyUsageWindows)[number]

export const apiKeyUsage = sqliteTable(
  'api_key_usage',
  {
    apiKeyId: text('api_key_id')
      .notNull()
      .references(() => apiKey.id, { onDelete: 'cascade' }),
    window: text('window', { enum: apiKeyUsageWindows }).notNull(),
    windowStartedAt: betterAuthTimestamp('window_started_at').notNull(),
    requestCount: integer('request_count').default(0).notNull(),
    softLimitNotifiedAt: betterAuthTimestamp('soft_limit_notified_at'),
  },
  table => [
    primaryKey({ columns: [table.apiKeyId, table.window, table.windowStartedAt] }),
  ],
)
