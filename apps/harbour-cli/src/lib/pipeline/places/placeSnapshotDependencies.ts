import type { HarbourReadableDb } from '@repo/core/db/types'
import { and, currentSchema, eq, metaSchema, sql } from '@repo/db'

export async function readAddressDivisionSnapshotId(
  metaDb: HarbourReadableDb,
  addressSnapshotId: string,
) {
  const assembly = await metaDb
    .select({ summary: metaSchema.metaSnapshotAssemblyRuns.selectionSummaryJson })
    .from(metaSchema.metaSnapshotAssemblyRuns)
    .where(eq(metaSchema.metaSnapshotAssemblyRuns.snapshotId, addressSnapshotId))
    .get()
  const summary = assembly?.summary as
    | { lookupSnapshotIds?: { division?: string } }
    | undefined
  const divisionSnapshotId = summary?.lookupSnapshotIds?.division
  if (!divisionSnapshotId)
    throw new Error(
      `Address snapshot ${addressSnapshotId} has no recorded exact Division dependency.`,
    )
  return divisionSnapshotId
}

/** Exact dependency metadata also covers valid snapshots containing no addresses. */
export async function resolvePlaceDivisionDependency(
  metaDb: HarbourReadableDb,
  dependencyDb: HarbourReadableDb,
  addressSnapshotId: string,
) {
  const divisionSnapshotId = await readAddressDivisionSnapshotId(
    metaDb,
    addressSnapshotId,
  )
  const publication = currentSchema.divisionPublicationState
  const divisionPublication = await dependencyDb
    .select({ scopeId: publication.scopeId })
    .from(publication)
    .where(
      and(
        eq(publication.snapshotId, divisionSnapshotId),
        sql`${publication.preparedAt} IS NOT NULL`,
      ),
    )
    .get()
  if (!divisionPublication)
    throw new Error(
      `Places require the complete exact Division projection ${divisionSnapshotId}.`,
    )
  const division = await metaDb
    .select({ id: metaSchema.metaSnapshots.id })
    .from(metaSchema.metaSnapshots)
    .where(
      and(
        eq(metaSchema.metaSnapshots.id, divisionSnapshotId),
        eq(metaSchema.metaSnapshots.resourceType, 'division'),
        eq(metaSchema.metaSnapshots.status, 'published'),
      ),
    )
    .get()
  if (!division)
    throw new Error(
      `Places require the published Division snapshot ${divisionSnapshotId} selected by Address snapshot ${addressSnapshotId}.`,
    )
  const addresses = currentSchema.address2d
  const addressPublication = currentSchema.addressPublicationState
  const inconsistent = await dependencyDb
    .select({ id: addresses.id })
    .from(addresses)
    .where(
      and(
        sql`${addresses.snapshotId} = (SELECT ${addressPublication.scopeId} FROM ${addressPublication} WHERE ${addressPublication.snapshotId} = ${addressSnapshotId} AND ${addressPublication.preparedAt} IS NOT NULL)`,
        sql`${addresses.divisionSnapshotId} IS NOT ${divisionPublication.scopeId}`,
      ),
    )
    .limit(1)
    .get()
  if (inconsistent)
    throw new Error(
      `Selected Places Address snapshot ${addressSnapshotId} contains a different Division dependency; refusing to build an ambiguous Place index.`,
    )
  return division
}
