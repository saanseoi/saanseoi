import {
  publishReleaseArtifacts,
  ensureDraftReleaseSetForRelease,
  ensureIngestRunStarted,
  getCurrentReleaseForDatasetId,
  listPublishedOvertureReleaseSetCohortsAtOrAfterCohortKey,
  listDraftReleaseSetsForTypeRegionAtOrAfterCohortKey,
  listCurrentApiCompositionMembersForType,
  listCurrentSnapshotCleanupCandidates,
  listApiReleaseSetSnapshots,
  resolveEarliestPublishedSnapshotForResourceTypeRegionAtOrAfterCohortKey,
  resolveLatestReleaseSetForTypeDomainCohort,
  resolvePublishedSnapshotForResourceTypeRegionCohortKey,
  resolvePublishedSnapshotsForResourceTypeRegionAtOrBeforeCohortKey,
  resolveReleaseSetForRelease,
  resolveSnapshotForRelease,
  updateLatestOpenIngestRun,
  updateDatasetStatus,
  upsertIngestRunStatus,
  waitForDatasetRecord,
} from '@repo/core/db/metaRegistry'
import {
  datasetVariantForSource,
  type HarbourJobMessage,
  type RegionCode,
  type ResourceType,
} from '@repo/core'
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
  apiCatalogRevisionCode?: string
  apiCatalogRevisionId?: string
  apiReleaseSetId?: string
  apiReleaseSetCode?: string
  apiReleaseSetStatus?: 'current' | 'draft'
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
    const datasetType = dataset.type as ResourceType
    const datasetVariant = datasetVariantForSource(datasetType, dataset.source, {
      cohortKey: dataset.cohortKey,
      datasetCode: dataset.datasetCode,
      sourceVersion: dataset.sourceVersion,
    })
    const compositionMembers = await listCurrentApiCompositionMembersForType(
      db,
      datasetType,
    )
    const datasetMember =
      compositionMembers.find(
        member =>
          member.resourceType === datasetType && member.variant === datasetVariant,
      ) ?? resolveTransformMember(compositionMembers, datasetType, datasetVariant)
    if (!datasetMember) {
      throw new ControlRequestError(
        `No current API composition member accepts ${datasetType}/${datasetVariant}.`,
      )
    }
    const domainCode = datasetMember.domainCode
    const isCenstatdGeometry =
      datasetType === 'divisionArea' && dataset.source === 'hkgov-censtatd'
    const censtatdReleaseSetCohorts = isCenstatdGeometry
      ? await listPublishedOvertureReleaseSetCohortsAtOrAfterCohortKey(
          db,
          'division',
          dataset.regionCode as RegionCode,
          dataset.cohortKey,
        )
      : []

    if (isCenstatdGeometry && censtatdReleaseSetCohorts.length === 0) {
      throw new ControlRequestError(
        `No published Overture division release set is available on or after C&SD cohort ${dataset.cohortKey}.`,
      )
    }

    const currentRelease = await getCurrentReleaseForDatasetId(
      db,
      dataset.datasetId,
      dataset.releaseId,
    )
    const existingReleaseSet = isCenstatdGeometry
      ? null
      : await resolveReleaseSetForRelease(
          db,
          dataset.releaseId,
          datasetType,
          domainCode,
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
    const releaseSets = isCenstatdGeometry
      ? await (async () => {
          const releaseSets = []
          // Create each revision in the same chronological order in which it
          // is published, so the registry's publication ordering is stable.
          for (const cohortKey of censtatdReleaseSetCohorts) {
            releaseSets.push(
              await ensureDraftReleaseSetForRelease(
                db,
                'division',
                { cohortKey, regionCode: dataset.regionCode },
                { domainCode },
              ),
            )
          }
          return releaseSets
        })()
      : draftReleaseSets.length > 0
        ? draftReleaseSets
        : [
            existingReleaseSet ??
              (await ensureDraftReleaseSetForRelease(db, datasetType, dataset, {
                domainCode,
              })),
          ]
    const snapshot = await waitForSnapshotForRelease(db, dataset.releaseId, datasetType)

    if (!snapshot) {
      throw new ControlRequestError(
        `Snapshot not found for ${dataset.releaseCode} (${datasetType}/${dataset.releaseId}).`,
      )
    }

    const domainMembers = compositionMembers.filter(
      member => member.domainCode === domainCode,
    )
    let selectedApiCatalogRevision: Awaited<
      ReturnType<typeof publishReleaseArtifacts>
    > | null = null
    let selectedReleaseSetStatus: 'current' | 'draft' = 'draft'
    const newestReleaseSetIndex = releaseSets.length - 1
    const publishedAtMs = Date.now()
    for (const [index, releaseSet] of releaseSets.entries()) {
      const releaseSetCohortKey =
        parseReleaseSetCohortKey(releaseSet.code) ?? dataset.cohortKey
      const previousReleaseSet = await resolveLatestReleaseSetForTypeDomainCohort(
        db,
        datasetType,
        domainCode,
        dataset.regionCode as RegionCode,
        releaseSetCohortKey,
      )
      const carriedSnapshots = await resolveCarriedSnapshots(
        db,
        previousReleaseSet?.id === releaseSet.id ? null : previousReleaseSet,
        datasetType,
        datasetVariant,
      )
      const requiredMembers = new Set(
        domainMembers
          .filter(member => member.isRequired)
          .map(member => releaseSetMemberKey(member.resourceType, member.variant)),
      )
      const satisfiedRequiredMembers = new Set<string>()

      for (const member of domainMembers) {
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
      if (isCenstatdGeometry && !releaseSetIsComplete) {
        throw new ControlRequestError(
          `Cannot enrich incomplete Overture division release set ${releaseSet.code} with C&SD geometry.`,
        )
      }
      const isNewestReleaseSet = index === newestReleaseSetIndex
      const shouldPublishReleaseSet = releaseSetIsComplete && isNewestReleaseSet
      if (isNewestReleaseSet && shouldPublishReleaseSet) {
        selectedReleaseSetStatus = 'current'
      }
      const apiCatalogRevision = await publishReleaseArtifacts(db, {
        carriedSnapshots,
        currentRelease,
        currentReleaseIsCorrected: currentRelease
          ? isCorrectedRelease(currentRelease.sourceVersion, dataset.sourceVersion)
          : false,
        dataset,
        // Preserve chronological ordering in registry queries even when this
        // backfill completes within one clock tick.
        publishedAt: new Date(publishedAtMs + index).toISOString(),
        releaseSetId: releaseSet.id,
        snapshotId: snapshot.id,
        type: datasetType,
        // The C&SD geometry is a post-hoc optional enrichment. Every affected
        // Overture cohort needs an immutable published revision; the newest
        // one becomes current and the older revisions become archived.
        deferApiReleaseSet: !isCenstatdGeometry && !shouldPublishReleaseSet,
        publishApiCatalogRevision: shouldPublishReleaseSet,
        updateDatasetRelease: isNewestReleaseSet,
      })
      if (shouldPublishReleaseSet) {
        selectedApiCatalogRevision = apiCatalogRevision
      }
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
      apiCatalogRevisionCode: selectedApiCatalogRevision?.code,
      apiCatalogRevisionId: selectedApiCatalogRevision?.id,
      apiReleaseSetId: releaseSets.at(-1)?.id,
      apiReleaseSetCode: releaseSets.at(-1)?.code,
      apiReleaseSetStatus: selectedReleaseSetStatus,
      datasetId: dataset.releaseCode,
      releaseCode: dataset.releaseCode,
      releaseId: dataset.releaseId,
      phase: null,
      snapshotId: snapshot.id,
      status: 'current',
    }
  })
}

