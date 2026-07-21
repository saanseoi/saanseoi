import type { DatasetProcessingMessage } from '../../../types'
import type { PublishDatasetResult } from '../../harbourClient'
import { createD1ImportClient } from '../../../lib/d1ImportApi'
import { resolveShardForTypeRegionYear } from '../../../lib/db/metaRegistry'
import type { HarbourReadableDb } from '../../../lib/db/types'
import { runWithWriteRetry, type WriteRetryEvent } from '../../utils'
import type { MetaDatabase } from '@repo/db'
import { createHash } from 'node:crypto'

import type { PipelineArtefactBucket } from '../pipelineArtefacts'
import { readArtefactBytes } from '../pipelineArtefacts'
import { resolveDataShardEnvironment } from '../shared'
import { buildAddressSqlCleanupFile, type AddressSqlImportTarget } from './sqlImport'

type SqlStageHarbourClient = {
  publishDataset(
    releaseId: string,
    releaseCode?: string,
    options?: {
      skipSnapshotCleanup?: boolean
    },
  ): Promise<PublishDatasetResult | void>
  stageCompleted(
    releaseId: string,
    phase: string,
    stats?: Record<string, unknown>,
    releaseCode?: string,
  ): Promise<void>
  stageFailed(
    releaseId: string,
    phase: string,
    error: string,
    stats?: Record<string, unknown>,
    releaseCode?: string,
  ): Promise<void>
  stageRunning(
    releaseId: string,
    phase: string,
    stats?: Record<string, unknown>,
    releaseCode?: string,
  ): Promise<void>
}

type LocalD1ExecBinding = {
  exec?(sql: string): Promise<unknown>
  batch?(statements: LocalD1PreparedStatement[]): Promise<unknown>
  prepare?(sql: string): {
    run(): Promise<unknown>
  }
}

type LocalD1PreparedStatement = {
  run(): Promise<unknown>
}

export type AddressSqlImportStageOptions = {
  accountId?: string
  apiToken?: string
  currentBinding?: LocalD1ExecBinding
  dataShardEnvironment?: string
  historyBinding?: LocalD1ExecBinding
  isLocal: boolean
  localWriteMaxRetries?: number
  metaBinding?: LocalD1ExecBinding
  metaDatabaseId?: string | null
  onRetry?: (event: AddressSqlImportRetryEvent) => void | Promise<void>
  pollIntervalMs?: number
  remoteImportBatchBytes?: number
  sourceBinding?: LocalD1ExecBinding
}

export type AddressSqlImportRetryEvent = WriteRetryEvent & {
  target: AddressSqlImportTarget
}

