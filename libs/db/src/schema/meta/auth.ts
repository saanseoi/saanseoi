import { sql } from 'drizzle-orm'
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

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

export const user = sqliteTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: integer('email_verified', { mode: 'boolean' })
    .default(false)
    .notNull(),
  image: text('image'),
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
