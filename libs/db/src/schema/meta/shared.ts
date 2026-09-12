import {
  check,
  customType,
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'

import { ingestRunStatuses } from '../../constants/schema'
import { metaApiReleaseSets } from './api'
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
    releaseId: text('releaseId').references(() => metaReleases.id),
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
    index('stats_apiReleaseSetId_idx').on(table.apiReleaseSetId),
    index('stats_dimension_idx').on(
      table.dimension,
      table.metric,
      table.groupBy,
      table.groupValue,
    ),
    check(
      'stats_owner_chk',
      sql`(${table.releaseId} IS NOT NULL) != (${table.apiReleaseSetId} IS NOT NULL)`,
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
    generation: text('generation').notNull(),
    decisionCount: integer('decisionCount').notNull(),
    affectedRecordCount: integer('affectedRecordCount').notNull(),
    ...timestamps,
  },
  table => [
    index('releaseProcessingActions_releaseId_idx').on(table.releaseId),
    index('releaseProcessingActions_action_idx').on(table.action, table.mode),
  ],
)

const auditBlob = customType<{ data: Uint8Array; driverData: Uint8Array }>({
  dataType: () => 'blob',
  toDriver: value => Uint8Array.from(value),
  fromDriver: value => new Uint8Array(value),
})

// Chunks are staged before the summary generation is switched. Their lifetime is
// release-owned, rather than tied to the currently visible summary rows.
export const releaseProcessingActionChunks = sqliteTable(
  'releaseProcessingActionChunks',
  {
    id: text('id').primaryKey(),
    releaseId: text('releaseId')
      .notNull()
      .references(() => metaReleases.id, { onDelete: 'cascade' }),
    actionId: text('actionId').notNull(),
    generation: text('generation').notNull(),
    firstOrdinal: integer('firstOrdinal').notNull(),
    decisionCount: integer('decisionCount').notNull(),
    part: integer('part').notNull(),
    parts: integer('parts').notNull(),
    encoding: text('encoding', { enum: ['gzip-json-v1'] }).notNull(),
    checksum: text('checksum').notNull(),
    payload: auditBlob('payload').notNull(),
  },
  table => [
    index('releaseProcessingActionChunks_page_idx').on(
      table.actionId,
      table.generation,
      table.firstOrdinal,
      table.part,
    ),
    index('releaseProcessingActionChunks_release_idx').on(table.releaseId),
    check(
      'releaseProcessingActionChunks_payload_chk',
      sql`length(${table.payload}) <= 32768`,
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
