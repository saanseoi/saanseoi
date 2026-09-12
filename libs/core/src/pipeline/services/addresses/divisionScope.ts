import { eq, metaSchema } from '@repo/db'
import type { HarbourReadableDb } from '../../../lib/db/types'
import { getPreparedPublication } from '../publication/execute'

/** Historical selection stays in provenance; current foreign keys use the persistent lineage. */
export async function resolveAddressDivisionScope(
  metaDb: HarbourReadableDb,
  currentDb: HarbourReadableDb,
  snapshotId: string,
) {
  const selected = await metaDb
    .select({
      scopeId: metaSchema.metaSnapshots.snapshotLineageId,
      resourceType: metaSchema.metaSnapshots.resourceType,
      status: metaSchema.metaSnapshots.status,
    })
    .from(metaSchema.metaSnapshots)
    .where(eq(metaSchema.metaSnapshots.id, snapshotId))
    .get()
  if (selected?.resourceType !== 'division' || selected.status !== 'published')
    throw new Error(
      `Address Division selection ${snapshotId} is not a published division snapshot.`,
    )
  const receipt = await getPreparedPublication(
    currentDb,
    'divisionPublicationState',
    selected.scopeId,
  )
  if (!receipt)
    throw new Error(
      `Division lineage ${selected.scopeId} has no complete publication receipt for Address references.`,
    )
  const projected = await metaDb
    .select({ scopeId: metaSchema.metaSnapshots.snapshotLineageId })
    .from(metaSchema.metaSnapshots)
    .where(eq(metaSchema.metaSnapshots.id, receipt.snapshotId))
    .get()
  if (projected?.scopeId !== selected.scopeId)
    throw new Error('Division publication receipt does not match the selected lineage.')
  return selected.scopeId
}
