import {
  publishReleaseArtefacts,
  ensureDraftReleaseSetForRelease,
  getCurrentReleaseForDatasetId,
  listSnapshotsForRelease,
  listOvertureReleaseSetCohortsAtOrAfterCohortKey,
  listDraftReleaseSetsForTypeRegionAtOrAfterCohortKey,
  listCurrentApiCompositionMembersForType,
  resolveLatestReleaseSetForTypeDomainCohort,
  resolveReleaseSetForRelease,
  updateDatasetStatus,
} from '@repo/core/db/metaRegistry'
import { datasetVariantForSource, type RegionCode, type ResourceType } from '@repo/core'
import type { HarbourReadableDb, HarbourWritableDb } from '@repo/core/db/types'
import {
  and,
  eq,
  metaApiReleaseSets,
  metaSchema,
  metaSnapshotSources,
  metaSnapshots,
} from '@repo/db'
import {
  ControlRequestError,
  requireDataset,
  runWithTransientControlRetry,
} from './controlRequests.ts'
import type { ControlResult, HarbourJobQueue, PublishRequest } from './controlTypes.ts'
import {
  releaseSetMemberKey,
  resolveCarriedSnapshots,
  resolveSupportingSnapshotsForMember,
  resolveTransformMember,
  waitForSnapshotsForRelease,
} from './controlSnapshots.ts'
import {
  publishMetadataDelta,
  requireReleaseSetPublicationMetadata,
  resolveApiReleaseSetMetadataDelta,
  resolvePublishedSnapshotMetadataDeltas,
  resolvePublisherName,
} from './controlMetadata.ts'
import {
  DEFAULT_SNAPSHOT_CLEANUP_DELAY_SECONDS,
  scheduleCurrentSnapshotCleanup,
} from './controlCleanup.ts'

