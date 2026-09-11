import { readFileSync } from 'node:fs'
import { parse } from 'comment-json'
import type { HarbourClient } from '@repo/core/pipeline/harbourClient'
import type { UploadTarget } from '../../cli/options.ts'
import {
  importSqlArtefactKeys,
  type SqlImportExecutionOptions,
  type SqlImportTargetContext,
} from '../local/sqlImport.ts'
import {
  appendPhaseDetails,
  colorRed,
  colorTeal,
  formatBytes,
  formatCompletedPhaseLabel,
  formatDurationMs,
  formatRunningPhaseLabel,
} from '../local/progressFormatting.ts'
import type { OperationProgress } from '../../cli/operationProgress.ts'
import type { LocalPipelineBucket } from '../local/localBucket.ts'
import {
  resolveShardBindingName,
  type LocalAddressDbContext,
} from '../../dbCache/localDbCache.ts'
import { runLocalProgressPhase } from '../local/orchestrator.ts'
import {
  HARBOUR_WORKERS_WRANGLER_PATH,
  REMOTE_IMPORT_BATCH_BYTES,
} from './processLocalHkgovPlandDivisionSqlUploadConfig.ts'
import type {
  PlandImportTargets,
  PlandSqlArtefactManifest,
} from './processLocalHkgovPlandDivisionSqlUploadSql.ts'

export function resolvePlandImportOptions(
  target: UploadTarget,
  context: LocalAddressDbContext,
): SqlImportExecutionOptions {
  const options: SqlImportExecutionOptions = {
    accountId: resolveCloudflareAccountId(target),
    apiToken: process.env.CLOUDFLARE_D1_TOKEN?.trim() || undefined,
    isLocal: !target.remote,
    metaDatabaseId: context.state.bindings.DB_META?.databaseId ?? null,
    remoteImportBatchBytes: REMOTE_IMPORT_BATCH_BYTES,
  }
  if (target.remote && (!options.accountId || !options.apiToken)) {
    throw new Error(
      'Remote PLAND SQL import requires CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_D1_TOKEN.',
    )
  }
  return options
}

export function resolvePlandImportTargets(
  context: LocalAddressDbContext,
  sourceVersion: string,
): PlandImportTargets {
  const shardYear = sourceVersion.slice(0, 4)
  const historyBindingName = resolveShardBindingName('history', 'HK', shardYear)
  const sourceBindingName = resolveShardBindingName('source', 'HK', shardYear)
  return {
    current: {
      binding: context.currentBinding,
      databaseId: context.state.bindings.DB_CURRENT?.databaseId ?? null,
      name: 'current',
    },
    history: {
      binding: context.historyBinding,
      databaseId: context.state.bindings[historyBindingName]?.databaseId ?? null,
      name: 'history',
    },
    meta: {
      binding: context.metaBinding,
      databaseId: context.state.bindings.DB_META?.databaseId ?? null,
      name: 'meta',
    },
    source: {
      binding: context.sourceBinding,
      databaseId: context.state.bindings[sourceBindingName]?.databaseId ?? null,
      name: 'source',
    },
  }
}

export async function importPlandSqlArtefacts(
  bucket: LocalPipelineBucket,
  manifest: PlandSqlArtefactManifest,
  targets: PlandImportTargets,
  options: SqlImportExecutionOptions,
  client: HarbourClient,
  releaseId: string,
  releaseCode: string,
  progress: OperationProgress,
) {
  const imports: Array<[string, SqlImportTargetContext, string]> = [
    ['importPlandSqlSource', targets.source, manifest.sourceKey],
    ['importPlandSqlHistory', targets.history, manifest.historyKey],
    ['importPlandSqlCurrent', targets.current, manifest.currentKey],
    ['importPlandSqlMeta', targets.meta, manifest.metaKey],
  ]
  for (const [phase, importTarget, key] of imports) {
    const importStartedAt = Date.now()
    progress.beginPhase(
      formatRunningPhaseLabel(colorTeal('Import'), colorRed(importTarget.name)),
      { current: 0, max: 1 },
    )
    await client.stageRunning(releaseId, phase, undefined, releaseCode)
    try {
      const stats = await importSqlArtefactKeys(
        bucket,
        importTarget,
        [key],
        options,
        async importProgress => {
          const totalFiles =
            typeof importProgress.totalFiles === 'number'
              ? importProgress.totalFiles
              : 1
          const processedFiles =
            typeof importProgress.processedFiles === 'number'
              ? importProgress.processedFiles
              : 0
          progress.update(processedFiles, {
            label: formatRunningPhaseLabel(
              colorTeal('Import'),
              colorRed(importTarget.name),
              processedFiles,
              totalFiles,
            ),
            max: totalFiles,
          })
          await client.stageRunning(releaseId, phase, importProgress, releaseCode)
        },
      )
      await client.stageCompleted(releaseId, phase, stats, releaseCode)
      progress.complete(
        appendPhaseDetails(
          formatCompletedPhaseLabel(colorTeal('Import'), colorRed(importTarget.name)),
          [formatDurationMs(Date.now() - importStartedAt), formatBytes(stats.bytes)],
        ),
      )
    } catch (error) {
      progress.fail()
      await client.stageFailed(
        releaseId,
        phase,
        error instanceof Error ? error.message : String(error),
        undefined,
        releaseCode,
      )
      throw error
    }
  }
}

export async function runPlandProgressPhase<T>(
  progress: OperationProgress,
  action: string,
  subject: string,
  operation: (reportProgress: (current: number) => void) => Promise<T>,
  options: { totalUnits?: number } = {},
) {
  const totalUnits =
    typeof options.totalUnits === 'number' && options.totalUnits > 0
      ? Math.floor(options.totalUnits)
      : undefined

  return runLocalProgressPhase(
    progress,
    { action, subject, totalUnits },
    reportProgress => operation(reportProgress),
  )
}

function resolveCloudflareAccountId(target: UploadTarget) {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim()
  if (accountId) return accountId
  const config = parse(
    readFileSync(HARBOUR_WORKERS_WRANGLER_PATH, 'utf8'),
  ) as unknown as {
    env?: {
      preview?: { vars?: Record<string, unknown> }
      production?: { vars?: Record<string, unknown> }
    }
    vars?: Record<string, unknown>
  }
  const vars = target.remote
    ? target.environment === 'production'
      ? config.env?.production?.vars
      : config.env?.preview?.vars
    : config.vars
  return typeof vars?.CLOUDFLARE_ACCOUNT_ID === 'string'
    ? vars.CLOUDFLARE_ACCOUNT_ID.trim() || undefined
    : undefined
}
