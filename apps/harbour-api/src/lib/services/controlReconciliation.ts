import {
  publishReleaseArtefacts,
  ensureDraftReleaseSetForRelease,
  getDatasetRecordByReleaseId,
  listDraftReleaseSetPrimaryReleases,
  listDraftReleaseSets,
  listSnapshotsForRelease,
  listCurrentApiCompositionMembersForType,
  listApiReleaseSetSnapshots,
  resolveLatestReleaseSetForTypeDomainCohort,
  resolveAcceptedStatisticSnapshotParent,
} from '@repo/core/db/metaRegistry'
import { datasetVariantForSource } from '@repo/core'
import type { HarbourReadableDb, HarbourWritableDb } from '@repo/core/db/types'
import {
  and,
  eq,
  isNull,
  metaApiReleaseSets,
  metaApiReleaseSetSnapshots,
  metaApiVersions,
  metaDatasets,
  metaReleases,
  metaSchema,
  metaSnapshotSources,
  or,
} from '@repo/db'
import type { ReleaseSetPublication } from './releaseDiscord'
import type {
  BootstrapStatsReleaseSetsRequest,
  BootstrapStatsReleaseSetsResult,
  ReconcileDraftReleaseSetsRequest,
  ReconcileDraftReleaseSetsResult,
} from './controlTypes.ts'
import { ControlRequestError, runWithTransientControlRetry } from './controlRequests.ts'
import { handlePublishDataset } from './control.ts'

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
    if (request.apiFamily === 'divisions') {
      await restoreMissingDivisionReleaseSets(db, request.regionCode)
    }
    const [draftReleaseSets, primaryReleases, recoverableCurrentStatsTargets] =
      await Promise.all([
        listDraftReleaseSets(db, request),
        listDraftReleaseSetPrimaryReleases(db, request),
        listCurrentReleaseSetStatsTargets(db, request),
      ])
    const primaryReleaseByReleaseSetId = new Map(
      primaryReleases.map(release => [release.apiReleaseSetId, release]),
    )
    const publishedReleaseSetCodes: string[] = []
    const publishedReleaseSetAnnouncements: ReleaseSetPublication[] = []
    const publishedReleaseSetPublications: ReleaseSetPublication[] = []
    const pendingReleaseSetCodes: string[] = []
    const publishedReleaseSetStatsTargets: ReconcileDraftReleaseSetsResult['publishedReleaseSetStatsTargets'] =
      []

    for (const releaseSet of draftReleaseSets) {
      const primaryRelease = primaryReleaseByReleaseSetId.get(releaseSet.id)
      if (!primaryRelease) {
        pendingReleaseSetCodes.push(releaseSet.code)
        continue
      }

      // A draft release set already contains the exact supporting snapshots
      // selected when its primary dataset was materialised. Keep those
      // selections during reconciliation; resolving them again by cohort can
      // silently replace a historical Place's recorded address snapshot.
      const carriedSnapshots = (await listApiReleaseSetSnapshots(db, releaseSet.id))
        .filter(snapshot => snapshot.role !== 'primary')
        .map(snapshot => ({
          resourceType: snapshot.snapshotResourceType,
          snapshotId: snapshot.snapshotId,
          variant: snapshot.variant,
        }))

      const result = await handlePublishDataset(
        db,
        {
          carriedSnapshots,
          releaseId: primaryRelease.releaseId,
          skipSnapshotCleanup: true,
        },
        undefined,
        { reconcileDraftReleaseSet: true, releaseSet },
      )
      if (
        result.apiReleaseSetPublications?.some(
          publication => publication.apiReleaseSetCode === releaseSet.code,
        )
      ) {
        publishedReleaseSetCodes.push(releaseSet.code)
        if (
          result.apiReleaseSetId &&
          result.snapshotId &&
          releaseSet.cohortKey &&
          (request.apiFamily === 'divisions' ||
            request.apiFamily === 'addresses' ||
            request.apiFamily === 'places' ||
            request.apiFamily === 'stats')
        ) {
          publishedReleaseSetStatsTargets.push({
            apiReleaseSetId: result.apiReleaseSetId,
            cohortKey: releaseSet.cohortKey,
            family:
              request.apiFamily === 'addresses'
                ? 'address'
                : request.apiFamily === 'divisions'
                  ? 'division'
                  : request.apiFamily === 'stats'
                    ? 'statistics'
                    : 'place',
            releaseCode: result.releaseCode,
            releaseId: result.releaseId,
            snapshotId: result.snapshotId,
          })
        }
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
      publishedReleaseSetStatsTargets: [
        ...publishedReleaseSetStatsTargets,
        ...recoverableCurrentStatsTargets,
      ],
    }
  })
}

