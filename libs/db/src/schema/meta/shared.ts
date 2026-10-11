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

import { processingRunStatuses } from '../../constants/schema'
import { metaApiReleaseSets, metaSnapshots } from './api'
import { metaResourceReleases } from './datasets'
import { jsonText, timestamps } from '../shared'

export const processingRuns = sqliteTable(
  'processingRuns',
  {
    runId: text('runId').primaryKey(),
    resourceReleaseId: text('resourceReleaseId').references(
      () => metaResourceReleases.id,
    ),
    snapshotId: text('snapshotId').references(() => metaSnapshots.id),
    apiReleaseSetId: text('apiReleaseSetId').references(() => metaApiReleaseSets.id),
    stage: text('stage', { enum: ['ingestion', 'assembly', 'composition'] }).notNull(),
    phase: text('phase').notNull(),
    checkpoint: jsonText('checkpoint'),
    attempt: integer('attempt').notNull().default(1),
    status: text('status', { enum: processingRunStatuses }).notNull(),
    results: jsonText('results'),
    error: jsonText('error'),
    startedAt: text('startedAt').notNull(),
    finishedAt: text('finishedAt'),
    ...timestamps,
  },
  table => [
    check(
      'processingRuns_owner_chk',
      sql`(${table.resourceReleaseId} IS NOT NULL) + (${table.snapshotId} IS NOT NULL) + (${table.apiReleaseSetId} IS NOT NULL) = 1`,
    ),
    uniqueIndex('processingRuns_snapshot_phase_unique_idx').on(
      table.snapshotId,
      table.phase,
    ),
    uniqueIndex('processingRuns_composition_phase_unique_idx').on(
      table.apiReleaseSetId,
      table.phase,
    ),
    uniqueIndex('processingRuns_release_phase_unique_idx').on(
      table.resourceReleaseId,
      table.phase,
    ),
  ],
)

export const stats = sqliteTable(
  'stats',
  {
    id: text('id').primaryKey(),
    resourceReleaseId: text('resourceReleaseId').references(
      () => metaResourceReleases.id,
    ),
    apiReleaseSetId: text('apiReleaseSetId').references(() => metaApiReleaseSets.id, {
      onDelete: 'cascade',
    }),
    category: text('category').notNull(),
    measure: text('measure').notNull(),
    unit: text('unit').notNull(),
    value: real('value').notNull(),
    dimension: text('dimension'),
    dimensionValue: text('dimensionValue'),
    ...timestamps,
  },
  table => [
    index('stats_resourceReleaseId_idx').on(table.resourceReleaseId),
    index('stats_apiReleaseSetId_idx').on(table.apiReleaseSetId),
    index('stats_dimension_idx').on(
      table.category,
      table.measure,
      table.dimension,
      table.dimensionValue,
    ),
    check(
      'stats_owner_chk',
      sql`(${table.resourceReleaseId} IS NOT NULL) != (${table.apiReleaseSetId} IS NOT NULL)`,
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
