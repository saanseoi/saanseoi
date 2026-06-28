import {
  foreignKey,
  index,
  integer,
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
import { jsonText, primaryUuid, timestamps } from './_shared'
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
    type: text('type', { enum: datasetTypes }).notNull(),
    sourceUrl: text('sourceUrl'),
    licenseId: text('licenseId').references(() => metaLicenses.id, {
      onDelete: 'restrict',
    }),
    category: text('category', { enum: datasetCategories }),
    attribution: text('attribution'),
    tags: jsonText('tags'),
    versionHash: text('versionHash').notNull(),
    ...timestamps,
  },
  table => [
    uniqueIndex('datasets_publisherId_code_unique_idx').on(
      table.publisherId,
      table.code,
    ),
    index('datasets_region_theme_type_idx').on(
      table.regionCode,
      table.theme,
      table.type,
    ),
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

export const metaReleases = sqliteTable(
  'releases',
  {
    id: primaryUuid('id'),
    datasetId: text('datasetId')
      .notNull()
      .references(() => metaDatasets.id, { onDelete: 'restrict' }),
    code: text('code').notNull().unique(),
    sourceVersion: text('sourceVersion').notNull(),
    sourceSchemaVersion: text('sourceSchemaVersion'),
    publicationDate: text('publicationDate'),
    snapshotMonth: text('snapshotMonth'),
    rawObjectKey: text('rawObjectKey'),
    originalFileName: text('originalFileName'),
    status: text('status', { enum: releaseStatuses }).notNull(),
    revokedAt: integer('revokedAt', { mode: 'timestamp_ms' }),
    revocationReason: text('revocationReason'),
    supersededByReleaseId: text('supersededByReleaseId'),
    ingestedAt: integer('ingestedAt', { mode: 'timestamp_ms' }),
    ...timestamps,
  },
  table => [
    uniqueIndex('releases_datasetId_sourceVersion_unique_idx').on(
      table.datasetId,
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