/**
 * Geometry transforms are materialized for efficient reads, but they do not
 * declare independent API-composition slots. A derived variant therefore
 * inherits the source variant's domain and release-set membership.
 */
function resolveTransformMember(
  compositionMembers: Awaited<
    ReturnType<typeof listCurrentApiCompositionMembersForType>
  >,
  datasetType: ResourceType,
  datasetVariant: string,
) {
  const sourceVariant = datasetVariant.match(
    /^(hkgov-censtatd:(?:2016|2021)):simplified$/,
  )?.[1]
  if (!sourceVariant) return undefined

  return compositionMembers.find(
    member => member.resourceType === datasetType && member.variant === sourceVariant,
  )
}

function releaseSetMemberKey(resourceType: ResourceType, variant: string) {
  return `${resourceType}:${variant}`
}

async function resolveCarriedSnapshots(
  db: HarbourReadableDb,
  activeReleaseSet: Awaited<
    ReturnType<typeof resolveLatestReleaseSetForTypeDomainCohort>
  >,
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
    const publisherCode = member.variant.split(':')[0] ?? member.variant
    const snapshots =
      await resolvePublishedSnapshotsForResourceTypeRegionAtOrBeforeCohortKey(
        db,
        member.resourceType,
        regionCode,
        cohortKey,
        {
          publisherCode,
          variant: member.variant.includes(':') ? member.variant : undefined,
        },
      )

    if (member.cohortMatchingMode === 'latest_at_or_before_cohort_per_dataset') {
      return snapshots
    }

    if (member.cohortMatchingMode === 'latest_at_or_before_or_earliest_after_cohort') {
      if (snapshots.length > 0) return snapshots

      const nextSnapshot =
        await resolveEarliestPublishedSnapshotForResourceTypeRegionAtOrAfterCohortKey(
          db,
          member.resourceType,
          regionCode,
          cohortKey,
          { publisherCode: member.variant },
        )
      return nextSnapshot ? [nextSnapshot] : []
    }

    return snapshots.filter(snapshot => snapshot.cohortKey === cohortKey)
  }

  const snapshot = await resolvePublishedSnapshotForResourceTypeRegionCohortKey(
    db,
    member.resourceType,
    regionCode,
    cohortKey,
  )
  return snapshot ? [snapshot] : []
}

function parseReleaseSetCohortKey(releaseSetCode?: string) {
  return (
    releaseSetCode?.match(
      /^data-[a-z0-9]+-divisions-(.+?)(?:-r\d+)?(?:--[a-z0-9-]+)?$/i,
    )?.[1] ?? null
  )
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
