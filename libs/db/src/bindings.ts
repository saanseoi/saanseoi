export type LegacyDbBindings = {
  DB: D1Database
}

export type MultiDbBindings = {
  DB_META: D1Database
  DB_CURRENT: D1Database
  DB_HISTORY_HK_2026: D1Database
  DB_SOURCE_HK_2026: D1Database
}

export type SaanseoiWorkerBindings = LegacyDbBindings & MultiDbBindings
