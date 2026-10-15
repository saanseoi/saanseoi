import { index, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { jsonText } from '../shared'
import { historyEventConstraints } from './constraints'
import { historyVersioning } from './shared'

/** Versioned geometry paired with the historic materialised street state. */
export const streetGeometry = sqliteTable(
  'streetGeometry',
  {
    streetId: text('streetId').notNull(),
    geometry: jsonText('geometry'),
    bbox: jsonText('bbox'),
    ...historyVersioning,
  },
  table => [
    ...historyEventConstraints(table, ['geometry', 'bbox']),
    primaryKey({ columns: [table.streetId, table.snapshotId] }),
    index('streetGeometry_current_lookup_idx').on(table.streetId, table.isCurrent),
    index('streetGeometry_snapshotId_idx').on(table.snapshotId),
  ],
)
