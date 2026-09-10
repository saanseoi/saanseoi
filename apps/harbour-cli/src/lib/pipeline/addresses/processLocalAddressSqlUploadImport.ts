import { readFileSync } from 'node:fs'
import { availableParallelism, cpus } from 'node:os'
import type { DatasetProcessingMessage } from '@repo/core'
import type { HarbourClient } from '@repo/core/pipeline/harbourClient'
import {
  importAddressSqlDataArtefacts,
  type AddressSqlImportStageOptions,
} from '@repo/core/pipeline/services/addressPipeline/sqlImportStages'
import {
  addAddressPipelineStats,
  EMPTY_ADDRESS_PIPELINE_STATS,
  type AddressPipelineMessage,
} from '@repo/core/pipeline/services/addressPipeline/types'
import type { UploadTarget } from '../../cli/options.ts'
import type { LocalPipelineBucket } from '../local/localBucket.ts'
import { readPendingSqlDelivery } from '../local/sqlDeliveryPending.ts'
import {
  invalidateRemoteDbCache,
  replayRemoteCacheWithRetry,
  refreshRemoteMetaCache,
  type resolveLocalAddressDbContext,
} from '../../dbCache/localDbCache.ts'
import {
  ADDRESS_CHUNK_SIZE,
  HARBOUR_WORKERS_WRANGLER_PATH,
} from './processLocalAddressSqlUploadConfig.ts'
import type { ChunkRange } from './processLocalAddressSqlUploadTypes.ts'

export async function replayAddressSqlIntoRemoteCache(
  target: UploadTarget,
  dbContext: Awaited<ReturnType<typeof resolveLocalAddressDbContext>>,
  bucket: LocalPipelineBucket,
  message: DatasetProcessingMessage,
  importOptions: AddressSqlImportStageOptions,
) {
  const targetName = target.environment === 'production' ? 'production' : 'preview'
  const cacheImportOptions: AddressSqlImportStageOptions = {
    ...importOptions,
    accountId: undefined,
    apiToken: undefined,
    isLocal: true,
  }

  try {
    await replayRemoteCacheWithRetry(
      targetName,
      dbContext.state.dbCacheDir,
      message.releaseCode ?? message.releaseId ?? 'unknown-release',
      () =>
        importAddressSqlDataArtefacts(
          createNoopHarbourClient(),
          dbContext.metaDb,
          bucket,
          message,
          cacheImportOptions,
        ),
    )
    return true
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    throw new Error(
      `Remote upload succeeded, but updating the ${targetName} local cache failed. ${reason}`,
    )
  }
}

export async function refreshRemoteMetaCacheAfterReplay(
  targetName: 'preview' | 'production',
  cacheDir: string,
) {
  try {
    await refreshRemoteMetaCache(targetName, cacheDir)
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)

    if (await readPendingSqlDelivery(cacheDir)) {
      throw new Error(
        `Remote delivery succeeded, but metadata refresh failed. The previous mirror and SQL delivery checkpoints were retained for sql:resume. ${reason}`,
      )
    }
    await invalidateRemoteDbCache(targetName, cacheDir, reason)
    throw new Error(
      `Remote upload succeeded, but refreshing the ${targetName} local meta cache failed. The cache was invalidated and future uploads will stop until it is rebuilt explicitly. ${reason}`,
    )
  }
}

function createNoopHarbourClient(): HarbourClient {
  return {
    async publishDataset() {},
    async stageCompleted() {},
    async stageFailed() {},
    async stageRunning() {},
  }
}

export function normaliseError(error: unknown) {
  return error instanceof Error ? error : new Error(String(error))
}

export function shouldIncludePreviousShardYears(cohortKey: string) {
  // Snapshot ancestry can cross a shard-year boundary for any cohort, not
  // only the first cohort published in January.
  return /^\d{4}-\d{2}(?:-\d{2})?/.test(cohortKey)
}

export function buildHistoricalAddressMatchKeyLookup(
  versions: NonNullable<AddressPipelineMessage['addressHistoricalParentVersions']>,
) {
  const byMatchKey = new Map<string, { churnHash: string; id: string }>()
  for (const version of versions.values()) {
    if (!version.matchKey || byMatchKey.has(version.matchKey)) continue
    byMatchKey.set(version.matchKey, {
      churnHash: version.churnHash,
      id: version.id,
    })
  }
  return byMatchKey
}

export function buildFinalImportMessage(
  initialMessage: DatasetProcessingMessage,
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
  const addressSqlArtefactKeys = messages.flatMap(
    message => message.addressSqlArtefactKeys ?? [],
  )

  return {
    ...initialMessage,
    addressSqlArtefactKeys,
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

export function buildChunkRanges(rowCount: number, chunkSize: number): ChunkRange[] {
  const ranges: ChunkRange[] = []

  for (let rowStart = 0; rowStart < rowCount; rowStart += chunkSize) {
    ranges.push({
      rowEnd: Math.min(rowStart + chunkSize, rowCount),
      rowStart,
    })
  }

  return ranges
}

export function requireString(value: string | undefined, label: string) {
  if (!value?.trim()) {
    throw new Error(`Missing ${label} for local SQL processing.`)
  }

  return value
}

export function resolveShardYear(cohortKey: string, sourceVersion: string) {
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

export function resolveTargetName(target: UploadTarget) {
  if (!target.remote) {
    return 'local'
  }

  return target.environment === 'production' ? 'production' : 'preview'
}

export function resolveCloudflareAccountId(target: UploadTarget) {
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

export function resolveCloudflareD1ApiToken() {
  const token = process.env.CLOUDFLARE_D1_TOKEN?.trim()

  return token || undefined
}

export function assertRemoteAddressImportPrerequisites(
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

export function resolveCpuCount() {
  if (typeof availableParallelism === 'function') {
    return availableParallelism()
  }

  return cpus().length
}
