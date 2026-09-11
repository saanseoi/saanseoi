import type { stats } from './shared'

export type ReleaseStatsRow = typeof stats.$inferSelect
export type NewReleaseStatsRow = typeof stats.$inferInsert
export type ReleaseScopedStatsRow = Omit<
  NewReleaseStatsRow,
  'apiReleaseSetId' | 'id' | 'releaseId'
>
export type ApiReleaseSetScopedStatsRow = Omit<
  NewReleaseStatsRow,
  'apiReleaseSetId' | 'id' | 'releaseId'
>
