import { metaSnapshotResourceReleaseDetails } from '@repo/db/metaSchema'
import { metaResourceReleaseDetails } from '@repo/db/metaSchema'
import { and, asc, desc, eq, inArray, metaSchema, ne, sql } from '@repo/db'

import type { HarbourReadableDb } from './types'

const { metaDatasets, metaSnapshotLineages, metaSnapshots } = metaSchema

/**
 * Current geometry follows the resource releases that are still published.
 * Independent census releases therefore retain their own cohort and transforms,
 * while archived rolling releases no longer protect their materialisations.
 */
export async function listRetainedGeometrySnapshotIds(db: HarbourReadableDb) {
  // Resolve against the whole published inventory: a cleanup request containing
  // only an old revision must still see the newer snapshot that replaces it.
  const candidates = await db
    .select({
      snapshotId: metaSnapshots.id,
      resourceType: metaSnapshotLineages.resourceType,
      cohortKey: metaSnapshots.cohortKey,
      datasetId: metaDatasets.id,
      regionCode: metaDatasets.regionCode,
      variant: metaSnapshotLineages.variant,
    })
    .from(metaSnapshots)
    .innerJoin(
      metaSnapshotLineages,
      eq(metaSnapshotLineages.id, metaSnapshots.snapshotLineageId),
    )
    .innerJoin(
      metaSnapshotResourceReleaseDetails,
      eq(metaSnapshotResourceReleaseDetails.snapshotId, metaSnapshots.id),
    )
    .innerJoin(
      metaResourceReleaseDetails,
      and(
        eq(
          metaResourceReleaseDetails.id,
          metaSnapshotResourceReleaseDetails.resourceReleaseId,
        ),
        eq(
          metaResourceReleaseDetails.datasetId,
          metaSnapshotResourceReleaseDetails.datasetId,
        ),
        eq(metaResourceReleaseDetails.resourceType, metaSnapshotLineages.resourceType),
      ),
    )
    .innerJoin(
      metaDatasets,
      eq(metaDatasets.id, metaSnapshotResourceReleaseDetails.datasetId),
    )

    .where(
      and(
        inArray(metaSnapshotLineages.resourceType, [
          'divisionArea',
          'divisionBoundary',
        ]),
        eq(metaSnapshots.status, 'published'),
        eq(metaResourceReleaseDetails.status, 'current'),
        ne(metaSnapshotResourceReleaseDetails.role, 'lookup'),
      ),
    )
    .orderBy(
      asc(
        sql`case ${metaSnapshots.geometryStatus} when 'authoritative' then 0 else 1 end`,
      ),
      desc(metaSnapshots.publishedAt),
      desc(metaSnapshots.createdAt),
      desc(metaSnapshots.revision),
      desc(metaSnapshots.id),
    )
    .all()

  const retained = new Set<string>()
  const selectedScopes = new Set<string>()
  for (const candidate of candidates) {
    const scope = JSON.stringify([
      candidate.datasetId,
      candidate.regionCode,
      candidate.resourceType,
      candidate.variant,
      candidate.cohortKey,
    ])
    if (selectedScopes.has(scope)) continue
    selectedScopes.add(scope)
    retained.add(candidate.snapshotId)
  }
  return retained
}
