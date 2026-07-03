import { mkdir } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { availableParallelism, cpus } from 'node:os'
import { resolve } from 'node:path'

import type { DatasetProcessingMessage } from '@repo/core'

import { hasCurrentAddressVersions } from '@repo/core/pipeline/db/address'
import type { HarbourClient } from '@repo/core/pipeline/harbourClient'
import { buildAddressSqlImportRunId } from '@repo/core/pipeline/services/addressPipeline/sqlImport'
import {
  importAddressSqlArtifactsAndPublish,
  type AddressSqlImportStageOptions,
} from '@repo/core/pipeline/services/addressPipeline/sqlImportStages'
import {
  normalizeAddressSqlChunkStage,
  writeAddressCurrentSqlChunkStage,
  writeAddressHistorySqlChunkStage,
  writeAddressSourceSqlChunkStage,
} from '@repo/core/pipeline/services/addressPipeline/sqlStages'
import {
  addAddressPipelineStats,
  EMPTY_ADDRESS_PIPELINE_STATS,
  type AddressPipelineMessage,
} from '@repo/core/pipeline/services/addressPipeline/types'
import {
  loadDivisionLookupMaps,
  serializeDivisionLookupMaps,
} from '@repo/core/pipeline/services/addressPipeline/normalization'

import type { PreparedUploadFile } from '../parquetRepack.ts'
import type { UploadTarget } from '../options.ts'
import { createHarbourControlClient } from '../harbourControl.ts'
import {
  createLocalImportProgressClient,
  runLocalGenerationPhase,
  writeLocalPipelineState,
} from '../localPipeline/orchestrator.ts'
import {
  appendPhaseDetails,
  colorRed,
  colorTeal,
  formatCompletedPhaseLabel,
  formatDurationMs,
  formatRunningPhaseLabel,
} from '../localPipeline/progressFormatting.ts'
import { LocalUploadProgress } from '../localUploadProgress.ts'
import {
  loadAddressCurrentLookupCache,
  writeAddressCurrentLookupCache,
} from './addressCurrentLookupCache.ts'
import { LocalPipelineBucket } from './localBucket.ts'
import {
  resolveLocalAddressDbContext,
  type LocalDbCacheProgressEvent,
} from './localDbCache.ts'

type UploadResult = {
  datasetCode?: string
  datasetId?: string
  rawObjectKey?: string
  releaseCode?: string
  releaseId?: string
}

type UploadPlan = {
  cohortKey: string
  regionCode: 'hk' | 'mo'
  releaseCode: string
  rowCount: number
  source: string
  sourceVersion: string
  theme: 'addresses'
  type: 'address'
}

type ChunkRange = {
  rowEnd: number
  rowStart: number
}

const REPO_ROOT = resolve(import.meta.dir, '../../../../..')
const LOCAL_RELEASE_ROOT = resolve(REPO_ROOT, '.local/harbour-sql/releases')
const HARBOUR_WORKERS_WRANGLER_PATH = resolve(
  REPO_ROOT,
  'apps/harbour-workers/wrangler.jsonc',
)
const ADDRESS_CHUNK_SIZE = 16_384
const GENERATION_CONCURRENCY = Math.max(1, Math.min(resolveCpuCount(), 4))
const REMOTE_IMPORT_BATCH_BYTES = 64 * 1024 * 1024
const SQL_STATEMENT_BYTE_TARGET = 99_000

