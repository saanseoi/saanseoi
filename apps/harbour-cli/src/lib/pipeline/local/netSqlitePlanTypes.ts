import type { Database } from 'bun:sqlite'
import type { SqlDeliveryTarget } from './sqlDeliveryTypes.ts'

export type NetTablePolicy = {
  name: string
  /** Preserve baseline values when these are the only changed columns. */
  ignoredColumns?: string[]
  /** Additional parent tables, supplementing declared SQLite foreign keys. */
  dependsOn?: string[]
  /** Keep every mutation in these tables in one bounded delivery transaction. */
  atomicGroup?: string
  /** Keep a logical collection together across tables sharing this name/key. */
  collection?: { name: string; keyColumns: string[] }
}

export type NetSqlitePlanInput<T> = {
  targets: Record<
    string,
    { path: string; databaseId?: string; tables: NetTablePolicy[] }
  >
  generate: (candidates: Record<string, { db: Database; path: string }>) => Promise<T>
  append: (target: SqlDeliveryTarget, bytes: Uint8Array, kind: 'bound') => Promise<void>
  /** Deliver all selected final rows to an empty, schema-provisioned target. */
  bootstrap?: boolean
  limits?: { maxStatements?: number; maxPayloadBytes?: number }
}

export type NetTableSummary = {
  before: number
  after: number
  inserted: number
  updated: number
  deleted: number
  unchanged: number
}

export type NetSqlitePlanSummary = {
  tables: Record<string, Record<string, NetTableSummary>>
  statements: number
  batches: number
  bytes: number
}

export type NetStatement = { sql: string; params: Array<string | number | null> }
export type NetRow = Record<
  string,
  string | number | bigint | Uint8Array | null | undefined
>
export type NetTable = {
  policy: NetTablePolicy
  columns: string[]
  writable: string[]
  primaryKey: string[]
  parents: string[]
  foreignKeys: Array<{
    parentTable: string
    columns: string[]
    parentColumns: string[]
  }>
}

export const quoteNetIdentifier = (value: string) => `"${value.replaceAll('"', '""')}"`
export const NET_D1_MAX_PARAMETERS = 100
export const NET_D1_MAX_SQL_BYTES = 100_000
// Leave room for SQLite record headers as well as the logical column values.
export const NET_D1_MAX_ROW_BYTES = 2_000_000
