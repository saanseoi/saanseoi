import type { Database } from 'bun:sqlite'
import {
  quoteNetIdentifier as q,
  type NetTable,
  type NetTablePolicy,
} from './netSqlitePlanTypes.ts'

export function readNetTables(db: Database, policies: NetTablePolicy[]): NetTable[] {
  const names = new Set(policies.map(policy => policy.name))
  if (names.size !== policies.length)
    throw new Error('Duplicate net-plan table policy.')
  return policies.map(policy => {
    const definition = db
      .query<{ sql: string }, [string]>(
        "SELECT sql FROM sqlite_schema WHERE type = 'table' AND name = ?",
      )
      .get(policy.name)
    if (!definition || /^CREATE\s+VIRTUAL\b/i.test(definition.sql))
      throw new Error(`Net planning requires an ordinary table: ${policy.name}`)
    if (
      db
        .query("SELECT 1 FROM sqlite_schema WHERE type='trigger' AND tbl_name=?")
        .get(policy.name)
    )
      throw new Error(`Net planning does not support triggers on ${policy.name}.`)
    const columns = db
      .query<{ name: string; pk: number; hidden: number }, []>(
        `PRAGMA table_xinfo(${q(policy.name)})`,
      )
      .all()
    const primaryKey = columns
      .filter(column => column.pk > 0)
      .sort((a, b) => Number(a.pk) - Number(b.pk))
      .map(column => column.name)
    if (columns.some(column => column.name.startsWith('__net_')))
      throw new Error(`Reserved net-plan column prefix in ${policy.name}.`)
    if (!primaryKey.length)
      throw new Error(`Net planning requires an explicit primary key: ${policy.name}`)
    for (const column of [
      ...(policy.ignoredColumns ?? []),
      ...(policy.collection?.keyColumns ?? []),
    ])
      if (!columns.some(item => item.name === column))
        throw new Error(`Unknown net-plan column ${policy.name}.${column}`)
    if (primaryKey.some(column => policy.ignoredColumns?.includes(column)))
      throw new Error(`Net planning cannot ignore primary keys: ${policy.name}`)
    if (policy.atomicGroup && policy.collection)
      throw new Error(`Choose one collection policy for ${policy.name}.`)
    if (policy.collection && !policy.collection.keyColumns.length)
      throw new Error(`Empty collection key for ${policy.name}.`)
    const foreignKeys = db
      .query<
        {
          id: number
          seq: number
          table: string
          from: string
          to: string | null
          on_update: string
          on_delete: string
        },
        []
      >(`PRAGMA foreign_key_list(${q(policy.name)})`)
      .all()
    if (
      foreignKeys.some(
        key =>
          !['NO ACTION', 'RESTRICT'].includes(key.on_update) ||
          ['SET NULL', 'SET DEFAULT'].includes(key.on_delete),
      )
    )
      throw new Error(
        `Net planning requires explicit mutations for referential updates: ${policy.name}`,
      )
    const references = new Map<number, NetTable['foreignKeys'][number]>()
    for (const key of foreignKeys.sort((a, b) => Number(a.seq) - Number(b.seq))) {
      if (!names.has(key.table)) continue
      const reference = references.get(key.id) ?? {
        parentTable: key.table,
        columns: [],
        parentColumns: [],
      }
      const parentColumn =
        key.to ??
        db
          .query<{ name: string; pk: number }, []>(`PRAGMA table_info(${q(key.table)})`)
          .all()
          .filter(column => column.pk > 0)
          .sort((a, b) => Number(a.pk) - Number(b.pk))[Number(key.seq)]?.name
      if (!parentColumn)
        throw new Error(`Cannot resolve foreign key on ${policy.name}.`)
      reference.columns.push(key.from)
      reference.parentColumns.push(parentColumn)
      references.set(key.id, reference)
    }
    const parents = [
      ...new Set([...foreignKeys.map(row => row.table), ...(policy.dependsOn ?? [])]),
    ].filter(parent => parent !== policy.name && names.has(parent))
    return {
      policy,
      columns: columns.map(column => column.name),
      writable: columns.filter(column => !column.hidden).map(column => column.name),
      primaryKey,
      parents,
      foreignKeys: [...references.values()],
    }
  })
}

