import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import type { LocalAddressDbContext } from '../dbCache/localDbCache.ts'
import type { UploadTarget } from '../cli/options.ts'
import {
  executeSqlText,
  type SqlImportExecutionOptions,
  type SqlImportTargetContext,
} from '../localPipeline/sqlImport.ts'

const REPO_ROOT = resolve(import.meta.dir, '../../../../..')
const HARBOUR_WORKERS_WRANGLER_PATH = resolve(
  REPO_ROOT,
  'apps/harbour-workers/wrangler.jsonc',
)
const SQL_CHUNK_BYTE_LIMIT = 1_000_000

export type CanonicalStatsTable =
  | 'statsDimensions'
  | 'statsMeasures'
  | 'statsMeasuresI18n'
  | 'statsObservationDimensions'
  | 'statsObservations'
  | 'statsValues'
  | 'statsValuesI18n'

type Row = Record<string, unknown>

export type CanonicalStatsSqlBatches = {
  current: string[]
  history: string[]
}

export function buildCanonicalStatsSqlBatches(input: {
  current: Array<{ rows: Row[]; table: CanonicalStatsTable }>
  history: Array<{ rows: Row[]; table: CanonicalStatsTable }>
}) {
  return {
    current: chunkSql(
      input.current.flatMap(group => [
        ...buildReplaceCurrentStatements(group.table, group.rows),
        ...buildUpsertStatements(
          group.table,
          group.rows,
          currentConflictColumns(group.table),
        ),
      ]),
    ),
    history: chunkSql(
      input.history.flatMap(group => [
        ...buildCloseHistoryStatements(group.table, group.rows),
        ...buildUpsertStatements(group.table, group.rows, [
          ...historyIdentityColumns(group.table),
          'versionHash',
        ]),
      ]),
    ),
  } satisfies CanonicalStatsSqlBatches
}

/** Replays latest-view and immutable history changes through the same SQL path. */
export async function replayCanonicalStatsSqlBatches(
  target: UploadTarget,
  context: Pick<
    LocalAddressDbContext,
    'currentBinding' | 'historyBinding' | 'historyTargets' | 'state'
  >,
  shardYear: string,
  batches: CanonicalStatsSqlBatches,
  options: {
    importOptions?: Pick<SqlImportExecutionOptions, 'accountId' | 'apiToken'>
  } = {},
) {
  await replay(
    { binding: context.currentBinding, databaseId: null, name: 'current' },
    batches.current,
    { isLocal: true },
  )
  await replay(
    { binding: context.historyBinding, databaseId: null, name: 'history' },
    batches.history,
    { isLocal: true },
  )
  if (!target.remote) return

  const accountId =
    options.importOptions?.accountId ?? resolveCloudflareAccountId(target)
  const apiToken =
    options.importOptions?.apiToken ?? process.env.CLOUDFLARE_D1_TOKEN?.trim()
  const currentDatabaseId = context.state.bindings.DB_CURRENT?.databaseId
  const historyDatabaseId = context.historyTargets.find(
    entry => entry.year === shardYear,
  )?.databaseId
  const missing = [
    !accountId && 'CLOUDFLARE_ACCOUNT_ID',
    !apiToken && 'CLOUDFLARE_D1_TOKEN',
    batches.current.length > 0 && !currentDatabaseId && 'current.databaseId',
    batches.history.length > 0 && !historyDatabaseId && 'history.databaseId',
  ].filter(Boolean)
  if (missing.length) {
    throw new Error(`Canonical statistic D1 replay requires ${missing.join(', ')}.`)
  }
  await replay(
    { databaseId: currentDatabaseId ?? null, name: 'current' },
    batches.current,
    { accountId, apiToken, isLocal: false },
  )
  await replay(
    { databaseId: historyDatabaseId ?? null, name: 'history' },
    batches.history,
    { accountId, apiToken, isLocal: false },
  )
}

function buildReplaceCurrentStatements(table: CanonicalStatsTable, rows: Row[]) {
  if (!rows.length) return []
  // Observation dimensions have no datasetCode. They are replaced with the
  // observations to which they belong, avoiding stale categorical dimensions.
  if (table === 'statsObservationDimensions') {
    const observationIds = uniqueStrings(rows, 'observationId')
    return chunk(observationIds, 250).map(
      ids =>
        `DELETE FROM ${identifier(table)} WHERE "observationId" IN (${ids.map(sqlValue).join(', ')});`,
    )
  }
  const datasetCodes = uniqueStrings(rows, 'datasetCode')
  if (table === 'statsObservations') {
    return [
      `DELETE FROM "statsObservationDimensions" WHERE "observationId" IN (SELECT "id" FROM "statsObservations" WHERE "datasetCode" IN (${datasetCodes.map(sqlValue).join(', ')}));`,
      `DELETE FROM ${identifier(table)} WHERE "datasetCode" IN (${datasetCodes.map(sqlValue).join(', ')});`,
    ]
  }
  return [
    `DELETE FROM ${identifier(table)} WHERE "datasetCode" IN (${datasetCodes.map(sqlValue).join(', ')});`,
  ]
}

