import type { stats } from './shared'

export type ReleaseStatsRow = typeof stats.$inferSelect
export type NewReleaseStatsRow = typeof stats.$inferInsert
export type DatasetStatsRow = Omit<ReleaseStatsRow, 'releaseId' | 'id'>
