import { index, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { canonicalDivisionGeometryColumns } from '../shared'
import { historyEventConstraints } from './constraints'
import { historyVersioning } from './shared'

// Geometry content versions are immutable. Inline snapshot events and current scope
// projections define membership; historyVersioning.isCurrent is not liveness.
export const divisionAreas = sqliteTable(
  'divisionAreas',
  {
    ...canonicalDivisionGeometryColumns(false),
    divisionId: text('divisionId'),
    ...historyVersioning,
  },
  table => [
    ...historyEventConstraints(table, ['divisionId', 'variant', 'type']),
    primaryKey({ columns: [table.id, table.snapshotId] }),
    index('divisionAreas_current_lookup_idx').on(table.id, table.isCurrent),
    index('divisionAreas_divisionId_idx').on(table.divisionId, table.isCurrent),
    index('divisionAreas_sourceReleaseId_idx').on(table.sourceReleaseId),
    index('divisionAreas_snapshotId_idx').on(table.snapshotId),
  ],
)

export const divisionBoundaries = sqliteTable(
  'divisionBoundaries',
  {
    ...canonicalDivisionGeometryColumns(false),
    leftDivisionId: text('leftDivisionId'),
    rightDivisionId: text('rightDivisionId'),
    ...historyVersioning,
  },
  table => [
    ...historyEventConstraints(table, [
      'leftDivisionId',
      'rightDivisionId',
      'variant',
      'type',
    ]),
    primaryKey({ columns: [table.id, table.snapshotId] }),
    index('divisionBoundaries_current_lookup_idx').on(table.id, table.isCurrent),
    index('divisionBoundaries_leftDivisionId_idx').on(
      table.leftDivisionId,
      table.isCurrent,
    ),
    index('divisionBoundaries_rightDivisionId_idx').on(
      table.rightDivisionId,
      table.isCurrent,
    ),
    index('divisionBoundaries_sourceReleaseId_idx').on(table.sourceReleaseId),
    index('divisionBoundaries_snapshotId_idx').on(table.snapshotId),
  ],
)
