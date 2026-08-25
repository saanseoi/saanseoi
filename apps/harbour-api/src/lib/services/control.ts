import {
  publishReleaseArtefacts,
  ensureDraftReleaseSetForRelease,
  ensureIngestRunStarted,
  getDatasetRecordByReleaseId,
  getCurrentReleaseForDatasetId,
  listDraftReleaseSetPrimaryReleases,
  listDraftReleaseSets,
  listSnapshotsForRelease,
  listOvertureReleaseSetCohortsAtOrAfterCohortKey,
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
  publisherCodeForSource,
  type HarbourJobMessage,
  type RegionCode,
  type ResourceType,
} from '@repo/core'
import type { HarbourReadableDb, HarbourWritableDb } from '@repo/core/db/types'
import {
  and,
  eq,
  inArray,
  metaApiComposition,
  metaApiReleaseSets,
  metaApiVersions,
  metaDatasets,
  metaPublisherI18n,
  metaPublishers,
  metaReleases,
  type ApiFamilyType,
} from '@repo/db'

import type { ReleaseSetPublication } from './releaseDiscord'

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

export type ReconcileDraftReleaseSetsRequest = {
  apiFamily?: ApiFamilyType
  regionCode?: RegionCode
}

export type BootstrapStatsReleaseSetsRequest = {
  regionCode?: RegionCode
}

