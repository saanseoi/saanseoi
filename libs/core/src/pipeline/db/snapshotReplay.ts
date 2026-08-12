import { and, eq, inArray } from 'drizzle-orm'
import { historySchema } from '@repo/db'

import type { HarbourReadableDb } from '../../lib/db/types'
import type { SnapshotReplayStep } from '../../lib/db/metaRegistry'
import { chunkArray, getMaxItemsPerInClause } from '../utils'

export type ReplayShard = { bindingName: string; db: HarbourReadableDb }
export type ResolvedSnapshotVersion = {
  recordType: string
  recordId: string
  locale: string
  versionHash: string
  sourceReleaseId: string
  shard: ReplayShard
}

const replayKey = (recordType: string, recordId: string, locale: string) =>
  `${recordType}\u0000${recordId}\u0000${locale}`

/**
 * Materialises membership by applying compact journal deltas root-to-leaf.
 * Content is not copied: each live entry retains the shard owning its immutable
 * content hash, allowing callers to fetch only the tables they need.
 */
export async function resolveSnapshotVersionState(
  plan: SnapshotReplayStep[],
  shards: ReadonlyMap<string, ReplayShard>,
  recordTypes: readonly string[],
): Promise<Map<string, ResolvedSnapshotVersion>> {
  const state = new Map<string, ResolvedSnapshotVersion>()
  const typeBatches = chunkArray(
    [...recordTypes],
    Math.max(1, getMaxItemsPerInClause(1)),
  )

  for (const step of plan) {
    for (const assignment of step.shards) {
      const shard = shards.get(assignment.bindingName)
      if (!shard) {
        throw new Error(
          `Snapshot ${step.snapshotId} requires unavailable history binding ${assignment.bindingName}.`,
        )
      }
      for (const types of typeBatches) {
        const rows = await shard.db
          .select({
            recordType: historySchema.snapshotVersionChanges.recordType,
            recordId: historySchema.snapshotVersionChanges.recordId,
            locale: historySchema.snapshotVersionChanges.locale,
            versionHash: historySchema.snapshotVersionChanges.versionHash,
            operation: historySchema.snapshotVersionChanges.operation,
            sourceReleaseId: historySchema.snapshotVersionChanges.sourceReleaseId,
          })
          .from(historySchema.snapshotVersionChanges)
          .where(
            and(
              eq(historySchema.snapshotVersionChanges.snapshotId, step.snapshotId),
              inArray(historySchema.snapshotVersionChanges.recordType, types),
            ),
          )
          .all()
        for (const row of rows) {
          const key = replayKey(row.recordType, row.recordId, row.locale)
          if (row.operation === 'delete' || !row.versionHash || !row.sourceReleaseId) {
            state.delete(key)
          } else {
            state.set(key, {
              recordType: row.recordType,
              recordId: row.recordId,
              locale: row.locale,
              versionHash: row.versionHash,
              sourceReleaseId: row.sourceReleaseId,
              shard,
            })
          }
        }
      }
    }
  }
  return state
}

export function groupResolvedVersionsByShard(
  versions: Iterable<ResolvedSnapshotVersion>,
): Map<string, ResolvedSnapshotVersion[]> {
  const grouped = new Map<string, ResolvedSnapshotVersion[]>()
  for (const version of versions) {
    const rows = grouped.get(version.shard.bindingName) ?? []
    rows.push(version)
    grouped.set(version.shard.bindingName, rows)
  }
  return grouped
}
