import type { HarbourReadableDb } from '@repo/core/db/types'
import { resolveSnapshotReplayPlan } from '@repo/core/db/metaRegistry'
import {
  resolveSnapshotVersionState,
  type ReplayShard,
  type ResolvedSnapshotVersion,
} from '@repo/core/pipeline/db/snapshotReplay'
import { eq, getTableColumns, historySchema, metaSchema, sql } from '@repo/db'
import type { SQLiteTable } from 'drizzle-orm/sqlite-core'

export type ProjectionComponent = {
  recordType: string
  table: string
  id: string
  localised?: boolean
  hashIdentity?: boolean
}
export type ProjectionHistoryTarget = ReplayShard & { filePath?: string }
export type ProjectionRow = Record<string, unknown>

/** Replay cannot treat absent assignments or competing shard journals as an empty snapshot. */
export async function resolveValidatedProjectionVersions(input: {
  metaDb: HarbourReadableDb
  historyTargets: readonly ProjectionHistoryTarget[]
  snapshotId: string
  recordTypes: readonly string[]
}) {
  const shards = new Map(
    input.historyTargets.map(target => [target.bindingName, target]),
  )
  if (shards.size !== input.historyTargets.length)
    throw new Error('Rollback history bindings must be unique.')
  const plan = await resolveSnapshotReplayPlan(input.metaDb, input.snapshotId)
  const lastAssertionOrder = new Map<string, number>()
  let assertionOrder = 0
  for (const step of plan) {
    const assignments = await input.metaDb
      .select()
      .from(metaSchema.metaSnapshotShardAssignments)
      .where(eq(metaSchema.metaSnapshotShardAssignments.snapshotId, step.snapshotId))
      .all()
    if (!step.shards.length || assignments.length !== step.shards.length)
      throw new Error(
        `Snapshot ${step.snapshotId} has incomplete history shard assignments.`,
      )
    const observed = new Map<string, string>()
    for (const assignment of step.shards) {
      const shard = shards.get(assignment.bindingName)
      if (!shard)
        throw new Error(
          `Snapshot ${step.snapshotId} requires unavailable history binding ${assignment.bindingName}.`,
        )
      const rows = await shard.db
        .select()
        .from(historySchema.snapshotVersionChanges)
        .where(eq(historySchema.snapshotVersionChanges.snapshotId, step.snapshotId))
        .all()
      for (const row of rows) {
        if (!input.recordTypes.includes(String(row.recordType))) continue
        const key = JSON.stringify([row.recordType, row.recordId, row.locale])
        if (row.operation !== 'upsert' && row.operation !== 'delete')
          throw new Error(
            `Snapshot ${step.snapshotId} has an invalid journal operation.`,
          )
        if (row.operation === 'upsert' && (!row.versionHash || !row.sourceReleaseId))
          throw new Error(
            `Snapshot ${step.snapshotId} has an incomplete version journal for ${key}.`,
          )
        const assertion = JSON.stringify([
          row.operation,
          row.versionHash,
          row.sourceReleaseId,
        ])
        const previous = observed.get(key)
        if (previous !== undefined && previous !== assertion)
          throw new Error(
            `Snapshot ${step.snapshotId} has conflicting history shard journals for ${key}.`,
          )
        observed.set(key, assertion)
        lastAssertionOrder.set(
          `${row.recordType}\u0000${row.recordId}\u0000${row.locale}`,
          assertionOrder++,
        )
      }
    }
  }
  const state = await resolveSnapshotVersionState(plan, shards, input.recordTypes)
  return new Map(
    [...state].sort(
      ([left], [right]) =>
        (lastAssertionOrder.get(left) ?? 0) - (lastAssertionOrder.get(right) ?? 0),
    ),
  )
}

/** Fetch by exact component identity, locale and hash from its journal owner. */
export async function* readExactProjectionRows(
  component: ProjectionComponent,
  versions: Iterable<ResolvedSnapshotVersion>,
): AsyncGenerator<ProjectionRow[]> {
  const table = historySchema[
    component.table as keyof typeof historySchema
  ] as SQLiteTable
  if (!table) throw new Error(`Unknown history projection table ${component.table}.`)
  const columns = getTableColumns(table)
  const hash = columns.versionHash
  if (!hash) throw new Error(`Missing history version hash on ${component.table}.`)
  const grouped = new Map<string, ResolvedSnapshotVersion[]>()
  for (const version of versions) {
    if (version.recordType !== component.recordType) continue
    if (component.hashIdentity && version.recordId !== version.versionHash)
      throw new Error(
        `Invalid ${component.recordType} journal identity ${version.recordId}.`,
      )
    const group = grouped.get(version.shard.bindingName) ?? []
    group.push(version)
    grouped.set(version.shard.bindingName, group)
  }
  for (const group of grouped.values()) {
    for (let start = 0; start < group.length; start += 100) {
      const batch = group.slice(start, start + 100)
      const first = batch[0]
      if (!first) continue
      const key = (id: unknown, locale: unknown, versionHash: unknown) =>
        JSON.stringify([id, locale ?? '', versionHash])
      const expected = new Map(
        batch.map(version => [
          key(version.recordId, version.locale, version.versionHash),
          version,
        ]),
      )
      const rows = await first.shard.db
        .select()
        .from(table)
        .where(
          sql`${hash} in (select value from json_each(${JSON.stringify(batch.map(version => version.versionHash))}))`,
        )
        .all()
      const found = new Set<string>()
      const selected: ProjectionRow[] = []
      for (const row of rows) {
        const identity = key(
          component.hashIdentity ? row.versionHash : row[component.id],
          component.localised ? row.locale : '',
          row.versionHash,
        )
        if (!expected.has(identity)) continue
        if (found.has(identity))
          throw new Error(
            `Ambiguous exact history component ${component.table}/${identity}.`,
          )
        found.add(identity)
        selected.push(row)
      }
      if (found.size !== expected.size)
        throw new Error(
          `Missing exact history component in ${component.table} on ${first.shard.bindingName}.`,
        )
      yield selected
    }
  }
}
