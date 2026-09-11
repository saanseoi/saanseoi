import { sql } from '@repo/db'
import type { HarbourReadableDb } from '@repo/core/db/types'
import type { ResourceType } from '@repo/core'

/** A metadata rollback cannot restore a mutable projection that has advanced. */
export async function assertRollbackPublicationAvailable(
  current: HarbourReadableDb,
  input: {
    resourceType: ResourceType
    snapshotId: string
    previousSnapshotId: string | null
    operation: 'rollback' | 'purge'
  },
) {
  const tables: Partial<Record<ResourceType, string>> = {
    division: 'divisionPublicationState',
    divisionArea: 'divisionAreaPublicationState',
    divisionBoundary: 'divisionBoundaryPublicationState',
    address: 'addressPublicationState',
    place: 'placePublicationState',
    street: 'streetPublicationState',
  }
  const table = tables[input.resourceType]
  if (!table || !input.previousSnapshotId) return
  const previous = await current
    .select({ ready: sql<number>`1` })
    .from(sql.raw(table))
    .where(
      sql`snapshotId = ${input.previousSnapshotId} AND status = 'current' AND preparedAt IS NOT NULL AND publicationToken <> ''`,
    )
    .get()
  if (previous) return
  // A draft that never acquired the current scope can still be removed safely.
  if (input.operation === 'purge') {
    const ownsScope = await current
      .select({ owned: sql<number>`1` })
      .from(sql.raw(table))
      .where(sql`snapshotId = ${input.snapshotId}`)
      .get()
    if (!ownsScope) return
  }
  throw new Error(
    `Cannot ${input.operation} ${input.snapshotId}: its predecessor ${input.previousSnapshotId} has no ready current projection. Automatic restoration from history is not implemented; prepare the predecessor through a separately authorised rebuild before retrying.`,
  )
}
