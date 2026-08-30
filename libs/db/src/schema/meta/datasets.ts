import {
  foreignKey,
  index,
  primaryKey,
  sqliteTable,
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
    // resource outputs are declared in metaDatasetResourceTypes below.
    subType: text('subType'),
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
    // Resolved, versioned merge-rule revisions are synchronised from the
    // registry. Releases copy this value so later dataset changes cannot
    // rewrite historic processing decisions; per-record exceptions belong in
    // releaseProcessingActions instead.
    processingRules: jsonText('processingRules'),
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

export const metaDatasetResourceTypes = sqliteTable(
  'datasetResourceTypes',
  {
    datasetId: text('datasetId')
      .notNull()
      .references(() => metaDatasets.id, { onDelete: 'cascade' }),
    resourceType: text('resourceType', { enum: datasetTypes }).notNull(),
  },
  table => [
    primaryKey({ columns: [table.datasetId, table.resourceType] }),
    index('datasetResourceTypes_resourceType_idx').on(table.resourceType),
  ],
)

export const metaDatasetI18n = sqliteTable(
  'datasetI18n',
  {
    datasetId: text('datasetId')
      .notNull()
      .references(() => metaDatasets.id, { onDelete: 'cascade' }),
    locale: text('locale').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    ...timestamps,
  },
  table => [
    primaryKey({
      columns: [table.datasetId, table.locale],
    }),
    index('datasetI18n_locale_idx').on(table.locale),
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
    sourceSchemaVersion: text('sourceSchemaVersion'),
    publicationDate: text('publicationDate'),
    cohortKey: text('cohortKey'),
    geometryStatus: text('geometryStatus', {
      enum: ['authoritative', 'fallback'],
    })
      .notNull()
      .default('authoritative'),
    rawObjectKey: text('rawObjectKey'),
    originalFileName: text('originalFileName'),
    releaseNotesUrl: text('releaseNotesUrl'),
    notes: text('notes'),
    status: text('status', { enum: releaseStatuses }).notNull(),
    revokedAt: isoTimestamp('revokedAt'),
    revocationReason: text('revocationReason'),
    supersededBySourceReleaseId: text('supersededBySourceReleaseId'),
    // Copied from the dataset when this immutable source release is created.
    // Do not rebuild a historic audit from later dataset metadata or later
    // merge-ruleset revisions.
    processingRules: jsonText('processingRules'),
    ingestedAt: isoTimestamp('ingestedAt'),
    ...timestamps,
  },
  table => [
    uniqueIndex('sourceReleases_datasetId_sourceVersion_unique_idx').on(
      table.datasetId,
      table.sourceVersion,
    ),
    uniqueIndex('sourceReleases_id_datasetId_unique_idx').on(table.id, table.datasetId),
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
export const metaReleases = sqliteTable(
  'releases',
  {
    id: primaryUuid('id'),
    sourceReleaseId: text('sourceReleaseId')
      .notNull()
      .references(() => metaSourceReleases.id, { onDelete: 'restrict' }),
    datasetId: text('datasetId')
      .notNull()
      .references(() => metaDatasets.id, { onDelete: 'restrict' }),
    code: text('code').notNull().unique(),
    resourceType: text('resourceType', { enum: datasetTypes }).notNull(),
    sourceVersion: text('sourceVersion').notNull(),
    sourceSchemaVersion: text('sourceSchemaVersion'),
    publicationDate: text('publicationDate'),
    cohortKey: text('cohortKey'),
    geometryStatus: text('geometryStatus', {
      enum: ['authoritative', 'fallback'],
    })
      .notNull()
      .default('authoritative'),
    rawObjectKey: text('rawObjectKey'),
    originalFileName: text('originalFileName'),
    releaseNotesUrl: text('releaseNotesUrl'),
    notes: text('notes'),
    status: text('status', { enum: releaseStatuses }).notNull(),
    revokedAt: isoTimestamp('revokedAt'),
    revocationReason: text('revocationReason'),
    supersededByReleaseId: text('supersededByReleaseId'),
    // Copied from the dataset when this immutable source release is created.
    // Do not rebuild a historic audit from later dataset metadata or later
    // merge-ruleset revisions.
    processingRules: jsonText('processingRules'),
    ingestedAt: isoTimestamp('ingestedAt'),
    ...timestamps,
  },
  table => [
    index('releases_sourceReleaseId_idx').on(table.sourceReleaseId),
    uniqueIndex('releases_datasetId_resourceType_sourceVersion_unique_idx').on(
      table.datasetId,
      table.resourceType,
      table.sourceVersion,
    ),
    uniqueIndex('releases_id_datasetId_unique_idx').on(table.id, table.datasetId),
    foreignKey({
      columns: [table.supersededByReleaseId],
      foreignColumns: [table.id],
      name: 'releases_supersededByReleaseId_releases_id_fk',
    }).onDelete('set null'),
    index('releases_status_idx').on(table.status),
    index('releases_supersededByReleaseId_idx').on(table.supersededByReleaseId),
  ],
)