function buildCloseHistoryStatements(table: CanonicalStatsTable, rows: Row[]) {
  if (!rows.length) return []
  const identity = historyIdentityColumns(table)
  const updatedAt = requiredString(rows[0]?.updatedAt, 'updatedAt')
  const conditions = uniqueTuples(rows, identity).map(
    tuple =>
      `(${identity.map((column, index) => `${identifier(column)} = ${sqlValue(tuple[index])}`).join(' AND ')})`,
  )
  return chunk(conditions, 100).map(
    group =>
      `UPDATE ${identifier(table)} SET "isCurrent" = 0, "updatedAt" = ${sqlValue(updatedAt)} WHERE "isCurrent" = 1 AND (${group.join(' OR ')});`,
  )
}

function buildUpsertStatements(
  table: CanonicalStatsTable,
  rows: Row[],
  conflictColumns: string[],
) {
  return rows.map(row => {
    const columns = Object.keys(row).sort()
    const updates = columns.filter(column => !conflictColumns.includes(column))
    return [
      `INSERT INTO ${identifier(table)} (${columns.map(identifier).join(', ')})`,
      `VALUES (${columns.map(column => sqlValue(row[column])).join(', ')})`,
      `ON CONFLICT (${conflictColumns.map(identifier).join(', ')}) DO UPDATE SET`,
      updates
        .map(column => `${identifier(column)} = excluded.${identifier(column)}`)
        .join(', '),
      ';',
    ].join(' ')
  })
}

function currentConflictColumns(table: CanonicalStatsTable) {
  return historyIdentityColumns(table)
}

function historyIdentityColumns(table: CanonicalStatsTable) {
  switch (table) {
    case 'statsObservations':
      return ['id']
    case 'statsMeasures':
      return ['datasetCode', 'measureCode']
    case 'statsMeasuresI18n':
      return ['datasetCode', 'measureCode', 'locale']
    case 'statsDimensions':
      return ['datasetCode', 'dimensionCode']
    case 'statsValues':
      return ['datasetCode', 'dimensionCode', 'valueCode']
    case 'statsValuesI18n':
      return ['datasetCode', 'dimensionCode', 'valueCode', 'locale']
    case 'statsObservationDimensions':
      return ['observationId', 'dimensionCode', 'valueCode']
  }
}

async function replay(
  destination: SqlImportTargetContext,
  batches: string[],
  options: SqlImportExecutionOptions,
) {
  for (const sql of batches) await executeSqlText(destination, sql, options)
}

function uniqueStrings(rows: Row[], column: string) {
  return [...new Set(rows.map(row => requiredString(row[column], column)))].sort()
}

function uniqueTuples(rows: Row[], columns: string[]) {
  const tuples = new Map<string, unknown[]>()
  for (const row of rows) {
    const tuple = columns.map(column => row[column])
    tuples.set(JSON.stringify(tuple), tuple)
  }
  return [...tuples.values()]
}

function chunkSql(statements: string[]) {
  const output: string[] = []
  let current = ''
  for (const statement of statements) {
    if (current && current.length + statement.length + 1 > SQL_CHUNK_BYTE_LIMIT) {
      output.push(current)
      current = ''
    }
    current += `${statement}\n`
  }
  if (current) output.push(current)
  return output
}

function chunk<T>(items: T[], size: number) {
  const output: T[][] = []
  for (let index = 0; index < items.length; index += size)
    output.push(items.slice(index, index + size))
  return output
}

function identifier(value: string) {
  if (!/^[A-Za-z][A-Za-z0-9]*$/.test(value))
    throw new Error(`Unsafe SQL identifier: ${value}.`)
  return `"${value}"`
}

function sqlValue(value: unknown): string {
  if (value === null || value === undefined) return 'NULL'
  if (typeof value === 'boolean') return value ? '1' : '0'
  if (typeof value === 'number') {
    if (!Number.isFinite(value))
      throw new Error('Cannot write a non-finite statistic value.')
    return String(value)
  }
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  return `'${text.replaceAll("'", "''")}'`
}

function requiredString(value: unknown, field: string) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Missing ${field}.`)
  return value
}

function resolveCloudflareAccountId(target: UploadTarget) {
  const fromEnvironment = process.env.CLOUDFLARE_ACCOUNT_ID?.trim()
  if (fromEnvironment) return fromEnvironment
  const config = JSON.parse(readFileSync(HARBOUR_WORKERS_WRANGLER_PATH, 'utf8')) as {
    env?: Record<string, { vars?: Record<string, unknown> }>
    vars?: Record<string, unknown>
  }
  const variables =
    target.environment === 'production'
      ? config.env?.production?.vars
      : target.environment === 'preview'
        ? config.env?.preview?.vars
        : config.vars
  const accountId = variables?.CLOUDFLARE_ACCOUNT_ID
  return typeof accountId === 'string' && accountId.trim()
    ? accountId.trim()
    : undefined
}
