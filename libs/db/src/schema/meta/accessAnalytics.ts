import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'

import { jsonText, timestamps } from '../shared'

export const accessAnalyticsEventTypes = ['api_request', 'download'] as const
export const accessAnalyticsSurfaces = ['source', 'api_release_set'] as const
export const accessAnalyticsRollupScopes = [
  'publisher',
  'source_release',
  'api_release_set',
] as const

/** Daily metric values are JSON numbers keyed by the metric name. The day is UTC. */
export const metaAccessAnalyticsDaily = sqliteTable(
  'accessAnalyticsDaily',
  {
    day: text('day').notNull(),
    scope: text('scope', { enum: accessAnalyticsRollupScopes }).notNull(),
    entityId: text('entityId').notNull(),
    metrics: jsonText<Record<string, number>>('metrics').notNull(),
    ...timestamps,
  },
  table => [
    primaryKey({ columns: [table.day, table.scope, table.entityId] }),
    index('accessAnalyticsDaily_entityId_idx').on(table.entityId),
  ],
)

/**
 * Compact request deduplication state. It contains no serving payload or
 * attribution, and is retained for exact retry handling.
 */
export const metaAccessAnalyticsIdempotency = sqliteTable(
  'accessAnalyticsIdempotency',
  {
    requestIdentity: text('requestIdentity').primaryKey(),
    eventType: text('eventType', { enum: accessAnalyticsEventTypes }).notNull(),
    eligible: integer('eligible', { mode: 'boolean' }).notNull(),
    counted: integer('counted', { mode: 'boolean' }).notNull(),
    ...timestamps,
  },
)

/** Running serving cache. `period` starts with `all_time` and can later hold week/month keys. */
export const metaAccessAnalyticsRollups = sqliteTable(
  'accessAnalyticsRollups',
  {
    period: text('period').notNull(),
    scope: text('scope', { enum: accessAnalyticsRollupScopes }).notNull(),
    entityId: text('entityId').notNull(),
    metrics: jsonText<Record<string, number>>('metrics').notNull(),
    asOf: text('asOf').notNull(),
    ...timestamps,
  },
  table => [
    primaryKey({ columns: [table.period, table.scope, table.entityId] }),
    index('accessAnalyticsRollups_entityId_idx').on(table.entityId),
  ],
)
