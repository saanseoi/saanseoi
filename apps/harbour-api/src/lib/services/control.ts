import {
  publishReleaseArtifacts,
  ensureDraftReleaseSetForRelease,
  ensureIngestRunStarted,
  getCurrentReleaseForDatasetId,
  listDraftReleaseSetsForTypeRegionAtOrAfterCohortKey,
  listCurrentApiCompositionMembersForType,
  listCurrentSnapshotCleanupCandidates,
  listApiReleaseSetSnapshots,
  resolveActiveReleaseSetForType,
  resolvePublishedSnapshotForResourceTypeRegionCohortKey,
  resolvePublishedSnapshotsForResourceTypeRegionAtOrBeforeCohortKey,
  resolveReleaseSetForRelease,
  resolveSnapshotForRelease,
  updateLatestOpenIngestRun,
  updateDatasetStatus,
  upsertIngestRunStatus,
  waitForDatasetRecord,
} from '@repo/core/db/metaRegistry'
import type { HarbourJobMessage, RegionCode, ResourceType } from '@repo/core'
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
  apiReleaseSetId?: string
  apiReleaseSetCode?: string
  datasetId: string
  releaseCode: string
  releaseId: string
  phase: string | null
  snapshotId?: string
  status: string
}

type CleanupSnapshotsResult = {
  candidateCount: number
  delaySeconds: number
  dryRun: boolean
  snapshotIds: string[]
  status: 'queued' | 'skipped'
}

export class ControlRequestError extends Error {}

export type HarbourJobQueue = {
  send(message: HarbourJobMessage, options?: QueueSendOptions): Promise<unknown>
}

const DEFAULT_SNAPSHOT_CLEANUP_DELAY_SECONDS = 30
const PUBLISH_SNAPSHOT_WAIT_LIMIT = 20
const PUBLISH_SNAPSHOT_WAIT_DELAY_MS = 250
const TRANSIENT_CONTROL_RETRY_LIMIT = 4
const TRANSIENT_CONTROL_RETRY_DELAY_MS = 50

export async function handleStageRunning(
  db: HarbourReadableDb & HarbourWritableDb,
  request: StageRequest,
): Promise<ControlResult> {
  return runWithTransientControlRetry(async () => {
    const dataset = await requireDataset(db, request)
    const now = new Date().toISOString()

    if (request.phase === 'processDataset') {
      await updateDatasetStatus(db, dataset.releaseId, 'processing')
    }

    if (isAddressSqlGenerationProgressPhase(request.phase)) {
      await upsertIngestRunStatus(
        db,
        dataset.releaseId,
        request.phase,
        'running',
        now,
        null,
        request.stats ?? null,
      )
    } else {
      await ensureIngestRunStarted(
        db,
        dataset.releaseId,
        request.phase,
        request.stats ?? null,
        now,
      )
    }

    return {
      datasetId: dataset.releaseCode,
      releaseCode: dataset.releaseCode,
      releaseId: dataset.releaseId,
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
  })
}

export async function handleStageFailed(
  db: HarbourReadableDb & HarbourWritableDb,
  request: StageRequest,
): Promise<ControlResult> {
  return runWithTransientControlRetry(async () => {
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
  })
}

export async function handlePublishDataset(
  db: HarbourReadableDb & HarbourWritableDb,
  request: PublishRequest,
  cleanupQueue?: HarbourJobQueue,
): Promise<ControlResult> {
  return runWithTransientControlRetry(async () => {
    const dataset = await requireDataset(db, request)
    const publishedAt = new Date().toISOString()
    const datasetType = dataset.type as ResourceType
    const datasetVariant = resolveDatasetVariant(datasetType, dataset.source)
    const currentRelease = await getCurrentReleaseForDatasetId(
      db,
      dataset.datasetId,
      dataset.releaseId,
    )
    const activeReleaseSet = await resolveActiveReleaseSetForType(db, datasetType)
    const existingReleaseSet = await resolveReleaseSetForRelease(
      db,
      dataset.releaseId,
      datasetType,
    )
    const draftReleaseSets =
      datasetVariant === 'hkgov-had'
        ? await listDraftReleaseSetsForTypeRegionAtOrAfterCohortKey(
            db,
            datasetType,
            dataset.regionCode as RegionCode,
            dataset.cohortKey,
          )
        : []
    const releaseSets =
      draftReleaseSets.length > 0
        ? draftReleaseSets
        : [
            existingReleaseSet ??
              (await ensureDraftReleaseSetForRelease(db, datasetType, dataset)),
          ]
    const snapshot = await waitForSnapshotForRelease(db, dataset.releaseId, datasetType)

    if (!snapshot) {
      throw new ControlRequestError(
        `Snapshot not found for ${dataset.releaseCode} (${datasetType}/${dataset.releaseId}).`,
      )
    }

    const compositionMembers = await listCurrentApiCompositionMembersForType(
      db,
      datasetType,
    )
    for (const [index, releaseSet] of releaseSets.entries()) {
      const releaseSetCohortKey =
        parseReleaseSetCohortKey(releaseSet.code) ?? dataset.cohortKey
      const carriedSnapshots = await resolveCarriedSnapshots(
        db,
        activeReleaseSet?.id === releaseSet.id ? null : activeReleaseSet,
        datasetType,
        datasetVariant,
      )
      const requiredMembers = new Set(
        compositionMembers
          .filter(member => member.isRequired)
          .map(member => releaseSetMemberKey(member.resourceType, member.variant)),
      )
      const satisfiedRequiredMembers = new Set<string>()

      for (const member of compositionMembers) {
        const memberKey = releaseSetMemberKey(member.resourceType, member.variant)
        if (member.resourceType === datasetType && member.variant === datasetVariant) {
          if (member.isRequired) satisfiedRequiredMembers.add(memberKey)
          continue
        }

        const supportingSnapshots = await resolveSupportingSnapshotsForMember(
          db,
          member,
          dataset.regionCode as RegionCode,
          releaseSetCohortKey,
        )

        if (supportingSnapshots.length === 0) continue
        if (member.isRequired) satisfiedRequiredMembers.add(memberKey)

        for (const supportingSnapshot of supportingSnapshots) {
          carriedSnapshots.push({
            resourceType: member.resourceType,
            snapshotId: supportingSnapshot.id,
            variant: member.variant,
          })
        }
      }

      const releaseSetIsComplete = [...requiredMembers].every(memberKey =>
        satisfiedRequiredMembers.has(memberKey),
      )
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
        // Several drafts may use the same cohort-independent geometry. Keep
        // older sets draft and activate only the newest complete candidate.
        deferApiReleaseSet: !releaseSetIsComplete || index > 0,
      })
    }

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
      apiReleaseSetId: releaseSets[0]?.id,
      apiReleaseSetCode: releaseSets[0]?.code,
      datasetId: dataset.releaseCode,
      releaseCode: dataset.releaseCode,
      releaseId: dataset.releaseId,
      phase: null,
      snapshotId: snapshot.id,
      status: 'current',
    }
  })
}

