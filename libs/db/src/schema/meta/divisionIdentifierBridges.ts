import { index, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'

import { jsonText, timestamps } from '../shared'

/** Provider identifiers mapped to canonical division IDs for a cohort/domain. */
export const metaDivisionIdentifierBridges = sqliteTable(
  'divisionIdentifierBridges',
  {
    cohortKey: text('cohortKey').notNull(),
    domain: text('domain').notNull(),
    authority: text('authority').notNull(),
    externalId: text('externalId').notNull(),
    externalCode: text('externalCode'),
    canonicalDivisionId: text('canonicalDivisionId').notNull(),
    sourceDatasetCode: text('sourceDatasetCode').notNull(),
    sourceReleaseCode: text('sourceReleaseCode').notNull(),
    mappingMethod: text('mappingMethod').notNull(),
    reviewStatus: text('reviewStatus').notNull(),
    identifiers: jsonText('identifiers'),
    ...timestamps,
  },
  table => [
    primaryKey({
      columns: [table.cohortKey, table.domain, table.authority, table.externalId],
    }),
    index('divisionIdentifierBridges_canonicalDivisionId_idx').on(
      table.canonicalDivisionId,
    ),
    index('divisionIdentifierBridges_sourceReleaseCode_idx').on(
      table.sourceReleaseCode,
    ),
  ],
)
