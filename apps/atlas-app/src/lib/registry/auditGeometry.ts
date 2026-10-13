import { resolveSnapshotReplayPlan } from '@repo/core/db/metaRegistry'
import type { HarbourReadableDb } from '@repo/core/db/types'
import {
  type ReplayShard,
  resolveSnapshotVersionState,
} from '@repo/core/pipeline/db/snapshotReplay.ts'
import { decompressJsonBrotli } from '@repo/core/pipeline/services/storage/brotliJson.ts'
import type { CurrentDatabase, HistoryDatabase, MetaDatabase } from '@repo/db'
import { and, currentSchema, eq, historySchema, metaSchema, ne } from '@repo/db'

function decodeGeometry(value: unknown) {
  return value instanceof Uint8Array || value instanceof ArrayBuffer
    ? decompressJsonBrotli(value)
    : value
}

/** Audit geometry follows immutable snapshot membership after current cleanup. */
export async function readAuditGeometry(input: {
  resourceReleaseId: string
  divisionId: string
  currentDb: CurrentDatabase
  metaDb: MetaDatabase
  getHistoryDb: (bindingName: string) => HistoryDatabase
}) {
  const { metaSnapshotResourceReleases: sources, metaSnapshots: snapshots } = metaSchema
  const references = await input.metaDb
    .select({ snapshotId: sources.snapshotId })
    .from(sources)
    .innerJoin(snapshots, eq(snapshots.id, sources.snapshotId))
    .innerJoin(
      metaSchema.metaSnapshotLineages,
      eq(snapshots.snapshotLineageId, metaSchema.metaSnapshotLineages.id),
    )
    .where(
      and(
        eq(sources.resourceReleaseId, input.resourceReleaseId),
        ne(sources.role, 'lookup'),
        eq(metaSchema.metaSnapshotLineages.resourceType, 'divisionArea'),
      ),
    )
    .all()
  for (const { snapshotId } of references) {
    const currentTable = currentSchema.divisionAreas
    const current = await input.currentDb
      .select({ geometry: currentTable.geometry })
      .from(currentTable)
      .where(
        and(
          eq(currentTable.scopeId, snapshotId),
          eq(currentTable.divisionId, input.divisionId),
        ),
      )
      .get()
    if (current) return decodeGeometry(current.geometry)

    const plan = await resolveSnapshotReplayPlan(
      input.metaDb as unknown as HarbourReadableDb,
      snapshotId,
    )
    const shards = new Map<string, ReplayShard>()
    for (const step of plan) {
      for (const { bindingName } of step.shards) {
        if (!shards.has(bindingName)) {
          shards.set(bindingName, {
            bindingName,
            db: input.getHistoryDb(bindingName) as unknown as HarbourReadableDb,
          })
        }
      }
    }
    const table = historySchema.divisionAreas
    const recordIds = new Set<string>()
    for (const { db } of shards.values()) {
      const candidates = await db
        .select({ id: table.id })
        .from(table)
        .where(eq(table.divisionId, input.divisionId))
        .all()
      for (const candidate of candidates) recordIds.add(candidate.id)
    }
    const versions = await resolveSnapshotVersionState(
      plan,
      shards,
      ['divisionArea'],
      [...recordIds],
    )
    for (const version of versions.values()) {
      const historical = await version.shard.db
        .select({ geometry: table.geometry })
        .from(table)
        .where(
          and(
            eq(table.id, version.recordId),
            eq(table.versionHash, version.versionHash),
            eq(table.snapshotId, version.snapshotId),
            eq(table.divisionId, input.divisionId),
          ),
        )
        .get()
      if (historical) return decodeGeometry(historical.geometry)
    }
  }
  return null
}
