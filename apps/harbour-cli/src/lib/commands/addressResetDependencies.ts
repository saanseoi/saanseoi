import type { HarbourReadableDb } from '@repo/core/db/types'
import { and, currentSchema, historySchema, metaSchema, or, sql } from '@repo/db'

type Context = {
  metaDb: HarbourReadableDb
  currentDb: HarbourReadableDb
  historyTargets: readonly { bindingName: string; db: HarbourReadableDb }[]
}

/** Full reset removes retained history, so logical dependency references must survive. */
export async function officialAddressResetDependencyBlockers(
  context: Context,
  owned: { snapshotIds: string[]; releaseIds: string[]; apiReleaseSetIds: string[] },
) {
  // JSON membership has a fixed parameter count even for long initialisations.
  const member = (column: unknown, ids: string[]) =>
    sql`${column} IN (SELECT value FROM json_each(${JSON.stringify(ids)}))`
  const outside = (column: unknown, ids: string[]) =>
    sql`${column} NOT IN (SELECT value FROM json_each(${JSON.stringify(ids)}))`
  const blockers: string[] = []
  const source = metaSchema.metaSnapshotSources
  if (
    await context.metaDb
      .select({ id: source.snapshotId })
      .from(source)
      .where(
        and(
          outside(source.snapshotId, owned.snapshotIds),
          or(
            member(source.resourceReleaseId, owned.releaseIds),
            member(source.anchorReleaseId, owned.releaseIds),
          ),
        ),
      )
      .limit(1)
      .get()
  )
    blockers.push('Other snapshots retain official Address source dependencies')
  const selection = metaSchema.metaApiReleaseSetSnapshots
  if (
    await context.metaDb
      .select({ id: selection.snapshotId })
      .from(selection)
      .where(
        and(
          outside(selection.apiReleaseSetId, owned.apiReleaseSetIds),
          or(
            member(selection.snapshotId, owned.snapshotIds),
            member(selection.anchorSnapshotId, owned.snapshotIds),
          ),
        ),
      )
      .limit(1)
      .get()
  )
    blockers.push('Other API families retain official Address snapshots')
  const snapshots = metaSchema.metaSnapshots
  if (
    await context.metaDb
      .select({ id: snapshots.id })
      .from(snapshots)
      .where(
        and(
          outside(snapshots.id, owned.snapshotIds),
          member(snapshots.parentSnapshotId, owned.snapshotIds),
        ),
      )
      .limit(1)
      .get()
  )
    blockers.push('Other snapshots retain official Address parents')
  const assembly = metaSchema.metaSnapshotAssemblyRuns
  if (
    await context.metaDb
      .select({ id: assembly.snapshotId })
      .from(assembly)
      .where(
        and(
          outside(assembly.snapshotId, owned.snapshotIds),
          or(
            member(assembly.anchorReleaseId, owned.releaseIds),
            sql`EXISTS (SELECT 1 FROM json_each(${assembly.selectionSummaryJson}, '$.lookupSnapshotIds') AS dependency WHERE ${member(sql`dependency.value`, owned.snapshotIds)})`,
          ),
        ),
      )
      .limit(1)
      .get()
  )
    blockers.push('Other snapshots retain official Address assembly dependencies')
  for (const [label, db, places] of [
    ['current', context.currentDb, currentSchema.places],
    ...context.historyTargets.map(
      target => [target.bindingName, target.db, historySchema.places] as const,
    ),
  ] as const) {
    if (
      await db
        .select({ id: places.id })
        .from(places)
        .where(member(places.addressSnapshotId, owned.snapshotIds))
        .limit(1)
        .get()
    )
      blockers.push(`${label}: Places retain exact official Address dependencies`)
  }
  return blockers
}
