import { eq, metaSchema } from '@repo/db'
import type { HarbourReadableDb, HarbourWritableDb } from '../../lib/db/types'

/** Exact snapshot inputs, keyed by their construction role. */
export async function readSnapshotDependencies(
  db: HarbourReadableDb,
  snapshotId: string,
) {
  const table = metaSchema.metaSnapshotDependencies
  const rows = await db
    .select({ role: table.role, dependencySnapshotId: table.dependencySnapshotId })
    .from(table)
    .where(eq(table.snapshotId, snapshotId))
    .all()
  return Object.fromEntries(rows.map(row => [row.role, row.dependencySnapshotId]))
}

/** Draft stages can add roles or replace a selection; published selections are immutable. */
export async function recordSnapshotDependencies(
  db: HarbourReadableDb & HarbourWritableDb,
  snapshotId: string,
  dependencies: Record<string, string>,
) {
  if (!Object.keys(dependencies).length) return
  const snapshot = await db
    .select({ status: metaSchema.metaSnapshots.status })
    .from(metaSchema.metaSnapshots)
    .where(eq(metaSchema.metaSnapshots.id, snapshotId))
    .get()
  if (snapshot?.status !== 'draft')
    throw new Error(
      `Cannot change dependencies of a missing or published snapshot: ${snapshotId}.`,
    )
  const table = metaSchema.metaSnapshotDependencies
  for (const [role, dependencySnapshotId] of Object.entries(dependencies)) {
    if (!role || !dependencySnapshotId || dependencySnapshotId === snapshotId)
      throw new Error(`Invalid snapshot dependency ${snapshotId}/${role}.`)
    await db
      .insert(table)
      .values({ snapshotId, role, dependencySnapshotId })
      .onConflictDoUpdate({
        target: [table.snapshotId, table.role],
        set: { dependencySnapshotId },
      })
      .run()
  }
}