export async function processLocalAddressSqlUpload(
  target: UploadTarget,
  previewPlan: UploadPlan,
  uploadResult: UploadResult,
  preparedUpload: PreparedUploadFile,
  options: {
    skipSnapshotCleanup?: boolean
  } = {},
) {
  const releaseId = requireString(uploadResult.releaseId, 'releaseId')
  const releaseCode = requireString(uploadResult.releaseCode, 'releaseCode')
  const datasetId = requireString(uploadResult.datasetId, 'datasetId')
  const rawObjectKey = requireString(uploadResult.rawObjectKey, 'rawObjectKey')
  const shardYear = resolveShardYear(previewPlan.cohortKey, previewPlan.sourceVersion)
  const releaseRoot = resolve(
    LOCAL_RELEASE_ROOT,
    resolveTargetName(target),
    releaseCode,
  )

  await mkdir(releaseRoot, { recursive: true })

  const bucket = new LocalPipelineBucket(releaseRoot)
  await bucket.seedRawObject(rawObjectKey, preparedUpload.filePath)
  const progress = new LocalUploadProgress()
  const resolvedTargetName = resolveTargetName(target)

  let dbContext: Awaited<ReturnType<typeof resolveLocalAddressDbContext>>
  const dbCacheStartedAt = Date.now()

  try {
    dbContext = await resolveLocalAddressDbContext(
      target,
      previewPlan.regionCode,
      shardYear,
      {
        onProgress(event) {
          updateDbCacheProgress(progress, event)
        },
        cacheTableProfile: 'address',
        includePreviousShardYears: shouldIncludePreviousShardYears(
          previewPlan.cohortKey,
        ),
        refreshRemoteTables: false,
        remoteCacheScopeKey: target.remote ? releaseId : undefined,
      },
    )
  } catch (error) {
    progress.fail(error instanceof Error ? error.message : String(error))
    throw error
  }

  if (target.remote && progress.hasActivePhase()) {
    progress.complete(
      appendPhaseDetails(
        formatCompletedPhaseLabel(
          colorTeal('Clone cache'),
          colorRed(resolvedTargetName),
        ),
        [formatDurationMs(Date.now() - dbCacheStartedAt)],
      ),
    )
  }
  const harbourClient = createHarbourControlClient(target) as HarbourClient
  const initialMessage: DatasetProcessingMessage = {
    datasetId,
    datasetCode: uploadResult.datasetCode,
    rawObjectKey,
    releaseCode,
    releaseId,
    regionCode: previewPlan.regionCode,
    shardYear,
    cohortKey: previewPlan.cohortKey,
    source: previewPlan.source,
    sourceVersion: previewPlan.sourceVersion,
    theme: previewPlan.theme,
    type: previewPlan.type,
    processingMode: 'sql',
    ...(options.skipSnapshotCleanup ? { skipSnapshotCleanup: true } : {}),
  }
  const importOptions: AddressSqlImportStageOptions = {
    accountId: resolveCloudflareAccountId(target),
    apiToken: resolveCloudflareD1ApiToken(),
    currentBinding: dbContext.currentBinding,
    dataShardEnvironment: target.remote
      ? target.environment === 'production'
        ? 'production'
        : 'preview'
      : 'preview',
    historyBinding: dbContext.historyBinding,
    isLocal: !target.remote,
    metaBinding: dbContext.metaBinding,
    metaDatabaseId: dbContext.state.bindings.DB_META?.databaseId ?? null,
    remoteImportBatchBytes: REMOTE_IMPORT_BATCH_BYTES,
    sourceBinding: dbContext.sourceBinding,
  }

  assertRemoteAddressImportPrerequisites(target, dbContext, importOptions)
  const processingRunStartedAt = new Date().toISOString()

  await writeLocalPipelineState(releaseRoot, {
    addressChunkSize: ADDRESS_CHUNK_SIZE,
    addressSqlRunId: buildAddressSqlImportRunId(initialMessage),
    generationConcurrency: GENERATION_CONCURRENCY,
    preparedAt: processingRunStartedAt,
    rawObjectKey,
    releaseCode,
    releaseId,
    shardYear,
    sqlStatementByteTarget: SQL_STATEMENT_BYTE_TARGET,
    target: resolvedTargetName,
    workingDbCacheDir: dbContext.state.dbCacheDir,
  })

  try {
    await harbourClient.stageRunning(
      releaseId,
      'processDataset',
      undefined,
      releaseCode,
    )
    await harbourClient.stageRunning(
      releaseId,
      'extractAddresses',
      undefined,
      releaseCode,
    )
    await harbourClient.stageRunning(
      releaseId,
      'extractAddressesI18n',
      undefined,
      releaseCode,
    )

    const serializedDivisionLookup = serializeDivisionLookupMaps(
      await loadDivisionLookupMaps(
        dbContext.metaDb,
        dbContext.currentDb,
        previewPlan.regionCode,
        previewPlan.cohortKey,
      ),
    )
    const addressCurrentLookupCache = (await hasCurrentAddressVersions(
      dbContext.historyDb as never,
    ))
      ? await loadAddressCurrentLookupCache(resolvedTargetName, previewPlan.regionCode)
      : null
    const chunkMessages: AddressPipelineMessage[] = buildChunkRanges(
      previewPlan.rowCount,
      ADDRESS_CHUNK_SIZE,
    ).map(
      range =>
        ({
          addressCurrentLookupCache: addressCurrentLookupCache ?? undefined,
          ...initialMessage,
          addressDivisionLookup: serializedDivisionLookup,
          addressStage: 'normalize',
          chunkSize: ADDRESS_CHUNK_SIZE,
          processingRunStartedAt,
          rowStart: range.rowStart,
          rowEnd: range.rowEnd,
          totalRows: previewPlan.rowCount,
        }) satisfies AddressPipelineMessage,
    )

    const normalizedMessages = await runLocalGenerationPhase(
      progress,
      harbourClient,
      {
        completionLabel: formatCompletedPhaseLabel(
          colorTeal('Normalize'),
          colorTeal('records'),
          previewPlan.rowCount,
        ),
        label: formatRunningPhaseLabel(
          colorTeal('Normalize'),
          colorTeal('records'),
          0,
          previewPlan.rowCount,
        ),
        labelForProgress(current: number) {
          return formatRunningPhaseLabel(
            colorTeal('Normalize'),
            colorTeal('records'),
            current,
            previewPlan.rowCount,
          )
        },
        phase: 'normalizeAddressSql',
        releaseCode,
        releaseId,
        totalUnits: previewPlan.rowCount,
        unitsForMessage(message) {
          return Math.max(0, (message.rowEnd ?? 0) - (message.rowStart ?? 0))
        },
      },
      chunkMessages,
      GENERATION_CONCURRENCY,
      message =>
        normalizeAddressSqlChunkStage(
          dbContext.metaDb,
          dbContext.currentDb,
          bucket,
          message,
        ),
    )
    const sourceMessages = await runLocalGenerationPhase(
      progress,
      harbourClient,
      {
        completionLabel: formatCompletedPhaseLabel(
          colorTeal('Generate SQL'),
          colorRed('source'),
          previewPlan.rowCount,
        ),
        label: formatRunningPhaseLabel(
          colorTeal('Generate SQL'),
          colorRed('source'),
          0,
          previewPlan.rowCount,
        ),
        labelForProgress(current: number) {
          return formatRunningPhaseLabel(
            colorTeal('Generate SQL'),
            colorRed('source'),
            current,
            previewPlan.rowCount,
          )
        },
        phase: 'generateAddressSqlSource',
        releaseCode,
        releaseId,
        totalUnits: previewPlan.rowCount,
        unitsForMessage(message) {
          return Math.max(0, (message.rowEnd ?? 0) - (message.rowStart ?? 0))
        },
      },
      normalizedMessages,
      GENERATION_CONCURRENCY,
      message => writeAddressSourceSqlChunkStage(bucket, message),
    )
    const historyMessages = await runLocalGenerationPhase(
      progress,
      harbourClient,
      {
        completionLabel: formatCompletedPhaseLabel(
          colorTeal('Generate SQL'),
          colorRed('history'),
          previewPlan.rowCount,
        ),
        label: formatRunningPhaseLabel(
          colorTeal('Generate SQL'),
          colorRed('history'),
          0,
          previewPlan.rowCount,
        ),
        labelForProgress(current: number) {
          return formatRunningPhaseLabel(
            colorTeal('Generate SQL'),
            colorRed('history'),
            current,
            previewPlan.rowCount,
          )
        },
        phase: 'generateAddressSqlHistory',
        releaseCode,
        releaseId,
        totalUnits: previewPlan.rowCount,
        unitsForMessage(message) {
          return Math.max(0, (message.rowEnd ?? 0) - (message.rowStart ?? 0))
        },
      },
      sourceMessages,
      GENERATION_CONCURRENCY,
      message =>
        writeAddressHistorySqlChunkStage(
          dbContext.metaDb,
          dbContext.historyDb,
          bucket,
          message,
        ),
    )
    const currentMessages = await runLocalGenerationPhase(
      progress,
      harbourClient,
      {
        completionLabel: formatCompletedPhaseLabel(
          colorTeal('Generate SQL'),
          colorRed('current'),
          previewPlan.rowCount,
        ),
        label: formatRunningPhaseLabel(
          colorTeal('Generate SQL'),
          colorRed('current'),
          0,
          previewPlan.rowCount,
        ),
        labelForProgress(current: number) {
          return formatRunningPhaseLabel(
            colorTeal('Generate SQL'),
            colorRed('current'),
            current,
            previewPlan.rowCount,
          )
        },
        phase: 'generateAddressSqlCurrent',
        releaseCode,
        releaseId,
        totalUnits: previewPlan.rowCount,
        unitsForMessage(message) {
          return Math.max(0, (message.rowEnd ?? 0) - (message.rowStart ?? 0))
        },
      },
      historyMessages,
      GENERATION_CONCURRENCY,
      message =>
        writeAddressCurrentSqlChunkStage(
          dbContext.metaDb,
          dbContext.currentDb,
          bucket,
          message,
        ),
    )

    const finalMessage = buildFinalImportMessage(
      initialMessage,
      serializedDivisionLookup,
      processingRunStartedAt,
      currentMessages,
      previewPlan.rowCount,
    )
    const importProgressClient = createLocalImportProgressClient(
      harbourClient,
      progress,
      buildAddressImportProgressConfig(finalMessage.addressSqlArtifactKeys ?? []),
    )

    await importAddressSqlArtifactsAndPublish(
      importProgressClient,
      dbContext.metaDb,
      bucket,
      finalMessage,
      importOptions,
    )
    await writeAddressCurrentLookupCache(
      resolvedTargetName,
      previewPlan.regionCode,
      releaseCode,
      dbContext.historyDb,
    )
  } catch (error) {
    progress.fail(error instanceof Error ? error.message : String(error))
    await harbourClient.stageFailed(
      releaseId,
      'processDataset',
      error instanceof Error ? error.message : String(error),
      undefined,
      releaseCode,
    )
    throw error
  } finally {
    dbContext.cleanup()
  }
}

