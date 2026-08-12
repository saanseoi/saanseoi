import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

import { jsonText, primaryUuid, timestamps } from '../shared'
import { metaDatasets, metaReleases } from './datasets'

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
    releaseId: text('releaseId').references(() => metaReleases.id, {
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
    manifest: jsonText('manifest'),
    ...timestamps,
  },
  table => [
    uniqueIndex('assets_assetKey_unique_idx').on(table.assetKey),
    index('assets_contentHash_idx').on(table.contentHash),
    index('assets_datasetId_idx').on(table.datasetId),
    index('assets_releaseId_idx').on(table.releaseId),
    index('assets_sourceRecordId_idx').on(table.sourceRecordId),
  ],
)
