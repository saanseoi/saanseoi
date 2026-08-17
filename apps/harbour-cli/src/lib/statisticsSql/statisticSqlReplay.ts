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
const SOURCE_ID_CHUNK_SIZE = 250

type StatisticRow = object

export type StatisticSqlReplayInput = {
  history?: {
    rows: StatisticRow[]
    table: 'divisionStatistics'
  }
  releaseCode: string
  releaseId: string
  source: {
    rows: StatisticRow[]
    table:
      | 'hkgovCenstatdDistrictLandAreaPopulationDensities'
      | 'hkgovCenstatdStatistics'
  }
}

export type StatisticSqlBatches = {
  history: string[]
  source: string[]
}

export type StatisticSqlReplayProgress = {
  completedBatches: number
  phase: 'local-replay' | 'remote-history-replay' | 'remote-source-replay'
  totalBatches: number
}

export type StatisticSqlReplayOptions = {
  executeSql?: typeof executeSqlText
  importOptions?: Pick<SqlImportExecutionOptions, 'accountId' | 'apiToken'>
  onProgress?: (event: StatisticSqlReplayProgress) => Promise<void> | void
}

/**
 * Builds the source/history mutations once, so local SQLite and remote D1
 * receive byte-for-byte identical, idempotent batches.
 */
export function buildStatisticSqlBatches(
  input: StatisticSqlReplayInput,
): StatisticSqlBatches {
  const sourceRows = sortRows(input.source.rows, 'sourceRecordId')
  const sourceIds = sourceRows.map(row =>
    requiredString(valueFor(row, 'sourceRecordId'), 'sourceRecordId'),
  )
  const sourceStatements = [
    ...buildCloseSourceStatements(
      input.source.table,
      sourceIds,
      input.releaseId,
      input.releaseCode,
      sourceRows,
    ),
    ...buildUpsertStatements(
      input.source.table,
      sourceRows,
      ['sourceRecordId', 'versionHash'],
      ['isCurrent', 'releaseId', 'updatedAt', 'validFromRelease', 'validToRelease'],
    ),
  ]

  const historyRows = sortRows(input.history?.rows ?? [], 'id')
  const historyIds = historyRows.map(row => requiredString(valueFor(row, 'id'), 'id'))
  const historyStatements = input.history
    ? [
        ...buildCloseHistoryStatements(historyIds, historyRows),
        ...buildUpsertStatements(
          input.history.table,
          historyRows,
          ['id', 'versionHash'],
          ['isCurrent', 'sourceReleaseId', 'updatedAt'],
        ),
      ]
    : []

  return {
    history: chunkSql(historyStatements),
    source: chunkSql(sourceStatements),
  }
}

/**
 * Replays source and history mutations into the local cache first. Preview
 * and production then import those exact batches into their owning D1 shards.
 */
export async function replayStatisticSqlBatches(
  target: UploadTarget,
  context: Pick<
    LocalAddressDbContext,
    'historyBinding' | 'historyTargets' | 'sourceBinding' | 'sourceTargets'
  >,
  shardYear: string,
  batches: StatisticSqlBatches,
  options: StatisticSqlReplayOptions = {},
) {
  const execute = options.executeSql ?? executeSqlText
  const localSourceTarget: SqlImportTargetContext = {
    binding: context.sourceBinding,
    databaseId: null,
    name: 'source',
  }
  const localHistoryTarget: SqlImportTargetContext = {
    binding: context.historyBinding,
    databaseId: null,
    name: 'history',
  }

  await replayBatches(
    execute,
    localSourceTarget,
    batches.source,
    { isLocal: true },
    'local-replay',
    options.onProgress,
  )
  await replayBatches(
    execute,
    localHistoryTarget,
    batches.history,
    { isLocal: true },
    'local-replay',
    options.onProgress,
    batches.source.length,
    batches.source.length + batches.history.length,
  )

  if (!target.remote) return

  const accountId =
    options.importOptions?.accountId ?? resolveCloudflareAccountId(target)
  const apiToken =
    options.importOptions?.apiToken ?? process.env.CLOUDFLARE_D1_TOKEN?.trim()
  const sourceDatabaseId = context.sourceTargets.find(
    item => item.bindingName === resolveShardBindingName('source', 'HK', shardYear),
  )?.databaseId
  const historyDatabaseId = context.historyTargets.find(
    item => item.bindingName === resolveShardBindingName('history', 'HK', shardYear),
  )?.databaseId
  assertRemoteReplayPrerequisites({
    accountId,
    apiToken,
    historyDatabaseId,
    requireHistoryDatabaseId: batches.history.length > 0,
    sourceDatabaseId,
  })

  await replayBatches(
    execute,
    { databaseId: sourceDatabaseId ?? null, name: 'source' },
    batches.source,
    { accountId, apiToken, isLocal: false },
    'remote-source-replay',
    options.onProgress,
  )
  await replayBatches(
    execute,
    { databaseId: historyDatabaseId ?? null, name: 'history' },
    batches.history,
    { accountId, apiToken, isLocal: false },
    'remote-history-replay',
    options.onProgress,
  )
}

