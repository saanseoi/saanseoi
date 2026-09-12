import { and, eq, or } from 'drizzle-orm'
import { historySchema } from '@repo/db'
import { chunkArray, getMaxItemsPerInClause } from '../utils'
import {
  groupResolvedVersionsByShard,
  type ResolvedSnapshotVersion,
} from './snapshotReplay'

/** Load immutable edition assertions from the exact version-owning shard. */
export async function loadReplayedAddressEvidence(versions: ResolvedSnapshotVersion[]) {
  const evidence = new Map<
    string,
    typeof historySchema.address2dEvidence.$inferSelect.sources
  >()
  for (const [bindingName, selected] of groupResolvedVersionsByShard(versions)) {
    const expected = new Set(
      selected.map(version => `${version.recordId}\0${version.versionHash}`),
    )
    const db = selected[0]?.shard.db
    if (!db) throw new Error(`Missing Address evidence shard ${bindingName}.`)
    const found = new Set<string>()
    for (const batch of chunkArray(selected, getMaxItemsPerInClause(2))) {
      const rows = await db
        .select({
          addressId: historySchema.address2dEvidence.addressId,
          versionHash: historySchema.address2dEvidence.versionHash,
          sources: historySchema.address2dEvidence.sources,
        })
        .from(historySchema.address2dEvidence)
        .where(
          or(
            ...batch.map(version =>
              and(
                eq(historySchema.address2dEvidence.addressId, version.recordId),
                eq(historySchema.address2dEvidence.versionHash, version.versionHash),
              ),
            ),
          ),
        )
        .all()
      for (const row of rows) {
        const key = `${row.addressId}\0${row.versionHash}`
        if (!expected.has(key)) continue
        found.add(key)
        evidence.set(row.addressId, row.sources)
      }
    }
    if (found.size !== expected.size)
      throw new Error(
        `Snapshot replay could not load Address evidence versions from ${bindingName}.`,
      )
  }
  return evidence
}
