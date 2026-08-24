import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  resolveShardBindingName,
  type LocalAddressDbContext,
} from '../dbCache/localDbCache.ts'
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
const SQL_STATEMENT_BYTE_LIMIT = 96 * 1024

export type CanonicalStatsDictionaryTable =
  | 'statsFields'
  | 'statsFieldsI18n'
  | 'statsMeasures'
  | 'statsMeasuresI18n'
  | 'statsValuesI18n'
export type CanonicalStatsRecordTable = 'statsRecords'
type CanonicalStatsTable = CanonicalStatsRecordTable | CanonicalStatsDictionaryTable

type Row = Record<string, unknown>

export type CanonicalStatsSqlBatches = {
  current: string[]
  history: Array<{ batches: string[]; shardYear: string }>
}

export type CanonicalStatsSqlReplayProgress = {
  completedBatches: number
  phase:
    | 'local-current-replay'
    | 'local-history-replay'
    | 'remote-current-replay'
    | 'remote-history-replay'
  shardYear?: string
  totalBatches: number
}

export function buildCanonicalStatsSqlBatches(input: {
  current: Array<{ rows: Row[]; table: CanonicalStatsTable }>
  history: Array<{
    rows: Row[]
    table: CanonicalStatsTable
    shardYear?: string
  }>
  dictionaries: Array<{ rows: Row[]; table: CanonicalStatsDictionaryTable }>
}) {
  const historyGroupsByYear = new Map<
    string,
    Array<{ rows: Row[]; table: CanonicalStatsTable }>
  >()
  for (const group of input.history) {
    const rowsByYear = new Map<string, Row[]>()
    for (const row of group.rows) {
      const shardYear =
        group.shardYear ??
        requiredString(row.referencePeriodEndYear, 'referencePeriodEndYear')
      const rows = rowsByYear.get(shardYear) ?? []
      rows.push(row)
      rowsByYear.set(shardYear, rows)
    }
    for (const [shardYear, rows] of rowsByYear) {
      const groups = historyGroupsByYear.get(shardYear) ?? []
      groups.push({ rows, table: group.table })
      historyGroupsByYear.set(shardYear, groups)
    }
  }
  const historyYears = [...historyGroupsByYear.keys()]
  for (const group of input.dictionaries) {
    for (const shardYear of historyYears) {
      const groups = historyGroupsByYear.get(shardYear)
      groups?.push({ rows: group.rows, table: group.table })
    }
  }
  const currentGroups: Array<{ rows: Row[]; table: CanonicalStatsTable }> = [
    ...input.current,
    ...input.dictionaries.map(group => ({
      rows: group.rows.map(stripHistoryDictionaryVersion),
      table: group.table,
    })),
  ]
  return {
    current: chunkSql([
      ...buildReplaceCurrentDictionaryStatements(currentGroups),
      ...currentGroups.flatMap(group =>
        buildUpsertStatements(
          group.table,
          group.rows,
          currentConflictColumns(group.table),
        ),
      ),
    ]),
    history: [...historyGroupsByYear.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([shardYear, groups]) => ({
        batches: chunkSql([
          ...groups.flatMap(group => [
            ...buildCloseHistoryStatements(group.table, group.rows),
            ...buildUpsertStatements(group.table, group.rows, [
              ...historyIdentityColumns(group.table),
              'versionHash',
            ]),
          ]),
        ]),
        shardYear,
      })),
  } satisfies CanonicalStatsSqlBatches
}

