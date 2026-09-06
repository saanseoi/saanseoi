import type { HarbourReadableDb, HarbourWritableDb } from '../lib/db/types'
import {
  ensureIngestRunStarted,
  updateDatasetStatus,
  updateLatestOpenIngestRun,
  upsertIngestRunStatus,
} from '../lib/db/metaRegistry'

export type DatasetStageRequest = {
  releaseId: string
  phase: string
  stats?: Record<string, unknown>
  error?: string
}

export async function recordDatasetStage(
  db: HarbourReadableDb & HarbourWritableDb,
  request: DatasetStageRequest,
  status: 'running' | 'completed' | 'error',
) {
  const { releaseId, phase } = request
  const now = new Date().toISOString()
  const stats = request.stats ?? null
  if (status === 'running') {
    if (phase === 'processDataset')
      await updateDatasetStatus(db, releaseId, 'processing')
    if (reopensCompletedPhase(phase)) {
      await upsertIngestRunStatus(db, releaseId, phase, status, now, null, stats)
    } else {
      await ensureIngestRunStarted(db, releaseId, phase, stats, now)
    }
    return
  }

  const error =
    status === 'error'
      ? JSON.stringify({ message: request.error || 'Unknown processing error.' })
      : null
  if (status === 'error') await updateDatasetStatus(db, releaseId, 'failed')
  const updated = await updateLatestOpenIngestRun(
    db,
    releaseId,
    phase,
    status,
    now,
    stats,
    error,
  )
  if (!updated) {
    await upsertIngestRunStatus(db, releaseId, phase, status, now, now, stats, error)
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
