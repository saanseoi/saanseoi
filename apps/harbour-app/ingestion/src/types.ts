export type Group = { id: string; label: string }
export type Table = { name: string; relation: string; shards: string[] }
export type Subset = { id: string; label: string; dimension: string; count: number }
export type Inspection = {
  contentRevision: string
  revision: string
  stable: boolean
  subset: string
  table: string
  samples: Array<{ shard: string; record: Record<string, unknown> }>
  shards: Array<{ binding: string; count?: number; relation: string }>
  schemas: Array<{
    binding: string
    columns: Array<{ name: string; type: string; notnull: number; pk: number }>
  }>
  columns: Array<{
    name: string
    type: string
    notnull: number
    pk: number
    nulls: number
    rows: number
  }>
}