/** Replays latest-view and immutable history changes through the same SQL path. */
export async function replayCanonicalStatsSqlBatches(
  target: UploadTarget,
  context: Pick<LocalAddressDbContext, 'currentBinding' | 'historyTargets' | 'state'>,
  batches: CanonicalStatsSqlBatches,
  options: {
    importOptions?: Pick<SqlImportExecutionOptions, 'accountId' | 'apiToken'>
    onProgress?: (event: CanonicalStatsSqlReplayProgress) => Promise<void> | void
  } = {},
) {
  const remoteReplay = target.remote
    ? resolveRemoteReplay(target, context, batches, options)
    : null
  const historyBatchCount = batches.history.reduce(
    (total, target) => total + target.batches.length,
    0,
  )
  const localBatchCount = batches.current.length + historyBatchCount
  const totalBatches = localBatchCount * (target.remote ? 2 : 1)
  let completedBatches = 0
  await replay(
    { binding: context.currentBinding, databaseId: null, name: 'current' },
    batches.current,
    { isLocal: true },
    'local-current-replay',
    options.onProgress,
    completedBatches,
    totalBatches,
  )
  completedBatches += batches.current.length
  for (const history of batches.history) {
    const bindingName = resolveShardBindingName('history', 'HK', history.shardYear)
    const historyTarget = context.historyTargets.find(
      entry => entry.bindingName === bindingName,
    )
    if (history.batches.length > 0 && !historyTarget?.binding) {
      throw new Error(`Local canonical statistic replay requires ${bindingName}.`)
    }
    await replay(
      {
        binding: historyTarget?.binding,
        databaseId: null,
        name: 'history',
      },
      history.batches,
      { isLocal: true },
      'local-history-replay',
      options.onProgress,
      completedBatches,
      totalBatches,
      history.shardYear,
    )
    completedBatches += history.batches.length
  }
  if (!remoteReplay) return
  await replay(
    { databaseId: remoteReplay.currentDatabaseId ?? null, name: 'current' },
    batches.current,
    {
      accountId: remoteReplay.accountId,
      apiToken: remoteReplay.apiToken,
      isLocal: false,
    },
    'remote-current-replay',
    options.onProgress,
    localBatchCount,
    totalBatches,
  )
  completedBatches += batches.current.length
  for (const history of batches.history) {
    const bindingName = resolveShardBindingName('history', 'HK', history.shardYear)
    const databaseId = context.historyTargets.find(
      entry => entry.bindingName === bindingName,
    )?.databaseId
    await replay(
      { databaseId: databaseId ?? null, name: 'history' },
      history.batches,
      {
        accountId: remoteReplay.accountId,
        apiToken: remoteReplay.apiToken,
        isLocal: false,
      },
      'remote-history-replay',
      options.onProgress,
      completedBatches,
      totalBatches,
      history.shardYear,
    )
    completedBatches += history.batches.length
  }
}

function resolveRemoteReplay(
  target: UploadTarget,
  context: Pick<LocalAddressDbContext, 'historyTargets' | 'state'>,
  batches: CanonicalStatsSqlBatches,
  options: {
    importOptions?: Pick<SqlImportExecutionOptions, 'accountId' | 'apiToken'>
  },
) {
  const accountId =
    options.importOptions?.accountId ?? resolveCloudflareAccountId(target)
  const apiToken =
    options.importOptions?.apiToken ?? process.env.CLOUDFLARE_D1_TOKEN?.trim()
  const currentDatabaseId = context.state.bindings.DB_CURRENT?.databaseId
  const missing = [
    !accountId && 'CLOUDFLARE_ACCOUNT_ID',
    !apiToken && 'CLOUDFLARE_D1_TOKEN',
    batches.current.length > 0 && !currentDatabaseId && 'current.databaseId',
    ...batches.history.map(history => {
      const bindingName = resolveShardBindingName('history', 'HK', history.shardYear)
      const databaseId = context.historyTargets.find(
        entry => entry.bindingName === bindingName,
      )?.databaseId
      return history.batches.length > 0 && !databaseId
        ? `${bindingName}.databaseId`
        : false
    }),
  ].filter(Boolean)
  if (missing.length) {
    throw new Error(`Canonical statistic D1 replay requires ${missing.join(', ')}.`)
  }
  return { accountId, apiToken, currentDatabaseId }
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
  const rowsByColumns = new Map<string, Row[]>()
  for (const row of rows) {
    const columns = Object.keys(row).sort()
    const key = columns.join('\u0000')
    const groupedRows = rowsByColumns.get(key) ?? []
    groupedRows.push(row)
    rowsByColumns.set(key, groupedRows)
  }

  return [...rowsByColumns.entries()].flatMap(([key, groupedRows]) => {
    const columns = key.split('\u0000')
    const prefix = `INSERT INTO ${identifier(table)} (${columns.map(identifier).join(', ')}) VALUES `
    const suffix = [
      `ON CONFLICT (${conflictColumns.map(identifier).join(', ')}) DO UPDATE SET`,
      columns
        .filter(column => !conflictColumns.includes(column))
        .map(column => `${identifier(column)} = excluded.${identifier(column)}`)
        .join(', '),
      ';',
    ].join(' ')
    const statements: string[] = []
    let values: string[] = []

    for (const row of groupedRows) {
      const value = `(${columns.map(column => sqlValue(row[column])).join(', ')})`
      const candidate = `${prefix}${[...values, value].join(', ')} ${suffix}`
      if (Buffer.byteLength(candidate) > SQL_STATEMENT_BYTE_LIMIT) {
        if (values.length === 0) {
          throw new Error(
            `A ${table} canonical statistic row exceeds the D1 SQL statement limit.`,
          )
        }
        statements.push(`${prefix}${values.join(', ')} ${suffix}`)
        values = [value]
        continue
      }
      values.push(value)
    }
    if (values.length) statements.push(`${prefix}${values.join(', ')} ${suffix}`)
    return statements
  })
}

