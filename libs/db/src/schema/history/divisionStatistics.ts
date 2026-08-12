import { index, primaryKey, sqliteTable } from 'drizzle-orm/sqlite-core'

import { canonicalDivisionStatistic } from '../shared'
import { historyStatisticVersioning } from './shared'

/**
 * Published district statistic observations, resolved to SaanSeoi's canonical
 * district identity. Source-specific assertions remain in the source shard.
 */
export const divisionStatistics = sqliteTable(
  'divisionStatistics',
  {
    ...canonicalDivisionStatistic,
    ...historyStatisticVersioning,
  },
  table => [
    primaryKey({ columns: [table.id, table.versionHash] }),
    index('divisionStatistics_current_lookup_idx').on(table.id, table.isCurrent),
    index('divisionStatistics_divisionId_referenceYear_idx').on(
      table.divisionId,
      table.referenceYear,
    ),
    index('divisionStatistics_sourceReleaseId_idx').on(table.sourceReleaseId),
  ],
)

export type DivisionStatisticVersionRow = typeof divisionStatistics.$inferSelect
export type NewDivisionStatisticVersionRow = typeof divisionStatistics.$inferInsert
