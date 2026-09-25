import { recordDatasetStage } from '@repo/core/pipeline/datasetStages'
import type { HarbourReadableDb, HarbourWritableDb } from '@repo/core/db/types'
import type { ControlResult, StageRequest } from './controlTypes.ts'
import { requireDataset, runWithTransientControlRetry } from './controlRequests.ts'

export async function handleStageRunning(
  db: HarbourReadableDb & HarbourWritableDb,
  request: StageRequest,
): Promise<ControlResult> {
  return runWithTransientControlRetry(async () => {
    const dataset = await requireDataset(db, request)
    await recordDatasetStage(
      db,
      { ...request, resourceReleaseId: dataset.resourceReleaseId },
      'running',
    )
    return {
      datasetId: dataset.releaseCode,
      releaseCode: dataset.releaseCode,
      resourceReleaseId: dataset.resourceReleaseId,
      phase: request.phase,
      status: 'running',
    }
  })
}

export async function handleStageCompleted(
  db: HarbourReadableDb & HarbourWritableDb,
  request: StageRequest,
): Promise<ControlResult> {
  return runWithTransientControlRetry(async () => {
    const dataset = await requireDataset(db, request)
    await recordDatasetStage(
      db,
      { ...request, resourceReleaseId: dataset.resourceReleaseId },
      'completed',
    )
    return {
      datasetId: dataset.releaseCode,
      releaseCode: dataset.releaseCode,
      resourceReleaseId: dataset.resourceReleaseId,
      phase: request.phase,
      status: 'completed',
    }
  })
}

export async function handleStageFailed(
  db: HarbourReadableDb & HarbourWritableDb,
  request: StageRequest,
): Promise<ControlResult> {
  return runWithTransientControlRetry(async () => {
    const dataset = await requireDataset(db, request)
    await recordDatasetStage(
      db,
      { ...request, resourceReleaseId: dataset.resourceReleaseId },
      'error',
    )
    return {
      datasetId: dataset.releaseCode,
      releaseCode: dataset.releaseCode,
      resourceReleaseId: dataset.resourceReleaseId,
      phase: request.phase,
      status: 'error',
    }
  })
}