function currentConflictColumns(table: CanonicalStatsTable) {
  return table === 'statsRecords' ? ['id'] : dictionaryIdentityColumns(table)
}

function historyIdentityColumns(table: CanonicalStatsTable) {
  return table === 'statsRecords'
    ? ['id']
    : [...dictionaryIdentityColumns(table), 'sourceReleaseId']
}

function dictionaryIdentityColumns(table: CanonicalStatsDictionaryTable) {
  switch (table) {
    case 'statsFields':
      return ['datasetCode', 'fieldName']
    case 'statsFieldsI18n':
      return ['datasetCode', 'fieldName', 'locale']
    case 'statsMeasures':
      return ['datasetCode', 'measureCode']
    case 'statsMeasuresI18n':
      return ['datasetCode', 'measureCode', 'locale']
    case 'statsValuesI18n':
      return ['datasetCode', 'dimensionCode', 'valueCode', 'locale']
  }
}

function stripHistoryDictionaryVersion(row: Row) {
  const {
    isCurrent: _isCurrent,
    sourceReleaseId: _sourceReleaseId,
    versionHash: _versionHash,
    ...current
  } = row
  return current
}

function buildReplaceCurrentDictionaryStatements(
  groups: Array<{ rows: Row[]; table: CanonicalStatsTable }>,
) {
  const scopes = uniqueTuples(
    groups.filter(group => group.table !== 'statsRecords').flatMap(group => group.rows),
    ['datasetCode'],
  )
  if (scopes.length === 0) return []
  const condition = scopes
    .map(([datasetCode]) => `"datasetCode" = ${sqlValue(datasetCode)}`)
    .join(' OR ')
  const tables: CanonicalStatsDictionaryTable[] = [
    'statsFieldsI18n',
    'statsMeasuresI18n',
    'statsValuesI18n',
    'statsFields',
    'statsMeasures',
  ]
  return tables.map(table => `DELETE FROM ${identifier(table)} WHERE ${condition};`)
}

async function replay(
  destination: SqlImportTargetContext,
  batches: string[],
  options: SqlImportExecutionOptions,
  phase: CanonicalStatsSqlReplayProgress['phase'],
  onProgress: (event: CanonicalStatsSqlReplayProgress) => Promise<void> | void = () =>
    undefined,
  completedBefore = 0,
  totalBatches = batches.length,
  shardYear?: string,
) {
  if (batches.length === 0) return
  for (let index = 0; index < batches.length; index += 1) {
    const sql = batches[index]
    if (!sql) continue
    await onProgress({
      completedBatches: completedBefore + index,
      phase,
      shardYear,
      totalBatches,
    })
    await executeSqlText(destination, sql, options)
  }
  await onProgress({
    completedBatches: completedBefore + batches.length,
    phase,
    shardYear,
    totalBatches,
  })
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
    if (Buffer.byteLength(statement) > SQL_STATEMENT_BYTE_LIMIT) {
      throw new Error('A canonical statistic SQL statement exceeds the D1 limit.')
    }
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
