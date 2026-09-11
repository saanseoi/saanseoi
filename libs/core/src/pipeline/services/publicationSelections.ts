import {
  and,
  desc,
  eq,
  metaDatasets,
  metaSnapshots,
  metaSnapshotSources,
} from '@repo/db'
import type { HarbourReadableDb } from '../../lib/db/types'
import { listApiReleaseSetSnapshotsForRegistryRequest } from '../../lib/db/metaRegistry'
import { listRetainedGeometrySnapshotIds } from '../../lib/db/geometrySnapshotRetention'
import { addressSearchIndex } from './addresses/searchIndex'
import { placeSearchIndex } from './places/searchIndex'
import { divisionSearchIndex } from './search/divisions'
import { resolvePublishedSearchScopes } from './search/incrementalIndex'
import type { PublicationFamily } from './publicationState'

/** Same published selections as resource reads, independent of FTS readiness. */
export async function resolvePublicationSelections(meta: HarbourReadableDb) {
  const selected = Object.fromEntries(
    ['division', 'divisionArea', 'divisionBoundary', 'street', 'address', 'place'].map(
      family => [family, new Set<string>()],
    ),
  ) as Record<PublicationFamily, Set<string>>
  for (const definition of [
    divisionSearchIndex,
    addressSearchIndex,
    placeSearchIndex,
  ]) {
    for (const scope of await resolvePublishedSearchScopes(meta, definition))
      selected[definition.resourceType].add(scope.snapshotId)
  }
  for (const snapshotId of await listRetainedGeometrySnapshotIds(meta)) {
    const row = await meta
      .select({ type: metaSnapshots.resourceType })
      .from(metaSnapshots)
      .where(eq(metaSnapshots.id, snapshotId))
      .get()
    if (row?.type === 'divisionArea' || row?.type === 'divisionBoundary')
      selected[row.type].add(snapshotId)
  }
  // A published API selection can still pin a companion from a superseded
  // source release while a replacement is waiting for its full composition.
  // Include every cohort in the serving catalogue: Statistics retains the
  // latest revision of older periods as well as its default period.
  for (const definition of [
    divisionSearchIndex,
    addressSearchIndex,
    placeSearchIndex,
    { resourceType: 'divisionStatistic' as const, domainCode: 'government' },
  ]) {
    const domains =
      'domainCodes' in definition && definition.domainCodes
        ? definition.domainCodes
        : [definition.domainCode]
    for (const regionCode of ['hk', 'mo'] as const) {
      for (const domainCode of domains) {
        const catalogue = await listApiReleaseSetSnapshotsForRegistryRequest(
          meta,
          definition.resourceType,
          {
            regionCode,
            domainCode,
          },
        )
        for (const releaseSet of catalogue?.releaseSets ?? []) {
          for (const snapshot of releaseSet.snapshots) {
            const type = snapshot.snapshotResourceType
            if (type === 'divisionArea' || type === 'divisionBoundary')
              selected[type].add(snapshot.snapshotId)
          }
        }
      }
    }
  }
  for (const region of ['hk', 'mo']) {
    const street = await meta
      .select({ id: metaSnapshots.id })
      .from(metaSnapshots)
      .innerJoin(
        metaSnapshotSources,
        eq(metaSnapshots.id, metaSnapshotSources.snapshotId),
      )
      .innerJoin(metaDatasets, eq(metaDatasets.id, metaSnapshotSources.datasetId))
      .where(
        and(
          eq(metaSnapshots.resourceType, 'street'),
          eq(metaSnapshots.status, 'published'),
          eq(metaDatasets.regionCode, region),
          eq(metaSnapshotSources.role, 'primary'),
        ),
      )
      .orderBy(desc(metaSnapshots.publishedAt), desc(metaSnapshots.createdAt))
      .limit(1)
      .get()
    if (street) selected.street.add(street.id)
  }
  return selected
}
