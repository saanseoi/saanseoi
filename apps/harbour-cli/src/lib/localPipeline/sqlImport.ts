import { createHash } from 'node:crypto'

import { createD1ImportClient } from '@repo/core/d1ImportApi'

import type { HarbourClient } from '@repo/core/pipeline/harbourClient'
import {
  combineSqlImportArtefacts,
  splitSqlStatements,
} from '@repo/core/pipeline/services/addressPipeline/sqlImportStages'
import { runWithWriteRetry, type WriteRetryEvent } from '@repo/core/pipeline/utils'
import {
  readArtefactBytes,
  type PipelineArtefactBucket,
} from '@repo/core/pipeline/services/pipelineArtefacts'

type LocalD1PreparedStatement = {
  run(): Promise<unknown>
}

type LocalD1ExecBinding = {
  batch?(statements: LocalD1PreparedStatement[]): Promise<unknown>
  prepare?(sql: string): LocalD1PreparedStatement
}

export type SqlImportTargetContext = {
  binding?: LocalD1ExecBinding
  databaseId: string | null
  name: 'current' | 'history' | 'meta' | 'source'
}

export type SqlImportExecutionOptions = {
  accountId?: string
  apiToken?: string
  isLocal: boolean
  localWriteMaxRetries?: number
  onRetry?: (event: SqlImportRetryEvent) => void | Promise<void>
  pollIntervalMs?: number
  remoteImportBatchBytes?: number
  retryDelayMs?: number
}

export type SqlImportRetryEvent = WriteRetryEvent & {
  target: SqlImportTargetContext['name']
}

type ImportStats = {
  bytes: number
  fileCount: number
  statementCount: number
}

type RemoteImportArtefact = {
  bytes: Uint8Array
  etag?: string | null
  key: string
}

const IMPORT_POLL_INTERVAL_MS = 1000
const IMPORT_PROGRESS_INTERVAL_MS = 1000
const LOCAL_D1_BATCH_STATEMENT_COUNT = 25
const REMOTE_IMPORT_BATCH_BYTES = 16 * 1024 * 1024

export async function runReportedSqlImportPhase<T extends Record<string, unknown>>(
  harbourClient: HarbourClient,
  releaseId: string,
  releaseCode: string | undefined,
  phase: string,
  operation: (
    reportProgress: (stats: Record<string, unknown>) => Promise<void>,
  ) => Promise<T>,
) {
  const startedAt = Date.now()
  const reportProgress = async (stats: Record<string, unknown>) => {
    await harbourClient.stageRunning(releaseId, phase, stats, releaseCode)
  }

  await harbourClient.stageRunning(releaseId, phase, undefined, releaseCode)

  try {
    const stats = await operation(reportProgress)

    await harbourClient.stageCompleted(
      releaseId,
      phase,
      {
        ...stats,
        durationMs: Date.now() - startedAt,
      },
      releaseCode,
    )

    return stats
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)

    await harbourClient.stageFailed(
      releaseId,
      phase,
      errorMessage,
      {
        durationMs: Date.now() - startedAt,
      },
      releaseCode,
    )
    throw error
  }
}

export async function importSqlArtefactKeys(
  bucket: PipelineArtefactBucket,
  target: SqlImportTargetContext,
  keys: string[],
  options: SqlImportExecutionOptions,
  reportProgress: (stats: Record<string, unknown>) => Promise<void>,
): Promise<ImportStats> {
  const importedFiles: string[] = []
  let bytes = 0
  let statementCount = 0
  let lastProgressAt = 0

  const maybeReportProgress = async (force = false) => {
    const now = Date.now()

    if (
      !force &&
      importedFiles.length < keys.length &&
      now - lastProgressAt < IMPORT_PROGRESS_INTERVAL_MS
    ) {
      return
    }

    lastProgressAt = now
    await reportProgress({
      bytes,
      processedFiles: importedFiles.length,
      statementCount,
      totalFiles: keys.length,
    })
  }

  await maybeReportProgress(true)

  if (!options.isLocal) {
    const pendingArtefacts: RemoteImportArtefact[] = []
    let pendingBytes = 0
    const batchBytesLimit = options.remoteImportBatchBytes ?? REMOTE_IMPORT_BATCH_BYTES

    for (const key of keys) {
      const artefact = await readArtefactBytes(bucket, key)
      const artefactBytes = artefact.bytes.byteLength

      bytes += artefactBytes

      if (
        pendingArtefacts.length > 0 &&
        pendingBytes + artefactBytes > batchBytesLimit
      ) {
        await importRemoteArtefactBatch(target, pendingArtefacts, options)
        importedFiles.push(...pendingArtefacts.map(item => item.key))
        pendingArtefacts.length = 0
        pendingBytes = 0
        await maybeReportProgress()
      }

      pendingArtefacts.push({
        bytes: artefact.bytes,
        etag: artefact.etag,
        key,
      })
      pendingBytes += artefactBytes
    }

    if (pendingArtefacts.length > 0) {
      await importRemoteArtefactBatch(target, pendingArtefacts, options)
      importedFiles.push(...pendingArtefacts.map(item => item.key))
    }

    await maybeReportProgress(true)

    return {
      bytes,
      fileCount: keys.length,
      statementCount,
    }
  }

  for (const key of keys) {
    const artefact = await readArtefactBytes(bucket, key)

    bytes += artefact.bytes.byteLength
    statementCount += await executeSqlBytes(target, artefact.bytes, options)
    importedFiles.push(key)
    await maybeReportProgress()
  }

  await maybeReportProgress(true)

  return {
    bytes,
    fileCount: keys.length,
    statementCount,
  }
}

