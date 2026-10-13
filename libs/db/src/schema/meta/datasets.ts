import { eq, getTableColumns } from 'drizzle-orm'
import type { MetaTranslations } from './i18n'
import {
  foreignKey,
  index,
  primaryKey,
  sqliteTable,
  sqliteView,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core'

import {
  datasetCategories,
  datasetReleaseFrequencies,
  datasetReleaseTypes,
  datasetThemes,
  datasetTypes,
  releaseStatuses,
} from '../../constants/schema'
import { metaLicenses } from './licenses'
import { isoTimestamp, jsonText, primaryUuid, timestamps } from '../shared'
import { metaPublishers } from './publishers'

export const metaDatasets = sqliteTable(
  'datasets',
  {
    id: primaryUuid('id'),
    publisherId: text('publisherId')
      .notNull()
      .references(() => metaPublishers.id, { onDelete: 'restrict' }),
    code: text('code').notNull(),
    regionCode: text('regionCode').notNull(),
    releaseType: text('releaseType', { enum: datasetReleaseTypes }).notNull(),
    releaseFrequency: text('releaseFrequency', {
      enum: datasetReleaseFrequencies,
    }).notNull(),
    theme: text('theme', { enum: datasetThemes }).notNull(),
    // A dataset describes one publisher product. Its independently processable
    // resource outputs are declared on the dataset.
    resourceTypes: text('resourceTypes', { mode: 'json' })
      .$type<(typeof datasetTypes)[number][]>()
      .notNull()
      .default([]),
    kind: text('kind'),
    sourceVariant: text('sourceVariant').notNull().default('default'),
    // Native CRS shared by every release of this source dataset. Source
    // records retain their geometry evidence but must not duplicate this
    // dataset-level metadata on every row.
    sourceCrs: text('sourceCrs'),
    sourceUrl: text('sourceUrl'),
    schemaURL: text('schemaURL'),
    licenseId: text('licenseId').references(() => metaLicenses.id, {
      onDelete: 'restrict',
    }),
    category: text('category', { enum: datasetCategories }),
    attribution: text('attribution'),
    tags: jsonText('tags'),
    // Content-addressed reference to the current resolved ingestion policy.
    // Releases capture this reference so later dataset changes cannot rewrite
    // historic processing decisions.
    processingRules: text('processingRules'),
    i18n: jsonText<MetaTranslations>('i18n').notNull().default({}),
    versionHash: text('versionHash').notNull(),
    ...timestamps,
  },
  table => [
    uniqueIndex('datasets_publisherId_code_unique_idx').on(
      table.publisherId,
      table.code,
    ),
    index('datasets_region_theme_idx').on(table.regionCode, table.theme),
  ],
)

/**
 * A named, reproducible derivative of a dataset resource. Transformations do
 * not create a second publisher or dataset: they retain the originating
 * dataset/release and select an additional geometry variant at read time.
 */
export const metaDatasetTransforms = sqliteTable(
  'datasetTransforms',
  {
    datasetId: text('datasetId')
      .notNull()
      .references(() => metaDatasets.id, { onDelete: 'cascade' }),
    code: text('code').notNull(),
    resourceType: text('resourceType').notNull(),
    sourceVersion: text('sourceVersion').notNull(),
    outputVariant: text('outputVariant').notNull(),
    derivation: jsonText('derivation').notNull(),
    versionHash: text('versionHash').notNull(),
    ...timestamps,
  },
  table => [
    // Source versions are retained independently, while public variants are
    // selected in the context of a dataset and cohort.
    primaryKey({ columns: [table.datasetId, table.code, table.sourceVersion] }),
    index('datasetTransforms_resourceType_idx').on(table.resourceType),
  ],
)

/**
 * One immutable publisher artefact/version. A source release can materialise
 * more than one resource type, so it owns the upstream metadata and archive
 * independently from its resource releases.
 */
export const metaSourceReleases = sqliteTable(
  'sourceReleases',
  {
    id: primaryUuid('id'),
    datasetId: text('datasetId')
      .notNull()
      .references(() => metaDatasets.id, { onDelete: 'restrict' }),
    code: text('code').notNull().unique(),
    sourceVersion: text('sourceVersion').notNull(),
    expectedResourceTypes: text('expectedResourceTypes', { mode: 'json' })
      .$type<string[]>()
      .notNull()
      .default([]),
    sourceSchemaVersion: text('sourceSchemaVersion'),
    publicationDate: text('publicationDate'),
    cohortKey: text('cohortKey'),
    releaseNotesUrl: text('releaseNotesUrl'),
    notes: text('notes'),
    status: text('status', { enum: releaseStatuses }).notNull(),
    // Content-addressed reference to the immutable processingRuleDefinitions row.
    // Releases sharing a policy retain the same reference.
    processingRules: text('processingRules'),
    ingestedAt: isoTimestamp('ingestedAt'),
    revokedAt: isoTimestamp('revokedAt'),
    revocationReason: text('revocationReason'),
    supersededBySourceReleaseId: text('supersededBySourceReleaseId'),
    ...timestamps,
  },
  table => [
    uniqueIndex('sourceReleases_datasetId_sourceVersion_unique_idx').on(
      table.datasetId,
      table.sourceVersion,
    ),
    foreignKey({
      columns: [table.supersededBySourceReleaseId],
      foreignColumns: [table.id],
      name: 'sourceReleases_supersededBySourceReleaseId_sourceReleases_id_fk',
    }).onDelete('set null'),
    index('sourceReleases_status_idx').on(table.status),
    index('sourceReleases_supersededBySourceReleaseId_idx').on(
      table.supersededBySourceReleaseId,
    ),
  ],
)

/**
 * One independently processed resource materialisation of a source release.
 * A Planning Department source release, for example, produces both division
 * and division-area resources while retaining a single upstream archive,
 * version, changelog, and source-release code.
 */
export const metaResourceReleases = sqliteTable(
  'resourceReleases',
  {
    id: primaryUuid('id'),
    sourceReleaseId: text('sourceReleaseId')
      .notNull()
      .references(() => metaSourceReleases.id, { onDelete: 'restrict' }),
    code: text('code').notNull().unique(),
    resourceType: text('resourceType', { enum: datasetTypes }).notNull(),
    geometryStatus: text('geometryStatus', {
      enum: ['authoritative', 'fallback'],
    }),
    status: text('status', { enum: releaseStatuses }).notNull(),
    // Content-addressed reference to the immutable processingRuleDefinitions row.
    // Releases sharing a policy retain the same reference.
    processingRules: text('processingRules'),
    ingestedAt: isoTimestamp('ingestedAt'),
    revokedAt: isoTimestamp('revokedAt'),
    revocationReason: text('revocationReason'),
    supersededByResourceReleaseId: text('supersededByResourceReleaseId'),
    ...timestamps,
  },
  table => [
    index('resourceReleases_sourceReleaseId_idx').on(table.sourceReleaseId),
    uniqueIndex('resourceReleases_sourceReleaseId_resourceType_unique_idx').on(
      table.sourceReleaseId,
      table.resourceType,
    ),
    foreignKey({
      columns: [table.supersededByResourceReleaseId],
      foreignColumns: [table.id],
      name: 'resourceReleases_supersededByResourceReleaseId_resourceReleases_id_fk',
    }).onDelete('set null'),
    index('resourceReleases_status_idx').on(table.status),
    index('resourceReleases_supersededByResourceReleaseId_idx').on(
      table.supersededByResourceReleaseId,
    ),
  ],
)

/** Immutable general processing definitions; releases retain a content hash reference. */
export const metaProcessingRuleDefinitions = sqliteTable('processingRuleDefinitions', {
  id: text('id').primaryKey(),
  definition: jsonText('definition').notNull(),
})

/** Read-only resource context. Source metadata has one owner, sourceReleases. */
export const metaResourceReleaseDetails = sqliteView('resourceReleaseDetails').as(qb =>
  qb
    .select({
      ...getTableColumns(metaResourceReleases),
      datasetId: metaSourceReleases.datasetId,
      sourceVersion: metaSourceReleases.sourceVersion,
      sourceSchemaVersion: metaSourceReleases.sourceSchemaVersion,
      publicationDate: metaSourceReleases.publicationDate,
      cohortKey: metaSourceReleases.cohortKey,
      releaseNotesUrl: metaSourceReleases.releaseNotesUrl,
    })
    .from(metaResourceReleases)
    .innerJoin(
      metaSourceReleases,
      eq(metaResourceReleases.sourceReleaseId, metaSourceReleases.id),
    ),
)
