import { index, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'

import { canonicalDivisionGeometry } from '../shared'
import { historyVersioning } from './shared'

export const divisionAreas = sqliteTable(
  'divisionAreas',
  {
    ...canonicalDivisionGeometry,
    divisionId: text('divisionId').notNull(),
    ...historyVersioning,
  },
  table => [
    primaryKey({ columns: [table.id, table.versionHash] }),
    index('divisionAreas_current_lookup_idx').on(table.id, table.isCurrent),
    index('divisionAreas_divisionId_idx').on(table.divisionId, table.isCurrent),
    index('divisionAreas_snapshot_validity_idx').on(
      table.validFromSnapshotId,
      table.validToSnapshotId,
    ),
    index('divisionAreas_validity_idx').on(
      table.validFromCohortKey,
      table.validToCohortKey,
    ),
    index('divisionAreas_sourceReleaseId_idx').on(table.sourceReleaseId),
    index('divisionAreas_snapshotId_idx').on(table.snapshotId),
  ],
)

export const divisionBoundaries = sqliteTable(
  'divisionBoundaries',
  {
    ...canonicalDivisionGeometry,
    leftDivisionId: text('leftDivisionId').notNull(),
    rightDivisionId: text('rightDivisionId').notNull(),
    ...historyVersioning,
  },
  table => [
    primaryKey({ columns: [table.id, table.versionHash] }),
    index('divisionBoundaries_current_lookup_idx').on(table.id, table.isCurrent),
    index('divisionBoundaries_leftDivisionId_idx').on(
      table.leftDivisionId,
      table.isCurrent,
    ),
    index('divisionBoundaries_rightDivisionId_idx').on(
      table.rightDivisionId,
      table.isCurrent,
    ),
    index('divisionBoundaries_snapshot_validity_idx').on(
      table.validFromSnapshotId,
      table.validToSnapshotId,
    ),
    index('divisionBoundaries_validity_idx').on(
      table.validFromCohortKey,
      table.validToCohortKey,
    ),
    index('divisionBoundaries_sourceReleaseId_idx').on(table.sourceReleaseId),
    index('divisionBoundaries_snapshotId_idx').on(table.snapshotId),
  ],
)
