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
    sourceVariant: text('sourceVariant').notNull().default('default'),
    // Native CRS shared by every release of this source dataset. Source
    // records retain their geometry evidence but must not duplicate this
    // dataset-level metadata on every row.
    sourceCrs: text('sourceCrs'),
    sourceUrl: text('sourceUrl'),
    licenseId: text('licenseId').references(() => metaLicenses.id, {
      onDelete: 'restrict',
    }),
    category: text('category', { enum: datasetCategories }),
    attribution: text('attribution'),
    tags: jsonText('tags'),
    // Versioned, localised descriptions of deterministic bulk transformations
    // applied while this dataset is ingested. Per-record exceptions belong in
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
    primaryKey({ columns: [table.datasetId, table.code] }),
    uniqueIndex('datasetTransforms_outputVariant_unique_idx').on(table.outputVariant),
    index('datasetTransforms_resourceType_idx').on(table.resourceType),
  ],
)

export const metaReleases = sqliteTable(
  'releases',
  {
    id: primaryUuid('id'),
    datasetId: text('datasetId')
      .notNull()
      .references(() => metaDatasets.id, { onDelete: 'restrict' }),
    code: text('code').notNull().unique(),
    resourceType: text('resourceType', { enum: datasetTypes }).notNull(),
    sourceVersion: text('sourceVersion').notNull(),
    sourceSchemaVersion: text('sourceSchemaVersion'),
    publicationDate: text('publicationDate'),
    cohortKey: text('cohortKey'),
    rawObjectKey: text('rawObjectKey'),
    originalFileName: text('originalFileName'),
    releaseNotesUrl: text('releaseNotesUrl'),
    notes: text('notes'),
    status: text('status', { enum: releaseStatuses }).notNull(),
    revokedAt: isoTimestamp('revokedAt'),
    revocationReason: text('revocationReason'),
    supersededByReleaseId: text('supersededByReleaseId'),
    // Captured from the dataset fixture when this immutable source release is
    // created. Do not rebuild a historic audit from later dataset metadata.
    processingRules: jsonText('processingRules'),
    ingestedAt: isoTimestamp('ingestedAt'),
    ...timestamps,
  },
  table => [
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
