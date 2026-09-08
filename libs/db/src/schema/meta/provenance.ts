import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { metaReleases } from './datasets'

/** One verified R2 manifest per resource release; no per-decision D1 writes. */
export const releaseProvenance = sqliteTable('releaseProvenance', {
  releaseId: text('releaseId')
    .primaryKey()
    .references(() => metaReleases.id, { onDelete: 'cascade' }),
  manifestHash: text('manifestHash').notNull(),
  byteLength: integer('byteLength').notNull(),
  applicationCount: integer('applicationCount').notNull(),
})
