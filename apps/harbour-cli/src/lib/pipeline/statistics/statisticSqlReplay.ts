import { missingSourceMembershipPredicates } from '../local/sourceMembershipSql.ts'
import { readFileSync } from 'node:fs'
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

type StatisticRow = object

export type StatisticSqlReplayInput = {
  history?: {
    rows: StatisticRow[]
    table: 'divisionStatistics'
  }
  sourceVersion: string
  resourceReleaseId: string
  source: {
    rows: StatisticRow[]
    geometries?: Array<{ id: string; sourceGeometry: Uint8Array }>
    table: 'hkgovCenstatdStatistics'
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
  delivery?: SqlDeliveryPhase
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
  const datasetCodes = new Set(
    sourceRows.map(row => requiredString(valueFor(row, 'datasetCode'), 'datasetCode')),
  )
  if (datasetCodes.size > 1)
    throw new Error('A feature replay batch must belong to one dataset.')
  const sourceIds = sourceRows.map(row =>
    requiredString(valueFor(row, 'sourceRecordId'), 'sourceRecordId'),
  )
  const sourceStatements = [
    ...buildCenstatdGeometryStatements(input.source.geometries ?? []),
    ...buildCloseSourceStatements(
      input.source.table,
      sourceIds,
      input.resourceReleaseId,
      input.sourceVersion,
      sourceRows,
    ),
    ...buildUpsertStatements(
      input.source.table,
      sourceRows,
      ['datasetCode', 'resourceReleaseId', 'sourceRecordId', 'versionHash'],
      ['isCurrent', 'updatedAt', 'validToRelease'],
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

/** Immutable geometry writes are resumable without overwriting a shared payload. */
export function buildCenstatdGeometryStatements(
  rows: Array<{ id: string; sourceGeometry: Uint8Array }>,
) {
  return [...new Map(rows.map(row => [row.id, row])).values()].flatMap(row => {
    const table = '"hkgovCenstatdStatisticsGeometry"'
    const id = sqlValue(row.id)
    const insert = (value: Uint8Array) =>
      `INSERT INTO ${table} (id, sourceGeometry) VALUES (${id}, ${sqlValue(value)}) ON CONFLICT (id) DO NOTHING;`
    const statement = insert(row.sourceGeometry)
    if (Buffer.byteLength(statement) <= SQL_STATEMENT_BYTE_LIMIT) return [statement]
    const appends: string[] = []
    for (let offset = 0; offset < row.sourceGeometry.length; offset += 40_000) {
      const chunk = row.sourceGeometry.subarray(offset, offset + 40_000)
      appends.push(
        `UPDATE ${table} SET sourceGeometry = CAST(sourceGeometry || ${sqlValue(chunk)} AS BLOB) WHERE id = ${id} AND length(sourceGeometry) = ${offset};`,
      )
    }
    return [insert(new Uint8Array()), ...appends]
  })
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
  input:
    | StatisticSqlBatches
    | (() => StatisticSqlBatches | Promise<StatisticSqlBatches>),
  options: StatisticSqlReplayOptions = {},
) {
  if (options.delivery) {
    await deliverSqlPhase(options.delivery, () =>
      replayStatisticSqlBatches(target, context, shardYear, input, {
        ...options,
        delivery: undefined,
      }),
    )
    return
  }
  const batches = typeof input === 'function' ? await input() : input
  const execute = options.executeSql ?? executeSqlText
  const remoteReplay = target.remote
    ? resolveRemoteReplay(target, context, shardYear, batches, options)
    : null
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
  const localBatchCount = batches.source.length + batches.history.length
  const totalBatchCount = remoteReplay ? localBatchCount * 2 : localBatchCount

  await replayBatches(
    execute,
    localSourceTarget,
    batches.source,
    { isLocal: true },
    'local-replay',
    options.onProgress,
    0,
    totalBatchCount,
  )
  await replayBatches(
    execute,
    localHistoryTarget,
    batches.history,
    { isLocal: true },
    'local-replay',
    options.onProgress,
    batches.source.length,
    totalBatchCount,
  )

  if (!remoteReplay) return

  await replayBatches(
    execute,
    { databaseId: remoteReplay.sourceDatabaseId ?? null, name: 'source' },
    batches.source,
    {
      accountId: remoteReplay.accountId,
      apiToken: remoteReplay.apiToken,
      isLocal: false,
    },
    'remote-source-replay',
    options.onProgress,
    localBatchCount,
    totalBatchCount,
  )
  await replayBatches(
    execute,
    { databaseId: remoteReplay.historyDatabaseId ?? null, name: 'history' },
    batches.history,
    {
      accountId: remoteReplay.accountId,
      apiToken: remoteReplay.apiToken,
      isLocal: false,
    },
    'remote-history-replay',
    options.onProgress,
    localBatchCount + batches.source.length,
    totalBatchCount,
  )
}

function resolveRemoteReplay(
  target: UploadTarget,
  context: Pick<LocalAddressDbContext, 'historyTargets' | 'sourceTargets'>,
  shardYear: string,
  batches: StatisticSqlBatches,
  options: StatisticSqlReplayOptions,
) {
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
  return { accountId, apiToken, historyDatabaseId, sourceDatabaseId }
}

function buildCloseSourceStatements(
  table: StatisticSqlReplayInput['source']['table'],
  ids: string[],
  resourceReleaseId: string,
  sourceVersion: string,
  rows: StatisticRow[],
) {
  if (ids.length === 0) return []
  const [firstRow] = rows
  if (!firstRow) return []
  const updatedAt = requiredString(valueFor(firstRow, 'updatedAt'), 'updatedAt')
  const hashesById = new Map<string, Set<string>>()
  for (const row of rows) {
    const id = requiredString(valueFor(row, 'sourceRecordId'), 'sourceRecordId')
    const hashes = hashesById.get(id) ?? new Set<string>()
    hashes.add(requiredString(valueFor(row, 'versionHash'), 'versionHash'))
    hashesById.set(id, hashes)
  }
  const update = `UPDATE ${sqlIdentifier(table)} SET "isCurrent" = 0, "validToRelease" = ${sqlValue(sourceVersion)}, "updatedAt" = ${sqlValue(updatedAt)} WHERE "isCurrent" = 1 AND "datasetCode" = ${sqlValue(requiredString(valueFor(firstRow, 'datasetCode'), 'datasetCode'))}`
  return [
    ...[...hashesById].map(
      ([id, hashes]) =>
        `${update} AND "sourceRecordId" = ${sqlValue(id)} AND ("resourceReleaseId" <> ${sqlValue(resourceReleaseId)} OR "versionHash" NOT IN (${[...hashes].map(sqlValue).join(',')}));`,
    ),
    // A same-release rebuild can omit rows; do not close other source lineages.
    ...missingSourceMembershipPredicates(ids).map(
      predicate =>
        `${update} AND "resourceReleaseId" = ${sqlValue(resourceReleaseId)} AND ${predicate};`,
    ),
  ]
}

function buildCloseHistoryStatements(ids: string[], rows: StatisticRow[]) {
  if (ids.length === 0) return []
  const [firstRow] = rows
  if (!firstRow) return []
  const updatedAt = requiredString(valueFor(firstRow, 'updatedAt'), 'updatedAt')
  return rows.map(
    row =>
      `UPDATE "divisionStatistics" SET "isCurrent" = 0, "updatedAt" = ${sqlValue(updatedAt)} WHERE "isCurrent" = 1 AND "id" = ${sqlValue(valueFor(row, 'id'))} AND "versionHash" <> ${sqlValue(valueFor(row, 'versionHash'))};`,
  )
}

function buildUpsertStatements(
  table: string,
  rows: StatisticRow[],
  conflictColumns: string[],
  updateColumns: string[],
) {
  return rows.flatMap(row => {
    const values = recordFor(row)
    const columns = Object.keys(values).sort()
    for (const column of columns) assertIdentifier(column, 'column')
    const statement = buildUpsertStatement(
      table,
      columns,
      values,
      conflictColumns,
      updateColumns,
    )
    if (Buffer.byteLength(statement) <= SQL_STATEMENT_BYTE_LIMIT) return statement

    throw new Error('A statistic SQL statement exceeds the D1 limit.')
  })
}

function buildUpsertStatement(
  table: string,
  columns: string[],
  values: Record<string, unknown>,
  conflictColumns: string[],
  updateColumns: string[],
) {
  return [
    `INSERT INTO ${sqlIdentifier(table)} (${columns.map(sqlIdentifier).join(', ')})`,
    `VALUES (${columns.map(column => sqlValue(values[column])).join(', ')})`,
    `ON CONFLICT (${conflictColumns.map(sqlIdentifier).join(', ')}) DO UPDATE SET`,
    updateColumns
      .map(column => `${sqlIdentifier(column)} = excluded.${sqlIdentifier(column)}`)
      .join(', '),
    `WHERE ${sqlIdentifier(table)}.isCurrent <> 1;`,
  ].join(' ')
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
    if (Buffer.byteLength(statement) > SQL_STATEMENT_BYTE_LIMIT) {
      throw new Error('A statistic SQL statement exceeds the D1 limit.')
    }
    if (
      current &&
      Buffer.byteLength(current) + Buffer.byteLength(statement) + 1 >
        SQL_CHUNK_BYTE_LIMIT
    ) {
      chunks.push(current)
      current = ''
    }
    current += `${statement}\n`
  }
  if (current) chunks.push(current)
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
  const binary = binaryValue(value)
  if (binary) return `X'${Buffer.from(binary).toString('hex')}'`
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  return `'${text.replaceAll("'", "''")}'`
}

function binaryValue(value: unknown) {
  if (value instanceof Uint8Array) return value
  if (value instanceof ArrayBuffer) return new Uint8Array(value)
  return null
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
