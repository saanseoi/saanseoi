import {
  listSnapshotsForRelease,
  type listCurrentApiCompositionMembersForType,
  listApiReleaseSetSnapshots,
  resolveEarliestPublishedSnapshotForResourceTypeRegionAtOrAfterCohortKey,
  resolveLatestPublishedSnapshotForResourceTypeRegionAtOrBeforeCohortKey,
  type resolveLatestReleaseSetForTypeDomainCohort,
  resolvePublishedSnapshotForResourceTypeRegionCohortKey,
  resolvePublishedSnapshotsForResourceTypeRegionAtOrBeforeCohortKey,
  resolveSnapshotForRelease,
} from '@repo/core/db/metaRegistry'
import { publisherCodeForSource, type RegionCode, type ResourceType } from '@repo/core'
import type { HarbourReadableDb } from '@repo/core/db/types'
import { sleep } from './controlRequests.ts'

const PUBLISH_SNAPSHOT_WAIT_LIMIT = 20

const PUBLISH_SNAPSHOT_WAIT_DELAY_MS = 250

/**
 * Geometry transforms are materialised for efficient reads, but they do not
 * declare independent API-composition slots. A derived variant therefore
 * inherits the source variant's domain and release-set membership.
 */
export function resolveTransformMember(
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

export function releaseSetMemberKey(resourceType: ResourceType, variant: string) {
  return `${resourceType}:${variant}`
}

export async function resolveCarriedSnapshots(
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

export async function resolveSupportingSnapshotsForMember(
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

    if (member.variant === 'overture' && snapshots.length === 0) {
      // Older fixture and repaired metadata rows can still lack a lineage.
      // Overture's canonical dataset is an adequate identity fallback, as it
      // is for exact cohort resolution below.
      const canonicalSnapshot =
        await resolveLatestPublishedSnapshotForResourceTypeRegionAtOrBeforeCohortKey(
          db,
          member.resourceType,
          regionCode,
          cohortKey,
          { publisherCode: 'overture', variant: 'overture' },
        )
      if (
        canonicalSnapshot &&
        (member.cohortMatchingMode === 'latest_at_or_before_cohort_per_dataset' ||
          member.cohortMatchingMode ===
            'latest_at_or_before_or_earliest_after_cohort' ||
          canonicalSnapshot.cohortKey === cohortKey)
      ) {
        return [canonicalSnapshot]
      }

      if (
        member.cohortMatchingMode === 'latest_at_or_before_or_earliest_after_cohort'
      ) {
        const nextSnapshot =
          await resolveEarliestPublishedSnapshotForResourceTypeRegionAtOrAfterCohortKey(
            db,
            member.resourceType,
            regionCode,
            cohortKey,
            { publisherCode: 'overture', variant: 'overture' },
          )
        return nextSnapshot ? [nextSnapshot] : []
      }
    }

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
          { datasetCode, publisherCode, variant: member.variant },
        )
      return nextSnapshot ? [nextSnapshot] : []
    }

    return snapshots.filter(snapshot => snapshot.cohortKey === cohortKey)
  }

  if (
    member.cohortMatchingMode === 'latest_at_or_before_cohort_per_dataset' ||
    member.cohortMatchingMode === 'latest_at_or_before_or_earliest_after_cohort'
  ) {
    const snapshots =
      await resolvePublishedSnapshotsForResourceTypeRegionAtOrBeforeCohortKey(
        db,
        member.resourceType,
        regionCode,
        cohortKey,
        { variant: member.variant },
      )
    if (snapshots.length > 0) return snapshots

    if (member.cohortMatchingMode === 'latest_at_or_before_or_earliest_after_cohort') {
      const nextSnapshot =
        await resolveEarliestPublishedSnapshotForResourceTypeRegionAtOrAfterCohortKey(
          db,
          member.resourceType,
          regionCode,
          cohortKey,
          { variant: member.variant },
        )
      return nextSnapshot ? [nextSnapshot] : []
    }
  }

  const snapshot = await resolvePublishedSnapshotForResourceTypeRegionCohortKey(
    db,
    member.resourceType,
    regionCode,
    cohortKey,
  )
  return snapshot ? [snapshot] : []
}

export async function waitForSnapshotsForRelease(
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
