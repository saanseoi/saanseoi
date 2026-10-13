import { index, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'

import { jsonText, timestamps } from '../shared'

/** Stable, per-street geometry aggregated from intact LandsD source segments. */
export const streetGeometry = sqliteTable(
  'streetGeometry',
  {
    scopeId: text('scopeId').notNull(),
    streetId: text('streetId').notNull(),
    sourceReleaseId: text('sourceReleaseId').notNull(),
    geometry: jsonText('geometry').notNull(),
    bbox: jsonText('bbox').notNull(),
    ...timestamps,
  },
  table => [
    primaryKey({ columns: [table.scopeId, table.streetId] }),
    index('streetGeometry_streetId_idx').on(table.streetId),
    index('streetGeometry_sourceReleaseId_idx').on(table.sourceReleaseId),
  ],
)
