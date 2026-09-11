import { readFileSync } from 'node:fs'
import { sourceResolutionSql } from '@repo/core/pipeline/db/sourceResolutions'
import type { NewSourceResolution } from '@repo/db/historySchema'
import { resolve } from 'node:path'
import { deliverSqlPhase, type SqlDeliveryPhase } from '../local/sqlDeliveryPhase.ts'

import {
  resolveShardBindingName,
  type LocalAddressDbContext,
} from '../../dbCache/localDbCache.ts'
import type { UploadTarget } from '../../cli/options.ts'
import {
  executeSqlText,
  type SqlImportExecutionOptions,
  type SqlImportTargetContext,
} from '../local/sqlImport.ts'

const REPO_ROOT = resolve(import.meta.dir, '../../../../../..')
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
type CanonicalStatsTable =
  | CanonicalStatsRecordTable
  | CanonicalStatsDictionaryTable
  | 'snapshotVersionChanges'

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
  changes?: Array<{ shardYear: string; row: Row }>
  resolutions?: Array<{ shardYear: string; row: NewSourceResolution }>
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
  for (const change of input.changes ?? []) {
    const groups = historyGroupsByYear.get(change.shardYear) ?? []
    groups.push({ rows: [change.row], table: 'snapshotVersionChanges' })
    historyGroupsByYear.set(change.shardYear, groups)
  }
  for (const group of input.dictionaries) {
    for (const shardYear of historyYears) {
      const groups = historyGroupsByYear.get(shardYear)
      groups?.push({ rows: group.rows, table: group.table })
    }
  }
  const currentGroups: Array<{ rows: Row[]; table: CanonicalStatsTable }> = [
    ...input.current,
  ]
  return {
    current: chunkSql([
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
          ...(input.resolutions ?? [])
            .filter(resolution => resolution.shardYear === shardYear)
            .map(resolution => sourceResolutionSql(resolution.row)),
          ...groups.flatMap(group => [
            ...buildUpsertStatements(
              group.table,
              group.rows,
              [
                ...historyIdentityColumns(group.table),
                ...(group.table === 'snapshotVersionChanges' ? [] : ['versionHash']),
              ],
              true,
            ),
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
  input:
    | CanonicalStatsSqlBatches
    | (() => CanonicalStatsSqlBatches | Promise<CanonicalStatsSqlBatches>),
  options: {
    delivery?: SqlDeliveryPhase
    importOptions?: Pick<SqlImportExecutionOptions, 'accountId' | 'apiToken'>
    onProgress?: (event: CanonicalStatsSqlReplayProgress) => Promise<void> | void
  } = {},
) {
  if (options.delivery) {
    await deliverSqlPhase(options.delivery, () =>
      replayCanonicalStatsSqlBatches(target, context, input, {
        ...options,
        delivery: undefined,
      }),
    )
    return
  }
  const batches = typeof input === 'function' ? await input() : input
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

function buildUpsertStatements(
  table: CanonicalStatsTable,
  rows: Row[],
  conflictColumns: string[],
  immutable = false,
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
    const statements: string[] = []
    let values: string[] = []

    for (const row of groupedRows) {
      const value = `(${columns.map(column => sqlValue(row[column])).join(', ')})`
      const candidate = `${prefix}${[...values, value].join(', ')} ${upsertSuffix(
        columns,
        conflictColumns,
        immutable,
      )}`
      if (Buffer.byteLength(candidate) > SQL_STATEMENT_BYTE_LIMIT) {
        if (values.length) {
          statements.push(
            `${prefix}${values.join(', ')} ${upsertSuffix(
              columns,
              conflictColumns,
              immutable,
            )}`,
          )
          values = []
        }
        statements.push(
          ...buildOversizedRowStatements(
            table,
            columns,
            row,
            conflictColumns,
            immutable,
          ),
        )
        continue
      }
      values.push(value)
    }
    if (values.length)
      statements.push(
        `${prefix}${values.join(', ')} ${upsertSuffix(
          columns,
          conflictColumns,
          immutable,
        )}`,
      )
    return statements
  })
}

function buildOversizedRowStatements(
  table: CanonicalStatsTable,
  columns: string[],
  row: Row,
  conflictColumns: string[],
  immutable: boolean,
) {
  const baseRow = { ...row }
  const splitColumns = columns
    .filter(column => !conflictColumns.includes(column) && canAppendValue(row[column]))
    .sort(
      (left, right) =>
        Buffer.byteLength(sqlText(row[right])) - Buffer.byteLength(sqlText(row[left])),
    )
  const appendedColumns: string[] = []
  for (const column of splitColumns) {
    baseRow[column] = ''
    appendedColumns.push(column)
    if (
      Buffer.byteLength(
        singleUpsertStatement(table, columns, baseRow, conflictColumns, immutable),
      ) <= SQL_STATEMENT_BYTE_LIMIT
    )
      break
  }
  if (!appendedColumns.length)
    throw new Error(
      `A ${table} canonical statistic row exceeds the D1 SQL statement limit.`,
    )

  if (immutable) {
    if (!Object.hasOwn(baseRow, 'isCurrent'))
      throw new Error(
        `An oversized immutable ${table} canonical statistic row must include isCurrent.`,
      )
    baseRow.isCurrent = false
  }
  const baseStatement = singleUpsertStatement(
    table,
    columns,
    baseRow,
    conflictColumns,
    immutable,
  )
  if (Buffer.byteLength(baseStatement) > SQL_STATEMENT_BYTE_LIMIT)
    throw new Error(
      `A ${table} canonical statistic row exceeds the D1 SQL statement limit.`,
    )

  const predicate = conflictColumns
    .map(column => `${identifier(column)} = ${sqlValue(row[column])}`)
    .join(' AND ')
  const appendPredicate = immutable ? `${predicate} AND "isCurrent" = 0` : predicate
  const statements = [baseStatement]
  for (const column of appendedColumns) {
    const text = sqlText(row[column])
    statements.push(
      ...chunkSqlText(text, chunk =>
        [
          `UPDATE ${identifier(table)} SET ${identifier(column)} = ${identifier(column)} || ${sqlValue(chunk)}`,
          `WHERE ${appendPredicate};`,
        ].join(' '),
      ),
    )
  }
  if (immutable)
    statements.push(
      [
        `UPDATE ${identifier(table)} SET "isCurrent" = ${sqlValue(row.isCurrent)}`,
        `WHERE ${predicate} AND "isCurrent" = 0;`,
      ].join(' '),
    )
  return statements
}

function singleUpsertStatement(
  table: CanonicalStatsTable,
  columns: string[],
  row: Row,
  conflictColumns: string[],
  immutable: boolean,
) {
  return [
    `INSERT INTO ${identifier(table)} (${columns.map(identifier).join(', ')})`,
    `VALUES (${columns.map(column => sqlValue(row[column])).join(', ')})`,
    upsertSuffix(columns, conflictColumns, immutable),
  ].join(' ')
}

function upsertSuffix(
  columns: string[],
  conflictColumns: string[],
  immutable: boolean,
) {
  if (immutable)
    return `ON CONFLICT (${conflictColumns.map(identifier).join(', ')}) DO NOTHING;`
  return [
    `ON CONFLICT (${conflictColumns.map(identifier).join(', ')}) DO UPDATE SET`,
    columns
      .filter(column => !conflictColumns.includes(column))
      .map(column => `${identifier(column)} = excluded.${identifier(column)}`)
      .join(', '),
    ';',
  ].join(' ')
}

function currentConflictColumns(table: CanonicalStatsTable) {
  if (table === 'statsRecords') return ['id']
  if (table === 'snapshotVersionChanges') return historyIdentityColumns(table)
  return [...dictionaryIdentityColumns(table), 'versionHash']
}

function historyIdentityColumns(table: CanonicalStatsTable) {
  if (table === 'snapshotVersionChanges')
    return ['snapshotId', 'recordType', 'recordId', 'locale']
  return table === 'statsRecords' ? ['id'] : dictionaryIdentityColumns(table)
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

function chunkSqlText(value: string, buildStatement: (chunk: string) => string) {
  const codePoints = [...value]
  const chunks: string[] = []
  let offset = 0
  while (offset < codePoints.length) {
    let low = offset + 1
    let high = Math.min(codePoints.length, offset + 65_536)
    let end = offset
    while (low <= high) {
      const middle = Math.floor((low + high) / 2)
      const candidate = codePoints.slice(offset, middle).join('')
      if (Buffer.byteLength(buildStatement(candidate)) <= SQL_STATEMENT_BYTE_LIMIT) {
        end = middle
        low = middle + 1
      } else {
        high = middle - 1
      }
    }
    if (end === offset)
      throw new Error('A canonical statistic value exceeds the D1 SQL statement limit.')
    chunks.push(codePoints.slice(offset, end).join(''))
    offset = end
  }
  return chunks.map(chunk => buildStatement(chunk))
}

function canAppendValue(value: unknown) {
  if (value === null || value === undefined) return false
  try {
    sqlText(value)
    return true
  } catch {
    return false
  }
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

function sqlText(value: unknown) {
  if (typeof value === 'string') return value
  const text = JSON.stringify(value)
  if (text === undefined)
    throw new Error('Cannot write an unserialisable canonical statistic value.')
  return text
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
