import { index, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'

import { canonicalDivisionStatistic, timestamps } from '../shared'

/** Materialised Division Statistics API observations for one published snapshot. */
export const divisionStatistics = sqliteTable(
  'divisionStatistics',
  {
    snapshotId: text('snapshotId').notNull(),
    ...canonicalDivisionStatistic,
    ...timestamps,
  },
  table => [
    primaryKey({ columns: [table.snapshotId, table.id] }),
    index('divisionStatistics_divisionId_referenceYear_idx').on(
      table.snapshotId,
      table.divisionId,
      table.referenceYear,
    ),
  ],
)

export type DivisionStatisticRow = typeof divisionStatistics.$inferSelect
export type NewDivisionStatisticRow = typeof divisionStatistics.$inferInsert
