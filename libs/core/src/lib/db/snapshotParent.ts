import { and, desc, eq, metaSchema, sql } from '@repo/db'
import type { HarbourReadableDb } from './types'

/**
 * A retained revision is not necessarily an accepted predecessor. Catalogue
 * membership selects the serving branch; older catalogue rows remain immutable.
 * Source-only lineages can advance before their first catalogue publication.
 */
export async function resolveAcceptedSnapshotParent(
  db: HarbourReadableDb,
  input: {
    lineageId: string
    cohortKey: string
    identityMode: 'persistent' | 'cohort_scoped'
  },
) {
  const snapshots = metaSchema.metaSnapshots
  const eligible = and(
    eq(snapshots.snapshotLineageId, input.lineageId),
    eq(snapshots.status, 'published'),
    input.identityMode === 'cohort_scoped'
      ? eq(snapshots.cohortKey, input.cohortKey)
      : sql`${snapshots.cohortKey} <= ${input.cohortKey}`,
  )
  if (
    !(await db
      .select({ id: snapshots.id })
      .from(snapshots)
      .where(eligible)
      .limit(1)
      .get())
  )
    return undefined
  const catalogued = await db
    .select({ id: snapshots.id })
    .from(snapshots)
    .where(
      and(
        eq(snapshots.snapshotLineageId, input.lineageId),
        sql`EXISTS (
        SELECT 1 FROM apiReleaseSetSnapshots member
        JOIN apiCatalogRevisionReleaseSets selected ON selected.apiReleaseSetId=member.apiReleaseSetId
        JOIN apiCatalogRevisions catalogue ON catalogue.id=selected.apiCatalogRevisionId
        WHERE member.snapshotId=${snapshots.id} AND catalogue.status<>'draft'
      )`,
      ),
    )
    .limit(1)
    .get()
  return db
    .select({ id: snapshots.id })
    .from(snapshots)
    .where(
      and(
        eligible,
        sql`NOT EXISTS (
      SELECT 1 FROM snapshotSources source
      JOIN releases release ON release.id=source.resourceReleaseId
      WHERE source.snapshotId=${snapshots.id} AND source.role<>'lookup' AND release.status='revoked'
    )`,
        catalogued
          ? sql`EXISTS (
      SELECT 1 FROM apiReleaseSetSnapshots member
      JOIN apiCatalogRevisionReleaseSets selected ON selected.apiReleaseSetId=member.apiReleaseSetId
      JOIN apiCatalogRevisions catalogue ON catalogue.id=selected.apiCatalogRevisionId
      WHERE member.snapshotId=${snapshots.id} AND catalogue.status='current'
        AND catalogue.id=(
          SELECT latest.id FROM apiCatalogRevisions latest
          WHERE latest.apiVersionId=catalogue.apiVersionId AND latest.regionCode=catalogue.regionCode
            AND latest.status='current'
          ORDER BY latest.publishedAt DESC,latest.revision DESC LIMIT 1
        )
    )`
          : undefined,
      ),
    )
    .orderBy(desc(snapshots.cohortKey), desc(snapshots.revision))
    .limit(1)
    .get()
}

export async function assertAcceptedDraftSnapshotParent(
  db: HarbourReadableDb,
  snapshot: {
    id: string
    status: string
    snapshotLineageId: string | null
    parentSnapshotId: string | null
    cohortKey: string
  },
) {
  if (snapshot.status !== 'draft') return
  const lineages = metaSchema.metaSnapshotLineages
  const lineage = snapshot.snapshotLineageId
    ? await db
        .select({ identityMode: lineages.identityMode })
        .from(lineages)
        .where(eq(lineages.id, snapshot.snapshotLineageId))
        .get()
    : undefined
  if (!lineage || !snapshot.snapshotLineageId)
    throw new Error('Draft snapshot requires its exact lineage before reuse.')
  const parent = await resolveAcceptedSnapshotParent(db, {
    lineageId: snapshot.snapshotLineageId,
    cohortKey: snapshot.cohortKey,
    identityMode: lineage.identityMode,
  })
  if (snapshot.parentSnapshotId !== (parent?.id ?? null))
    throw new Error(
      'Draft snapshot predecessor is no longer selected; prepare a fresh draft before ingestion.',
    )
}
