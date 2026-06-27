import {
  activateReleaseSet,
  ensureDraftReleaseSetForRelease,
  ensureIngestRunStarted,
  getCurrentReleaseForDatasetId,
  getDatasetRecordByReleaseId,
  markDatasetCurrent,
  markDatasetHistoric,
  resolveReleaseSetForRelease,
  revokeDataset,
  setSupersededByReleaseId,
  updateDatasetStatus,
  upsertIngestRunStatus,
} from '@repo/core/db/meta-repository'
import type { SupportedType } from '@repo/core'
import type { HarbourReadableDb, HarbourWritableDb } from '@repo/core/db/types'

type StageRequest = {
  releaseId: string
  error?: string
  phase: string
  stats?: Record<string, unknown>
}

type PublishRequest = {
  releaseId: string
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
  const dataset = await requireDataset(db, request.releaseId)
  const now = new Date().toISOString()

  if (request.phase === 'processDataset') {
    await updateDatasetStatus(db, dataset.releaseId, 'processing')
  }

  await ensureIngestRunStarted(
    db,
    dataset.releaseId,
    request.phase,
    stringifyOptional(request.stats),
    now,
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
  const dataset = await requireDataset(db, request.releaseId)
  const now = new Date().toISOString()

  await upsertIngestRunStatus(
    db,
    dataset.releaseId,
    request.phase,
    'completed',
    now,
    now,
    stringifyOptional(request.stats),
  )

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
  const dataset = await requireDataset(db, request.releaseId)
  const now = new Date().toISOString()
  const errorJson = stringifyOptional({
    message: request.error ?? 'Unknown processing error.',
  })

  await updateDatasetStatus(db, dataset.releaseId, 'failed')
  await upsertIngestRunStatus(
    db,
    dataset.releaseId,
    request.phase,
    'error',
    now,
    now,
    stringifyOptional(request.stats),
    errorJson,
  )

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
  const dataset = await requireDataset(db, request.releaseId)
  const publishedAt = new Date().toISOString()
  const datasetType = dataset.type as SupportedType
  const currentRelease = await getCurrentReleaseForDatasetId(
    db,
    dataset.datasetId,
    dataset.releaseId,
  )
  const releaseSet =
    (await resolveReleaseSetForRelease(db, dataset.releaseId, datasetType)) ??
    (await ensureDraftReleaseSetForRelease(db, datasetType, dataset.releaseCode))

  await activateReleaseSet(db, releaseSet.id)

  await markDatasetCurrent(db, dataset.releaseId)

  if (currentRelease) {
    await setSupersededByReleaseId(db, currentRelease.releaseId, dataset.releaseId)

    if (isCorrectedRelease(currentRelease.sourceVersion, dataset.sourceVersion)) {
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

async function requireDataset(db: HarbourReadableDb, releaseId: string) {
  const dataset = await getDatasetRecordByReleaseId(db, releaseId)

  if (!dataset) {
    throw new Error(`Release not found: ${releaseId}`)
  }

  return dataset
}

function stringifyOptional(value?: Record<string, unknown>) {
  return value ? JSON.stringify(value) : null
}

function isCorrectedRelease(
  previousSourceVersion?: string,
  nextSourceVersion?: string,
) {
  if (!previousSourceVersion || !nextSourceVersion) {
    return false
  }

  return previousSourceVersion.split('.')[0] === nextSourceVersion.split('.')[0]
}
