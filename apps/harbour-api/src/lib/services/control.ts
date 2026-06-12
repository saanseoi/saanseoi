import {
  getCurrentReleaseForDatasetId,
  getDatasetRecordByReleaseId,
  insertIngestRun,
  markDatasetCurrent,
  markDatasetHistoric,
  revokeDataset,
  setSupersededByReleaseId,
  updateLatestOpenIngestRun,
  updateDatasetStatus,
} from '@repo/core/db/meta-repository'
import type { HarbourReadableDb, HarbourWritableDb } from '@repo/core/db/repository'

type StageRequest = {
  releaseId?: string
  datasetId?: string
  error?: string
  phase: string
  stats?: Record<string, unknown>
}

type PublishRequest = {
  releaseId?: string
  datasetId?: string
}

type ControlResult = {
  datasetId: string
  releaseCode: string
  releaseId: string
  phase: string | null
  status: string
}

export async function handleStageStarted(
  db: HarbourReadableDb & HarbourWritableDb,
  request: StageRequest,
): Promise<ControlResult> {
  const dataset = await requireDataset(db, request.releaseId ?? request.datasetId)
  const now = new Date().toISOString()

  if (request.phase === 'processDataset') {
    await updateDatasetStatus(db, dataset.releaseId, 'processing')
  }

  await insertIngestRun(
    db,
    dataset.releaseId,
    request.phase,
    'running',
    stringifyOptional(request.stats),
    now,
    null,
  )

  return {
    datasetId: dataset.releaseCode,
    releaseCode: dataset.releaseCode,
    releaseId: dataset.releaseId,
    phase: request.phase,
    status: 'running',
  }
}

export async function handleStageCompleted(
  db: HarbourReadableDb & HarbourWritableDb,
  request: StageRequest,
): Promise<ControlResult> {
  const dataset = await requireDataset(db, request.releaseId ?? request.datasetId)
  const now = new Date().toISOString()

  const updated = await updateLatestOpenIngestRun(
    db,
    dataset.releaseId,
    request.phase,
    'completed',
    now,
    stringifyOptional(request.stats),
  )

  if (!updated) {
    await insertIngestRun(
      db,
      dataset.releaseId,
      request.phase,
      'completed',
      stringifyOptional(request.stats),
      now,
      now,
    )
  }

  return {
    datasetId: dataset.releaseCode,
    releaseCode: dataset.releaseCode,
    releaseId: dataset.releaseId,
    phase: request.phase,
    status: 'completed',
  }
}

export async function handleStageFailed(
  db: HarbourReadableDb & HarbourWritableDb,
  request: StageRequest,
): Promise<ControlResult> {
  const dataset = await requireDataset(db, request.releaseId ?? request.datasetId)
  const now = new Date().toISOString()
  const errorJson = stringifyOptional({
    message: request.error ?? 'Unknown processing error.',
  })

  await updateDatasetStatus(db, dataset.releaseId, 'failed')
  const updated = await updateLatestOpenIngestRun(
    db,
    dataset.releaseId,
    request.phase,
    'error',
    now,
    stringifyOptional(request.stats),
    errorJson,
  )

  if (!updated) {
    await insertIngestRun(
      db,
      dataset.releaseId,
      request.phase,
      'error',
      stringifyOptional(request.stats),
      now,
      now,
      errorJson,
    )
  }

  return {
    datasetId: dataset.releaseCode,
    releaseCode: dataset.releaseCode,
    releaseId: dataset.releaseId,
    phase: request.phase,
    status: 'error',
  }
}

export async function handlePublishDataset(
  db: HarbourReadableDb & HarbourWritableDb,
  request: PublishRequest,
): Promise<ControlResult> {
  const dataset = await requireDataset(db, request.releaseId ?? request.datasetId)
  const publishedAt = new Date().toISOString()
  const currentRelease = await getCurrentReleaseForDatasetId(
    db,
    dataset.datasetId,
    dataset.releaseId,
  )

  await markDatasetCurrent(db, dataset.releaseId)

  if (currentRelease) {
    await setSupersededByReleaseId(db, currentRelease.releaseId, dataset.releaseId)

    if (isCorrectedRelease(currentRelease.releaseCode, dataset.releaseCode)) {
      await revokeDataset(
        db,
        currentRelease.releaseId,
        `Superseded by corrected release ${dataset.releaseCode}.`,
        publishedAt,
      )
    } else {
      await markDatasetHistoric(db, currentRelease.releaseId, publishedAt)
    }
  }

  return {
    datasetId: dataset.releaseCode,
    releaseCode: dataset.releaseCode,
    releaseId: dataset.releaseId,
    phase: null,
    status: 'current',
  }
}

async function requireDataset(db: HarbourReadableDb, releaseId?: string) {
  if (!releaseId) {
    throw new Error('Missing releaseId.')
  }

  const dataset = await getDatasetRecordByReleaseId(db, releaseId)

  if (!dataset) {
    throw new Error(`Release not found: ${releaseId}`)
  }

  return dataset
}

function stringifyOptional(value?: Record<string, unknown>) {
  return value ? JSON.stringify(value) : null
}

function isCorrectedRelease(previousDatasetId: string, nextDatasetId: string) {
  const previousSourceVersion = getSourceVersionFromDatasetId(previousDatasetId)
  const nextSourceVersion = getSourceVersionFromDatasetId(nextDatasetId)

  if (!previousSourceVersion || !nextSourceVersion) {
    return false
  }

  return previousSourceVersion.split('.')[0] === nextSourceVersion.split('.')[0]
}

function getSourceVersionFromDatasetId(datasetId: string) {
  const match = datasetId.match(/^[^-]+-[^-]+-(.+)-[^-]+$/)
  return match?.[1] ?? null
}
