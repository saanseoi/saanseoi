import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

export const datasets = sqliteTable(
  'datasets',
  {
    datasetId: text('datasetId').primaryKey(),
    regionCode: text('regionCode').notNull(),
    snapshotMonth: text('snapshotMonth').notNull(),
    theme: text('theme').notNull(),
    type: text('type').notNull(),
    source: text('source').notNull(),
    sourceVersion: text('sourceVersion').notNull(),
    rawObjectKey: text('rawObjectKey').notNull(),
    originalFileName: text('originalFileName').notNull(),
    status: text('status').notNull(),
    isActive: integer('isActive', { mode: 'boolean' }).notNull(),
    supersedesDatasetId: text('supersedesDatasetId'),
    revokedAt: text('revokedAt'),
    revocationReason: text('revocationReason'),
    ingestedAt: text('ingestedAt').notNull(),
  },
  table => ({
    activeLookupIdx: index('datasets_active_lookup_idx').on(
      table.regionCode,
      table.source,
      table.sourceVersion,
      table.type,
      table.isActive,
    ),
    monthThemeUniqueIdx: uniqueIndex('datasets_dataset_id_unique_idx').on(
      table.datasetId,
    ),
  }),
)

export const ingestRuns = sqliteTable('ingestRuns', {
  runId: text('runId').primaryKey(),
  datasetId: text('datasetId')
    .notNull()
    .references(() => datasets.datasetId),
  phase: text('phase').notNull(),
  status: text('status').notNull(),
  statsJson: text('statsJson'),
  errorJson: text('errorJson'),
  startedAt: text('startedAt').notNull(),
  finishedAt: text('finishedAt'),
})

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
  },
  table => ({
    aliasUniqueIdx: uniqueIndex('entityAliases_entityType_aliasValue_unique_idx').on(
      table.entityType,
      table.aliasValue,
    ),
    canonicalLookupIdx: index('entityAliases_canonical_lookup_idx').on(
      table.entityType,
      table.canonicalId,
    ),
  }),
)
