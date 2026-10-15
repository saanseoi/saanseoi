import {
  index,
  primaryKey,
  real,
  sqliteTable,
  text,
  integer,
} from 'drizzle-orm/sqlite-core'
import { createdAtTimestamp } from '../shared'

/** Immutable spatial interpretations, retained independently of CURRENT promotion. */
export const divisionGeographicCrosswalks = sqliteTable(
  'divisionGeographicCrosswalks',
  {
    id: text('id').primaryKey(),
    geographicReleaseSet: text('geographicReleaseSet').notNull(),
    geographicSnapshotId: text('geographicSnapshotId').notNull(),
    geographicAreaSnapshotId: text('geographicAreaSnapshotId').notNull(),
    sourceReleaseSet: text('sourceReleaseSet').notNull(),
    sourceSnapshotId: text('sourceSnapshotId').notNull(),
    sourceAreaSnapshotId: text('sourceAreaSnapshotId').notNull(),
    sourceDomain: text('sourceDomain').notNull(),
    sourceCohort: text('sourceCohort').notNull(),
    policy: text('policy').notNull(),
    contentHash: text('contentHash').notNull(),
    ...createdAtTimestamp,
  },
  table => [
    index('divisionGeographicCrosswalks_selection_idx').on(
      table.geographicReleaseSet,
      table.sourceSnapshotId,
    ),
  ],
)

export const divisionGeographicMemberships = sqliteTable(
  'divisionGeographicMemberships',
  {
    crosswalkId: text('crosswalkId')
      .notNull()
      .references(() => divisionGeographicCrosswalks.id),
    divisionId: text('divisionId').notNull(),
    geographicDivisionId: text('geographicDivisionId').notNull(),
    sourceGeometryHash: text('sourceGeometryHash').notNull(),
    geographicGeometryHash: text('geographicGeometryHash').notNull(),
    overlapSquareMetres: real('overlapSquareMetres').notNull(),
    sourceFraction: real('sourceFraction').notNull(),
    fullyContained: integer('fullyContained', { mode: 'boolean' }).notNull(),
  },
  table => [
    primaryKey({
      columns: [table.crosswalkId, table.divisionId, table.geographicDivisionId],
    }),
    index('divisionGeographicMemberships_target_idx').on(
      table.crosswalkId,
      table.geographicDivisionId,
    ),
  ],
)
