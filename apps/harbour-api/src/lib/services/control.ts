import {
  publishReleaseArtifacts,
  ensureDraftReleaseSetForRelease,
  ensureIngestRunStarted,
  getCurrentReleaseForDatasetId,
  getDatasetRecordByReleaseId,
  listApiReleaseSetSnapshots,
  listApiReleaseSetSources,
  resolveActiveReleaseSetForType,
  resolveReleaseSetForRelease,
  resolveSnapshotForRelease,
  updateLatestOpenIngestRun,
  updateDatasetStatus,
  upsertIngestRunStatus,
} from '@repo/core/db/meta-repository'
import type { SnapshotFamily } from '@repo/core/db/meta-repository'
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

export async function handleStageRunning(
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

  const updatedExistingRun = await updateLatestOpenIngestRun(
    db,
    dataset.releaseId,
    request.phase,
    'completed',
    now,
    stringifyOptional(request.stats),
  )

  if (!updatedExistingRun) {
    await upsertIngestRunStatus(
      db,
      dataset.releaseId,
      request.phase,
      'completed',
      now,
      now,
      stringifyOptional(request.stats),
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
  const dataset = await requireDataset(db, request.releaseId)
  const now = new Date().toISOString()
  const errorJson = stringifyOptional({
    message: request.error ?? 'Unknown processing error.',
  })

  await updateDatasetStatus(db, dataset.releaseId, 'failed')
  const updatedExistingRun = await updateLatestOpenIngestRun(
    db,
    dataset.releaseId,
    request.phase,
    'error',
    now,
    stringifyOptional(request.stats),
    errorJson,
  )

  if (!updatedExistingRun) {
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
  const snapshot = await resolveSnapshotForRelease(db, dataset.releaseId, datasetType)

  if (!snapshot) {
    throw new Error(
      `Snapshot not found for ${dataset.releaseCode} (${datasetType}/${dataset.releaseId}).`,
    )
  }

  const activeReleaseSet = await resolveActiveReleaseSetForType(db, datasetType)
  const carriedSnapshots: Array<{
    snapshotFamily: SnapshotFamily
    snapshotId: string
  }> = []
  const carriedSources: Array<{
    datasetId: string
    role: 'primary' | 'enrichment' | 'fallback' | 'lookup'
    sourceReleaseId: string
  }> = []

  if (activeReleaseSet && activeReleaseSet.id !== releaseSet.id) {
    const [activeSnapshots, activeSources] = await Promise.all([
      listApiReleaseSetSnapshots(db, activeReleaseSet.id),
      listApiReleaseSetSources(db, activeReleaseSet.id),
    ])

    for (const activeSnapshot of activeSnapshots) {
      if (activeSnapshot.snapshotFamily === datasetType) {
        continue
      }

      carriedSnapshots.push({
        snapshotFamily: activeSnapshot.snapshotFamily as SnapshotFamily,
        snapshotId: activeSnapshot.snapshotId,
      })
    }

    for (const activeSource of activeSources) {
      if (activeSource.datasetId === dataset.datasetId) {
        continue
      }

      carriedSources.push({
        datasetId: activeSource.datasetId,
        sourceReleaseId: activeSource.sourceReleaseId,
        role: activeSource.role,
      })
    }
  }

  await publishReleaseArtifacts(db, {
    carriedSnapshots,
    carriedSources,
    currentRelease,
    currentReleaseIsCorrected: currentRelease
      ? isCorrectedRelease(currentRelease.sourceVersion, dataset.sourceVersion)
      : false,
    dataset,
    publishedAt,
    releaseSetId: releaseSet.id,
    snapshotId: snapshot.id,
    type: datasetType,
  })

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
