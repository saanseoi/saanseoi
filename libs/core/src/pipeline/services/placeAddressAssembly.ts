import { eq, metaSchema } from '@repo/db'
import type { HarbourReadableDb, HarbourWritableDb } from '../../lib/db/types'
import { recordEffectiveSnapshotAssembly } from '../db/snapshotAssembly'

/** A scoped assembly records both analysis and finalisation without changing the
 * default Address-family assembly selected by other ingesters. */
export async function recordPlaceAddressAssembly(
  db: HarbourReadableDb & HarbourWritableDb,
  input: {
    snapshotId: string
    resourceType: 'place' | 'address'
    anchorReleaseId: string
    anchorCohortKey: string
    selectionSummaryJson: Record<string, unknown>
  },
) {
  const snapshot = await db
    .select({ status: metaSchema.metaSnapshots.status })
    .from(metaSchema.metaSnapshots)
    .where(eq(metaSchema.metaSnapshots.id, input.snapshotId))
    .get()
  if (snapshot?.status !== 'draft')
    throw new Error('Cannot change a published Place Address assembly.')
  await recordEffectiveSnapshotAssembly(db, { ...input, allowPlanning: true })
}