function shouldIncludePreviousShardYears(cohortKey: string) {
  return /^\d{4}-01(?:-\d{2})?/.test(cohortKey)
}

function updateDbCacheProgress(
  progress: LocalUploadProgress,
  event: LocalDbCacheProgressEvent,
) {
  if (event.target !== 'preview' && event.target !== 'production') {
    return
  }

  const label = formatDbCacheProgressLabel(event)
  const current = Math.min(event.current, event.total)

  if (!progress.hasActivePhase()) {
    progress.beginPhase(label, {
      current,
      max: event.total,
    })
  } else {
    progress.update(current, {
      label,
      max: event.total,
    })
  }

  if (event.action === 'reuse-cache') {
    progress.complete(
      formatCompletedPhaseLabel(
        colorTeal('Clone cache'),
        colorRed(event.target),
        event.total,
      ),
    )
  }
}

function formatDbCacheProgressLabel(event: LocalDbCacheProgressEvent) {
  const subject = describeDbCacheSubject(event)

  return formatRunningPhaseLabel(
    colorTeal('Clone cache'),
    colorRed(subject),
    Math.min(event.current, event.total),
    event.total,
  )
}

function describeDbCacheSubject(event: LocalDbCacheProgressEvent) {
  switch (event.action) {
    case 'check-cache':
      return `${event.target}.manifest`
    case 'export-binding':
      return event.tableName
        ? `${event.bindingName}.${event.tableName}`
        : `${event.bindingName}.export`
    case 'reuse-cache':
      return `${event.target}.reuse`
    case 'mirror-table':
      return event.tableName
        ? `${event.bindingName}.${event.tableName}`
        : event.bindingName
    case 'copy-binding':
      return `${event.bindingName}.sqlite`
    case 'validate-binding':
      return `${event.bindingName}.validate`
  }
}

