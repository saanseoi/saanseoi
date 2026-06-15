import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core'

import { ingestRunStatuses } from '../../constants/schema'
import { metaReleases } from './datasets'
import { jsonText, timestamps } from './_shared'

export const ingestRuns = sqliteTable(
  'ingestRuns',
  {
    runId: text('runId').primaryKey(),
    releaseId: text('releaseId')
      .notNull()
      .references(() => metaReleases.id),
    phase: text('phase').notNull(),
    status: text('status', { enum: ingestRunStatuses }).notNull(),
    stats: jsonText('stats'),
    error: jsonText('error'),
    startedAt: text('startedAt').notNull(),
    finishedAt: text('finishedAt'),
    ...timestamps,
  },
  table => [
    uniqueIndex('ingestRuns_release_phase_unique_idx').on(table.releaseId, table.phase),
  ],
)

export const stats = sqliteTable(
  'stats',
  {
    id: text('id').primaryKey(),
    type: text('type').notNull(),
    releaseId: text('releaseId')
      .notNull()
      .references(() => metaReleases.id),
    dimension: text('dimension').notNull(),
    metric: text('metric').notNull(),
    metricUnit: text('metricUnit').notNull(),
    value: real('value').notNull(),
    groupBy: text('groupBy'),
    groupValue: text('groupValue'),
    ...timestamps,
  },
  table => [
    index('stats_releaseId_idx').on(table.releaseId),
    index('stats_dimension_idx').on(
      table.type,
      table.dimension,
      table.metric,
      table.groupBy,
      table.groupValue,
    ),
  ],
)

export const entityAliases = sqliteTable(
  'entityAliases',
  {
    aliasId: text('aliasId').primaryKey(),
    entityType: text('entityType').notNull(),
    aliasValue: text('aliasValue').notNull(),
    canonicalId: text('canonicalId').notNull(),
    sourceSystem: text('sourceSystem').notNull(),
    isCurrent: integer('isCurrent', { mode: 'boolean' }).notNull(),
    validFromMonth: text('validFromMonth'),
    validToMonth: text('validToMonth'),
    notes: text('notes'),
    ...timestamps,
  },
  table => [
    uniqueIndex('entityAliases_entityType_aliasValue_unique_idx').on(
      table.entityType,
      table.aliasValue,
    ),
    index('entityAliases_canonical_lookup_idx').on(table.entityType, table.canonicalId),
  ],
)
