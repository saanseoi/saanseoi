import { and, eq, sql } from 'drizzle-orm'
import { historySchema } from '@repo/db'
import type { SourceResolutions } from '@repo/db/historySchema'
import type { SnapshotReplayStep } from '../../lib/db/metaRegistry'
import type { ReplayShard } from './snapshotReplay'

export type ResolvedSnapshotSourceResolution = {
  snapshotId: string
  sourceReleaseId: string
  sourceRecordId: string
  sourceVersionHash: string
  resolutions: SourceResolutions
  shard: ReplayShard
}

/**
 * Replay sparse snapshot interpretations in explicit root-to-leaf ancestry order.
 * Unchanged assertions remain owned by the snapshot/shard which recorded them.
 * An omission is a retained assertion with empty entities and a source_omission
 * decision; only a later assertion can replace it. Release-scoped interpretations
 * (including Statistics) are outside this reader's scope.
 */
export async function resolveSnapshotSourceResolutions(
  plan: SnapshotReplayStep[],
  shards: ReadonlyMap<string, ReplayShard>,
): Promise<Map<string, ResolvedSnapshotSourceResolution>> {
  let parent: string | null = null
  const snapshots = new Set<string>()
  for (const step of plan) {
    if (snapshots.has(step.snapshotId) || step.parentSnapshotId !== parent)
      throw new Error(
        'Source resolution replay requires a complete root-to-leaf snapshot ancestry.',
      )
    snapshots.add(step.snapshotId)
    parent = step.snapshotId
    for (const assignment of step.shards) {
      if (!shards.has(assignment.bindingName))
        throw new Error(
          `Snapshot ${step.snapshotId} requires unavailable history binding ${assignment.bindingName}.`,
        )
    }
  }
  const state = new Map<string, ResolvedSnapshotSourceResolution>()
  for (const step of plan) {
    const seen = new Set<string>()
    for (const binding of new Set(
      step.shards.map(assignment => assignment.bindingName),
    )) {
      const shard = shards.get(binding)
      if (!shard)
        throw new Error(`Missing source resolution history binding ${binding}.`)
      // Page along the primary key so large snapshots do not require one unbounded
      // database response. Six scalar parameters cover the scope, cursor and limit.
      let cursor:
        | { sourceReleaseId: string; sourceRecordId: string; sourceVersionHash: string }
        | undefined
      while (true) {
        const rows = await shard.db
          .select({
            sourceReleaseId: historySchema.sourceResolutions.sourceReleaseId,
            sourceRecordId: historySchema.sourceResolutions.sourceRecordId,
            sourceVersionHash: historySchema.sourceResolutions.sourceVersionHash,
            resolutions: historySchema.sourceResolutions.resolutions,
          })
          .from(historySchema.sourceResolutions)
          .where(
            and(
              eq(
                historySchema.sourceResolutions.scopeId,
                `snapshot:${step.snapshotId}`,
              ),
              eq(historySchema.sourceResolutions.snapshotId, step.snapshotId),
              cursor
                ? sql`(${historySchema.sourceResolutions.sourceReleaseId}, ${historySchema.sourceResolutions.sourceRecordId}, ${historySchema.sourceResolutions.sourceVersionHash}) > (${cursor.sourceReleaseId}, ${cursor.sourceRecordId}, ${cursor.sourceVersionHash})`
                : undefined,
            ),
          )
          .orderBy(
            historySchema.sourceResolutions.sourceReleaseId,
            historySchema.sourceResolutions.sourceRecordId,
            historySchema.sourceResolutions.sourceVersionHash,
          )
          .limit(512)
          .all()
        for (const row of rows) {
          if (seen.has(row.sourceRecordId))
            throw new Error(
              `Ambiguous source interpretation for ${row.sourceRecordId} in snapshot ${step.snapshotId}.`,
            )
          seen.add(row.sourceRecordId)
          assertSourceResolution(row.resolutions, row.sourceRecordId)
          state.set(row.sourceRecordId, { ...row, snapshotId: step.snapshotId, shard })
        }
        cursor = rows.at(-1)
        if (rows.length < 512) break
      }
    }
  }
  return state
}

function assertSourceResolution(value: SourceResolutions, sourceRecordId: string) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    !value.entities ||
    typeof value.entities !== 'object' ||
    Array.isArray(value.entities) ||
    Object.values(value.entities).some(
      ids => !Array.isArray(ids) || ids.some(id => typeof id !== 'string' || !id),
    ) ||
    (value.decisions !== undefined &&
      (!Array.isArray(value.decisions) ||
        value.decisions.some(
          decision =>
            !decision || typeof decision !== 'object' || Array.isArray(decision),
        )))
  )
    throw new Error(`Invalid source interpretation for ${sourceRecordId}.`)
  if (
    value.decisions?.some(decision => decision.type === 'source_omission') &&
    Object.keys(value.entities).length
  )
    throw new Error(`Source omission must have empty entities: ${sourceRecordId}.`)
}
