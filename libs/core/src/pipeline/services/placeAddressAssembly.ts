import { buildDeterministicUuidV5, eq, metaSchema } from '@repo/db'
import type { HarbourReadableDb, HarbourWritableDb } from '../../lib/db/types'
import { createHash } from '../utils'

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
  const code = `snapshot-assembly-overture-places-${input.resourceType}-v1`
  const namespace = '747dc748-4086-5dc5-a0de-7d1fefcd0c51'
  const assemblyId = buildDeterministicUuidV5(namespace, code)
  const id = buildDeterministicUuidV5(namespace, `${code}:${input.snapshotId}`)
  const now = new Date().toISOString()
  await db
    .insert(metaSchema.metaSnapshotAssembly)
    .values({
      id: assemblyId,
      code,
      resourceType: input.resourceType,
      version: 1,
      status: 'scoped',
      versionHash: await createHash({ code }),
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing()
    .run()
  const snapshot = await db
    .select({ status: metaSchema.metaSnapshots.status })
    .from(metaSchema.metaSnapshots)
    .where(eq(metaSchema.metaSnapshots.id, input.snapshotId))
    .get()
  if (snapshot?.status !== 'draft')
    throw new Error('Cannot change a published Place Address assembly.')
  await db
    .insert(metaSchema.metaSnapshotAssemblyRuns)
    .values({
      id,
      snapshotAssemblyId: assemblyId,
      snapshotId: input.snapshotId,
      anchorReleaseId: input.anchorReleaseId,
      anchorCohortKey: input.anchorCohortKey,
      selectionSummaryJson: input.selectionSummaryJson,
      status: 'selected',
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: metaSchema.metaSnapshotAssemblyRuns.id,
      set: { selectionSummaryJson: input.selectionSummaryJson, updatedAt: now },
    })
    .run()
}
