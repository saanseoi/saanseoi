import type { UploadTarget } from '../cli/options.ts'
import {
  prepareReleaseSqlDelivery,
  executeReleaseSqlDelivery,
} from '../localPipeline/releaseSqlDelivery.ts'
import type { LocalAddressDbContext } from '../dbCache/localDbCacheTypes.ts'
import {
  executeSqlText,
  REMOTE_IMPORT_BATCH_BYTES,
  type SqlImportExecutionOptions,
  type SqlImportTargetContext,
} from '../localPipeline/sqlImport.ts'
import { runLocalProgressPhase } from '../localPipeline/orchestrator.ts'
import type { OperationProgress } from '../cli/operationProgress.ts'
import type { placeTargets } from './processLocalPlaceSqlUploadMetadata.ts'
import {
  type buildPlaceSql,
  buildPlaceSqlBatches,
} from './processLocalPlaceSqlUploadRows.ts'
import type {
  BuildPlaceSqlInput,
  PlaceSqlProgressEvent,
} from './processLocalPlaceSqlUploadTypes.ts'
import {
  MAX_SQL_BYTES,
  PLACE_SQL_BATCH_SIZE,
} from './processLocalPlaceSqlUploadConfig.ts'

export async function importPlaceSqlChunks(
  targets: Awaited<ReturnType<typeof placeTargets>>,
  sql: Awaited<ReturnType<typeof buildPlaceSql>>,
  options: SqlImportExecutionOptions,
  onProgress?: (completed: number, total: number) => void,
) {
  const batchBytes = options.isLocal
    ? MAX_SQL_BYTES
    : (options.remoteImportBatchBytes ?? REMOTE_IMPORT_BATCH_BYTES)
  const totalChunks = countSqlChunks(sql, batchBytes)
  let completedChunks = 0
  const executeChunk = async (target: SqlImportTargetContext, chunk: string) => {
    await executeSqlText(target, chunk, options)
    completedChunks += 1
    onProgress?.(completedChunks, totalChunks)
  }

  for (const [bindingName, statements] of sql.sourceSqlByBinding) {
    const target = targets.sourceByBinding.get(bindingName)
    if (!target) throw new Error(`Missing Places source target ${bindingName}.`)
    for (const chunk of chunkStatements(statements, batchBytes))
      await executeChunk(target, chunk)
  }
  for (const [bindingName, statements] of sql.historySqlByBinding) {
    const target = targets.historyByBinding.get(bindingName)
    if (!target) throw new Error(`Missing Places history target ${bindingName}.`)
    for (const chunk of chunkStatements(statements, batchBytes))
      await executeChunk(target, chunk)
  }
  for (const chunk of chunkStatements(sql.currentSql, batchBytes))
    await executeChunk(targets.current, chunk)
  for (const chunk of chunkStatements(sql.changes, batchBytes))
    await executeChunk(targets.history, chunk)
}

export async function importPlaceSqlBatches(
  targets: Awaited<ReturnType<typeof placeTargets>>,
  input: BuildPlaceSqlInput,
  path: string,
  totalRows: number,
  timestamp: string,
  options: SqlImportExecutionOptions,
  onProgress?: (event: PlaceSqlProgressEvent) => void,
  delivery?: {
    directory: string
    context: LocalAddressDbContext
    releaseId: string
    inputs: Record<string, unknown>
    accountId?: string
    apiToken?: string
    timings?: { mirrorPreparationMs?: number }
  },
) {
  if (delivery) {
    if (!options.isLocal) {
      await prepareReleaseSqlDelivery({
        ...delivery,
        phase: 'places-data',
        generate: captureSql =>
          importPlaceSqlBatches(
            targets,
            input,
            path,
            totalRows,
            timestamp,
            { ...options, captureSql },
            onProgress,
          ),
      })
    }
    await executeReleaseSqlDelivery({
      ...delivery,
      mode: options.isLocal ? 'local' : 'remote',
      onProgress: (completed, total) =>
        onProgress?.({
          current: completed === total ? totalRows : 0,
          detail: `${options.isLocal ? 'replay' : 'delivery'} ${completed}/${total} SQL batches`,
          phase: 'import',
        }),
    })
    return
  }
  let completedBatches = 0
  for await (const sql of buildPlaceSqlBatches(input, path, timestamp, onProgress)) {
    const batchEnd = Math.min(totalRows, (completedBatches + 1) * PLACE_SQL_BATCH_SIZE)
    await importPlaceSqlChunks(targets, sql, options, (completed, total) =>
      onProgress?.({
        current: batchEnd,
        detail: `import ${completed}/${total} SQL chunks`,
        phase: 'import',
      }),
    )
    completedBatches += 1
    onProgress?.({
      current: Math.min(totalRows, completedBatches * PLACE_SQL_BATCH_SIZE),
      phase: 'import',
    })
  }
}

