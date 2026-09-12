import { primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { timestamps } from '../shared'

/** Delivery completion is separate from permission to serve a published snapshot. */
export const publicationStateColumns = () => ({
  status: text('status', { enum: ['publishing', 'current'] })
    .notNull()
    .default('publishing'),
  publicationToken: text('publicationToken').notNull().default(''),
  preparedAt: text('preparedAt'),
  ...timestamps,
})

/**
 * Publication readiness for each dataset and exact reference period.
 * Gates reads while packs are promoted; older periods retain their own state.
 */
export const statsPublicationState = sqliteTable(
  'statsPublicationState',
  {
    datasetCode: text('datasetCode').notNull(),
    referencePeriodCode: text('referencePeriodCode').notNull(),
    snapshotId: text('snapshotId').notNull(),
    status: text('status', { enum: ['publishing', 'restoring', 'current'] }).notNull(),
    ...timestamps,
  },
  table => [primaryKey({ columns: [table.datasetCode, table.referencePeriodCode] })],
)

function scopedPublicationState(name: string) {
  return sqliteTable(name, {
    scopeId: text('scopeId').primaryKey(),
    snapshotId: text('snapshotId').notNull().unique(),
    ...publicationStateColumns(),
  })
}

// Current records use the stable scope as their storage key. The receipt alone
// advances the logical snapshot; immutable revisions remain in history.
export const divisionPublicationState = scopedPublicationState(
  'divisionPublicationState',
)
export const placePublicationState = scopedPublicationState('placePublicationState')
export const streetPublicationState = scopedPublicationState('streetPublicationState')
export const divisionAreaPublicationState = scopedPublicationState(
  'divisionAreaPublicationState',
)
export const divisionBoundaryPublicationState = scopedPublicationState(
  'divisionBoundaryPublicationState',
)
