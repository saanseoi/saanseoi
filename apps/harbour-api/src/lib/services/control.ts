import {
  publishReleaseArtifacts,
  ensureDraftReleaseSetForRelease,
  ensureIngestRunStarted,
  getCurrentReleaseForDatasetId,
  listCurrentSnapshotCleanupCandidates,
  listApiReleaseSetSnapshots,
  resolveActiveReleaseSetForType,
  resolveReleaseSetForRelease,
  resolveSnapshotForRelease,
  updateLatestOpenIngestRun,
  updateDatasetStatus,
  upsertIngestRunStatus,
  waitForDatasetRecord,
} from '@repo/core/db/metaRepository'
import type { HarbourJobMessage, ResourceType } from '@repo/core'
import type { HarbourReadableDb, HarbourWritableDb } from '@repo/core/db/types'

type StageRequest = {
  releaseCode?: string
  releaseId?: string
  error?: string
  phase: string
  stats?: Record<string, unknown>
}

type PublishRequest = {
  releaseCode?: string
  releaseId?: string
  skipSnapshotCleanup?: boolean
}

type CleanupSnapshotsRequest = {
  delaySeconds?: number
  dryRun?: boolean
  resourceType?: ResourceType
  snapshotIds?: string[]
}

type ControlResult = {
  datasetId: string
  releaseCode: string
  releaseId: string
  phase: string | null
  status: string
}

type CleanupSnapshotsResult = {
  candidateCount: number
  delaySeconds: number
  dryRun: boolean
  snapshotIds: string[]
  status: 'queued' | 'skipped'
}

export type HarbourJobQueue = {
  send(message: HarbourJobMessage, options?: QueueSendOptions): Promise<unknown>
}

const DEFAULT_SNAPSHOT_CLEANUP_DELAY_SECONDS = 30

export async function handleStageRunning(
  db: HarbourReadableDb & HarbourWritableDb,
  request: StageRequest,
): Promise<ControlResult> {
  const dataset = await requireDataset(db, request)
  const now = new Date().toISOString()

  if (request.phase === 'processDataset') {
    await updateDatasetStatus(db, dataset.releaseId, 'processing')
  }

  await ensureIngestRunStarted(
    db,
    dataset.releaseId,
    request.phase,
    request.stats ?? null,
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
  const dataset = await requireDataset(db, request)
  const now = new Date().toISOString()

  const updatedExistingRun = await updateLatestOpenIngestRun(
    db,
    dataset.releaseId,
    request.phase,
    'completed',
    now,
    request.stats ?? null,
  )

  if (!updatedExistingRun) {
    await upsertIngestRunStatus(
      db,
      dataset.releaseId,
      request.phase,
      'completed',
      now,
      now,
      request.stats ?? null,
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
  const dataset = await requireDataset(db, request)
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
    request.stats ?? null,
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
      request.stats ?? null,
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
  cleanupQueue?: HarbourJobQueue,
): Promise<ControlResult> {
  const dataset = await requireDataset(db, request)
  const publishedAt = new Date().toISOString()
  const datasetType = dataset.type as ResourceType
  const currentRelease = await getCurrentReleaseForDatasetId(
    db,
    dataset.datasetId,
    dataset.releaseId,
  )
  const releaseSet =
    (await resolveReleaseSetForRelease(db, dataset.releaseId, datasetType)) ??
    (await ensureDraftReleaseSetForRelease(db, datasetType, dataset))
  const snapshot = await resolveSnapshotForRelease(db, dataset.releaseId, datasetType)

  if (!snapshot) {
    throw new Error(
      `Snapshot not found for ${dataset.releaseCode} (${datasetType}/${dataset.releaseId}).`,
    )
  }

  const activeReleaseSet = await resolveActiveReleaseSetForType(db, datasetType)
  const carriedSnapshots: Array<{
    resourceType: ResourceType
    snapshotId: string
  }> = []

  if (activeReleaseSet && activeReleaseSet.id !== releaseSet.id) {
    const activeSnapshots = await listApiReleaseSetSnapshots(db, activeReleaseSet.id)

    for (const activeSnapshot of activeSnapshots) {
      if (activeSnapshot.snapshotResourceType === datasetType) {
        continue
      }

      carriedSnapshots.push({
        resourceType: activeSnapshot.snapshotResourceType,
        snapshotId: activeSnapshot.snapshotId,
      })
    }
  }

  await publishReleaseArtifacts(db, {
    carriedSnapshots,
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

  if (!request.skipSnapshotCleanup && cleanupQueue) {
    try {
      await scheduleCurrentSnapshotCleanup(db, cleanupQueue, {
        delaySeconds: DEFAULT_SNAPSHOT_CLEANUP_DELAY_SECONDS,
        resourceType: datasetType,
      })
    } catch (error) {
      console.error('Failed to schedule current snapshot cleanup after publish', {
        error: error instanceof Error ? error.message : String(error),
        releaseId: dataset.releaseId,
        type: datasetType,
      })
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

export async function handleScheduleSnapshotCleanup(
  db: HarbourReadableDb,
  cleanupQueue: HarbourJobQueue,
  request: CleanupSnapshotsRequest,
): Promise<CleanupSnapshotsResult> {
  return scheduleCurrentSnapshotCleanup(db, cleanupQueue, request)
}

async function scheduleCurrentSnapshotCleanup(
  db: HarbourReadableDb,
  cleanupQueue: HarbourJobQueue,
  request: CleanupSnapshotsRequest,
): Promise<CleanupSnapshotsResult> {
  const delaySeconds = Math.max(
    0,
    Math.floor(request.delaySeconds ?? DEFAULT_SNAPSHOT_CLEANUP_DELAY_SECONDS),
  )
  const candidates = await listCurrentSnapshotCleanupCandidates(db, {
    resourceType: request.resourceType,
    snapshotIds: request.snapshotIds,
  })
  const snapshotIds = candidates.map(candidate => candidate.snapshotId)

  if (snapshotIds.length === 0 || request.dryRun) {
    return {
      candidateCount: snapshotIds.length,
      delaySeconds,
      dryRun: Boolean(request.dryRun),
      snapshotIds,
      status: 'skipped',
    }
  }

  await cleanupQueue.send(
    {
      jobType: 'cleanupCurrentSnapshots',
      requestedAt: new Date().toISOString(),
      resourceType: request.resourceType,
      snapshotIds,
    },
    {
      delaySeconds,
    },
  )

  return {
    candidateCount: snapshotIds.length,
    delaySeconds,
    dryRun: false,
    snapshotIds,
    status: 'queued',
  }
}

async function requireDataset(
  db: HarbourReadableDb,
  {
    releaseCode,
    releaseId,
  }: {
    releaseCode?: string
    releaseId?: string
  },
) {
  const dataset = await waitForDatasetRecord(db, {
    releaseCode,
    releaseId,
  })

  if (!dataset) {
    throw new Error(`Release not found: ${releaseId ?? releaseCode ?? 'unknown'}`)
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
