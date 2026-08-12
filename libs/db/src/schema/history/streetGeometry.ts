import { index, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'

import { jsonText } from '../shared'
import { historyVersioning } from './shared'

/** Versioned geometry paired with the historic materialised street state. */
export const streetGeometry = sqliteTable(
  'streetGeometry',
  {
    streetId: text('streetId').notNull(),
    geometry: jsonText('geometry').notNull(),
    bbox: jsonText('bbox').notNull(),
    ...historyVersioning,
  },
  table => [
    primaryKey({ columns: [table.streetId, table.versionHash] }),
    index('streetGeometry_current_lookup_idx').on(table.streetId, table.isCurrent),
    index('streetGeometry_sourceReleaseId_idx').on(table.sourceReleaseId),
    index('streetGeometry_snapshotId_idx').on(table.snapshotId),
  ],
)
