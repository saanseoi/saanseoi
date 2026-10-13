import {
  getTableColumns,
  getTableName,
  historyEventTables,
  historySchema,
} from '@repo/db'
import { and, eq, inArray, sql } from 'drizzle-orm'
import type { SnapshotReplayStep } from '../../lib/db/metaRegistry'
import type { HarbourReadableDb } from '../../lib/db/types'
import { chunkArray, getMaxItemsPerInClause } from '../utils'

export type ReplayShard = { bindingName: string; db: HarbourReadableDb }
export type ResolvedSnapshotVersion = {
  recordType: string
  recordId: string
  locale: string
  snapshotId: string
  versionHash: string
  sourceReleaseId: string
  shard: ReplayShard
}

const replayKey = (recordType: string, recordId: string, locale: string) =>
  `${recordType}\u0000${recordId}\u0000${locale}`

export const dependentHistoryEvents: Record<string, readonly string[]> = {
  division: ['divisionI18n'],
  address2d: ['address2dI18n', 'address2dBuildingNumberLookup'],
  address3d: ['address3dI18n'],
  place: ['placeI18n'],
  street: ['streetI18n', 'streetGeometry'],
  streetNameChange: ['streetNameChangeStreet'],
}
export const historyParentIdentity = (recordType: string, recordId: string) =>
  ['address2dBuildingNumberLookup', 'streetNameChangeStreet'].includes(recordType)
    ? (JSON.parse(recordId)[0] as string)
    : recordId

/**
 * Resolves inline events root-to-leaf. Each live entry retains its introducing
 * snapshot and owning shard; equal hashes on different branches remain distinct.
 */