export async function assertPlaceAddressDependencies(
  db: HarbourReadableDb,
  snapshotId: string,
  releaseId: string,
) {
  const runs = await db
    .select()
    .from(metaSchema.metaSnapshotAssemblyRuns)
    .where(eq(metaSchema.metaSnapshotAssemblyRuns.snapshotId, snapshotId))
    .all()
  const summary = runs
    .map(
      run =>
        run.selectionSummaryJson as {
          supplementaryAddressSnapshotId?: string
          addressReviewRequired?: number
        } | null,
    )
    .find(value => value?.supplementaryAddressSnapshotId)
  if (!summary?.supplementaryAddressSnapshotId || summary.addressReviewRequired !== 0) {
    throw new ControlRequestError(
      'Places publication requires completed supplementary Address analysis with no outstanding identity reviews.',
    )
  }
  const supplementary = await db
    .select({
      id: metaSnapshots.id,
      sourceReleaseId: metaSnapshotSources.resourceReleaseId,
    })
    .from(metaSnapshots)
    .innerJoin(
      metaSnapshotSources,
      eq(metaSnapshotSources.snapshotId, metaSnapshots.id),
    )
    .innerJoin(
      metaSchema.metaSnapshotLineages,
      eq(metaSchema.metaSnapshotLineages.id, metaSnapshots.snapshotLineageId),
    )
    .where(
      and(
        eq(metaSnapshots.id, summary.supplementaryAddressSnapshotId),
        eq(metaSnapshots.status, 'published'),
        eq(metaSnapshots.resourceType, 'address'),
        eq(metaSchema.metaSnapshotLineages.variant, 'overture-places'),
        eq(metaSnapshotSources.role, 'primary'),
        eq(metaSnapshotSources.anchorReleaseId, releaseId),
      ),
    )
    .get()
  if (!supplementary)
    throw new ControlRequestError(
      'Places supplementary Address snapshot is missing or does not belong to this Place release.',
    )
  const sources = await db
    .select()
    .from(metaSnapshotSources)
    .where(eq(metaSnapshotSources.snapshotId, snapshotId))
    .all()
  if (
    !sources.some(
      source =>
        source.role === 'lookup' &&
        source.resourceReleaseId === supplementary.sourceReleaseId &&
        source.selectedByRule ===
          'api-composition:places/overture:place/default->address/overture-places',
    )
  ) {
    throw new ControlRequestError(
      'Places supplementary Address dependency is not recorded.',
    )
  }
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
    const failedAudit = await db
      .select({ status: metaSchema.releaseProvenance.attemptStatus })
      .from(metaSchema.releaseProvenance)
      .where(eq(metaSchema.releaseProvenance.releaseId, dataset.releaseId))
      .get()
    if (failedAudit?.status === 'failed')
      throw new ControlRequestError(
        'Publication is blocked by the failed processing audit attempt.',
      )
    if (
      (datasetType === 'divisionStatistic' && dataset.source === 'hkgov-censtatd') ||
      (datasetType === 'address' &&
        ['hkgov-dpo', 'overture'].includes(dataset.source)) ||
      (datasetType === 'place' && dataset.source === 'overture')
    ) {
      if (!failedAudit)
        throw new ControlRequestError(
          `${datasetType === 'divisionStatistic' ? 'Statistics' : datasetType === 'address' ? 'Addresses' : 'Places'} publication requires a verified retained processing result.`,
        )
    }
    const materialisedSnapshots = await listSnapshotsForRelease(
      db,
      dataset.releaseId,
      datasetType,
    )
    const datasetVariant =
      materialisedSnapshots.find(snapshot => !snapshot.variant.endsWith(':simplified'))
        ?.variant ??
      datasetVariantForSource(datasetType, dataset.source, {
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
      domainCode === 'geographic' &&
      dataset.geometryStatus === 'authoritative'
    const isFallbackCenstatdGeographicGeometry =
      datasetType === 'divisionArea' &&
      dataset.source === 'hkgov-censtatd' &&
      domainCode === 'geographic' &&
      dataset.geometryStatus === 'fallback'
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

    if (datasetType === 'place') {
      await assertPlaceAddressDependencies(db, firstSnapshot.id, dataset.releaseId)
    }

    if (request.deferStatsReleaseSet) {
      if (datasetType !== 'divisionStatistic') {
        throw new ControlRequestError(
          'Only Statistics source releases can defer API release-set publication.',
        )
      }
      if (!request.deferSourcePublish) {
        await updateDatasetStatus(db, dataset.releaseId, 'published')
      }
      return {
        datasetId: dataset.releaseCode,
        metadataDelta: publishMetadataDelta(
          request.deferSourcePublish ? null : dataset.releaseId,
        ),
        phase: null,
        releaseCode: dataset.releaseCode,
        releaseId: dataset.releaseId,
        snapshotId: firstSnapshot.id,
        status: request.deferSourcePublish ? 'processing' : 'published',
      }
    }

    // Fallback geometry remains a selectable Statistics companion, but must
    // never become a Divisions release-set member or fan out across Overture
    // cohorts. A later authoritative C&SD release owns that publication.
    if (isFallbackCenstatdGeographicGeometry) {
      if (!request.deferSourcePublish) {
        await updateDatasetStatus(db, dataset.releaseId, 'published')
      }
      return {
        datasetId: dataset.releaseCode,
        metadataDelta: publishMetadataDelta(
          request.deferSourcePublish ? null : dataset.releaseId,
        ),
        phase: null,
        releaseCode: dataset.releaseCode,
        releaseId: dataset.releaseId,
        snapshotId: firstSnapshot.id,
        status: request.deferSourcePublish ? 'processing' : 'published',
      }
    }

    const ensureDeferredDraftReleaseSet = async (cohortKey: string) => {
      if (request.deferApiReleaseSet) {
        const publishedReleaseSet = await resolveLatestReleaseSetForTypeDomainCohort(
          db,
          datasetType,
          domainCode,
          dataset.regionCode as RegionCode,
          cohortKey,
        )

        // A deferred source upload may complete after its cohort's API set is
        // already current (for example, a Statistics companion replayed after
        // geographic initialisation). Source publication must not open an
        // enrichment revision in that case.
        if (publishedReleaseSet) return null
      }

      return ensureDraftReleaseSetForRelease(
        db,
        datasetType,
        { cohortKey, regionCode: dataset.regionCode },
        { domainCode },
      )
    }
    const releaseSets = isCenstatdGeographicGeometry
      ? await (async () => {
          const releaseSets: Array<
            NonNullable<Awaited<ReturnType<typeof ensureDraftReleaseSetForRelease>>>
          > = []
          // Create each revision in the same chronological order in which it
          // is published, so the registry's publication ordering is stable.
          for (const cohortKey of censtatdReleaseSetCohorts) {
            const releaseSet = await ensureDeferredDraftReleaseSet(cohortKey)
            if (releaseSet) releaseSets.push(releaseSet)
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
          : await (async () => {
              if (existingReleaseSet) {
                if (
                  request.deferApiReleaseSet &&
                  existingReleaseSet.status !== 'draft'
                ) {
                  return []
                }
                return [existingReleaseSet]
              }
              const releaseSet = await ensureDeferredDraftReleaseSet(dataset.cohortKey)
              return releaseSet ? [releaseSet] : []
            })()
    if (releaseSets.length === 0) {
      if (!request.deferSourcePublish) {
        await updateDatasetStatus(db, dataset.releaseId, 'published')
      }
      return {
        datasetId: dataset.releaseCode,
        metadataDelta: publishMetadataDelta(
          request.deferSourcePublish ? null : dataset.releaseId,
        ),
        phase: null,
        releaseCode: dataset.releaseCode,
        releaseId: dataset.releaseId,
        snapshotId: firstSnapshot.id,
        status: request.deferSourcePublish ? 'processing' : 'published',
      }
    }
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
    let selectedReleaseSetStatus: 'current' | 'draft' | 'archived' = 'draft'
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
      const explicitlyCarriedMemberKeys = new Set(
        (request.carriedSnapshots ?? []).map(snapshot =>
          releaseSetMemberKey(snapshot.resourceType, snapshot.variant ?? 'default'),
        ),
      )

      for (const member of domainMembers) {
        const memberKey = releaseSetMemberKey(member.resourceType, member.variant)
        if (member.resourceType === datasetType && member.variant === datasetVariant) {
          if (member.isRequired) satisfiedRequiredMembers.add(memberKey)
          continue
        }

        // Family processors may have selected an exact reference snapshot from
        // the data they materialised. Preserve that choice instead of replacing
        // it with an independently resolved cohort match.
        if (explicitlyCarriedMemberKeys.has(memberKey)) {
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

      for (const carriedSnapshot of request.carriedSnapshots ?? []) {
        const snapshot = await db
          .select({
            id: metaSnapshots.id,
            resourceType: metaSnapshots.resourceType,
            status: metaSnapshots.status,
          })
          .from(metaSnapshots)
          .where(eq(metaSnapshots.id, carriedSnapshot.snapshotId))
          .limit(1)
          .get()
        if (
          snapshot?.status !== 'published' ||
          snapshot.resourceType !== carriedSnapshot.resourceType
        ) {
          throw new ControlRequestError(
            `Carried ${carriedSnapshot.resourceType} snapshot ${carriedSnapshot.snapshotId} is not a published matching snapshot.`,
          )
        }
        carriedSnapshots.push({
          ...carriedSnapshot,
          variant: carriedSnapshot.variant ?? 'default',
        })
      }

      const releaseSetIsComplete = [...requiredMembers].every(memberKey =>
        satisfiedRequiredMembers.has(memberKey),
      )
      const isNewestReleaseSet = index === newestReleaseSetIndex
      const shouldPublishReleaseSet =
        !request.deferApiReleaseSet &&
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
        snapshotVariant: datasetVariant,
        type: datasetType,
        // Each statistic reference period is independently publishable. Other
        // families may still wait for required companion snapshots.
        deferApiReleaseSet: !shouldPublishReleaseSet,
        publishApiCatalogRevision: shouldPublishReleaseSet,
        updateDatasetRelease:
          !request.deferSourcePublish &&
          !options.reconcileDraftReleaseSet &&
          isNewestReleaseSet,
      })
      if (shouldPublishReleaseSet) {
        selectedApiCatalogRevision = apiCatalogRevision
        const publishedReleaseSetStatus = await db
          .select({ status: metaApiReleaseSets.status })
          .from(metaApiReleaseSets)
          .where(eq(metaApiReleaseSets.id, releaseSet.id))
          .limit(1)
          .get()
        selectedReleaseSetStatus = publishedReleaseSetStatus?.status ?? 'draft'
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

    if (!request.deferSourcePublish && !request.skipSnapshotCleanup && cleanupQueue) {
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

    const apiReleaseSetMetadata = releaseSets.at(-1)
      ? await resolveApiReleaseSetMetadataDelta(db, releaseSets.at(-1)?.id ?? '')
      : undefined

    return {
      apiCatalogRevisionCode: selectedApiCatalogRevision?.code,
      apiCatalogRevisionId: selectedApiCatalogRevision?.id,
      apiReleaseSetId: releaseSets.at(-1)?.id,
      apiReleaseSetCode: releaseSets.at(-1)?.code,
      apiReleaseSetStatus: selectedReleaseSetStatus,
      apiReleaseSetAnnouncements,
      apiReleaseSetPublications,
      datasetId: dataset.releaseCode,
      metadataDelta: publishMetadataDelta(
        request.deferSourcePublish ? null : dataset.releaseId,
        apiReleaseSetMetadata,
        await resolvePublishedSnapshotMetadataDeltas(
          db,
          snapshots.map(snapshot => snapshot.id),
        ),
      ),
      releaseCode: dataset.releaseCode,
      releaseId: dataset.releaseId,
      phase: null,
      snapshotId: publicationTargets.at(-1)?.snapshot.id,
      status: request.deferSourcePublish ? 'processing' : 'current',
    }
  })
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

export type {
  ReconcileDraftReleaseSetsRequest,
  BootstrapStatsReleaseSetsRequest,
  ReconcileDraftReleaseSetsResult,
  BootstrapStatsReleaseSetsResult,
  HarbourJobQueue,
} from './controlTypes.ts'

export { ControlRequestError, isTransientControlError } from './controlRequests.ts'

export { handleScheduleSnapshotCleanup } from './controlCleanup.ts'

export {
  handleStageRunning,
  handleStageCompleted,
  handleStageFailed,
} from './controlStages.ts'

export {
  handleReconcileDraftReleaseSets,
  handleBootstrapStatsReleaseSets,
} from './controlReconciliation.ts'
