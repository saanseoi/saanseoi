import { getTableColumns, historySchema } from '@repo/db'
import type { InferSelectModel } from 'drizzle-orm'
import type { SQLiteTable } from 'drizzle-orm/sqlite-core'
import { resolveSnapshotReplayPlan } from '../lib/db/metaRegistry'
import type { HarbourReadableDb } from '../lib/db/types'
import {
  groupResolvedVersionsByShard,
  historyVersionSelection,
  resolveSnapshotVersionState,
  type ReplayShard,
} from '../pipeline/db/snapshotReplay'

/** Read resolved immutable content in bounded batches, retaining introducing-branch identity. */
export async function* exportHistoryRows<T extends SQLiteTable>(
  metaDb: HarbourReadableDb,
  shards: ReadonlyMap<string, ReplayShard>,
  snapshotId: string,
  recordType: string,
  table: T,
): AsyncGenerator<InferSelectModel<T>[]> {
  const plan = await resolveSnapshotReplayPlan(metaDb, snapshotId)
  const versions = await resolveSnapshotVersionState(plan, shards, [recordType])
  for (const refs of groupResolvedVersionsByShard(
    [...versions.values()]
      .filter(row => row.recordType === recordType)
      .sort((a, b) =>
        `${a.recordId}:${a.locale}`.localeCompare(`${b.recordId}:${b.locale}`),
      ),
  ).values()) {
    for (let offset = 0; offset < refs.length; offset += 128) {
      const batch = refs.slice(offset, offset + 128)
      const rows = await batch[0]!.shard.db
        .select(getTableColumns(table))
        .from(table)
        .where(historyVersionSelection(table, batch))
        .all()
      if (rows.length !== batch.length)
        throw new Error(`Incomplete ${recordType} history for export ${snapshotId}`)
      yield rows as InferSelectModel<T>[]
    }
  }
}
export { historySchema }
