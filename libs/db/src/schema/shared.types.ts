import { stats } from './shared'

export type StatsRow = typeof stats.$inferSelect
export type NewStatsRow = typeof stats.$inferInsert
export type DatasetStatsRow = Omit<StatsRow, 'datasetId' | 'id'>
