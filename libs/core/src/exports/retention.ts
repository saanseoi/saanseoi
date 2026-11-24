import { and, desc, eq, ne, metaSchema as m } from '@repo/db'
import type { HarbourReadableDb } from '../lib/db/types'
import { exportPrefix, supportsExports, type ExportSelection } from './contracts'

/** Publication ordering matches API selection; upload time never promotes an old cohort. */
export async function listExportReleases(
  db: HarbourReadableDb,
  selection: Pick<ExportSelection, 'apiVersion' | 'family' | 'domain' | 'region'>,
) {
  const rows = await db
    .select({
      id: m.metaApiReleaseSets.id,
      code: m.metaApiReleaseSets.code,
      cohortKey: m.metaApiReleaseSets.cohortKey,
      revision: m.metaApiReleaseSets.revision,
    })
    .from(m.metaApiReleaseSets)
    .innerJoin(
      m.metaApiVersionReleaseSets,
      eq(m.metaApiVersionReleaseSets.apiReleaseSetId, m.metaApiReleaseSets.id),
    )
    .innerJoin(
      m.metaApiVersions,
      eq(m.metaApiVersions.id, m.metaApiVersionReleaseSets.apiVersionId),
    )
    .innerJoin(
      m.metaApiReleaseSetSnapshots,
      eq(m.metaApiReleaseSetSnapshots.apiReleaseSetId, m.metaApiReleaseSets.id),
    )
    .innerJoin(
      m.metaSnapshots,
      eq(m.metaSnapshots.id, m.metaApiReleaseSetSnapshots.snapshotId),
    )
    .innerJoin(
      m.metaSnapshotLineages,
      eq(m.metaSnapshotLineages.id, m.metaSnapshots.snapshotLineageId),
    )
    .where(
      and(
        eq(m.metaApiVersions.code, selection.apiVersion),
        eq(m.metaApiVersions.familyType, selection.family),
        eq(m.metaApiReleaseSets.domainCode, selection.domain),
        eq(m.metaApiReleaseSets.regionCode, selection.region),
        ne(m.metaApiVersionReleaseSets.status, 'draft'),
        eq(
          m.metaSnapshotLineages.resourceType,
          selection.family === 'divisions' ? 'division' : 'street',
        ),
        eq(
          m.metaApiReleaseSetSnapshots.variant,
          selection.family === 'divisions' ? 'saanseoi' : 'hkgov-landsd',
        ),
      ),
    )
    .orderBy(
      desc(m.metaApiReleaseSets.cohortKey),
      desc(m.metaApiReleaseSets.revision),
      desc(m.metaApiVersionReleaseSets.publishedAt),
    )
    .all()
  return [...new Map(rows.map(row => [row.id, row])).values()]
}

/** Delete only owned export objects outside the retained two, never API history or sources. */
export async function expireReleaseExports(
  db: HarbourReadableDb,
  bucket: R2Bucket,
  selection: ExportSelection,
): Promise<void> {
  if (!supportsExports(selection)) return
  const releases = await listExportReleases(db, selection)
  for (const release of releases.slice(2)) {
    const prefix = exportPrefix({ ...selection, apiReleaseSetId: release.id })
    let cursor: string | undefined
    do {
      const page = await bucket.list({ prefix, cursor, limit: 100 })
      if (page.objects.length)
        await bucket.delete(page.objects.map(object => object.key))
      cursor = page.truncated ? page.cursor : undefined
    } while (cursor)
  }
}
