import {
  check,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
  type AnySQLiteColumn,
} from 'drizzle-orm/sqlite-core'

import { sql } from 'drizzle-orm'

import { primaryUuid, timestamps } from '../shared'
import { metaDatasets, metaResourceReleases, metaSourceReleases } from './datasets'

/**
 * A private-R2 object that has been registered for public delivery through
 * Atlas. The key is deliberately not exposed to API consumers: stable asset
 * IDs let us preserve evidence storage without coupling the public API to R2.
 */
export const metaAssets = sqliteTable(
  'assets',
  {
    id: primaryUuid('id'),
    datasetId: text('datasetId').references(() => metaDatasets.id, {
      onDelete: 'restrict',
    }),
    resourceReleaseId: text('resourceReleaseId').references(
      () => metaResourceReleases.id,
      {
        onDelete: 'set null',
      },
    ),
    sourceReleaseId: text('sourceReleaseId').references(() => metaSourceReleases.id, {
      onDelete: 'set null',
    }),
    sourceRecordId: text('sourceRecordId'),
    assetKey: text('assetKey').notNull(),
    contentHash: text('contentHash').notNull(),
    byteLength: integer('byteLength').notNull(),
    mediaType: text('mediaType').notNull(),
    role: text('role').notNull(),
    originalUrl: text('originalUrl'),
    sourcePageLocale: text('sourcePageLocale'),
    sourcePageUrl: text('sourcePageUrl'),
    retrievedAt: text('retrievedAt').notNull(),
    ...timestamps,
    /** The retained source object described by this downloadable manifest. */
    sourceAssetId: text('sourceAssetId').references(
      (): AnySQLiteColumn => metaAssets.id,
      {
        onDelete: 'set null',
      },
    ),
  },
  table => [
    uniqueIndex('assets_assetKey_unique_idx').on(table.assetKey),
    index('assets_contentHash_idx').on(table.contentHash),
    index('assets_datasetId_idx').on(table.datasetId),
    index('assets_resourceReleaseId_idx').on(table.resourceReleaseId),
    index('assets_sourceReleaseId_idx').on(table.sourceReleaseId),
    check(
      'assets_archive_owner_check',
      sql`(${table.role} != 'releaseSourceArchive' OR ${table.resourceReleaseId} IS NULL) AND (${table.role} != 'resourceSourceArchive' OR (${table.resourceReleaseId} IS NOT NULL AND ${table.sourceReleaseId} IS NULL AND ${table.mediaType} = 'application/vnd.apache.parquet')) AND ${table.role} != 'sourceArchive'`,
    ),
    index('assets_sourceRecordId_idx').on(table.sourceRecordId),
    index('assets_sourceAssetId_idx').on(table.sourceAssetId),
  ],
)

/** A release authority for resets; archive ownership remains on assets itself. */
export const assetReleaseAuthority = sql<
  string | null
>`coalesce(${metaAssets.resourceReleaseId}, (SELECT r.id FROM resourceReleases r WHERE r.sourceReleaseId = ${metaAssets.sourceReleaseId} ORDER BY r.id LIMIT 1))`