function buildFinalImportMessage(
  initialMessage: DatasetProcessingMessage,
  serializedDivisionLookup: AddressPipelineMessage['addressDivisionLookup'],
  processingRunStartedAt: string,
  messages: AddressPipelineMessage[],
  totalRows: number,
) {
  const addressStats = messages.reduce(
    (stats, message) =>
      addAddressPipelineStats(
        stats,
        message.addressStats ?? EMPTY_ADDRESS_PIPELINE_STATS,
      ),
    EMPTY_ADDRESS_PIPELINE_STATS,
  )
  const addressSqlArtifactKeys = messages.flatMap(
    message => message.addressSqlArtifactKeys ?? [],
  )

  return {
    ...initialMessage,
    addressDivisionLookup: serializedDivisionLookup,
    addressSqlArtifactKeys,
    addressStage: 'sql-import-source',
    addressStats,
    chunkSize: ADDRESS_CHUNK_SIZE,
    processingMode: 'sql',
    processingRunStartedAt,
    rowEnd: totalRows,
    rowStart: 0,
    totalRows,
  } satisfies AddressPipelineMessage
}

function buildChunkRanges(rowCount: number, chunkSize: number): ChunkRange[] {
  const ranges: ChunkRange[] = []

  for (let rowStart = 0; rowStart < rowCount; rowStart += chunkSize) {
    ranges.push({
      rowEnd: Math.min(rowStart + chunkSize, rowCount),
      rowStart,
    })
  }

  return ranges
}