function releaseSetMemberKey(resourceType: ResourceType, variant: string) {
  return `${resourceType}:${variant}`
}

async function resolveCarriedSnapshots(
  db: HarbourReadableDb,
  activeReleaseSet: Awaited<ReturnType<typeof resolveActiveReleaseSetForType>>,
  datasetType: ResourceType,
  datasetVariant: string,
) {
  if (!activeReleaseSet) return []

  const activeSnapshots = await listApiReleaseSetSnapshots(db, activeReleaseSet.id)
  return activeSnapshots.flatMap(activeSnapshot =>
    activeSnapshot.snapshotResourceType === datasetType &&
    activeSnapshot.variant === datasetVariant
      ? []
      : [
          {
            resourceType: activeSnapshot.snapshotResourceType,
            snapshotId: activeSnapshot.snapshotId,
            variant: activeSnapshot.variant,
          },
        ],
  )
}

async function resolveSupportingSnapshotsForMember(
  db: HarbourReadableDb,
  member: Awaited<ReturnType<typeof listCurrentApiCompositionMembersForType>>[number],
  regionCode: RegionCode,
  cohortKey: string,
) {
  if (member.variant !== 'default') {
    const snapshots =
      await resolvePublishedSnapshotsForResourceTypeRegionAtOrBeforeCohortKey(
        db,
        member.resourceType,
        regionCode,
        cohortKey,
        { publisherCode: member.variant },
      )

    return member.selectionMode === 'latest_at_or_before_cohort_per_dataset'
      ? snapshots
      : snapshots.filter(snapshot => snapshot.cohortKey === cohortKey)
  }

  const snapshot = await resolvePublishedSnapshotForResourceTypeRegionCohortKey(
    db,
    member.resourceType,
    regionCode,
    cohortKey,
  )
  return snapshot ? [snapshot] : []
}

function resolveDatasetVariant(type: ResourceType, source: string) {
  return type === 'divisionArea' || type === 'divisionBoundary' ? source : 'default'
}

function parseReleaseSetCohortKey(releaseSetCode?: string) {
  return releaseSetCode?.match(/^data-[a-z0-9]+-divisions-(.+)-\d+$/i)?.[1] ?? null
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
    throw new ControlRequestError(
      `Release not found: ${releaseId ?? releaseCode ?? 'unknown'}`,
    )
  }

  return dataset
}

async function waitForSnapshotForRelease(
  db: HarbourReadableDb,
  releaseId: string,
  datasetType: ResourceType,
) {
  for (let attempt = 0; attempt <= PUBLISH_SNAPSHOT_WAIT_LIMIT; attempt += 1) {
    const snapshot = await resolveSnapshotForRelease(db, releaseId, datasetType)

    if (snapshot) {
      return snapshot
    }

    if (attempt < PUBLISH_SNAPSHOT_WAIT_LIMIT) {
      await sleep(PUBLISH_SNAPSHOT_WAIT_DELAY_MS)
    }
  }

  return null
}

function stringifyOptional(value?: Record<string, unknown>) {
  return value ? JSON.stringify(value) : null
}

function isAddressSqlGenerationProgressPhase(phase: string) {
  return (
    phase === 'normalizeAddressSql' ||
    phase === 'generateAddressSqlSource' ||
    phase === 'generateAddressSqlHistory' ||
    phase === 'generateAddressSqlCurrent'
  )
}

export function isTransientControlError(error: unknown) {
  return collectErrorMessages(error).some(message =>
    /sqlite_busy|database is locked|failed to parse body as json, got: error: internal error|d1_error: .*internal error/i.test(
      message,
    ),
  )
}

async function runWithTransientControlRetry<T>(
  operation: () => Promise<T>,
  attempt = 0,
): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    if (!isTransientControlError(error) || attempt >= TRANSIENT_CONTROL_RETRY_LIMIT) {
      throw error
    }

    await sleep(TRANSIENT_CONTROL_RETRY_DELAY_MS * (attempt + 1))
    return runWithTransientControlRetry(operation, attempt + 1)
  }
}

function collectErrorMessages(error: unknown) {
  const messages: string[] = []
  let current: unknown = error
  let depth = 0

  while (current instanceof Error && depth < 8) {
    messages.push(current.message)
    current = current.cause
    depth += 1
  }

  return messages
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
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
