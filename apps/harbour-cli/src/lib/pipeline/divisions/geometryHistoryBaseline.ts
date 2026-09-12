import { resolveSnapshotReplayPlan } from '@repo/core/db/metaRegistry'
import type { HarbourReadableDb } from '@repo/core/db/types'
import {
  groupResolvedVersionsByShard,
  resolveSnapshotVersionState,
} from '@repo/core/pipeline/db/snapshotReplay'
import { hashDivisionGeometryRow } from '@repo/core/pipeline/services/divisions/divisionGeometry'
import { chunkArray } from '@repo/core/pipeline/utils'
import { historySchema, sql } from '@repo/db'
import type { LocalAddressDbContext } from '../../dbCache/localDbCacheTypes.ts'
import type { GeometryUploadPlan } from './processLocalDivisionGeometrySqlUploadTypes.ts'
import { decodeStoredGeoJsonGeometry } from './processLocalDivisionGeometrySqlUploadStatistics.ts'

/** Only a complete, reconstructable parent can supply omitted child membership. */
export async function validateGeometryHistoryBaseline(
  context: LocalAddressDbContext,
  resourceType: GeometryUploadPlan['resourceType'],
  parentSnapshotId: string,
  selected: ReadonlyMap<string, { versionHash: string }>,
) {
  const plan = await resolveSnapshotReplayPlan(
    context.metaDb as unknown as HarbourReadableDb,
    parentSnapshotId,
  )
  const shards = new Map(
    context.historyTargets.map(target => [
      target.bindingName,
      { bindingName: target.bindingName, db: target.db as HarbourReadableDb },
    ]),
  )
  if (shards.size !== context.historyTargets.length)
    throw new Error('Duplicate geometry history binding.')
  for (const step of plan) {
    if (!step.shards.length)
      throw new Error(
        `Geometry parent ${step.snapshotId} has no retained history assignment.`,
      )
    if (
      new Set(step.shards.map(shard => shard.bindingName)).size !== step.shards.length
    )
      throw new Error(`Duplicate geometry history assignment for ${step.snapshotId}.`)
  }
  const versions = await resolveSnapshotVersionState(plan, shards, [resourceType])
  if (
    versions.size !== selected.size ||
    [...versions.values()].some(
      version =>
        version.locale !== '' ||
        selected.get(version.recordId)?.versionHash !== version.versionHash,
    )
  )
    throw new Error(
      'Geometry parent membership does not match its selected projection.',
    )

  const table =
    resourceType === 'divisionArea'
      ? historySchema.divisionAreas
      : historySchema.divisionBoundaries
  for (const group of groupResolvedVersionsByShard(versions.values()).values()) {
    for (const batch of chunkArray(group, 64)) {
      const first = batch[0]
      if (!first) continue
      const rows = await first.shard.db
        .select()
        .from(table)
        .where(
          sql`(${table.id},${table.versionHash}) IN (SELECT json_extract(value,'$[0]'),json_extract(value,'$[1]') FROM json_each(${JSON.stringify(batch.map(version => [version.recordId, version.versionHash]))}))`,
        )
        .all()
      if (rows.length !== batch.length)
        throw new Error(
          `Missing exact geometry parent content on ${first.shard.bindingName}.`,
        )
      for (const row of rows) {
        const {
          versionHash,
          sourceReleaseId: _release,
          isCurrent: _current,
          ...canonical
        } = row as unknown as
          | typeof historySchema.divisionAreas.$inferSelect
          | typeof historySchema.divisionBoundaries.$inferSelect
        const hash = await hashDivisionGeometryRow({
          ...canonical,
          geometry: decodeStoredGeoJsonGeometry(canonical.geometry),
        })
        if (hash !== versionHash)
          throw new Error(`Geometry parent content hash mismatch for ${row.id}.`)
      }
    }
  }
}