function buildAddressImportProgressConfig(keys: string[]) {
  const currentKeys = keys.filter(key => key.includes('/sql/current/'))
  const metaKeys = keys.filter(key => key.includes('/sql/meta/'))
  const totalImportFiles =
    keys.filter(key => key.includes('/sql/source/')).length +
    keys.filter(key => key.includes('/sql/history/')).length +
    keys.filter(key => key.includes('/sql/history-apply/')).length +
    currentKeys.length +
    metaKeys.length

  return {
    cleanup: {
      completedLabel: formatCompletedPhaseLabel(
        colorTeal('Cleanup'),
        colorRed('staging'),
      ),
      phase: 'cleanupAddressSqlStaging',
      runningLabel(current: number) {
        return formatRunningPhaseLabel(
          colorTeal('Cleanup'),
          colorRed('staging'),
          current,
          3,
        )
      },
      totalUnits: 3,
    },
    importPhases: [
      {
        completedLabel: formatCompletedPhaseLabel(
          colorTeal('Import'),
          colorRed('SQL'),
          totalImportFiles,
        ),
        phase: 'importAddressSqlSource',
        runningLabel(current: number) {
          return formatRunningPhaseLabel(
            colorTeal('Import'),
            colorRed('SQL'),
            current,
            totalImportFiles,
          )
        },
        totalUnits: keys.filter(key => key.includes('/sql/source/')).length,
      },
      {
        completedLabel: formatCompletedPhaseLabel(
          colorTeal('Import'),
          colorRed('SQL'),
          totalImportFiles,
        ),
        phase: 'importAddressSqlHistory',
        runningLabel(current: number) {
          return formatRunningPhaseLabel(
            colorTeal('Import'),
            colorRed('SQL'),
            current,
            totalImportFiles,
          )
        },
        totalUnits:
          keys.filter(key => key.includes('/sql/history/')).length +
          keys.filter(key => key.includes('/sql/history-apply/')).length,
      },
      {
        completedLabel: formatCompletedPhaseLabel(
          colorTeal('Import'),
          colorRed('SQL'),
          totalImportFiles,
        ),
        phase: 'importAddressSqlCurrentInit',
        runningLabel(current: number) {
          return formatRunningPhaseLabel(
            colorTeal('Import'),
            colorRed('SQL'),
            current,
            totalImportFiles,
          )
        },
        totalUnits: currentKeys.filter(isCurrentInitSqlKey).length,
      },
      {
        completedLabel: formatCompletedPhaseLabel(
          colorTeal('Import'),
          colorRed('SQL'),
          totalImportFiles,
        ),
        phase: 'importAddressSqlCurrent',
        runningLabel(current: number) {
          return formatRunningPhaseLabel(
            colorTeal('Import'),
            colorRed('SQL'),
            current,
            totalImportFiles,
          )
        },
        totalUnits: currentKeys.filter(key => !isCurrentInitSqlKey(key)).length,
      },
      {
        completedLabel: formatCompletedPhaseLabel(
          colorTeal('Import'),
          colorRed('SQL'),
          totalImportFiles,
        ),
        phase: 'importAddressSqlStats',
        runningLabel(current: number) {
          return formatRunningPhaseLabel(
            colorTeal('Import'),
            colorRed('SQL'),
            current,
            totalImportFiles,
          )
        },
        totalUnits: metaKeys.length,
      },
    ],
    publish: {
      completedLabel: formatCompletedPhaseLabel(
        colorTeal('Publish'),
        colorRed('release'),
      ),
      phase: 'publishDataset',
      runningLabel(current: number) {
        return formatRunningPhaseLabel(
          colorTeal('Publish'),
          colorRed('release'),
          current,
          1,
        )
      },
      totalUnits: 1,
    },
  }
}

