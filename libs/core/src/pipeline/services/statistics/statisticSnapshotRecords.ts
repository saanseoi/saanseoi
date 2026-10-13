import type { currentSchema, HistoryContent } from '@repo/db'
import {
  and,
  getTableColumns,
  historySchema,
  inArray,
  sql,
  statisticDefinitionHashes,
} from '@repo/db'
import { resolveSnapshotReplayPlan } from '../../../lib/db/metaRegistry'
import type { HarbourReadableDb } from '../../../lib/db/types'
import {
  dependentHistoryEvents,
  historyParentIdentity,
  historyVersionSelection,
} from '../../db/snapshotReplay'

export type RetainedStatisticRecord = Omit<
  HistoryContent<
    typeof historySchema.statsRecords.$inferSelect,
    typeof currentSchema.statsRecords.$inferSelect
  >,
  'definitionSetId'
> & { fieldDefinitionHashes: Record<string, string> }

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
  const selected = await resolveStatisticEvents(historyDbs, snapshotIds, [
    'statsRecord',
  ])
  const records: RetainedStatisticRecord[] = []
  for (const [db, versions] of selected) {
    for (let offset = 0; offset < versions.length; offset += 80) {
      const rows = await db
        .select({
          ...getTableColumns(historySchema.statsRecords),
          fieldDefinitionHashes: statisticDefinitionHashes.as('fieldDefinitionHashes'),
        })
        .from(historySchema.statsRecords)
        .where(
          historyVersionSelection(
            historySchema.statsRecords,
            versions.slice(offset, offset + 80),
          ),
        )
        .all()
      if (rows.length !== versions.slice(offset, offset + 80).length)
        throw new Error('Missing retained Statistics event content.')
      records.push(...(rows as RetainedStatisticRecord[]))
    }
  }
  return records.sort((a, b) => a.id.localeCompare(b.id))
}

/** Resolve nearest events across all shards before content filtering or pagination. */
export async function resolveStatisticEvents(
  historyDbs: HarbourReadableDb[],
  snapshotIds: readonly string[],
  recordTypes: readonly string[],
) {
  const requestedTypes = new Set(recordTypes)
  const requiredTypes = new Set(recordTypes)
  for (const [parent, children] of Object.entries(dependentHistoryEvents))
    if (children.some(child => requestedTypes.has(child))) requiredTypes.add(parent)
  const deletions = new Map<string, number>()
  const positions = new Map(snapshotIds.map((id, index) => [id, index]))
  const winners = new Map<
    string,
    { position: number; db: HarbourReadableDb; row: StatisticEvent }
  >()
  const events = historySchema.historyEvents
  for (const db of historyDbs) {
    const rows = (await db
      .select()
      .from(events)
      .where(
        and(
          sql`${events.snapshotId} in (select value from json_each(${JSON.stringify(snapshotIds)}))`,
          sql`${events.recordType} in (select value from json_each(${JSON.stringify([...requiredTypes])}))`,
        ),
      )
      .all()) as StatisticEvent[]
    for (const row of rows) {
      const position = positions.get(row.snapshotId)
      if (position === undefined) continue
      const key = JSON.stringify([row.recordType, row.recordId, row.locale])
      if (row.operation === 'delete')
        deletions.set(key, Math.max(position, deletions.get(key) ?? -1))
      const previous = winners.get(key)
      if (previous?.position === position)
        throw new Error(`Ambiguous Statistics event ${key}/${row.snapshotId}.`)
      if (!previous || previous.position < position)
        winners.set(key, { position, db, row })
    }
  }
  const groups = new Map<
    HarbourReadableDb,
    Array<StatisticEvent & { versionHash: string; sourceReleaseId: string }>
  >()
  for (const { db, row, position } of winners.values()) {
    if (!requestedTypes.has(row.recordType)) continue
    const parent = Object.entries(dependentHistoryEvents).find(([, children]) =>
      children.includes(row.recordType),
    )?.[0]
    if (parent) {
      const parentKey = JSON.stringify([
        parent,
        historyParentIdentity(row.recordType, row.recordId),
        '',
      ])
      if (
        winners.get(parentKey)?.row.operation !== 'upsert' ||
        (deletions.get(parentKey) ?? -1) > position
      )
        continue
    }
    if (row.operation === 'delete') continue
    if (row.operation !== 'upsert' || !row.versionHash || !row.sourceReleaseId)
      throw new Error(`Invalid Statistics event ${row.recordId}/${row.snapshotId}.`)
    const group = groups.get(db) ?? []
    group.push({
      ...row,
      versionHash: row.versionHash,
      sourceReleaseId: row.sourceReleaseId,
    })
    groups.set(db, group)
  }
  return groups
}
type StatisticEvent = typeof historySchema.historyEvents.$inferSelect

/** Attach shared definitions for operations that also need the raw stored record columns. */
export async function hydrateStatisticDefinitions(
  db: HarbourReadableDb,
  rows: Array<Record<string, unknown>>,
) {
  const ids = [...new Set(rows.map(row => String(row.definitionSetId)))]
  const table = historySchema.statsDefinitionSets
  const definitions = new Map<string, Record<string, string>>()
  for (let offset = 0; offset < ids.length; offset += 80) {
    const selected = await db
      .select()
      .from(table)
      .where(inArray(table.id, ids.slice(offset, offset + 80)))
      .all()
    for (const row of selected)
      definitions.set(
        String(row.id),
        row.fieldDefinitionHashes as Record<string, string>,
      )
  }
  for (const row of rows) {
    const hashes = definitions.get(String(row.definitionSetId))
    if (!hashes)
      throw new Error(`Missing statistic definition set ${row.definitionSetId}.`)
    row.fieldDefinitionHashes = hashes
  }
}
