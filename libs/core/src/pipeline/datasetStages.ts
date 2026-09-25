import type { HarbourReadableDb, HarbourWritableDb } from '../lib/db/types'
import {
  ensureProcessingRunStarted,
  updateDatasetStatus,
  updateLatestOpenProcessingRun,
  upsertProcessingRunStatus,
} from '../lib/db/metaRegistry'

export type DatasetStageRequest = {
  resourceReleaseId: string
  phase: string
  results?: Record<string, unknown>
  error?: string
}

export async function recordDatasetStage(
  db: HarbourReadableDb & HarbourWritableDb,
  request: DatasetStageRequest,
  status: 'running' | 'completed' | 'error',
) {
  const { resourceReleaseId, phase } = request
  const now = new Date().toISOString()
  const results = request.results ?? null
  if (status === 'running') {
    if (phase === 'processDataset')
      await updateDatasetStatus(db, resourceReleaseId, 'processing')
    if (reopensCompletedPhase(phase)) {
      await upsertProcessingRunStatus(
        db,
        resourceReleaseId,
        phase,
        status,
        now,
        null,
        results,
      )
    } else {
      await ensureProcessingRunStarted(db, resourceReleaseId, phase, results, now)
    }
    return
  }

  const error =
    status === 'error'
      ? JSON.stringify({ message: request.error || 'Unknown processing error.' })
      : null
  if (status === 'error') await updateDatasetStatus(db, resourceReleaseId, 'failed')
  const updated = await updateLatestOpenProcessingRun(
    db,
    resourceReleaseId,
    phase,
    status,
    now,
    results,
    error,
  )
  if (!updated) {
    await upsertProcessingRunStatus(
      db,
      resourceReleaseId,
      phase,
      status,
      now,
      now,
      results,
      error,
    )
  }
}

function reopensCompletedPhase(phase: string) {
  return (
    phase === 'processDataset' ||
    phase === 'normaliseAddressSql' ||
    phase === 'generateAddressSqlSource' ||
    phase === 'generateAddressSqlHistory' ||
    phase === 'generateAddressSqlCurrent'
  )
}