type ImportTargetContext = {
  binding?: LocalD1ExecBinding
  databaseId: string | null
  name: AddressSqlImportTarget
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
const LOCAL_D1_BATCH_STATEMENT_COUNT = 25
const IMPORT_PROGRESS_INTERVAL_MS = 1000
const REMOTE_HISTORY_IMPORT_BATCH_BYTES = 16 * 1024 * 1024
const LEGACY_NORMALIZED_ROWS_TABLE = 'zzAddressImportRows'
const LEGACY_NORMALIZED_ROWS_COLUMNS = [
  ['sourceArea', 'TEXT'],
  ['sourceDistrict', 'TEXT'],
  ['sourceUnit', 'TEXT'],
] as const

export function isAddressSqlImportOrCleanupStage(message: DatasetProcessingMessage) {
  return (
    message.type === 'address' &&
    message.processingMode === 'sql' &&
    (message.addressStage === 'sql-import-source' ||
      message.addressStage === 'sql-import-history' ||
      message.addressStage === 'sql-import-current' ||
      message.addressStage === 'sql-import-meta' ||
      message.addressStage === 'sql-cleanup-staging')
  )
}

export async function processAddressSqlImportOrCleanupStage(
  harbourClient: SqlStageHarbourClient,
  metaDb: MetaDatabase,
  bucket: PipelineArtefactBucket,
  message: DatasetProcessingMessage,
  options: AddressSqlImportStageOptions,
): Promise<DatasetProcessingMessage | null> {
  await harbourClient.stageRunning(
    message.releaseId ?? message.datasetId,
    'processDataset',
    undefined,
    message.releaseCode,
  )

  if (isAddressSqlImportStage(message.addressStage)) {
    await completeAddressSqlGenerationPhases(harbourClient, message)
  }

  switch (message.addressStage) {
    case 'sql-import-source':
      await runReportedPhase(
        harbourClient,
        message,
        'importAddressSqlSource',
        progress =>
          importArtefactKeys(
            metaDb,
            bucket,
            message,
            'source',
            filterSqlArtefactKeys(message, 'source'),
            options,
            progress,
          ),
      )
      return {
        ...message,
        addressStage: 'sql-import-history',
      }
    case 'sql-import-history':
      await runReportedPhase(
        harbourClient,
        message,
        'importAddressSqlHistory',
        async progress => {
          const historyStats = await importArtefactKeys(
            metaDb,
            bucket,
            message,
            'history',
            filterSqlArtefactKeys(message, 'history'),
            options,
            progress,
          )
          const historyApplyStats = await importArtefactKeys(
            metaDb,
            bucket,
            message,
            'history-apply',
            filterSqlArtefactKeys(message, 'history-apply'),
            options,
            async () => undefined,
          )

          return {
            bytes: historyStats.bytes + historyApplyStats.bytes,
            fileCount: historyStats.fileCount + historyApplyStats.fileCount,
            statementCount:
              historyStats.statementCount + historyApplyStats.statementCount,
          }
        },
      )
      return {
        ...message,
        addressStage: 'sql-import-current',
      }
    case 'sql-import-current': {
      const currentKeys = filterSqlArtefactKeys(message, 'current')
      const initKeys = currentKeys.filter(isCurrentInitSqlKey)
      const deltaKeys = currentKeys.filter(key => !isCurrentInitSqlKey(key))

      await runReportedPhase(
        harbourClient,
        message,
        'importAddressSqlCurrentInit',
        progress =>
          importArtefactKeys(
            metaDb,
            bucket,
            message,
            'current',
            initKeys,
            options,
            progress,
          ),
      )
      await runReportedPhase(
        harbourClient,
        message,
        'importAddressSqlCurrent',
        progress =>
          importArtefactKeys(
            metaDb,
            bucket,
            message,
            'current',
            deltaKeys,
            options,
            progress,
          ),
      )

      return {
        ...message,
        addressStage: 'sql-import-meta',
        addressSqlPublishAfterCleanup: true,
      }
    }
    case 'sql-import-meta':
      await runReportedPhase(
        harbourClient,
        message,
        'importAddressSqlStats',
        progress =>
          importArtefactKeys(
            metaDb,
            bucket,
            message,
            'meta',
            filterSqlArtefactKeys(message, 'meta'),
            options,
            progress,
          ),
      )

      return {
        ...message,
        addressStage: 'sql-cleanup-staging',
      }
    case 'sql-cleanup-staging':
      await runReportedPhase(harbourClient, message, 'cleanupAddressSqlStaging', () =>
        cleanupSqlStaging(metaDb, message, options),
      )

      if (message.addressSqlPublishAfterCleanup) {
        await publishImportedAddressSqlRelease(harbourClient, message)
      }

      return null
  }

  throw new Error(`Unsupported address SQL stage: ${String(message.addressStage)}`)
}

export async function importAddressSqlArtefactsAndPublish(
  harbourClient: SqlStageHarbourClient,
  metaDb: MetaDatabase,
  bucket: PipelineArtefactBucket,
  message: DatasetProcessingMessage,
  options: AddressSqlImportStageOptions,
): Promise<PublishDatasetResult | void> {
  const releaseId = message.releaseId ?? message.datasetId
  const releaseCode = message.releaseCode
  const sourceKeys = filterSqlArtefactKeys(message, 'source')
  const historyKeys = filterSqlArtefactKeys(message, 'history')
  const historyApplyKeys = filterSqlArtefactKeys(message, 'history-apply')
  const currentKeys = filterSqlArtefactKeys(message, 'current')
  const metaKeys = filterSqlArtefactKeys(message, 'meta')
  const initKeys = currentKeys.filter(isCurrentInitSqlKey)
  const deltaKeys = currentKeys.filter(key => !isCurrentInitSqlKey(key))

  await harbourClient.stageRunning(releaseId, 'processDataset', undefined, releaseCode)
  await completeAddressSqlGenerationPhases(harbourClient, message)

  await Promise.all([
    runReportedPhase(harbourClient, message, 'importAddressSqlSource', progress =>
      importArtefactKeys(
        metaDb,
        bucket,
        message,
        'source',
        sourceKeys,
        options,
        progress,
      ),
    ),
    runReportedPhase(
      harbourClient,
      message,
      'importAddressSqlHistory',
      async progress => {
        const historyStats = await importArtefactKeys(
          metaDb,
          bucket,
          message,
          'history',
          historyKeys,
          options,
          progress,
        )
        const historyApplyStats = await importArtefactKeys(
          metaDb,
          bucket,
          message,
          'history-apply',
          historyApplyKeys,
          options,
          async () => undefined,
        )

        return {
          bytes: historyStats.bytes + historyApplyStats.bytes,
          fileCount: historyStats.fileCount + historyApplyStats.fileCount,
          statementCount:
            historyStats.statementCount + historyApplyStats.statementCount,
        }
      },
    ),
    (async () => {
      await runReportedPhase(
        harbourClient,
        message,
        'importAddressSqlCurrentInit',
        progress =>
          importArtefactKeys(
            metaDb,
            bucket,
            message,
            'current',
            initKeys,
            options,
            progress,
          ),
      )
      await runReportedPhase(
        harbourClient,
        message,
        'importAddressSqlCurrent',
        progress =>
          importArtefactKeys(
            metaDb,
            bucket,
            message,
            'current',
            deltaKeys,
            options,
            progress,
          ),
      )
    })(),
    runReportedPhase(harbourClient, message, 'importAddressSqlStats', progress =>
      importArtefactKeys(metaDb, bucket, message, 'meta', metaKeys, options, progress),
    ),
  ])

  await runReportedPhase(harbourClient, message, 'cleanupAddressSqlStaging', () =>
    cleanupSqlStaging(metaDb, message, options),
  )
  return publishImportedAddressSqlRelease(harbourClient, message)
}

export async function importAddressSqlDataArtefacts(
  harbourClient: SqlStageHarbourClient,
  metaDb: MetaDatabase,
  bucket: PipelineArtefactBucket,
  message: DatasetProcessingMessage,
  options: AddressSqlImportStageOptions,
) {
  const releaseId = message.releaseId ?? message.datasetId
  const releaseCode = message.releaseCode
  const sourceKeys = filterSqlArtefactKeys(message, 'source')
  const historyKeys = filterSqlArtefactKeys(message, 'history')
  const historyApplyKeys = filterSqlArtefactKeys(message, 'history-apply')
  const currentKeys = filterSqlArtefactKeys(message, 'current')
  const initKeys = currentKeys.filter(isCurrentInitSqlKey)
  const deltaKeys = currentKeys.filter(key => !isCurrentInitSqlKey(key))

  await harbourClient.stageRunning(releaseId, 'processDataset', undefined, releaseCode)

  await Promise.all([
    runReportedPhase(harbourClient, message, 'cacheAddressSqlSource', progress =>
      importArtefactKeys(
        metaDb,
        bucket,
        message,
        'source',
        sourceKeys,
        options,
        progress,
      ),
    ),
    runReportedPhase(
      harbourClient,
      message,
      'cacheAddressSqlHistory',
      async progress => {
        const historyStats = await importArtefactKeys(
          metaDb,
          bucket,
          message,
          'history',
          historyKeys,
          options,
          progress,
        )
        const historyApplyStats = await importArtefactKeys(
          metaDb,
          bucket,
          message,
          'history-apply',
          historyApplyKeys,
          options,
          async () => undefined,
        )

        return {
          bytes: historyStats.bytes + historyApplyStats.bytes,
          fileCount: historyStats.fileCount + historyApplyStats.fileCount,
          statementCount:
            historyStats.statementCount + historyApplyStats.statementCount,
        }
      },
    ),
    (async () => {
      await runReportedPhase(
        harbourClient,
        message,
        'cacheAddressSqlCurrentInit',
        progress =>
          importArtefactKeys(
            metaDb,
            bucket,
            message,
            'current',
            initKeys,
            options,
            progress,
          ),
      )
      await runReportedPhase(
        harbourClient,
        message,
        'cacheAddressSqlCurrent',
        progress =>
          importArtefactKeys(
            metaDb,
            bucket,
            message,
            'current',
            deltaKeys,
            options,
            progress,
          ),
      )
    })(),
  ])

  await runReportedPhase(harbourClient, message, 'cacheAddressSqlCleanup', () =>
    cleanupSqlStaging(metaDb, message, options),
  )
}

async function completeAddressSqlGenerationPhases(
  harbourClient: SqlStageHarbourClient,
  message: DatasetProcessingMessage,
) {
  const processedRows =
    message.addressStats?.processedRows ?? message.totalRows ?? message.rowEnd

  if (processedRows == null) {
    return
  }

  const stats: Record<string, unknown> = {
    processedRows,
  }
  const sqlArtefactCount = message.addressSqlArtefactKeys?.length

  if (sqlArtefactCount != null) {
    stats.sqlArtefactCount = sqlArtefactCount
  }

  for (const phase of [
    'normaliseAddressSql',
    'generateAddressSqlSource',
    'generateAddressSqlHistory',
    'generateAddressSqlCurrent',
  ]) {
    await harbourClient.stageCompleted(
      message.releaseId ?? message.datasetId,
      phase,
      stats,
      message.releaseCode,
    )
  }
}

function isAddressSqlImportStage(
  addressStage: DatasetProcessingMessage['addressStage'],
) {
  return (
    addressStage === 'sql-import-source' ||
    addressStage === 'sql-import-history' ||
    addressStage === 'sql-import-current'
  )
}

async function runReportedPhase<T extends Record<string, unknown>>(
  harbourClient: SqlStageHarbourClient,
  message: DatasetProcessingMessage,
  phase: string,
  operation: (
    reportProgress: (stats: Record<string, unknown>) => Promise<void>,
  ) => Promise<T>,
) {
  const releaseId = message.releaseId ?? message.datasetId
  const releaseCode = message.releaseCode
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

async function importArtefactKeys(
  metaDb: MetaDatabase,
  bucket: PipelineArtefactBucket,
  message: DatasetProcessingMessage,
  target: AddressSqlImportTarget,
  keys: string[],
  options: AddressSqlImportStageOptions,
  reportProgress: (stats: Record<string, unknown>) => Promise<void>,
): Promise<ImportStats> {
  const targetContext = await resolveImportTarget(metaDb, message, target, options)
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

  if (!options.isLocal && shouldBatchRemoteImport(target, options)) {
    const pendingArtefacts: RemoteImportArtefact[] = []
    let pendingBytes = 0
    const batchBytesLimit =
      options.remoteImportBatchBytes ?? REMOTE_HISTORY_IMPORT_BATCH_BYTES

    for (const key of keys) {
      const artefact = await readArtefactBytes(bucket, key)
      const artefactBytes = artefact.bytes.byteLength
      bytes += artefactBytes

      if (
        pendingArtefacts.length > 0 &&
        pendingBytes + artefactBytes > batchBytesLimit
      ) {
        await importRemoteArtefactBatch(targetContext, pendingArtefacts, options)
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
      await importRemoteArtefactBatch(targetContext, pendingArtefacts, options)
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

    if (options.isLocal) {
      statementCount += await execSqlWithBoundD1(targetContext, artefact.bytes, options)
    } else {
      await importSqlWithD1RestApi(targetContext, artefact, options)
    }

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

async function importRemoteArtefactBatch(
  target: ImportTargetContext,
  artefacts: RemoteImportArtefact[],
  options: AddressSqlImportStageOptions,
) {
  const combined = combineSqlImportArtefacts(artefacts)

  await importSqlWithD1RestApi(target, combined, options)
}

async function cleanupSqlStaging(
  metaDb: MetaDatabase,
  message: DatasetProcessingMessage,
  options: AddressSqlImportStageOptions,
) {
  const targets: AddressSqlImportTarget[] = ['source', 'history', 'current']
  const cleanedTargets: string[] = []
  let bytes = 0

  for (const target of targets) {
    const targetContext = await resolveImportTarget(metaDb, message, target, options)
    const cleanupFile = buildAddressSqlCleanupFile(message, target)
    const sqlBytes = new TextEncoder().encode(cleanupFile.sql)

    bytes += sqlBytes.byteLength

    if (options.isLocal) {
      await execSqlWithBoundD1(targetContext, sqlBytes, options)
    } else {
      await importSqlWithD1RestApi(
        targetContext,
        {
          bytes: sqlBytes,
          etag: createHash('md5').update(sqlBytes).digest('hex'),
        },
        options,
      )
    }

    cleanedTargets.push(target)
  }

  return {
    bytes,
    cleanedTargets,
    targetCount: cleanedTargets.length,
  }
}

async function publishImportedAddressSqlRelease(
  harbourClient: SqlStageHarbourClient,
  message: DatasetProcessingMessage,
): Promise<PublishDatasetResult | void> {
  const releaseId = message.releaseId ?? message.datasetId
  const releaseCode = message.releaseCode
  const extractDurationStats = {
    deletedRows: 0,
    insertedVersions: message.addressStats?.insertedVersions ?? 0,
    processedRows:
      message.addressStats?.processedRows ??
      Math.max(0, Math.floor(message.totalRows ?? 0)),
    sqlArtefactCount: message.addressSqlArtefactKeys?.length ?? 0,
    unchangedRows: message.addressStats?.unchangedRows ?? 0,
  }
  const i18nStats = {
    localisedRows: message.addressStats?.localisedRows ?? 0,
    sqlArtefactCount: message.addressSqlArtefactKeys?.length ?? 0,
  }

  await harbourClient.stageCompleted(
    releaseId,
    'extractAddresses',
    extractDurationStats,
    releaseCode,
  )
  await harbourClient.stageCompleted(
    releaseId,
    'extractAddressesI18n',
    i18nStats,
    releaseCode,
  )

  const publishStartedAt = Date.now()
  await harbourClient.stageRunning(releaseId, 'publishDataset', undefined, releaseCode)
  const publishResult = await harbourClient.publishDataset(releaseId, releaseCode, {
    skipSnapshotCleanup: message.skipSnapshotCleanup,
  })
  await harbourClient.stageCompleted(
    releaseId,
    'publishDataset',
    {
      durationMs: Date.now() - publishStartedAt,
    },
    releaseCode,
  )
  await harbourClient.stageCompleted(
    releaseId,
    'processDataset',
    {
      sqlArtefactCount: message.addressSqlArtefactKeys?.length ?? 0,
    },
    releaseCode,
  )

  return publishResult
}

async function resolveImportTarget(
  metaDb: MetaDatabase,
  message: DatasetProcessingMessage,
  target: AddressSqlImportTarget,
  options: AddressSqlImportStageOptions,
): Promise<ImportTargetContext> {
  const environment = resolveDataShardEnvironment(options.dataShardEnvironment)
  const metaRepoDb = metaDb as unknown as HarbourReadableDb
  const shardTarget = target === 'history-apply' ? 'history' : target

  if (shardTarget === 'meta') {
    return {
      binding: options.metaBinding,
      databaseId: options.metaDatabaseId ?? null,
      name: target,
    }
  }

  const shard =
    shardTarget === 'current'
      ? await resolveShardForTypeRegionYear(metaRepoDb, 'current', environment)
      : await resolveShardForTypeRegionYear(
          metaRepoDb,
          shardTarget,
          environment,
          message.regionCode,
          resolveMessageShardYear(message),
        )

  return {
    binding:
      target === 'source'
        ? options.sourceBinding
        : target === 'history' || target === 'history-apply'
          ? options.historyBinding
          : target === 'meta'
            ? options.metaBinding
            : options.currentBinding,
    databaseId: shard?.databaseId ?? null,
    name: target,
  }
}

async function execSqlWithBoundD1(
  target: ImportTargetContext,
  sqlBytes: Uint8Array,
  options: AddressSqlImportStageOptions,
) {
  if (!target.binding?.prepare) {
    throw new Error(`Missing D1 prepare binding for ${target.name} SQL execution.`)
  }

  const sql = new TextDecoder().decode(sqlBytes)
  await ensureLegacyNormalisedRowsSchema(target, sql, options)

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
        },
      )
    }

    return statements.length
  }

  for (const statement of statements) {
    await runWithWriteRetry(() => target.binding?.prepare?.(statement).run(), {
      maxRetries: options.localWriteMaxRetries,
      onRetry: event => options.onRetry?.({ ...event, target: target.name }),
    })
  }

  return statements.length
}

async function ensureLegacyNormalisedRowsSchema(
  target: ImportTargetContext,
  sql: string,
  options: AddressSqlImportStageOptions,
) {
  const binding = target.binding

  const prepare = binding?.prepare

  if (
    !prepare ||
    target.name !== 'source' ||
    !/\bzzAddressImportRows\b/.test(sql) ||
    !/\bsourceArea\b/.test(sql)
  ) {
    return
  }

  for (const [columnName, columnType] of LEGACY_NORMALIZED_ROWS_COLUMNS) {
    try {
      await runWithWriteRetry(
        () =>
          prepare
            .call(
              binding,
              `ALTER TABLE ${LEGACY_NORMALIZED_ROWS_TABLE} ADD COLUMN ${columnName} ${columnType};`,
            )
            .run(),
        {
          maxRetries: options.localWriteMaxRetries,
          onRetry: event => options.onRetry?.({ ...event, target: target.name }),
        },
      )
    } catch (error) {
      if (!isIgnorableLegacyNormalisedRowsAlterError(error)) {
        throw error
      }
    }
  }
}

function isIgnorableLegacyNormalisedRowsAlterError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)

  return /duplicate column name|no such table/i.test(message)
}

