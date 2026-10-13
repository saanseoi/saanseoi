import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { metaResourceReleases } from './datasets'

/** A resource can participate in several independently owned lifecycle executions. */
export const processingAudits = sqliteTable(
  'processingAudits',
  {
    resourceReleaseId: text('resourceReleaseId')
      .notNull()
      .references(() => metaResourceReleases.id, { onDelete: 'cascade' }),
    stage: text('stage', {
      enum: ['preparation', 'ingestion', 'assembly', 'composition'],
    }).notNull(),
    ownerId: text('ownerId').notNull(),
    manifestHash: text('manifestHash').notNull(),
    byteLength: integer('byteLength').notNull(),
    applicationCount: integer('applicationCount').notNull(),
    attemptStatus: text('attemptStatus', { enum: ['completed', 'failed'] }).notNull(),
  },
  table => [
    primaryKey({ columns: [table.resourceReleaseId, table.stage, table.ownerId] }),
    index('processingAudits_owner_idx').on(table.stage, table.ownerId),
  ],
)
