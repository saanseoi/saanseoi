import { index, primaryKey, sqliteTable } from 'drizzle-orm/sqlite-core'
import { canonicalDivisionStatisticColumns } from '../shared'
import { historyEventConstraints } from './constraints'
import { historyStatisticVersioning } from './shared'

/**
 * Published district statistic observations, resolved to SaanSeoi's canonical
 * district identity. Source-specific records remain in the source shard.
 */
export const divisionStatistics = sqliteTable(
  'divisionStatistics',
  {
    ...canonicalDivisionStatisticColumns(false),
    ...historyStatisticVersioning,
  },
  table => [
    ...historyEventConstraints(table, [
      'divisionId',
      'districtCode',
      'referenceYear',
      'landAreaSqKm',
      'midYearPopulation',
      'midYearPopulationDensityPerSqKm',
      'sources',
    ]),
    primaryKey({ columns: [table.id, table.snapshotId] }),
    index('divisionStatistics_current_lookup_idx').on(table.id, table.isCurrent),
    index('divisionStatistics_sourceReleaseId_idx').on(table.sourceReleaseId),
  ],
)

export type DivisionStatisticVersionRow = typeof divisionStatistics.$inferSelect
export type NewDivisionStatisticVersionRow = typeof divisionStatistics.$inferInsert