export async function executeSqlText(
  target: SqlImportTargetContext,
  sql: string,
  options: SqlImportExecutionOptions,
) {
  return executeSqlBytes(target, new TextEncoder().encode(sql), options)
}

async function importRemoteArtefactBatch(
  target: SqlImportTargetContext,
  artefacts: RemoteImportArtefact[],
  options: SqlImportExecutionOptions,
) {
  const combined = combineSqlImportArtefacts(artefacts)

  await importSqlWithD1RestApi(target, combined, options)
}

async function executeSqlBytes(
  target: SqlImportTargetContext,
  sqlBytes: Uint8Array,
  options: SqlImportExecutionOptions,
) {
  if (options.isLocal) {
    return execSqlWithBoundD1(target, sqlBytes, options)
  }

  await importSqlWithD1RestApi(
    target,
    {
      bytes: sqlBytes,
      etag: createHash('md5').update(sqlBytes).digest('hex'),
    },
    options,
  )

  return 0
}

async function execSqlWithBoundD1(
  target: SqlImportTargetContext,
  sqlBytes: Uint8Array,
  options: SqlImportExecutionOptions,
) {
  if (!target.binding?.prepare) {
    throw new Error(`Missing D1 prepare binding for ${target.name} SQL execution.`)
  }

  const sql = new TextDecoder().decode(sqlBytes)
  const statements = splitSqlStatements(sql)

  if (target.binding.batch) {
    for (
      let index = 0;
      index < statements.length;
      index += LOCAL_D1_BATCH_STATEMENT_COUNT
    ) {
      await runWithWriteRetry(
        () =>
          target.binding?.batch?.(
            statements
              .slice(index, index + LOCAL_D1_BATCH_STATEMENT_COUNT)
              .map(statement => target.binding?.prepare?.(statement))
              .filter(isLocalD1PreparedStatement),
          ),
        {
          maxRetries: options.localWriteMaxRetries,
          onRetry: event => options.onRetry?.({ ...event, target: target.name }),
          retryDelayMs: options.retryDelayMs,
        },
      )
    }

    return statements.length
  }

  for (const statement of statements) {
    await runWithWriteRetry(() => target.binding?.prepare?.(statement).run(), {
      maxRetries: options.localWriteMaxRetries,
      onRetry: event => options.onRetry?.({ ...event, target: target.name }),
      retryDelayMs: options.retryDelayMs,
    })
  }

  return statements.length
}

async function importSqlWithD1RestApi(
  target: SqlImportTargetContext,
  artefact: {
    bytes: Uint8Array
    etag?: string | null
  },
  options: SqlImportExecutionOptions,
) {
  const accountId = options.accountId?.trim()
  const apiToken = options.apiToken?.trim()
  const databaseId = target.databaseId?.trim()
  const etag = normaliseEtag(artefact.etag)

  if (!accountId || !apiToken || !databaseId || !etag) {
    throw new Error(
      `Missing D1 REST import configuration for ${target.name}. Required: accountId, apiToken, databaseId, artefact etag.`,
    )
  }

  const client = createD1ImportClient({
    accountId,
    apiToken,
    databaseId,
  })

  await client.importSql({
    etag,
    pollIntervalMs: options.pollIntervalMs ?? IMPORT_POLL_INTERVAL_MS,
    sql: artefact.bytes,
  })
}

function isLocalD1PreparedStatement(
  statement: LocalD1PreparedStatement | undefined,
): statement is LocalD1PreparedStatement {
  return Boolean(statement)
}

function normaliseEtag(etag: string | null | undefined) {
  const normalised = etag?.trim().replaceAll('"', '')

  return normalised || null
}