function isCurrentInitSqlKey(key: string) {
  return /-current-init\.sql$/.test(key)
}

function requireString(value: string | undefined, label: string) {
  if (!value?.trim()) {
    throw new Error(`Missing ${label} for local SQL processing.`)
  }

  return value
}

function resolveShardYear(cohortKey: string, sourceVersion: string) {
  const cohortYear = cohortKey.slice(0, 4)

  if (/^\d{4}$/.test(cohortYear)) {
    return cohortYear
  }

  const sourceYear = sourceVersion.slice(0, 4)

  if (/^\d{4}$/.test(sourceYear)) {
    return sourceYear
  }

  throw new Error(
    `Could not resolve shard year from cohortKey=${cohortKey} and sourceVersion=${sourceVersion}.`,
  )
}

function resolveTargetName(target: UploadTarget) {
  if (!target.remote) {
    return 'local'
  }

  return target.environment === 'production' ? 'production' : 'preview'
}

function resolveCloudflareAccountId(target: UploadTarget) {
  const fromEnv = process.env.CLOUDFLARE_ACCOUNT_ID?.trim()

  if (fromEnv) {
    return fromEnv
  }

  const rawConfig = readFileSync(HARBOUR_WORKERS_WRANGLER_PATH, 'utf8')
  const config = JSON.parse(rawConfig) as {
    vars?: Record<string, unknown>
    env?: {
      preview?: {
        vars?: Record<string, unknown>
      }
      production?: {
        vars?: Record<string, unknown>
      }
    }
  }
  const targetName = resolveTargetName(target)
  const vars =
    targetName === 'production'
      ? config.env?.production?.vars
      : targetName === 'preview'
        ? config.env?.preview?.vars
        : config.vars
  const accountId = vars?.CLOUDFLARE_ACCOUNT_ID

  if (typeof accountId === 'string' && accountId.trim()) {
    return accountId.trim()
  }

  return undefined
}

function resolveCloudflareD1ApiToken() {
  const token = process.env.CLOUDFLARE_D1_TOKEN?.trim()

  return token || undefined
}

function assertRemoteAddressImportPrerequisites(
  target: UploadTarget,
  dbContext: Awaited<ReturnType<typeof resolveLocalAddressDbContext>>,
  options: AddressSqlImportStageOptions,
) {
  if (!target.remote) {
    return
  }

  const missing: string[] = []

  if (!options.accountId?.trim()) {
    missing.push('CLOUDFLARE_ACCOUNT_ID')
  }

  if (!options.apiToken?.trim()) {
    missing.push('CLOUDFLARE_D1_TOKEN')
  }

  if (!dbContext.state.bindings.DB_CURRENT?.databaseId?.trim()) {
    missing.push('current.databaseId')
  }

  if (!dbContext.state.bindings.DB_META?.databaseId?.trim()) {
    missing.push('meta.databaseId')
  }

  if (
    !dbContext.historyTargets.some(targetContext =>
      Boolean(targetContext.databaseId?.trim()),
    )
  ) {
    missing.push('history.databaseId')
  }

  if (
    !dbContext.sourceTargets.some(targetContext =>
      Boolean(targetContext.databaseId?.trim()),
    )
  ) {
    missing.push('source.databaseId')
  }

  if (missing.length === 0) {
    return
  }

  throw new Error(
    [
      `Remote SQL import prerequisites are incomplete for ${resolveTargetName(target)}.`,
      `Missing: ${missing.join(', ')}.`,
      'Define CLOUDFLARE_D1_TOKEN in your shell or repo .env before running preview/production SQL uploads.',
    ].join(' '),
  )
}

function resolveCpuCount() {
  if (typeof availableParallelism === 'function') {
    return availableParallelism()
  }

  return cpus().length
}
