import {
  and,
  desc,
  eq,
  metaApiReleaseSets,
  metaApiReleaseSetSnapshots,
  metaApiVersions,
  metaDatasets,
  metaSnapshotSources,
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
      apiVersionId: metaApiReleaseSets.apiVersionId,
      cohortKey: metaApiReleaseSets.cohortKey,
      domainCode: metaApiReleaseSets.domainCode,
      id: metaApiReleaseSets.id,
      regionCode: metaApiReleaseSets.regionCode,
    })
    .from(metaApiReleaseSets)
    .innerJoin(metaApiVersions, eq(metaApiVersions.id, metaApiReleaseSets.apiVersionId))
    .where(
      and(
        eq(metaApiVersions.familyType, 'stats'),
        ne(metaApiReleaseSets.status, 'draft'),
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
        metaSnapshotSources,
        eq(metaSnapshotSources.snapshotId, metaSnapshots.id),
      )
      .innerJoin(metaDatasets, eq(metaDatasets.id, metaSnapshotSources.datasetId))
      .where(
        and(
          eq(metaApiReleaseSetSnapshots.apiReleaseSetId, release.id),
          eq(metaSnapshots.resourceType, 'divisionStatistic'),
          ne(metaSnapshotSources.role, 'lookup'),
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
