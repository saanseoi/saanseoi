import { index, sqliteTable, text } from 'drizzle-orm/sqlite-core'
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

function snapshotPublicationState(name: string) {
  return sqliteTable(
    name,
    {
      snapshotId: text('snapshotId').primaryKey(),
      scopeId: text('scopeId').notNull(),
      ...publicationStateColumns(),
    },
    table => [index(`${name}_scope_idx`).on(table.scopeId)],
  )
}

// Immutable snapshots can be prepared alongside a serving selection. Their small
// receipts live as long as the retained materialisation, including empty snapshots.
export const divisionPublicationState = snapshotPublicationState(
  'divisionPublicationState',
)
export const placePublicationState = snapshotPublicationState('placePublicationState')
export const streetPublicationState = snapshotPublicationState('streetPublicationState')
export const divisionAreaPublicationState = snapshotPublicationState(
  'divisionAreaPublicationState',
)
export const divisionBoundaryPublicationState = snapshotPublicationState(
  'divisionBoundaryPublicationState',
)
