import { and, eq, metaSchema, sql } from '@repo/db'
import type { HarbourReadableDb } from './types'

/** Follow completed source-only revisions without crossing a catalogue-selected branch. */
export async function resolveAcceptedStatisticSnapshotParent(
  db: HarbourReadableDb,
  lineageId: string,
  cohortKey: string,
) {
  // Qualify correlated columns explicitly: Drizzle strips column qualifiers
  // from SQL expressions in a single-table projection.
  const snapshots = metaSchema.metaSnapshots
  const candidates = await db
    .select({
      id: snapshots.id,
      parentSnapshotId: snapshots.parentSnapshotId,
      catalogued: sql<number>`EXISTS (
        SELECT 1 FROM apiReleaseSetSnapshots member
        JOIN apiCatalogRevisionReleaseSets selected ON selected.apiReleaseSetId=member.apiReleaseSetId
        JOIN apiCatalogRevisions catalogue ON catalogue.id=selected.apiCatalogRevisionId
        WHERE member.snapshotId=snapshots.id AND catalogue.status<>'draft'
      )`,
      selected: sql<number>`EXISTS (
        SELECT 1 FROM apiReleaseSetSnapshots member
        JOIN apiCatalogRevisionReleaseSets selected ON selected.apiReleaseSetId=member.apiReleaseSetId
        JOIN apiCatalogRevisions catalogue ON catalogue.id=selected.apiCatalogRevisionId
        WHERE member.snapshotId=snapshots.id AND catalogue.status='current'
          AND catalogue.id=(SELECT latest.id FROM apiCatalogRevisions latest
            WHERE latest.apiVersionId=catalogue.apiVersionId AND latest.regionCode=catalogue.regionCode
              AND latest.status='current'
            ORDER BY latest.publishedAt DESC,latest.revision DESC LIMIT 1)
      )`,
      completed: sql<number>`EXISTS (
        SELECT 1 FROM snapshotSources source
        JOIN releases release ON release.id=source.resourceReleaseId
        JOIN releaseProvenance audit ON audit.releaseId=release.id
        WHERE source.snapshotId=snapshots.id AND source.role='primary'
          AND release.status='published' AND audit.attemptStatus='completed'
      ) AND NOT EXISTS (
        SELECT 1 FROM snapshotSources source
        JOIN releases release ON release.id=source.resourceReleaseId
        WHERE source.snapshotId=snapshots.id AND source.role<>'lookup'
          AND release.status NOT IN ('published','superseded')
      )`,
      revoked: sql<number>`EXISTS (
        SELECT 1 FROM snapshotSources source
        JOIN releases release ON release.id=source.resourceReleaseId
        WHERE source.snapshotId=snapshots.id AND source.role<>'lookup' AND release.status='revoked'
      )`,
    })
    .from(snapshots)
    .where(
      and(
        eq(snapshots.snapshotLineageId, lineageId),
        eq(snapshots.cohortKey, cohortKey),
        eq(snapshots.status, 'published'),
      ),
    )
    .all()

  const selected = candidates.filter(row => row.selected && !row.revoked)
  if (selected.length > 1)
    throw new Error('Statistics period has multiple catalogue-selected predecessors.')
  let parent = selected[0]
  if (!parent && candidates.some(row => row.catalogued)) return undefined
  const deferred = candidates.filter(
    row => !row.catalogued && row.completed && !row.revoked,
  )
  const visited = new Set<string>()
  while (true) {
    const children = deferred.filter(
      row => row.parentSnapshotId === (parent?.id ?? null),
    )
    if (children.length > 1)
      throw new Error(
        'Statistics period has competing completed deferred revisions; resolve its publication branch before ingestion.',
      )
    const child = children[0]
    if (!child) return parent ? { id: parent.id } : undefined
    if (visited.has(child.id))
      throw new Error('Statistics snapshot ancestry contains a cycle.')
    visited.add(child.id)
    parent = child
  }
}