/** A stats reset retracts compositions but retains independent primary geography. */
async function restoreMissingDivisionReleaseSets(
  db: HarbourReadableDb & HarbourWritableDb,
  regionCode?: 'hk' | 'mo',
) {
  const members = (
    await listCurrentApiCompositionMembersForType(db, 'division')
  ).filter(member => member.role === 'primary')
  const releases = await db
    .select({ id: metaReleases.id })
    .from(metaReleases)
    .innerJoin(metaDatasets, eq(metaReleases.datasetId, metaDatasets.id))
    .where(
      and(
        eq(metaReleases.resourceType, 'division'),
        or(eq(metaReleases.status, 'published'), eq(metaReleases.status, 'superseded')),
        regionCode ? eq(metaDatasets.regionCode, regionCode) : undefined,
      ),
    )
    .orderBy(metaReleases.cohortKey)
    .all()
  for (const release of releases) {
    const dataset = await getDatasetRecordByReleaseId(db, release.id)
    if (!dataset) continue
    const snapshots = await listSnapshotsForRelease(db, release.id, 'division')
    const member = members.find(member =>
      snapshots.some(
        snapshot =>
          snapshot.variant === member.variant && snapshot.status !== 'archived',
      ),
    )
    if (!member) continue
    const existing = await db
      .select({ id: metaApiReleaseSets.id })
      .from(metaApiReleaseSets)
      .innerJoin(
        metaApiVersions,
        eq(metaApiReleaseSets.apiVersionId, metaApiVersions.id),
      )
      .where(
        and(
          eq(metaApiVersions.familyType, 'divisions'),
          eq(metaApiReleaseSets.regionCode, dataset.regionCode),
          eq(metaApiReleaseSets.domainCode, member.domainCode),
          eq(metaApiReleaseSets.cohortKey, dataset.cohortKey),
        ),
      )
      .get()
    if (existing) continue
    await handlePublishDataset(
      db,
      {
        releaseId: release.id,
        deferApiReleaseSet: true,
        skipSnapshotCleanup: true,
      },
      undefined,
      { reconcileDraftReleaseSet: true },
    )
  }
}

