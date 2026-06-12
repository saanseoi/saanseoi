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

export const ingestRuns = sqliteTable('ingestRuns', {
  runId: text('runId').primaryKey(),
  releaseId: text('releaseId')
    .notNull()
    .references(() => metaReleases.id),
  phase: text('phase').notNull(),
  status: text('status', { enum: ingestRunStatuses }).notNull(),
  statsJson: text('statsJson'),
  errorJson: text('errorJson'),
  startedAt: text('startedAt').notNull(),
  finishedAt: text('finishedAt'),
  createdAt: text('createdAt').notNull(),
  updatedAt: text('updatedAt').notNull(),
})

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
    createdAt: text('createdAt').notNull(),
    updatedAt: text('updatedAt').notNull(),
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
    createdAt: text('createdAt').notNull(),
    updatedAt: text('updatedAt').notNull(),
  },
  table => [
    uniqueIndex('entityAliases_entityType_aliasValue_unique_idx').on(
      table.entityType,
      table.aliasValue,
    ),
    index('entityAliases_canonical_lookup_idx').on(table.entityType, table.canonicalId),
  ],
)