function isLocalD1PreparedStatement(
  statement: LocalD1PreparedStatement | undefined,
): statement is LocalD1PreparedStatement {
  return Boolean(statement)
}

export function splitSqlStatements(sql: string) {
  const statements: string[] = []
  let inSingleQuotedString = false
  let statementStart = 0

  for (let index = 0; index < sql.length; index += 1) {
    const char = sql[index]

    if (char === "'") {
      if (inSingleQuotedString && sql[index + 1] === "'") {
        index += 1
        continue
      }

      inSingleQuotedString = !inSingleQuotedString
      continue
    }

    if (char !== ';' || inSingleQuotedString) {
      continue
    }

    const statement = sql.slice(statementStart, index + 1).trim()

    if (statement) {
      statements.push(statement)
    }

    statementStart = index + 1
  }

  const trailingStatement = sql.slice(statementStart).trim()

  if (trailingStatement) {
    statements.push(trailingStatement)
  }

  return statements
}

export function combineSqlImportArtefacts(artefacts: RemoteImportArtefact[]) {
  if (artefacts.length === 0) {
    throw new Error('Cannot combine an empty SQL artefact batch.')
  }

  if (artefacts.length === 1) {
    const artefact = artefacts[0]

    if (!artefact) {
      throw new Error('Expected a SQL artefact in a single-item batch.')
    }

    return {
      bytes: artefact.bytes,
      etag: artefact.etag ?? createHash('md5').update(artefact.bytes).digest('hex'),
    }
  }

  const decoder = new TextDecoder()
  const encoder = new TextEncoder()
  const sql = artefacts
    .map(artefact => decoder.decode(artefact.bytes).trimEnd())
    .join('\n\n')
  const bytes = encoder.encode(`${sql}\n`)

  return {
    bytes,
    etag: createHash('md5').update(bytes).digest('hex'),
  }
}