function buildCloseSourceStatements(
  table: StatisticSqlReplayInput['source']['table'],
  ids: string[],
  releaseId: string,
  releaseCode: string,
  rows: StatisticRow[],
) {
  if (ids.length === 0) return []
  const [firstRow] = rows
  if (!firstRow) return []
  const updatedAt = requiredString(valueFor(firstRow, 'updatedAt'), 'updatedAt')
  return chunk(ids, SOURCE_ID_CHUNK_SIZE).map(idsChunk =>
    [
      `UPDATE ${sqlIdentifier(table)} SET "isCurrent" = 0, "validToRelease" = ${sqlValue(releaseCode)}, "updatedAt" = ${sqlValue(updatedAt)}`,
      `WHERE "isCurrent" = 1 AND ("sourceRecordId" IN (${idsChunk.map(sqlValue).join(', ')}) OR "releaseId" = ${sqlValue(releaseId)});`,
    ].join(' '),
  )
}

function buildCloseHistoryStatements(ids: string[], rows: StatisticRow[]) {
  if (ids.length === 0) return []
  const [firstRow] = rows
  if (!firstRow) return []
  const updatedAt = requiredString(valueFor(firstRow, 'updatedAt'), 'updatedAt')
  return chunk(ids, SOURCE_ID_CHUNK_SIZE).map(idsChunk =>
    [
      'UPDATE "divisionStatistics" SET "isCurrent" = 0,',
      `"updatedAt" = ${sqlValue(updatedAt)}`,
      `WHERE "isCurrent" = 1 AND "id" IN (${idsChunk.map(sqlValue).join(', ')});`,
    ].join(' '),
  )
}

function buildUpsertStatements(
  table: string,
  rows: StatisticRow[],
  conflictColumns: string[],
  updateColumns: string[],
) {
  return rows.map(row => {
    const values = recordFor(row)
    const columns = Object.keys(values).sort()
    for (const column of columns) assertIdentifier(column, 'column')
    return [
      `INSERT INTO ${sqlIdentifier(table)} (${columns.map(sqlIdentifier).join(', ')})`,
      `VALUES (${columns.map(column => sqlValue(values[column])).join(', ')})`,
      `ON CONFLICT (${conflictColumns.map(sqlIdentifier).join(', ')}) DO UPDATE SET`,
      updateColumns
        .map(column => `${sqlIdentifier(column)} = excluded.${sqlIdentifier(column)}`)
        .join(', '),
      ';',
    ].join(' ')
  })
}

async function replayBatches(
  execute: typeof executeSqlText,
  destination: SqlImportTargetContext,
  batches: string[],
  importOptions: SqlImportExecutionOptions,
  phase: StatisticSqlReplayProgress['phase'],
  onProgress: StatisticSqlReplayOptions['onProgress'],
  completedBefore = 0,
  totalBatches = batches.length,
) {
  if (batches.length === 0) return
  for (let index = 0; index < batches.length; index += 1) {
    const batch = batches[index]
    if (!batch) continue
    await onProgress?.({
      completedBatches: completedBefore + index,
      phase,
      totalBatches,
    })
    await execute(destination, batch, importOptions)
  }
  await onProgress?.({
    completedBatches: completedBefore + batches.length,
    phase,
    totalBatches,
  })
}

function assertRemoteReplayPrerequisites(options: {
  accountId?: string
  apiToken?: string
  historyDatabaseId?: string | null
  requireHistoryDatabaseId: boolean
  sourceDatabaseId?: string | null
}) {
  const missing = [
    !options.accountId?.trim() && 'CLOUDFLARE_ACCOUNT_ID',
    !options.apiToken?.trim() && 'CLOUDFLARE_D1_TOKEN',
    !options.sourceDatabaseId?.trim() && 'source.databaseId',
    options.requireHistoryDatabaseId &&
      !options.historyDatabaseId?.trim() &&
      'history.databaseId',
  ].filter((value): value is string => Boolean(value))
  if (missing.length === 0) return
  throw new Error(
    `Statistic D1 replay requires ${missing.join(', ')} before a remote release can be published.`,
  )
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

function sortRows(rows: StatisticRow[], idColumn: 'id' | 'sourceRecordId') {
  return rows
    .slice()
    .sort(
      (left, right) =>
        requiredString(valueFor(left, idColumn), idColumn).localeCompare(
          requiredString(valueFor(right, idColumn), idColumn),
        ) ||
        requiredString(valueFor(left, 'versionHash'), 'versionHash').localeCompare(
          requiredString(valueFor(right, 'versionHash'), 'versionHash'),
        ),
    )
}

function chunkSql(statements: string[]) {
  const chunks: string[] = []
  let current = ''
  for (const statement of statements) {
    if (current && current.length + statement.length + 1 > SQL_CHUNK_BYTE_LIMIT) {
      chunks.push(current)
      current = ''
    }
    current += `${statement}\n`
  }
  if (current) chunks.push(current)
  return chunks
}

function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }
  return chunks
}

function sqlIdentifier(value: string) {
  assertIdentifier(value, 'identifier')
  return `"${value}"`
}

function assertIdentifier(value: string, label: string) {
  if (!/^[A-Za-z][A-Za-z0-9]*$/.test(value)) {
    throw new Error(`Unsafe ${label}: ${value}.`)
  }
}

function sqlValue(value: unknown): string {
  if (value === null || value === undefined) return 'NULL'
  if (typeof value === 'boolean') return value ? '1' : '0'
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Cannot import a non-finite number.')
    return String(value)
  }
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  return `'${text.replaceAll("'", "''")}'`
}

function recordFor(value: StatisticRow) {
  return value as Record<string, unknown>
}

function valueFor(value: StatisticRow, key: string) {
  return recordFor(value)[key]
}

function requiredString(value: unknown, field: string) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Expected ${field}.`)
  }
  return value
}