/** Parent-first ordering. Cyclic dependency graphs require a specialised plan. */
export function orderNetTables(tables: NetTable[]) {
  const result: NetTable[] = []
  const visiting = new Set<string>()
  const visited = new Set<string>()
  const byName = new Map(tables.map(table => [table.policy.name, table]))
  const visit = (table: NetTable) => {
    const name = table.policy.name
    if (visited.has(name)) return
    if (visiting.has(name))
      throw new Error(
        `Cyclic net-plan dependencies require a bounded explicit plan: ${name}`,
      )
    visiting.add(name)
    for (const parent of table.parents) {
      const dependency = byName.get(parent)
      if (dependency) visit(dependency)
    }
    visiting.delete(name)
    visited.add(name)
    result.push(table)
  }
  for (const table of tables) visit(table)
  return result
}

export function assertNetSchema(db: Database, table: NetTable) {
  const query = (schema: string) =>
    db
      .query(
        `SELECT type, name, sql FROM ${schema}.sqlite_schema WHERE tbl_name=? ORDER BY type,name`,
      )
      .all(table.policy.name)
  if (JSON.stringify(query('main')) !== JSON.stringify(query('net_baseline')))
    throw new Error(`Schema changed during net planning: ${table.policy.name}`)
  for (const schema of ['main', 'net_baseline'])
    if (
      db
        .query(
          `SELECT 1 FROM ${schema}.${q(table.policy.name)} WHERE ${table.primaryKey.map(column => `${q(column)} IS NULL`).join(' OR ')} LIMIT 1`,
        )
        .get()
    )
      throw new Error(`Nullable primary key in net-plan table ${table.policy.name}.`)
}

export function assertNetForeignKeys(db: Database) {
  const violation = db.query('PRAGMA main.foreign_key_check').get()
  if (violation)
    throw new Error(
      `Net-plan foreign key validation failed: ${JSON.stringify(violation, (_key, value) => (typeof value === 'bigint' ? value.toString() : value))}`,
    )
}

export function netKeyMatch(table: NetTable, left: string, right: string) {
  return table.primaryKey
    .map(
      column =>
        `${left}.${q(column)} IS ${right}.${q(column)} AND ${left}.${q(column)} COLLATE BINARY IS ${right}.${q(column)} COLLATE BINARY`,
    )
    .join(' AND ')
}

/** Exact, JSON-safe SQLite key identity, including binary and 64-bit integer keys. */
export function netRowKey(table: NetTable, alias: string) {
  return `json_array(${table.primaryKey.map(column => `typeof(${alias}.${q(column)}),hex(${alias}.${q(column)})`).join(',')})`
}

export function netDifference(columns: string[], left: string, right: string) {
  return (
    columns
      .map(
        column =>
          `${left}.${q(column)} COLLATE BINARY IS NOT ${right}.${q(column)} COLLATE BINARY`,
      )
      .join(' OR ') || '0'
  )
}

export function normaliseNetIgnoredColumns(db: Database, table: NetTable) {
  const ignored = table.policy.ignoredColumns ?? []
  if (!ignored.length) return
  const semantic = table.columns.filter(column => !ignored.includes(column))
  const name = q(table.policy.name)
  const match = netKeyMatch(table, 'c', 'b')
  db.exec(
    `UPDATE main.${name} AS c SET ${ignored
      .map(
        column =>
          `${q(column)}=(SELECT b.${q(column)} FROM net_baseline.${name} b WHERE ${match})`,
      )
      .join(
        ',',
      )} WHERE EXISTS (SELECT 1 FROM net_baseline.${name} b WHERE ${match} AND NOT (${netDifference(semantic, 'c', 'b')}) AND (${netDifference(ignored, 'c', 'b')}))`,
  )
}

export function assertNetReplayEqualsCandidate(db: Database, tables: NetTable[]) {
  for (const table of tables) {
    const columns = table.columns.map(column => `${q(column)} COLLATE BINARY`).join(',')
    for (const [left, right] of [
      ['main', 'net_candidate'],
      ['net_candidate', 'main'],
    ])
      if (
        db
          .query(
            `SELECT 1 FROM (SELECT ${columns} FROM ${left}.${q(table.policy.name)} EXCEPT SELECT ${columns} FROM ${right}.${q(table.policy.name)}) LIMIT 1`,
          )
          .get()
      )
        throw new Error(`Net-plan replay differs from candidate: ${table.policy.name}`)
  }
}
