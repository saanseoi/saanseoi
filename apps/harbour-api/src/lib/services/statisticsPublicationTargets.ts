import { metaSnapshotResourceReleaseDetails } from '@repo/db/metaSchema'
import {
  and,
  desc,
  eq,
  metaApiReleaseSets,
  metaApiVersionReleaseSets,
  metaApiReleaseSetSnapshots,
  metaApiVersions,
  metaDatasets,
  metaSnapshotResourceReleases,
  metaSnapshotLineages,
  metaSnapshots,
  ne,
} from '@repo/db'
import type { HarbourReadableDb } from '@repo/core/db/types'

export type StatisticsPublicationTarget = {
  datasetCode: string
  referencePeriodCode: string
  snapshotId: string
}

/** Older periods remain current: publication currency is chosen per exact period. */
export async function listPublishedStatisticsTargets(db: HarbourReadableDb) {
  const releases = await db
    .select({
      apiVersionId: metaApiVersionReleaseSets.apiVersionId,
      cohortKey: metaApiReleaseSets.cohortKey,
      domainCode: metaApiReleaseSets.domainCode,
      id: metaApiReleaseSets.id,
      regionCode: metaApiReleaseSets.regionCode,
    })
    .from(metaApiReleaseSets)
    .innerJoin(
      metaApiVersionReleaseSets,
      eq(metaApiVersionReleaseSets.apiReleaseSetId, metaApiReleaseSets.id),
    )
    .innerJoin(
      metaApiVersions,
      eq(metaApiVersions.id, metaApiVersionReleaseSets.apiVersionId),
    )
    .where(
      and(
        eq(metaApiVersions.familyType, 'stats'),
        ne(metaApiVersionReleaseSets.status, 'draft'),
      ),
    )
    .orderBy(desc(metaApiReleaseSets.revision))
    .all()
  const scopes = new Set<string>()
  const targets = new Map<string, StatisticsPublicationTarget>()
  for (const release of releases) {
    if (!release.cohortKey) continue
    const scope = JSON.stringify([
      release.apiVersionId,
      release.regionCode,
      release.domainCode,
      release.cohortKey,
    ])
    if (scopes.has(scope)) continue
    scopes.add(scope)
    const snapshots = await db
      .select({
        datasetCode: metaDatasets.code,
        referencePeriodCode: metaSnapshots.cohortKey,
        snapshotId: metaSnapshots.id,
      })
      .from(metaApiReleaseSetSnapshots)
      .innerJoin(
        metaSnapshots,
        eq(metaSnapshots.id, metaApiReleaseSetSnapshots.snapshotId),
      )
      .innerJoin(
        metaSnapshotLineages,
        eq(metaSnapshots.snapshotLineageId, metaSnapshotLineages.id),
      )
      .innerJoin(
        metaSnapshotResourceReleaseDetails,
        eq(metaSnapshotResourceReleaseDetails.snapshotId, metaSnapshots.id),
      )
      .innerJoin(
        metaDatasets,
        eq(metaDatasets.id, metaSnapshotResourceReleaseDetails.datasetId),
      )
      .where(
        and(
          eq(metaApiReleaseSetSnapshots.apiReleaseSetId, release.id),
          eq(metaSnapshotLineages.resourceType, 'divisionStatistic'),
          ne(metaSnapshotResourceReleaseDetails.role, 'lookup'),
        ),
      )
      .all()
    for (const snapshot of snapshots) {
      const key = JSON.stringify([snapshot.datasetCode, snapshot.referencePeriodCode])
      const existing = targets.get(key)
      if (existing && existing.snapshotId !== snapshot.snapshotId) {
        throw new Error(
          `Conflicting published statistic snapshots for ${snapshot.datasetCode}/${snapshot.referencePeriodCode}.`,
        )
      }
      targets.set(key, snapshot)
    }
  }
  return [...targets.values()]
}