async function listCurrentReleaseSetStatsTargets(
  db: HarbourReadableDb,
  request: ReconcileDraftReleaseSetsRequest,
) {
  if (
    request.apiFamily !== 'addresses' &&
    request.apiFamily !== 'divisions' &&
    request.apiFamily !== 'places' &&
    request.apiFamily !== 'stats'
  ) {
    return []
  }

  const rows = await db
    .select({
      apiReleaseSetId: metaApiReleaseSets.id,
      cohortKey: metaApiReleaseSets.cohortKey,
      releaseCode: metaReleases.code,
      releaseId: metaReleases.id,
      snapshotId: metaApiReleaseSetSnapshots.snapshotId,
    })
    .from(metaApiReleaseSets)
    .innerJoin(metaApiVersions, eq(metaApiReleaseSets.apiVersionId, metaApiVersions.id))
    .innerJoin(
      metaApiReleaseSetSnapshots,
      and(
        eq(metaApiReleaseSetSnapshots.apiReleaseSetId, metaApiReleaseSets.id),
        eq(metaApiReleaseSetSnapshots.role, 'primary'),
      ),
    )
    .innerJoin(
      metaSnapshotSources,
      and(
        eq(metaSnapshotSources.snapshotId, metaApiReleaseSetSnapshots.snapshotId),
        eq(metaSnapshotSources.role, 'primary'),
      ),
    )
    .innerJoin(metaReleases, eq(metaSnapshotSources.resourceReleaseId, metaReleases.id))
    .where(
      and(
        request.apiFamily === 'divisions' || request.apiFamily === 'stats'
          ? or(
              eq(metaApiReleaseSets.status, 'current'),
              eq(metaApiReleaseSets.status, 'archived'),
            )
          : eq(metaApiReleaseSets.status, 'current'),
        eq(
          metaApiVersions.familyType,
          request.apiFamily === 'addresses'
            ? 'addresses'
            : request.apiFamily === 'divisions'
              ? 'divisions'
              : request.apiFamily === 'stats'
                ? 'stats'
                : 'places',
        ),
        request.regionCode
          ? eq(metaApiReleaseSets.regionCode, request.regionCode)
          : undefined,
        or(eq(metaReleases.status, 'published'), eq(metaReleases.status, 'superseded')),
      ),
    )
    .orderBy(metaApiReleaseSets.cohortKey, metaApiReleaseSets.revision)
    .all()

  const seenReleaseSetIds = new Set<string>()
  const targets: ReconcileDraftReleaseSetsResult['publishedReleaseSetStatsTargets'] = []
  for (const row of rows) {
    if (seenReleaseSetIds.has(row.apiReleaseSetId)) continue
    seenReleaseSetIds.add(row.apiReleaseSetId)

    const existingStats = await db
      .select({ id: metaSchema.stats.id })
      .from(metaSchema.stats)
      .where(
        and(
          eq(metaSchema.stats.apiReleaseSetId, row.apiReleaseSetId),
          request.apiFamily === 'divisions'
            ? and(
                eq(metaSchema.stats.metric, 'churn'),
                eq(metaSchema.stats.dimension, 'count'),
                isNull(metaSchema.stats.groupBy),
              )
            : undefined,
        ),
      )
      .limit(1)
      .get()
    if (existingStats) continue
    if (!row.cohortKey) continue

    targets.push({
      apiReleaseSetId: row.apiReleaseSetId,
      cohortKey: row.cohortKey,
      family:
        request.apiFamily === 'addresses'
          ? 'address'
          : request.apiFamily === 'divisions'
            ? 'division'
            : request.apiFamily === 'stats'
              ? 'statistics'
              : 'place',
      releaseCode: row.releaseCode,
      releaseId: row.releaseId,
      snapshotId: row.snapshotId,
    })
  }

  return targets
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
    ).filter(member => member.domainCode === 'government')
    const memberVariants = new Set(members.map(member => member.variant))
    // A Statistics source may publish DivisionArea artefacts as its primary
    // resource while also materialising a linked divisionStatistic snapshot.
    // Select the source family here; the snapshot lookup below remains the
    // resource-type gate for the Statistics API release set.
    const sourceReleases = await db
      .select({ id: metaReleases.id })
      .from(metaReleases)
      .innerJoin(metaDatasets, eq(metaReleases.datasetId, metaDatasets.id))
      .where(
        and(
          eq(metaDatasets.regionCode, regionCode),
          eq(metaDatasets.theme, 'stats'),
          eq(metaReleases.status, 'published'),
        ),
      )
      .all()

    const candidatesByCohort = new Map<
      string,
      Array<{
        dataset: NonNullable<Awaited<ReturnType<typeof getDatasetRecordByReleaseId>>>
        snapshotId: string
        lineageId: string
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

      const snapshots = await db
        .select({
          id: metaSchema.metaSnapshots.id,
          cohortKey: metaSchema.metaSnapshots.cohortKey,
          lineageId: metaSchema.metaSnapshotLineages.id,
        })
        .from(metaSchema.metaSnapshots)
        .innerJoin(
          metaSchema.metaSnapshotLineages,
          eq(
            metaSchema.metaSnapshots.snapshotLineageId,
            metaSchema.metaSnapshotLineages.id,
          ),
        )
        .innerJoin(
          metaSnapshotSources,
          eq(metaSnapshotSources.snapshotId, metaSchema.metaSnapshots.id),
        )
        .where(
          and(
            eq(metaSnapshotSources.resourceReleaseId, sourceRelease.id),
            eq(metaSnapshotSources.role, 'primary'),
            eq(metaSchema.metaSnapshots.resourceType, 'divisionStatistic'),
            eq(metaSchema.metaSnapshots.status, 'published'),
            eq(metaSchema.metaSnapshotLineages.variant, variant),
          ),
        )
        .all()
      for (const snapshot of snapshots) {
        const candidates = candidatesByCohort.get(snapshot.cohortKey) ?? []
        candidates.push({
          dataset,
          snapshotId: snapshot.id,
          lineageId: snapshot.lineageId,
          variant,
        })
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
        'government',
        regionCode,
        cohortKey,
      )
      if (existing) {
        skippedCohortKeys.push(cohortKey)
        continue
      }

      const existingDraft = await db
        .select({ revision: metaApiReleaseSets.revision })
        .from(metaApiReleaseSets)
        .innerJoin(
          metaApiVersions,
          eq(metaApiReleaseSets.apiVersionId, metaApiVersions.id),
        )
        .where(
          and(
            eq(metaApiVersions.code, 'api-stats-v0.1'),
            eq(metaApiReleaseSets.regionCode, regionCode),
            eq(metaApiReleaseSets.domainCode, 'government'),
            eq(metaApiReleaseSets.cohortKey, cohortKey),
            eq(metaApiReleaseSets.status, 'draft'),
          ),
        )
        .limit(1)
        .get()
      if (existingDraft && existingDraft.revision !== 0) {
        skippedCohortKeys.push(cohortKey)
        continue
      }

      const selectedByVariant = new Map<string, (typeof candidates)[number]>()
      for (const candidate of candidates) {
        const previous = selectedByVariant.get(candidate.variant)
        if (previous && previous.lineageId !== candidate.lineageId) {
          throw new ControlRequestError(
            `Cannot bootstrap Statistics cohort ${cohortKey}: multiple lineages are available for ${candidate.variant}.`,
          )
        }
        if (previous) continue
        const head = await resolveAcceptedStatisticSnapshotParent(
          db,
          candidate.lineageId,
          cohortKey,
        )
        const selected = head && candidates.find(row => row.snapshotId === head.id)
        if (!selected) {
          throw new ControlRequestError(
            `Cannot bootstrap Statistics cohort ${cohortKey}: no completed predecessor is available for ${candidate.variant}.`,
          )
        }
        selectedByVariant.set(candidate.variant, selected)
      }

      const releaseSet = await ensureDraftReleaseSetForRelease(
        db,
        'divisionStatistic',
        { cohortKey, regionCode },
        { domainCode: 'government' },
      )
      const orderedCandidates = [...selectedByVariant.values()].sort(
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
          resourceType: 'divisionStatistic',
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
        resourceType: 'divisionStatistic',
      })
      createdReleaseSetCodes.push(releaseSet.code)
    }

    return { createdReleaseSetCodes, inspectedSnapshots, skippedCohortKeys }
  })
}
