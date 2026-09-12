import { and, eq, historySchema, inArray } from '@repo/db'
import type { HarbourReadableDb } from '../../../lib/db/types'
import { resolveSnapshotReplayPlan } from '../../../lib/db/metaRegistry'

export type RetainedStatisticRecord = typeof historySchema.statsRecords.$inferSelect

export const STATISTIC_RECORD_TYPE = 'statsRecord'

/** Resolve sparse changes on one immutable branch; unchanged packs have no new membership. */
export async function readStatisticSnapshotRecords(
  metaDb: HarbourReadableDb,
  historyDbs: HarbourReadableDb[],
  snapshotId: string,
): Promise<RetainedStatisticRecord[]> {
  const plan = await resolveSnapshotReplayPlan(metaDb, snapshotId)
  return readStatisticRecordsForSnapshotPlan(
    historyDbs,
    plan.map(step => step.snapshotId),
  )
}

export async function readStatisticRecordsForSnapshotPlan(
  historyDbs: HarbourReadableDb[],
  snapshotIds: string[],
): Promise<RetainedStatisticRecord[]> {
  const positions = new Map(snapshotIds.map((id, index) => [id, index]))
  const selected = new Map<string, { position: number; versionHash: string | null }>()
  for (const db of historyDbs) {
    for (let offset = 0; offset < snapshotIds.length; offset += 80) {
      const changes = await db
        .select()
        .from(historySchema.snapshotVersionChanges)
        .where(
          and(
            eq(historySchema.snapshotVersionChanges.recordType, STATISTIC_RECORD_TYPE),
            inArray(
              historySchema.snapshotVersionChanges.snapshotId,
              snapshotIds.slice(offset, offset + 80),
            ),
          ),
        )
        .all()
      for (const change of changes) {
        const position = positions.get(String(change.snapshotId))
        if (position === undefined) continue
        const id = String(change.recordId)
        const versionHash =
          change.operation === 'delete' ? null : String(change.versionHash)
        if (change.operation !== 'delete' && !change.versionHash)
          throw new Error(
            `Missing Statistics version in snapshot ${change.snapshotId}: ${id}`,
          )
        const previous = selected.get(id)
        if (previous?.position === position && previous.versionHash !== versionHash)
          throw new Error(`Conflicting Statistics membership for ${id}`)
        if (!previous || previous.position < position)
          selected.set(id, { position, versionHash })
      }
    }
  }
  const ids = [...selected]
    .filter(([, value]) => value.versionHash !== null)
    .map(([id]) => id)
  const records = new Map<string, RetainedStatisticRecord>()
  for (const db of historyDbs) {
    for (let offset = 0; offset < ids.length; offset += 80) {
      const rows = await db
        .select()
        .from(historySchema.statsRecords)
        .where(inArray(historySchema.statsRecords.id, ids.slice(offset, offset + 80)))
        .all()
      for (const row of rows) {
        const id = String(row.id)
        if (row.versionHash !== selected.get(id)?.versionHash) continue
        const previous = records.get(id)
        if (previous && JSON.stringify(previous) !== JSON.stringify(row))
          throw new Error(`Conflicting immutable Statistics payload for ${id}`)
        records.set(id, row as RetainedStatisticRecord)
      }
    }
  }
  for (const id of ids)
    if (!records.has(id))
      throw new Error(
        `Missing retained Statistics version ${id}/${selected.get(id)?.versionHash}`,
      )
  return [...records.values()].sort((a, b) => a.id.localeCompare(b.id))
}
