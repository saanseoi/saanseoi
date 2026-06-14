export type LegacyDbBindings = {
  DB: D1Database
}

type ShardedRegionCode = 'HK'
type ShardedYear = '2025' | '2026'

type HistoryShardBindings = {
  [K in `DB_HISTORY_${ShardedRegionCode}_${ShardedYear}`]: D1Database
}

type SourceShardBindings = {
  [K in `DB_SOURCE_${ShardedRegionCode}_${ShardedYear}`]: D1Database
}

export type MultiDbBindings = HistoryShardBindings &
  SourceShardBindings & {
    DB_META: D1Database
    DB_CURRENT: D1Database
  }

export type SaanseoiWorkerBindings = LegacyDbBindings & MultiDbBindings
