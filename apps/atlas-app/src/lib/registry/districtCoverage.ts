import { isNotNull } from 'drizzle-orm'
import {
  and,
  currentSchema,
  desc,
  eq,
  ne,
  metaSnapshotLineages,
  metaSnapshots,
  type CurrentDatabase,
  type MetaDatabase,
} from '@repo/db'

/** Shared Stats maps use the published SaanSeoi district land coverage. */
export async function readDistrictCoverageAreas(
  meta: MetaDatabase,
  current: CurrentDatabase,
) {
  const latest = (resourceType: 'division' | 'divisionArea') =>
    meta
      .select({ id: metaSnapshots.id })
      .from(metaSnapshots)
      .innerJoin(
        metaSnapshotLineages,
        eq(metaSnapshots.snapshotLineageId, metaSnapshotLineages.id),
      )
      .where(
        and(
          eq(metaSnapshotLineages.resourceType, resourceType),
          eq(metaSnapshots.status, 'published'),
          eq(metaSnapshotLineages.variant, 'saanseoi'),
          eq(metaSnapshotLineages.regionCode, 'hk'),
        ),
      )
      .orderBy(desc(metaSnapshots.publishedAt), desc(metaSnapshots.createdAt))
      .limit(1)
      .get()
  const [snapshot, districtSnapshot] = await Promise.all([
    latest('divisionArea'),
    latest('division'),
  ])
  if (!snapshot || !districtSnapshot) return []
  const {
    divisionAreas,
    divisions,
    divisionPublicationState: districts,
    divisionAreaPublicationState: publication,
  } = currentSchema
  return current
    .select({
      divisionId: divisionAreas.divisionId,
      geometry: divisionAreas.geometry,
      variant: divisionAreas.variant,
    })
    .from(divisionAreas)
    .innerJoin(publication, eq(divisionAreas.scopeId, publication.scopeId))
    .innerJoin(divisions, eq(divisionAreas.divisionId, divisions.id))
    .innerJoin(districts, eq(divisions.scopeId, districts.scopeId))
    .where(
      and(
        eq(publication.snapshotId, snapshot.id),
        eq(publication.status, 'current'),
        isNotNull(publication.preparedAt),
        ne(publication.publicationToken, ''),
        eq(districts.snapshotId, districtSnapshot.id),
        eq(districts.status, 'current'),
        isNotNull(districts.preparedAt),
        ne(districts.publicationToken, ''),
        eq(divisions.class, 'district'),
        eq(divisionAreas.isLand, true),
        eq(divisionAreas.isTerritorial, false),
      ),
    )
    .orderBy(divisionAreas.divisionId, divisionAreas.variant, divisionAreas.id)
    .all()
}
