import type { DatasetProcessingMessage } from '@repo/core'
import { createD1ImportClient } from '@repo/core/d1ImportApi'
import { resolveShardForTypeRegionYear } from '@repo/core/db/metaRepository'
import type { HarbourReadableDb } from '@repo/core/db/types'
import type { MetaDatabase } from '@repo/db'

import type { PipelineArtifactBucket } from '../pipelineArtifacts'
import { readArtifactBytes } from '../pipelineArtifacts'
import { resolveDataShardEnvironment } from '../shared'
import { buildAddressSqlCleanupFile, type AddressSqlImportTarget } from './sqlImport'

type SqlStageHarbourClient = {
  publishDataset(
    releaseId: string,
    releaseCode?: string,
    options?: {
      skipSnapshotCleanup?: boolean
    },
  ): Promise<void>
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
  prepare?(sql: string): {
    run(): Promise<unknown>
  }
}

export type AddressSqlImportStageOptions = {
  accountId?: string
  apiToken?: string
  currentBinding?: LocalD1ExecBinding
  dataShardEnvironment?: string
  historyBinding?: LocalD1ExecBinding
  isLocal: boolean
  pollIntervalMs?: number
  sourceBinding?: LocalD1ExecBinding
}

type ImportTargetContext = {
  binding?: LocalD1ExecBinding
  databaseId: string | null
  name: AddressSqlImportTarget
}

type ImportStats = {
  bytes: number
  fileCount: number
  importedFiles: string[]
  target: AddressSqlImportTarget
}

const IMPORT_POLL_INTERVAL_MS = 1000

export function isAddressSqlImportOrCleanupStage(message: DatasetProcessingMessage) {
  return (
    message.type === 'address' &&
    message.processingMode === 'sql' &&
    (message.addressStage === 'sql-import-source' ||
      message.addressStage === 'sql-import-history' ||
      message.addressStage === 'sql-import-current' ||
      message.addressStage === 'sql-cleanup-staging')
  )
}

