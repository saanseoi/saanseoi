import type { Database } from 'bun:sqlite'
import {
  NET_D1_MAX_PARAMETERS,
  NET_D1_MAX_ROW_BYTES,
  NET_D1_MAX_SQL_BYTES,
  quoteNetIdentifier as q,
  type NetRow,
  type NetStatement,
  type NetTable,
  type NetTableSummary,
} from './netSqlitePlanTypes.ts'
import { netDifference, netKeyMatch, netRowKey } from './netSqlitePlanSchema.ts'

function valueExpression(value: NetRow[string], params: NetStatement['params']) {
  // JSON transports cannot preserve 64-bit integers or binary binding types.
  // Exact SQL literals retain these values and still obey the SQL byte budget.
  if (typeof value === 'bigint') return value.toString()
  if (value instanceof Uint8Array) {
    params.push(Buffer.from(value).toString('hex'))
    return 'unhex(?)'
  }
  if (value === undefined || (typeof value === 'number' && !Number.isFinite(value)))
    throw new Error('Unsupported net-plan SQLite value.')
  params.push(value)
  return '?'
}

export function assertNetRowBudget(row: NetRow, columns: string[], name: string) {
  let bytes = 16 + columns.length * 9
  for (const column of columns) {
    const value = row[column]
    bytes +=
      typeof value === 'string'
        ? Buffer.byteLength(value)
        : value instanceof Uint8Array
          ? value.byteLength
          : value === null
            ? 0
            : 8
  }
  if (bytes > NET_D1_MAX_ROW_BYTES)
    throw new Error(`D1 logical row budget exceeded in ${name}: ${bytes} bytes.`)
}

function sameValue(left: NetRow[string], right: NetRow[string]) {
  if (left instanceof Uint8Array && right instanceof Uint8Array)
    return Buffer.from(left).equals(Buffer.from(right))
  return left === right
}

function collectionKey(table: NetTable, row: NetRow) {
  if (table.policy.atomicGroup) return `atomic:${table.policy.atomicGroup}`
  const collection = table.policy.collection
  if (!collection) return null
  return JSON.stringify([
    collection.name,
    collection.keyColumns.map(column => {
      const value = row[column]
      if (value === undefined) throw new Error('Missing net-plan collection key.')
      return typeof value === 'bigint' ? ['integer', value.toString()] : value
    }),
  ])
}

function keyedMutation(
  table: NetTable,
  kind: 'delete' | 'insert' | 'update',
  row: NetRow,
) {
  const params: NetStatement['params'] = []
  const name = q(table.policy.name)
  let sql: string
  if (kind === 'insert') {
    sql = `INSERT INTO ${name} (${table.writable.map(q).join(',')}) VALUES (${table.writable.map(column => valueExpression(row[column], params)).join(',')})`
  } else {
    const changed = table.writable.filter(
      (column, index) =>
        !table.primaryKey.includes(column) &&
        !sameValue(row[column], row[`__net_before_${index}`]),
    )
    const assignments =
      kind === 'update'
        ? changed
            .map(column => `${q(column)}=${valueExpression(row[column], params)}`)
            .join(',')
        : ''
    const where = table.primaryKey
      .map(column => `${q(column)} IS ${valueExpression(row[column], params)}`)
      .join(' AND ')
    sql =
      kind === 'delete'
        ? `DELETE FROM ${name} WHERE ${where}`
        : `UPDATE ${name} SET ${assignments} WHERE ${where}`
  }
  if (
    params.length > NET_D1_MAX_PARAMETERS ||
    Buffer.byteLength(sql) > NET_D1_MAX_SQL_BYTES
  )
    throw new Error(`D1 statement budget exceeded for ${kind} ${table.policy.name}.`)
  return { sql, params }
}

/** SQLite performs indexed comparisons; only one changed row enters JS at a time. */
export function journalNetTable(input: {
  db: Database
  table: NetTable
  bootstrap: boolean
  record: (
    kind: 'delete' | 'insert' | 'update',
    statement: NetStatement,
    group: string | null,
    rowKey: string,
  ) => void
}): NetTableSummary {
  const { db, table, bootstrap, record } = input
  const name = q(table.policy.name)
  const count = (schema: string) =>
    Number(
      db
        .query<{ n: number | bigint }, []>(
          `SELECT count(*) AS n FROM ${schema}.${name}`,
        )
        .get()?.n ?? 0,
    )
  const summary: NetTableSummary = {
    before: bootstrap ? 0 : count('net_baseline'),
    after: count('main'),
    inserted: 0,
    updated: 0,
    deleted: 0,
    unchanged: 0,
  }
  const match = netKeyMatch(table, 'c', 'b')
  const ordering = (alias: string) =>
    table.primaryKey.map(column => `${alias}.${q(column)}`).join(',')
  const write = (kind: 'delete' | 'insert' | 'update', row: NetRow) => {
    const scope = table.policy.rowScope
    if (scope) {
      const index = table.writable.indexOf(scope.column)
      if (
        index < 0 ||
        !scope.values.includes(String(row[scope.column])) ||
        (kind === 'update' &&
          !scope.values.includes(String(row[`__net_before_${index}`])))
      )
        throw new Error(
          `Net-plan mutation escapes its owned scope: ${table.policy.name}.${scope.column}`,
        )
    }
    if (kind !== 'delete') assertNetRowBudget(row, table.columns, table.policy.name)
    if (kind === 'update' && table.policy.collection) {
      const previous = Object.fromEntries(
        table.writable.map((column, index) => [column, row[`__net_before_${index}`]]),
      )
      if (collectionKey(table, row) !== collectionKey(table, previous))
        throw new Error(
          `Collection key changed in ${table.policy.name}; requires an explicit bounded transition.`,
        )
    }
    if (typeof row.__net_key !== 'string')
      throw new Error('Missing net-plan row identity.')
    record(
      kind,
      keyedMutation(table, kind, row),
      collectionKey(table, row),
      row.__net_key,
    )
    if (kind === 'insert') summary.inserted++
    else if (kind === 'update') summary.updated++
    else summary.deleted++
  }
  if (!bootstrap) {
    for (const row of db
      .query<NetRow, []>(
        `SELECT b.*,${netRowKey(table, 'b')} AS __net_key FROM net_baseline.${name} b WHERE NOT EXISTS (SELECT 1 FROM main.${name} c WHERE ${match}) ORDER BY ${ordering('b')}`,
      )
      .iterate())
      write('delete', row)
    const previous = table.writable
      .map((column, index) => `b.${q(column)} AS ${q(`__net_before_${index}`)}`)
      .join(',')
    const semantic = table.columns.filter(
      column => !table.policy.ignoredColumns?.includes(column),
    )
    for (const row of db
      .query<NetRow, []>(
        `SELECT c.*,${netRowKey(table, 'c')} AS __net_key,${previous} FROM main.${name} c JOIN net_baseline.${name} b ON ${match} WHERE ${netDifference(semantic, 'c', 'b')} ORDER BY ${ordering('c')}`,
      )
      .iterate())
      write('update', row)
  }
  for (const row of db
    .query<NetRow, []>(
      `SELECT c.*,${netRowKey(table, 'c')} AS __net_key FROM main.${name} c ${bootstrap ? '' : `WHERE NOT EXISTS (SELECT 1 FROM net_baseline.${name} b WHERE ${match})`} ORDER BY ${ordering('c')}`,
    )
    .iterate())
    write('insert', row)
  summary.unchanged = summary.after - summary.inserted - summary.updated
  return summary
}