type ControlResult = {
  apiCatalogRevisionCode?: string
  apiCatalogRevisionId?: string
  apiReleaseSetId?: string
  apiReleaseSetCode?: string
  apiReleaseSetStatus?: 'current' | 'draft'
  /** Release-set publications that crossed draft -> current in this call. */
  apiReleaseSetAnnouncements?: ReleaseSetPublication[]
  apiReleaseSetPublications?: ReleaseSetPublication[]
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

export type ReconcileDraftReleaseSetsResult = {
  inspected: number
  pendingReleaseSetCodes: string[]
  /** Release-set publications that crossed draft -> current in this call. */
  publishedReleaseSetAnnouncements: ReleaseSetPublication[]
  publishedReleaseSetPublications: ReleaseSetPublication[]
  publishedReleaseSetCodes: string[]
}

export type BootstrapStatsReleaseSetsResult = {
  createdReleaseSetCodes: string[]
  inspectedSnapshots: number
  skippedCohortKeys: string[]
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
  options: {
    reconcileDraftReleaseSet?: boolean
    releaseSet?: {
      code: string
      cohortKey?: string | null
      id: string
      status?: 'draft' | 'current' | 'archived'
    }
  } = {},
): Promise<ControlResult> {
  return runWithTransientControlRetry(async () => {
    const dataset = await requireDataset(db, request)
    const datasetType = dataset.type as ResourceType
    const datasetVariant = datasetVariantForSource(datasetType, dataset.source, {
      cohortKey: dataset.cohortKey,
      datasetCode: dataset.datasetCode,
      sourceVariant: dataset.sourceVariant,
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
    // Only the Geographic domain attaches separately selectable C&SD geometry to
    // Overture cohorts. Publisher-defined C&SD domains (such as Housing Market
    // Areas) publish their own canonical division and divisionArea release set.
    const isCenstatdGeographicGeometry =
      datasetType === 'divisionArea' &&
      dataset.source === 'hkgov-censtatd' &&
      domainCode === 'geographic'
    const censtatdReleaseSetCohorts = isCenstatdGeographicGeometry
      ? await listOvertureReleaseSetCohortsAtOrAfterCohortKey(
          db,
          'division',
          dataset.regionCode as RegionCode,
          dataset.cohortKey,
        )
      : []

    if (isCenstatdGeographicGeometry && censtatdReleaseSetCohorts.length === 0) {
      throw new ControlRequestError(
        `No Overture division release set is available on or after C&SD cohort ${dataset.cohortKey}.`,
      )
    }

    // Census cohorts are independently selectable required inputs. Publishing
    // a later one must not supersede the earlier source release.
    const currentRelease =
      isCenstatdGeographicGeometry || options.reconcileDraftReleaseSet
        ? null
        : await getCurrentReleaseForDatasetId(
            db,
            dataset.datasetId,
            datasetType,
            dataset.releaseId,
          )
    const existingReleaseSet = isCenstatdGeographicGeometry
      ? null
      : datasetType === 'divisionStatistic'
        ? (options.releaseSet ?? null)
        : (options.releaseSet ??
          (await resolveReleaseSetForRelease(
            db,
            dataset.releaseId,
            datasetType,
            domainCode,
          )))
    const draftReleaseSets =
      datasetVariant === 'hkgov-had'
        ? await listDraftReleaseSetsForTypeRegionAtOrAfterCohortKey(
            db,
            datasetType,
            dataset.regionCode as RegionCode,
            dataset.cohortKey,
          )
        : []
    const snapshots = await waitForSnapshotsForRelease(
      db,
      dataset.releaseId,
      datasetType,
      datasetVariant,
    )
    const firstSnapshot = snapshots[0]
    if (!firstSnapshot) {
      throw new ControlRequestError(
        `Snapshot not found for ${dataset.releaseCode} (${datasetType}/${dataset.releaseId}).`,
      )
    }

    const releaseSets = isCenstatdGeographicGeometry
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
      : datasetType === 'divisionStatistic'
        ? await (async () => {
            if (options.releaseSet) return [options.releaseSet]
            const sets = []
            for (const snapshot of snapshots) {
              sets.push(
                await ensureDraftReleaseSetForRelease(
                  db,
                  datasetType,
                  { cohortKey: snapshot.cohortKey, regionCode: dataset.regionCode },
                  { domainCode },
                ),
              )
            }
            return sets
          })()
        : draftReleaseSets.length > 0
          ? draftReleaseSets
          : [
              existingReleaseSet ??
                (await ensureDraftReleaseSetForRelease(db, datasetType, dataset, {
                  domainCode,
                })),
            ]
    const publicationTargets = releaseSets.map(releaseSet => {
      if (datasetType !== 'divisionStatistic') {
        return { releaseSet, snapshot: firstSnapshot }
      }
      const cohortKey = releaseSet.cohortKey ?? dataset.cohortKey
      const snapshot = snapshots.find(candidate => candidate.cohortKey === cohortKey)
      if (!snapshot) {
        throw new ControlRequestError(
          `Statistic snapshot not found for release-set cohort ${cohortKey}.`,
        )
      }
      return { releaseSet, snapshot }
    })

    const domainMembers = compositionMembers.filter(
      member => member.domainCode === domainCode,
    )
    let selectedApiCatalogRevision: Awaited<
      ReturnType<typeof publishReleaseArtefacts>
    > | null = null
    let selectedReleaseSetStatus: 'current' | 'draft' = 'draft'
    const apiReleaseSetPublications: NonNullable<
      ControlResult['apiReleaseSetPublications']
    > = []
    const apiReleaseSetAnnouncements: NonNullable<
      ControlResult['apiReleaseSetAnnouncements']
    > = []
    const newestReleaseSetIndex = publicationTargets.length - 1
    const publishedAtMs = Date.now()
    const publisherName = await resolvePublisherName(db, dataset.source)
    for (const [index, publicationTarget] of publicationTargets.entries()) {
      const { releaseSet, snapshot } = publicationTarget
      const releaseSetWasDraft =
        !('status' in releaseSet) || releaseSet.status === 'draft'
      const releaseSetCohortKey = releaseSet.cohortKey ?? dataset.cohortKey
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
      const isNewestReleaseSet = index === newestReleaseSetIndex
      const shouldPublishReleaseSet =
        releaseSetIsComplete &&
        (isCenstatdGeographicGeometry ||
          datasetType === 'divisionStatistic' ||
          isNewestReleaseSet)
      if (isNewestReleaseSet && shouldPublishReleaseSet) {
        selectedReleaseSetStatus = 'current'
      }
      const publishedAt = new Date(publishedAtMs + index).toISOString()
      const apiCatalogRevision = await publishReleaseArtefacts(db, {
        carriedSnapshots,
        currentRelease,
        currentReleaseIsCorrected: currentRelease
          ? isCorrectedRelease(currentRelease.sourceVersion, dataset.sourceVersion)
          : false,
        dataset,
        // Preserve chronological ordering in registry queries even when this
        // backfill completes within one clock tick.
        publishedAt,
        releaseSetId: releaseSet.id,
        snapshotId: snapshot.id,
        type: datasetType,
        // Each statistic reference period is independently publishable. Other
        // families may still wait for required companion snapshots.
        deferApiReleaseSet: !shouldPublishReleaseSet,
        publishApiCatalogRevision: shouldPublishReleaseSet,
        updateDatasetRelease: !options.reconcileDraftReleaseSet && isNewestReleaseSet,
      })
      if (shouldPublishReleaseSet) {
        selectedApiCatalogRevision = apiCatalogRevision
        const publishedReleaseSetStatus = await db
          .select({ status: metaApiReleaseSets.status })
          .from(metaApiReleaseSets)
          .where(eq(metaApiReleaseSets.id, releaseSet.id))
          .limit(1)
          .get()
        const publishedReleaseSet = await requireReleaseSetPublicationMetadata(
          db,
          releaseSet.id,
          {
            apiFamily: dataset.theme,
            cohortKey: releaseSetCohortKey,
            domainCode,
            regionCode: dataset.regionCode,
          },
        )
        const publication = {
          apiCatalogRevisionCode: apiCatalogRevision?.code,
          apiFamily: publishedReleaseSet.apiFamily,
          apiReleaseSetCode: releaseSet.code,
          cohortKey: publishedReleaseSet.cohortKey,
          description: publishedReleaseSet.description,
          domainCode: publishedReleaseSet.domainCode,
          domainName: publishedReleaseSet.domainName,
          publishedAt,
          publisherName,
          regionCode: publishedReleaseSet.regionCode,
          revision: publishedReleaseSet.revision,
        }
        apiReleaseSetPublications.push(publication)
        if (releaseSetWasDraft && publishedReleaseSetStatus?.status === 'current') {
          apiReleaseSetAnnouncements.push(publication)
        }
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
      apiReleaseSetAnnouncements,
      apiReleaseSetPublications,
      datasetId: dataset.releaseCode,
      releaseCode: dataset.releaseCode,
      releaseId: dataset.releaseId,
      phase: null,
      snapshotId: publicationTargets.at(-1)?.snapshot.id,
      status: 'current',
    }
  })
}

/**
 * Re-evaluates every selected draft set against its already-published source
 * snapshots. This makes a resumed backfill safe: no source release is
 * re-ingested and no source-release lifecycle state is changed.
 */
export async function handleReconcileDraftReleaseSets(
  db: HarbourReadableDb & HarbourWritableDb,
  request: ReconcileDraftReleaseSetsRequest = {},
): Promise<ReconcileDraftReleaseSetsResult> {
  return runWithTransientControlRetry(async () => {
    const [draftReleaseSets, primaryReleases] = await Promise.all([
      listDraftReleaseSets(db, request),
      listDraftReleaseSetPrimaryReleases(db, request),
    ])
    const primaryReleaseByReleaseSetId = new Map(
      primaryReleases.map(release => [release.apiReleaseSetId, release]),
    )
    const publishedReleaseSetCodes: string[] = []
    const publishedReleaseSetAnnouncements: ReleaseSetPublication[] = []
    const publishedReleaseSetPublications: ReleaseSetPublication[] = []
    const pendingReleaseSetCodes: string[] = []

    for (const releaseSet of draftReleaseSets) {
      const primaryRelease = primaryReleaseByReleaseSetId.get(releaseSet.id)
      if (!primaryRelease) {
        pendingReleaseSetCodes.push(releaseSet.code)
        continue
      }

      const result = await handlePublishDataset(
        db,
        { releaseId: primaryRelease.releaseId, skipSnapshotCleanup: true },
        undefined,
        { reconcileDraftReleaseSet: true, releaseSet },
      )
      if (
        result.apiReleaseSetPublications?.some(
          publication => publication.apiReleaseSetCode === releaseSet.code,
        )
      ) {
        publishedReleaseSetCodes.push(releaseSet.code)
        publishedReleaseSetAnnouncements.push(
          ...(result.apiReleaseSetAnnouncements ?? []).filter(
            publication => publication.apiReleaseSetCode === releaseSet.code,
          ),
        )
        publishedReleaseSetPublications.push(
          ...(result.apiReleaseSetPublications ?? []).filter(
            publication => publication.apiReleaseSetCode === releaseSet.code,
          ),
        )
      } else {
        pendingReleaseSetCodes.push(releaseSet.code)
      }
    }

    return {
      inspected: draftReleaseSets.length,
      pendingReleaseSetCodes,
      publishedReleaseSetAnnouncements,
      publishedReleaseSetPublications,
      publishedReleaseSetCodes,
    }
  })
}

/**
 * Creates the initial Statistics release set for every cohort that has prepared
 * source snapshots but no published release set yet. This is intentionally a
 * one-off launch operation: routine uploads continue to create later immutable
 * revisions for a cohort.
 */
export async function handleBootstrapStatsReleaseSets(
  db: HarbourReadableDb & HarbourWritableDb,
  request: BootstrapStatsReleaseSetsRequest = {},
): Promise<BootstrapStatsReleaseSetsResult> {
  return runWithTransientControlRetry(async () => {
    const regionCode = request.regionCode ?? 'hk'
    const members = (
      await listCurrentApiCompositionMembersForType(db, 'divisionStatistic')
    ).filter(member => member.domainCode === 'official')
    const memberVariants = new Set(members.map(member => member.variant))
    const sourceReleases = await db
      .select({ id: metaReleases.id })
      .from(metaReleases)
      .innerJoin(metaDatasets, eq(metaReleases.datasetId, metaDatasets.id))
      .where(
        and(
          eq(metaDatasets.regionCode, regionCode),
          eq(metaDatasets.theme, 'stats'),
          eq(metaReleases.resourceType, 'divisionStatistic'),
          inArray(metaReleases.status, ['staged', 'processing', 'published']),
        ),
      )
      .all()

    const candidatesByCohort = new Map<
      string,
      Array<{
        dataset: NonNullable<Awaited<ReturnType<typeof getDatasetRecordByReleaseId>>>
        snapshotId: string
        variant: string
      }>
    >()

    for (const sourceRelease of sourceReleases) {
      const dataset = await getDatasetRecordByReleaseId(db, sourceRelease.id)
      if (!dataset) continue
      const variant = datasetVariantForSource('divisionStatistic', dataset.source, {
        cohortKey: dataset.cohortKey,
        datasetCode: dataset.datasetCode,
        sourceVariant: dataset.sourceVariant,
        sourceVersion: dataset.sourceVersion,
      })
      if (!memberVariants.has(variant)) continue

      const snapshots = await listSnapshotsForRelease(
        db,
        sourceRelease.id,
        'divisionStatistic',
        {
          variant,
        },
      )
      for (const snapshot of snapshots) {
        if (snapshot.status === 'archived') continue
        const candidates = candidatesByCohort.get(snapshot.cohortKey) ?? []
        candidates.push({ dataset, snapshotId: snapshot.id, variant })
        candidatesByCohort.set(snapshot.cohortKey, candidates)
      }
    }

    const createdReleaseSetCodes: string[] = []
    const skippedCohortKeys: string[] = []
    let inspectedSnapshots = 0

    for (const [cohortKey, candidates] of [...candidatesByCohort.entries()].sort(
      ([left], [right]) => left.localeCompare(right),
    )) {
      inspectedSnapshots += candidates.length
      const existing = await resolveLatestReleaseSetForTypeDomainCohort(
        db,
        'divisionStatistic',
        'official',
        regionCode,
        cohortKey,
      )
      if (existing) {
        skippedCohortKeys.push(cohortKey)
        continue
      }

      const existingDraft = await db
        .select({ code: metaApiReleaseSets.code })
        .from(metaApiReleaseSets)
        .innerJoin(
          metaApiVersions,
          eq(metaApiReleaseSets.apiVersionId, metaApiVersions.id),
        )
        .where(
          and(
            eq(metaApiVersions.code, 'api-stats-v0.1'),
            eq(metaApiReleaseSets.regionCode, regionCode),
            eq(metaApiReleaseSets.domainCode, 'official'),
            eq(metaApiReleaseSets.cohortKey, cohortKey),
            eq(metaApiReleaseSets.status, 'draft'),
          ),
        )
        .limit(1)
        .get()
      if (existingDraft && !existingDraft.code.endsWith('-r0')) {
        skippedCohortKeys.push(cohortKey)
        continue
      }

      const snapshotIdsByVariant = new Map<string, string>()
      for (const candidate of candidates) {
        const previousSnapshotId = snapshotIdsByVariant.get(candidate.variant)
        if (previousSnapshotId && previousSnapshotId !== candidate.snapshotId) {
          throw new ControlRequestError(
            `Cannot bootstrap Statistics cohort ${cohortKey}: multiple snapshots are available for ${candidate.variant}.`,
          )
        }
        snapshotIdsByVariant.set(candidate.variant, candidate.snapshotId)
      }

      const releaseSet = await ensureDraftReleaseSetForRelease(
        db,
        'divisionStatistic',
        { cohortKey, regionCode },
        { domainCode: 'official', explicitInitialRevision: true },
      )
      const orderedCandidates = candidates
        .slice()
        .sort(
          (left, right) =>
            left.variant.localeCompare(right.variant) ||
            left.snapshotId.localeCompare(right.snapshotId),
        )
      const finalCandidate = orderedCandidates.at(-1)
      if (!finalCandidate) continue

      for (const candidate of orderedCandidates) {
        await publishReleaseArtefacts(db, {
          carriedSnapshots: [],
          currentRelease: null,
          currentReleaseIsCorrected: false,
          dataset: candidate.dataset,
          publishedAt: new Date().toISOString(),
          releaseSetId: releaseSet.id,
          snapshotId: candidate.snapshotId,
          type: 'divisionStatistic',
          deferApiReleaseSet: true,
        })
      }

      await publishReleaseArtefacts(db, {
        carriedSnapshots: [],
        currentRelease: null,
        currentReleaseIsCorrected: false,
        dataset: finalCandidate.dataset,
        publishedAt: new Date().toISOString(),
        releaseSetId: releaseSet.id,
        snapshotId: finalCandidate.snapshotId,
        type: 'divisionStatistic',
      })
      createdReleaseSetCodes.push(releaseSet.code)
    }

    return { createdReleaseSetCodes, inspectedSnapshots, skippedCohortKeys }
  })
}

/**
 * Geometry transforms are materialised for efficient reads, but they do not
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
    const datasetCode = member.variant.startsWith('ds-') ? member.variant : undefined
    const source = member.variant.split(':')[0] ?? member.variant
    const publisherCode = datasetCode ? undefined : publisherCodeForSource(source)
    const snapshots =
      await resolvePublishedSnapshotsForResourceTypeRegionAtOrBeforeCohortKey(
        db,
        member.resourceType,
        regionCode,
        cohortKey,
        {
          datasetCode,
          publisherCode,
          variant: member.variant,
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
          { datasetCode, publisherCode },
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

async function resolvePublisherName(db: HarbourReadableDb, publisherCode: string) {
  const publisher = await db
    .select({ name: metaPublisherI18n.name })
    .from(metaPublisherI18n)
    .innerJoin(metaPublishers, eq(metaPublisherI18n.publisherId, metaPublishers.id))
    .where(
      and(eq(metaPublishers.code, publisherCode), eq(metaPublisherI18n.locale, 'en')),
    )
    .limit(1)
    .get()

  return publisher?.name ?? publisherCode
}

async function requireReleaseSetPublicationMetadata(
  db: HarbourReadableDb,
  releaseSetId: string,
  fallback: {
    apiFamily: string
    cohortKey: string
    domainCode: string
    regionCode: string
  },
) {
  const releaseSet = await db
    .select({
      apiFamily: metaApiVersions.familyType,
      apiVersionId: metaApiReleaseSets.apiVersionId,
      apiCompositionId: metaApiReleaseSets.apiCompositionId,
      cohortKey: metaApiReleaseSets.cohortKey,
      domainCode: metaApiReleaseSets.domainCode,
      regionCode: metaApiReleaseSets.regionCode,
      revision: metaApiReleaseSets.revision,
    })
    .from(metaApiReleaseSets)
    .innerJoin(metaApiVersions, eq(metaApiReleaseSets.apiVersionId, metaApiVersions.id))
    .where(eq(metaApiReleaseSets.id, releaseSetId))
    .limit(1)
    .get()

  if (!releaseSet) {
    throw new ControlRequestError(
      `Published API release set metadata not found: ${releaseSetId}`,
    )
  }

  const composition = await db
    .select({ i18n: metaApiComposition.i18n })
    .from(metaApiComposition)
    .where(
      releaseSet.apiCompositionId
        ? eq(metaApiComposition.id, releaseSet.apiCompositionId)
        : and(
            eq(metaApiComposition.apiVersionId, releaseSet.apiVersionId),
            eq(metaApiComposition.status, 'current'),
          ),
    )
    .limit(1)
    .get()
  const domainCode = releaseSet.domainCode ?? fallback.domainCode
  const copy = getEnglishDomainCopy(composition?.i18n, domainCode)
  return {
    apiFamily: releaseSet.apiFamily ?? fallback.apiFamily,
    cohortKey: releaseSet.cohortKey ?? fallback.cohortKey,
    description: copy.description,
    domainCode,
    domainName: copy.name,
    regionCode: releaseSet.regionCode ?? fallback.regionCode,
    revision: releaseSet.revision,
  }
}

function getEnglishDomainCopy(value: unknown, domainCode: string) {
  const composition = parseCompositionI18n(value)
  const translations =
    composition && typeof composition === 'object'
      ? (composition as Record<string, unknown>)[domainCode]
      : undefined
  const english = Array.isArray(translations)
    ? translations.find(
        translation =>
          translation &&
          typeof translation === 'object' &&
          (translation as { locale?: unknown }).locale === 'en',
      )
    : undefined
  const name =
    english &&
    typeof english === 'object' &&
    typeof (english as { name?: unknown }).name === 'string'
      ? (english as { name: string }).name
      : domainCode
  const description =
    english &&
    typeof english === 'object' &&
    typeof (english as { description?: unknown }).description === 'string'
      ? (english as { description: string }).description
      : ''

  return { description, name }
}

function parseCompositionI18n(value: unknown) {
  if (typeof value !== 'string') return value

  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object'
      ? (parsed as Record<string, unknown>)
      : undefined
  } catch {
    return undefined
  }
}

async function waitForSnapshotsForRelease(
  db: HarbourReadableDb,
  releaseId: string,
  datasetType: ResourceType,
  variant: string,
) {
  for (let attempt = 0; attempt <= PUBLISH_SNAPSHOT_WAIT_LIMIT; attempt += 1) {
    const snapshots =
      datasetType === 'divisionStatistic'
        ? await listSnapshotsForRelease(db, releaseId, datasetType, { variant })
        : await resolveSnapshotForRelease(db, releaseId, datasetType, {
            variant,
          }).then(snapshot => (snapshot ? [snapshot] : []))

    if (snapshots.length > 0) {
      return snapshots
    }

    if (attempt < PUBLISH_SNAPSHOT_WAIT_LIMIT) {
      await sleep(PUBLISH_SNAPSHOT_WAIT_DELAY_MS)
    }
  }

  return []
}

function stringifyOptional(value?: Record<string, unknown>) {
  return value ? JSON.stringify(value) : null
}

function isAddressSqlGenerationProgressPhase(phase: string) {
  return (
    phase === 'normaliseAddressSql' ||
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
