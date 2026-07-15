import { index, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'

import { jsonText, timestamps } from '../shared'

/** Source identifiers mapped to canonical resource IDs for a cohort/domain. */
export const metaIdentifierBridges = sqliteTable(
  'identifierBridges',
  {
    resourceType: text('resourceType').notNull(),
    cohortKey: text('cohortKey').notNull(),
    domain: text('domain').notNull(),
    authority: text('authority').notNull(),
    externalId: text('externalId').notNull(),
    externalCode: text('externalCode'),
    canonicalId: text('canonicalId').notNull(),
    sourceDatasetCode: text('sourceDatasetCode').notNull(),
    sourceReleaseCode: text('sourceReleaseCode').notNull(),
    mappingMethod: text('mappingMethod').notNull(),
    reviewStatus: text('reviewStatus').notNull(),
    identifiers: jsonText('identifiers'),
    ...timestamps,
  },
  table => [
    primaryKey({
      columns: [
        table.resourceType,
        table.cohortKey,
        table.domain,
        table.authority,
        table.externalId,
      ],
    }),
    index('identifierBridges_canonicalId_idx').on(table.canonicalId),
    index('identifierBridges_sourceReleaseCode_idx').on(table.sourceReleaseCode),
  ],
)