export async function runPlaceProgressPhase<T>(
  progress: OperationProgress,
  action: string,
  subject: string,
  operation: (
    reportProgress: (current: number, subject?: string) => void,
  ) => Promise<T> | T,
  totalUnits?: number,
) {
  return runLocalProgressPhase(
    progress,
    {
      action,
      completedCount: totalUnits,
      subject,
      totalUnits,
    },
    operation,
  )
}

export function normaliseError(error: unknown) {
  return error instanceof Error ? error : new Error(String(error))
}

export function* chunkStatements(
  statements: readonly string[],
  maxBatchBytes = MAX_SQL_BYTES,
) {
  if (!Number.isSafeInteger(maxBatchBytes) || maxBatchBytes <= 0) {
    throw new Error('Places SQL batch byte limit must be a positive safe integer.')
  }
  let current: string[] = []
  let currentBytes = 0
  for (const statement of statements) {
    const statementBytes = Buffer.byteLength(statement)
    if (statementBytes > MAX_SQL_BYTES || statementBytes > maxBatchBytes) {
      throw new Error(
        'A Places SQL statement exceeds the statement or batch byte limit.',
      )
    }
    if (currentBytes && currentBytes + statementBytes > maxBatchBytes) {
      yield current.join('')
      current = []
      currentBytes = 0
    }
    current.push(statement)
    currentBytes += statementBytes
  }
  if (currentBytes) yield current.join('')
}

function countSqlChunks(
  sql: Awaited<ReturnType<typeof buildPlaceSql>>,
  maxBatchBytes: number,
) {
  const countMapChunks = (groups: Map<string, string[]>) =>
    [...groups.values()].reduce(
      (total, statements) => total + countStatementChunks(statements, maxBatchBytes),
      0,
    )
  return (
    countMapChunks(sql.sourceSqlByBinding) +
    countMapChunks(sql.historySqlByBinding) +
    countStatementChunks(sql.currentSql, maxBatchBytes) +
    countStatementChunks(sql.changes, maxBatchBytes)
  )
}

function countStatementChunks(statements: string[], maxBatchBytes: number) {
  let chunks = 0
  let currentBytes = 0
  for (const statement of statements) {
    const statementBytes = Buffer.byteLength(statement)
    if (currentBytes && currentBytes + statementBytes > maxBatchBytes) {
      chunks += 1
      currentBytes = statementBytes
    } else {
      currentBytes += statementBytes
    }
  }
  return currentBytes ? chunks + 1 : chunks
}

export function insertSql(table: string, values: Record<string, unknown>) {
  const entries = Object.entries(values).filter(([, value]) => value !== undefined)
  return `INSERT INTO "${table}" (${entries.map(([key]) => `"${key}"`).join(', ')}) VALUES (${entries.map(([, value]) => sqlValue(value)).join(', ')}) ON CONFLICT DO UPDATE SET ${entries.map(([key]) => `"${key}" = excluded."${key}"`).join(', ')};`
}

function sqlValue(value: unknown) {
  if (value === null) return 'NULL'
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  if (typeof value === 'boolean') return value ? '1' : '0'
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  return lit(text ?? '')
}

export function lit(value: string) {
  return `'${value.replaceAll("'", "''")}'`
}

export function recordValue(value: unknown, key: string) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)[key]
    : null
}

export function numberOrNull(value: unknown) {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

export function required(value: string | undefined, name: string) {
  if (!value?.trim()) throw new Error(`Missing ${name} for Places SQL processing.`)
  return value
}

export function findTargetBindingName(
  targets: Array<{ bindingName: string; db: unknown }>,
  db: unknown,
) {
  const target = targets.find(candidate => candidate.db === db)
  if (!target) throw new Error('Could not resolve the active Places shard binding.')
  return target.bindingName
}

export function resolveShardYear(cohortKey: string, sourceVersion: string) {
  const year = cohortKey.slice(0, 4)
  if (/^\d{4}$/.test(year)) return year
  const sourceYear = sourceVersion.slice(0, 4)
  if (/^\d{4}$/.test(sourceYear)) return sourceYear
  throw new Error(
    `Could not resolve Places shard year from ${cohortKey}/${sourceVersion}.`,
  )
}

export function targetName(target: UploadTarget) {
  return target.remote && target.environment === 'production'
    ? 'production'
    : target.remote
      ? 'preview'
      : 'local'
}
