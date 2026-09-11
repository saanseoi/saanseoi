import { and, asc, desc, eq, inArray, metaSchema, ne, sql } from '@repo/db'

import { datasetVariantForSource } from '../../codes'
import type { HarbourReadableDb } from './types'

const {
  metaDatasets,
  metaPublishers,
  metaReleases,
  metaSnapshotLineages,
  metaSnapshots,
  metaSnapshotSources,
} = metaSchema

/**
 * Current geometry follows the resource releases that are still published.
 * Independent census releases therefore retain their own cohort and transforms,
 * while superseded rolling releases no longer protect their materialisations.
 */
export async function listRetainedGeometrySnapshotIds(db: HarbourReadableDb) {
  // Resolve against the whole published inventory: a cleanup request containing
  // only an old revision must still see the newer snapshot that replaces it.
  const candidates = await db
    .select({
      snapshotId: metaSnapshots.id,
      resourceType: metaSnapshots.resourceType,
      cohortKey: metaSnapshots.cohortKey,
      datasetId: metaDatasets.id,
      datasetCode: metaDatasets.code,
      regionCode: metaDatasets.regionCode,
      sourceVariant: metaDatasets.sourceVariant,
      publisherCode: metaPublishers.code,
      variant: metaSnapshotLineages.variant,
    })
    .from(metaSnapshots)
    .innerJoin(
      metaSnapshotSources,
      eq(metaSnapshotSources.snapshotId, metaSnapshots.id),
    )
    .innerJoin(
      metaReleases,
      and(
        eq(metaReleases.id, metaSnapshotSources.resourceReleaseId),
        eq(metaReleases.datasetId, metaSnapshotSources.datasetId),
        eq(metaReleases.resourceType, metaSnapshots.resourceType),
      ),
    )
    .innerJoin(metaDatasets, eq(metaDatasets.id, metaSnapshotSources.datasetId))
    .innerJoin(metaPublishers, eq(metaPublishers.id, metaDatasets.publisherId))
    .leftJoin(
      metaSnapshotLineages,
      eq(metaSnapshotLineages.id, metaSnapshots.snapshotLineageId),
    )
    .where(
      and(
        inArray(metaSnapshots.resourceType, ['divisionArea', 'divisionBoundary']),
        eq(metaSnapshots.status, 'published'),
        eq(metaReleases.status, 'published'),
        ne(metaSnapshotSources.role, 'lookup'),
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
    const variant =
      candidate.variant ??
      datasetVariantForSource(candidate.resourceType, candidate.publisherCode, {
        datasetCode: candidate.datasetCode,
        sourceVariant: candidate.sourceVariant,
      })
    const scope = JSON.stringify([
      candidate.datasetId,
      candidate.regionCode,
      candidate.resourceType,
      variant,
      candidate.cohortKey,
    ])
    if (selectedScopes.has(scope)) continue
    selectedScopes.add(scope)
    retained.add(candidate.snapshotId)
  }
  return retained
}
