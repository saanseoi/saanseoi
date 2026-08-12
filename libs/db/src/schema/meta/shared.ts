import {
  check,
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'

import { ingestRunStatuses } from '../../constants/schema'
import { metaApiReleaseSets, metaSnapshots } from './api'
import { metaReleases } from './datasets'
import { jsonText, timestamps } from '../shared'

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
    releaseId: text('releaseId').references(() => metaReleases.id),
    snapshotId: text('snapshotId').references(() => metaSnapshots.id, {
      onDelete: 'cascade',
    }),
    apiReleaseSetId: text('apiReleaseSetId').references(() => metaApiReleaseSets.id, {
      onDelete: 'cascade',
    }),
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
    index('stats_snapshotId_idx').on(table.snapshotId),
    index('stats_apiReleaseSetId_idx').on(table.apiReleaseSetId),
    index('stats_dimension_idx').on(
      table.type,
      table.dimension,
      table.metric,
      table.groupBy,
      table.groupValue,
    ),
    check(
      'stats_owner_chk',
      sql`${table.releaseId} IS NOT NULL OR ${table.snapshotId} IS NOT NULL OR ${table.apiReleaseSetId} IS NOT NULL`,
    ),
  ],
)

export const releaseProcessingActions = sqliteTable(
  'releaseProcessingActions',
  {
    id: text('id').primaryKey(),
    releaseId: text('releaseId')
      .notNull()
      .references(() => metaReleases.id, { onDelete: 'cascade' }),
    action: text('action').notNull(),
    mode: text('mode', { enum: ['automatic', 'manual'] }).notNull(),
    summary: text('summary').notNull(),
    affectedRecordCount: integer('affectedRecordCount').notNull(),
    evidence: jsonText('evidence').notNull(),
    ...timestamps,
  },
  table => [
    index('releaseProcessingActions_releaseId_idx').on(table.releaseId),
    index('releaseProcessingActions_action_idx').on(table.action, table.mode),
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
