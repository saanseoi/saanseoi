import { index, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { jsonText } from '../shared'

/** Interpretation of exact source evidence within a snapshot or statistics release. */
export type SourceResolutions = {
  entities: Record<string, string[]>
  decisions?: Array<Record<string, unknown>>
  methods?: Record<string, string>
}

export const sourceResolutions = sqliteTable(
  'sourceResolutions',
  {
    /** Snapshot interpretation, or release interpretation for snapshot-free statistics. */
    scopeId: text('scopeId').notNull(),
    snapshotId: text('snapshotId'),
    sourceReleaseId: text('sourceReleaseId').notNull(),
    sourceRecordId: text('sourceRecordId').notNull(),
    sourceVersionHash: text('sourceVersionHash').notNull(),
    resolutions: jsonText<SourceResolutions>('resolutions').notNull(),
  },
  table => [
    primaryKey({
      columns: [
        table.scopeId,
        table.sourceReleaseId,
        table.sourceRecordId,
        table.sourceVersionHash,
      ],
    }),
    index('sourceResolutions_source_idx').on(
      table.sourceReleaseId,
      table.sourceRecordId,
      table.sourceVersionHash,
    ),
  ],
)

export type NewSourceResolution = Omit<typeof sourceResolutions.$inferInsert, 'scopeId'>