export async function resolveSnapshotVersionState(
  plan: SnapshotReplayStep[],
  shards: ReadonlyMap<string, ReplayShard>,
  recordTypes: readonly string[],
  recordIds?: readonly string[],
): Promise<Map<string, ResolvedSnapshotVersion>> {
  const state = new Map<string, ResolvedSnapshotVersion>()
  if (recordIds?.length === 0) return state
  const selectedIds = recordIds
    ? [
        ...new Set(
          recordIds.flatMap(id => {
            try {
              const value = JSON.parse(id)
              return Array.isArray(value) && typeof value[0] === 'string'
                ? [id, value[0]]
                : [id]
            } catch {
              return [id]
            }
          }),
        ),
      ]
    : undefined
  const requestedTypes = new Set(recordTypes)
  const requiredTypes = new Set(recordTypes)
  for (const [parent, children] of Object.entries(dependentHistoryEvents))
    if (children.some(child => requestedTypes.has(child))) requiredTypes.add(parent)
  const typeBatches = chunkArray(
    [...requiredTypes],
    Math.max(1, getMaxItemsPerInClause(recordIds ? 2 : 1)),
  )

  for (const step of plan) {
    const observed = new Set<string>()
    const stepEvents: Array<{
      row: Pick<
        typeof historySchema.historyEvents.$inferSelect,
        | 'recordType'
        | 'recordId'
        | 'locale'
        | 'versionHash'
        | 'operation'
        | 'sourceReleaseId'
      >
      shard: ReplayShard
    }> = []
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
            recordType: historySchema.historyEvents.recordType,
            recordId: historySchema.historyEvents.recordId,
            locale: historySchema.historyEvents.locale,
            versionHash: historySchema.historyEvents.versionHash,
            operation: historySchema.historyEvents.operation,
            sourceReleaseId: historySchema.historyEvents.sourceReleaseId,
          })
          .from(historySchema.historyEvents)
          .where(
            and(
              eq(historySchema.historyEvents.snapshotId, step.snapshotId),
              inArray(historySchema.historyEvents.recordType, types),
              recordIds
                ? sql`(${historySchema.historyEvents.recordId} in (select value from json_each(${JSON.stringify(selectedIds)})) or (case when ${historySchema.historyEvents.recordType} in ('address2dBuildingNumberLookup','streetNameChangeStreet') then json_extract(${historySchema.historyEvents.recordId}, '$[0]') end) in (select value from json_each(${JSON.stringify(selectedIds)})))`
                : undefined,
            ),
          )
          .all()
        for (const row of rows) stepEvents.push({ row, shard })
      }
    }
    // Clear inherited components before applying this snapshot's explicit events.
    const deletedParentsByChildType = new Map<string, Set<string>>()
    for (const { row } of stepEvents) {
      if (row.operation !== 'delete') continue
      for (const childType of dependentHistoryEvents[row.recordType] ?? []) {
        const deletedParents =
          deletedParentsByChildType.get(childType) ?? new Set<string>()
        deletedParents.add(row.recordId)
        deletedParentsByChildType.set(childType, deletedParents)
      }
    }
    // A large withdrawal must scan live components once, not once per parent.
    if (deletedParentsByChildType.size > 0) {
      for (const [key, value] of state) {
        const deletedParents = deletedParentsByChildType.get(value.recordType)
        if (
          deletedParents?.has(historyParentIdentity(value.recordType, value.recordId))
        )
          state.delete(key)
      }
    }
    for (const { row, shard } of stepEvents) {
      const key = replayKey(row.recordType, row.recordId, row.locale)
      if (observed.has(key))
        throw new Error(`Snapshot ${step.snapshotId} has multiple owners for ${key}.`)
      observed.add(key)
      if (row.operation === 'delete') state.delete(key)
      else {
        if (row.operation !== 'upsert' || !row.versionHash || !row.sourceReleaseId)
          throw new Error(
            `Snapshot ${step.snapshotId} has an invalid content event for ${key}.`,
          )
        state.set(key, {
          ...row,
          versionHash: row.versionHash,
          sourceReleaseId: row.sourceReleaseId,
          snapshotId: step.snapshotId,
          shard,
        })
      }
    }
  }
  const liveKeys = new Set(state.keys())
  for (const [key, value] of state) {
    if (!requestedTypes.has(value.recordType)) {
      state.delete(key)
      continue
    }
    for (const [parent, children] of Object.entries(dependentHistoryEvents))
      if (
        children.includes(value.recordType) &&
        !liveKeys.has(
          replayKey(
            parent,
            historyParentIdentity(value.recordType, value.recordId),
            '',
          ),
        )
      )
        state.delete(key)
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

/** Resolve exact inline rows with one bounded JSON parameter, including branch identity. */
export function historyVersionSelection(
  table: import('drizzle-orm/sqlite-core').SQLiteTable,
  versions: readonly Pick<
    ResolvedSnapshotVersion,
    'recordType' | 'recordId' | 'locale' | 'snapshotId' | 'versionHash'
  >[],
) {
  const columns = getTableColumns(table)
  const name = getTableName(table)
  const definition = Object.values(historyEventTables).find(
    entry => entry.table === name,
  )
  if (!definition) throw new Error(`Unknown HISTORY event table ${name}.`)
  const identity = [
    ...definition.keys,
    ...('locale' in definition ? [definition.locale] : []),
    'snapshotId',
    'versionHash',
  ]
  const tuples = versions.map(version => {
    const keys =
      definition.keys.length === 1 ? [version.recordId] : JSON.parse(version.recordId)
    if (!Array.isArray(keys) || keys.length !== definition.keys.length)
      throw new Error(`Invalid history identity ${version.recordId}`)
    return [
      ...keys,
      ...('locale' in definition ? [version.locale] : []),
      version.snapshotId,
      version.versionHash,
    ]
  })
  return sql`(${sql.join(
    identity.map(key => sql`${columns[key]}`),
    sql`, `,
  )}) in (select ${sql.join(
    identity.map((_, index) => sql.raw(`json_extract(value, '$[${index}]')`)),
    sql`, `,
  )} from json_each(${JSON.stringify(tuples)})) and ${columns.operation} = 'upsert'`
}