export async function processAddressSqlImportOrCleanupStage(
  harbourClient: SqlStageHarbourClient,
  metaDb: MetaDatabase,
  bucket: PipelineArtifactBucket,
  message: DatasetProcessingMessage,
  options: AddressSqlImportStageOptions,
): Promise<DatasetProcessingMessage | null> {
  await harbourClient.stageRunning(
    message.releaseId ?? message.datasetId,
    'processDataset',
    undefined,
    message.releaseCode,
  )

  switch (message.addressStage) {
    case 'sql-import-source':
      await runReportedPhase(harbourClient, message, 'importAddressSqlSource', () =>
        importArtifactKeys(
          metaDb,
          bucket,
          message,
          'source',
          filterSqlArtifactKeys(message, 'source'),
          options,
        ),
      )
      return {
        ...message,
        addressStage: 'sql-import-history',
      }
    case 'sql-import-history':
      await runReportedPhase(harbourClient, message, 'importAddressSqlHistory', () =>
        importArtifactKeys(
          metaDb,
          bucket,
          message,
          'history',
          filterSqlArtifactKeys(message, 'history'),
          options,
        ),
      )
      return {
        ...message,
        addressStage: 'sql-import-current',
      }
    case 'sql-import-current': {
      const currentKeys = filterSqlArtifactKeys(message, 'current')
      const initKeys = currentKeys.filter(isCurrentInitSqlKey)
      const deltaKeys = currentKeys.filter(key => !isCurrentInitSqlKey(key))

      await runReportedPhase(
        harbourClient,
        message,
        'importAddressSqlCurrentInit',
        () => importArtifactKeys(metaDb, bucket, message, 'current', initKeys, options),
      )
      await runReportedPhase(harbourClient, message, 'importAddressSqlCurrent', () =>
        importArtifactKeys(metaDb, bucket, message, 'current', deltaKeys, options),
      )

      return {
        ...message,
        addressStage: 'sql-cleanup-staging',
        addressSqlPublishAfterCleanup: true,
      }
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

async function runReportedPhase<T extends Record<string, unknown>>(
  harbourClient: SqlStageHarbourClient,
  message: DatasetProcessingMessage,
  phase: string,
  operation: () => Promise<T>,
) {
  const releaseId = message.releaseId ?? message.datasetId
  const releaseCode = message.releaseCode
  const startedAt = Date.now()

  await harbourClient.stageRunning(releaseId, phase, undefined, releaseCode)

  try {
    const stats = await operation()

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

async function importArtifactKeys(
  metaDb: MetaDatabase,
  bucket: PipelineArtifactBucket,
  message: DatasetProcessingMessage,
  target: AddressSqlImportTarget,
  keys: string[],
  options: AddressSqlImportStageOptions,
): Promise<ImportStats> {
  const targetContext = await resolveImportTarget(metaDb, message, target, options)
  const importedFiles: string[] = []
  let bytes = 0

  for (const key of keys) {
    const artifact = await readArtifactBytes(bucket, key)
    bytes += artifact.bytes.byteLength

    if (options.isLocal) {
      await execSqlWithBoundD1(targetContext, artifact.bytes)
    } else {
      await importSqlWithD1RestApi(targetContext, artifact, options)
    }

    importedFiles.push(key)
  }

  return {
    bytes,
    fileCount: keys.length,
    importedFiles,
    target,
  }
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

    await execSqlWithBoundD1(targetContext, sqlBytes)

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
) {
  const releaseId = message.releaseId ?? message.datasetId
  const releaseCode = message.releaseCode
  const extractDurationStats = {
    deletedRows: 0,
    insertedVersions: message.addressStats?.insertedVersions ?? 0,
    processedRows:
      message.addressStats?.processedRows ??
      Math.max(0, Math.floor(message.totalRows ?? 0)),
    sqlArtifactCount: message.addressSqlArtifactKeys?.length ?? 0,
    unchangedRows: message.addressStats?.unchangedRows ?? 0,
  }
  const i18nStats = {
    localizedRows: message.addressStats?.localizedRows ?? 0,
    sqlArtifactCount: message.addressSqlArtifactKeys?.length ?? 0,
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
  await harbourClient.publishDataset(releaseId, releaseCode, {
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
      sqlArtifactCount: message.addressSqlArtifactKeys?.length ?? 0,
    },
    releaseCode,
  )
}

async function resolveImportTarget(
  metaDb: MetaDatabase,
  message: DatasetProcessingMessage,
  target: AddressSqlImportTarget,
  options: AddressSqlImportStageOptions,
): Promise<ImportTargetContext> {
  const environment = resolveDataShardEnvironment(options.dataShardEnvironment)
  const metaRepoDb = metaDb as unknown as HarbourReadableDb
  const shard =
    target === 'current'
      ? await resolveShardForTypeRegionYear(metaRepoDb, 'current', environment)
      : await resolveShardForTypeRegionYear(
          metaRepoDb,
          target,
          environment,
          message.regionCode,
          resolveMessageShardYear(message),
        )

  return {
    binding:
      target === 'source'
        ? options.sourceBinding
        : target === 'history'
          ? options.historyBinding
          : options.currentBinding,
    databaseId: shard?.databaseId ?? null,
    name: target,
  }
}

async function execSqlWithBoundD1(target: ImportTargetContext, sqlBytes: Uint8Array) {
  if (!target.binding?.prepare) {
    throw new Error(`Missing D1 prepare binding for ${target.name} SQL execution.`)
  }

  for (const statement of splitSqlStatements(new TextDecoder().decode(sqlBytes))) {
    await target.binding.prepare(statement).run()
  }
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

async function importSqlWithD1RestApi(
  target: ImportTargetContext,
  artifact: {
    bytes: Uint8Array
    etag?: string | null
  },
  options: AddressSqlImportStageOptions,
) {
  const accountId = options.accountId?.trim()
  const apiToken = options.apiToken?.trim()
  const databaseId = target.databaseId?.trim()
  const etag = normalizeEtag(artifact.etag)

  if (!accountId || !apiToken || !databaseId || !etag) {
    throw new Error(
      `Missing D1 REST import configuration for ${target.name}. Required: accountId, apiToken, databaseId, artifact etag.`,
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
    sql: artifact.bytes,
  })
}

function filterSqlArtifactKeys(
  message: DatasetProcessingMessage,
  target: AddressSqlImportTarget,
) {
  const marker = `/sql/${target}/`

  return (message.addressSqlArtifactKeys ?? []).filter(key => key.includes(marker))
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

function normalizeEtag(etag: string | null | undefined) {
  const normalized = etag?.trim().replaceAll('"', '')

  return normalized || null
}
