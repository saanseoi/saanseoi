import { getDatasetRecordByReleaseId } from '@repo/core/db/metaRegistry'
import { recordDatasetStage } from '@repo/core/pipeline/datasetStages'
import type { HarbourReadableDb, HarbourWritableDb } from '@repo/core/db/types'
import type { HarbourClient } from '@repo/core/pipeline/harbourClient'
import { runWithWriteRetry, type WriteRetryEvent } from '@repo/core/pipeline/utils'

type LocalControlClientOptions = {
  maxRetries?: number
  onRetry?: (event: WriteRetryEvent & { target: string }) => Promise<void> | void
  publishClient: HarbourClient
  retryDelayMs?: number
  targetName?: string
}

export function createLocalControlClient(
  db: HarbourReadableDb & HarbourWritableDb,
  options: LocalControlClientOptions,
): HarbourClient {
  const targetName = options.targetName ?? 'meta'

  return {
    publishDataset(resourceReleaseId, releaseCode, publishOptions) {
      return options.publishClient.publishDataset(
        resourceReleaseId,
        releaseCode,
        publishOptions,
      )
    },
    async stageCompleted(resourceReleaseId, phase, stats) {
      return runLocalControlWrite(
        async () => {
          const dataset = await requireLocalControlDataset(db, resourceReleaseId)
          await recordDatasetStage(
            db,
            { resourceReleaseId: dataset.resourceReleaseId, phase, stats },
            'completed',
          )
        },
        options,
        targetName,
      )
    },
    async stageFailed(resourceReleaseId, phase, error, stats) {
      return runLocalControlWrite(
        async () => {
          const dataset = await requireLocalControlDataset(db, resourceReleaseId)
          await recordDatasetStage(
            db,
            { resourceReleaseId: dataset.resourceReleaseId, phase, stats, error },
            'error',
          )
        },
        options,
        targetName,
      )
    },
    async stageRunning(resourceReleaseId, phase, stats) {
      return runLocalControlWrite(
        async () => {
          const dataset = await requireLocalControlDataset(db, resourceReleaseId)
          await recordDatasetStage(
            db,
            { resourceReleaseId: dataset.resourceReleaseId, phase, stats },
            'running',
          )
        },
        options,
        targetName,
      )
    },
  }
}

async function runLocalControlWrite(
  operation: () => Promise<void>,
  options: LocalControlClientOptions,
  targetName: string,
) {
  await runWithWriteRetry(operation, {
    maxRetries: options.maxRetries,
    onRetry: event => options.onRetry?.({ ...event, target: targetName }),
    retryDelayMs: options.retryDelayMs,
  })
}

async function requireLocalControlDataset(
  db: HarbourReadableDb,
  resourceReleaseId: string,
) {
  const dataset = await getDatasetRecordByReleaseId(db, resourceReleaseId)

  if (!dataset) {
    throw new Error(`Release not found: ${resourceReleaseId}`)
  }

  return dataset
}
