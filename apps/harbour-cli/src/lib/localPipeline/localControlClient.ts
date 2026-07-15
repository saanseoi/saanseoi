import {
  ensureIngestRunStarted,
  getDatasetRecordByReleaseId,
  updateDatasetStatus,
  updateLatestOpenIngestRun,
  upsertIngestRunStatus,
} from '@repo/core/db/metaRegistry'
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
    publishDataset(releaseId, releaseCode, publishOptions) {
      return options.publishClient.publishDataset(
        releaseId,
        releaseCode,
        publishOptions,
      )
    },
    async stageCompleted(releaseId, phase, stats) {
      return runLocalControlWrite(
        async () => {
          const dataset = await requireLocalControlDataset(db, releaseId)
          const now = new Date().toISOString()
          const updatedExistingRun = await updateLatestOpenIngestRun(
            db,
            dataset.releaseId,
            phase,
            'completed',
            now,
            stats ?? null,
          )

          if (!updatedExistingRun) {
            await upsertIngestRunStatus(
              db,
              dataset.releaseId,
              phase,
              'completed',
              now,
              now,
              stats ?? null,
            )
          }
        },
        options,
        targetName,
      )
    },
    async stageFailed(releaseId, phase, error, stats) {
      return runLocalControlWrite(
        async () => {
          const dataset = await requireLocalControlDataset(db, releaseId)
          const now = new Date().toISOString()
          const errorJson = JSON.stringify({
            message: error || 'Unknown processing error.',
          })

          await updateDatasetStatus(db, dataset.releaseId, 'failed')
          const updatedExistingRun = await updateLatestOpenIngestRun(
            db,
            dataset.releaseId,
            phase,
            'error',
            now,
            stats ?? null,
            errorJson,
          )

          if (!updatedExistingRun) {
            await upsertIngestRunStatus(
              db,
              dataset.releaseId,
              phase,
              'error',
              now,
              now,
              stats ?? null,
              errorJson,
            )
          }
        },
        options,
        targetName,
      )
    },
    async stageRunning(releaseId, phase, stats) {
      return runLocalControlWrite(
        async () => {
          const dataset = await requireLocalControlDataset(db, releaseId)
          const now = new Date().toISOString()

          if (phase === 'processDataset') {
            await updateDatasetStatus(db, dataset.releaseId, 'processing')
          }

          await ensureIngestRunStarted(db, dataset.releaseId, phase, stats ?? null, now)
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

async function requireLocalControlDataset(db: HarbourReadableDb, releaseId: string) {
  const dataset = await getDatasetRecordByReleaseId(db, releaseId)

  if (!dataset) {
    throw new Error(`Release not found: ${releaseId}`)
  }

  return dataset
}