async function importSqlWithD1RestApi(
  target: ImportTargetContext,
  artefact: {
    bytes: Uint8Array
    etag?: string | null
  },
  options: AddressSqlImportStageOptions,
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

function filterSqlArtefactKeys(
  message: DatasetProcessingMessage,
  target: AddressSqlImportTarget,
) {
  const marker = `/sql/${target}/`

  return sortSqlArtefactKeys(
    (message.addressSqlArtefactKeys ?? []).filter(key => key.includes(marker)),
    target,
  )
}

function isCurrentInitSqlKey(key: string) {
  return /-current-init\.sql$/.test(key)
}

function resolveMessageShardYear(message: DatasetProcessingMessage) {
  const shardYear = message.shardYear?.trim()

  if (shardYear) {
    return shardYear
  }

  const cohortYear = message.cohortKey.slice(0, 4)

  if (/^\d{4}$/.test(cohortYear)) {
    return cohortYear
  }

  return message.sourceVersion.slice(0, 4)
}

function normaliseEtag(etag: string | null | undefined) {
  const normalised = etag?.trim().replaceAll('"', '')

  return normalised || null
}

function shouldBatchRemoteImport(
  target: AddressSqlImportTarget,
  options: AddressSqlImportStageOptions,
) {
  void target
  const batchBytes = options.remoteImportBatchBytes ?? REMOTE_HISTORY_IMPORT_BATCH_BYTES

  return batchBytes > 0
}

function sortSqlArtefactKeys(keys: string[], target: AddressSqlImportTarget) {
  if (target === 'history-apply') {
    return [...keys].sort((left, right) => left.localeCompare(right))
  }

  return [...keys].sort((left, right) => {
    const leftRowStart = parseSqlArtefactRowStart(left)
    const rightRowStart = parseSqlArtefactRowStart(right)

    if (
      leftRowStart != null &&
      rightRowStart != null &&
      leftRowStart !== rightRowStart
    ) {
      return leftRowStart - rightRowStart
    }

    if (leftRowStart != null) {
      return -1
    }

    if (rightRowStart != null) {
      return 1
    }

    return left.localeCompare(right)
  })
}

function parseSqlArtefactRowStart(key: string) {
  const match = key.match(/-(\d+)\.sql$/)
  const rowStart = match?.[1]

  if (!rowStart) {
    return null
  }

  return Number.parseInt(rowStart, 10)
}
