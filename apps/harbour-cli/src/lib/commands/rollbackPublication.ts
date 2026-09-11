import { sql } from '@repo/db'
import type { HarbourReadableDb } from '@repo/core/db/types'
import type { ResourceType } from '@repo/core'

/** Draft deletion needs an intact serving predecessor when the draft owns current. */
export async function assertDraftPurgePublicationAvailable(
  current: HarbourReadableDb,
  input: {
    resourceType: ResourceType
    snapshotId: string
    previousSnapshotId: string | null
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
  {
    const ownsScope = await current
      .select({ owned: sql<number>`1` })
      .from(sql.raw(table))
      .where(sql`snapshotId = ${input.snapshotId}`)
      .get()
    if (!ownsScope) return
  }
  throw new Error(
    `Cannot purge ${input.snapshotId}: its predecessor ${input.previousSnapshotId} has no ready current projection. Complete recovery of the draft-owned current scope before purging. Published releases use rollback reconstruction.`,
  )
}
