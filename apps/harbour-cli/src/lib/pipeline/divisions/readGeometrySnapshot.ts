import { resolveSnapshotReplayPlan } from '@repo/core/db/metaRegistry'
import type { HarbourReadableDb } from '@repo/core/db/types'
import {
  groupResolvedVersionsByShard,
  resolveSnapshotVersionState,
  type ReplayShard,
} from '@repo/core/pipeline/db/snapshotReplay'
import { chunkArray } from '@repo/core/pipeline/utils'
import { currentSchema, historySchema, metaSchema, eq, sql } from '@repo/db'
import type { LocalAddressDbContext } from '../../dbCache/localDbCacheTypes.ts'

type GeometrySnapshotRow = (
  | typeof currentSchema.divisionAreas.$inferSelect
  | typeof currentSchema.divisionBoundaries.$inferSelect
) & { versionHash?: string }

/** Read the selected revision, even when its scope now projects a newer snapshot. */
export async function readGeometrySnapshot(
  context: Pick<LocalAddressDbContext, 'currentDb' | 'metaDb' | 'historyTargets'>,
  resourceType: 'divisionArea' | 'divisionBoundary',
  snapshotId: string,
): Promise<GeometrySnapshotRow[]> {
  const publicationTable =
    resourceType === 'divisionArea'
      ? currentSchema.divisionAreaPublicationState
      : currentSchema.divisionBoundaryPublicationState
  const receipt = await context.currentDb
    .select()
    .from(publicationTable)
    .where(eq(publicationTable.snapshotId, snapshotId))
    .get()
  if (receipt) {
    // An interrupted current projection must never fall back to partial journals.
    if (!receipt.preparedAt || !receipt.publicationToken)
      throw new Error(
        `Snapshot ${snapshotId} has no complete ${resourceType}PublicationState receipt.`,
      )
    const table =
      resourceType === 'divisionArea'
        ? currentSchema.divisionAreas
        : currentSchema.divisionBoundaries
    return context.currentDb
      .select()
      .from(table)
      .where(eq(table.snapshotId, receipt.scopeId))
      .all()
  }

  const snapshot = await context.metaDb
    .select({
      status: metaSchema.metaSnapshots.status,
      resourceType: metaSchema.metaSnapshots.resourceType,
    })
    .from(metaSchema.metaSnapshots)
    .where(eq(metaSchema.metaSnapshots.id, snapshotId))
    .get()
  if (snapshot?.status !== 'published' || snapshot.resourceType !== resourceType)
    throw new Error(
      `Geometry replay requires a published ${resourceType} snapshot ${snapshotId}.`,
    )
  const plan = await resolveSnapshotReplayPlan(
    context.metaDb as unknown as HarbourReadableDb,
    snapshotId,
  )
  for (const step of plan)
    if (!step.shards.length)
      throw new Error(`Snapshot ${step.snapshotId} has no assigned history shards.`)
  const shards = context.historyTargets as unknown as ReplayShard[]
  const state = await resolveSnapshotVersionState(
    plan,
    new Map(shards.map(shard => [shard.bindingName, shard])),
    [resourceType],
  )
  const table =
    resourceType === 'divisionArea'
      ? historySchema.divisionAreas
      : historySchema.divisionBoundaries
  const rows: GeometrySnapshotRow[] = []
  for (const versions of groupResolvedVersionsByShard(state.values()).values()) {
    const db = versions[0]!.shard.db
    for (const chunk of chunkArray(versions, 64)) {
      const found = await db
        .select()
        .from(table)
        .where(
          sql`(id,versionHash) IN (SELECT json_extract(value,'$[0]'),json_extract(value,'$[1]') FROM json_each(${JSON.stringify(chunk.map(row => [row.recordId, row.versionHash]))}))`,
        )
        .all()
      if (found.length !== chunk.length)
        throw new Error(
          `Snapshot ${snapshotId} is missing retained ${resourceType} versions in ${versions[0]!.shard.bindingName}.`,
        )
      rows.push(...(found as unknown as GeometrySnapshotRow[]))
    }
  }
  return rows
}
