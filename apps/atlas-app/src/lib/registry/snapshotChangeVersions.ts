import type { SnapshotReplayStep } from '@repo/core/db/metaRegistry'
import {
  type ReplayShard,
  type ResolvedSnapshotVersion,
  snapshotEventProducer,
} from '@repo/core/pipeline/db/snapshotReplay.ts'
import { getTableColumns, sql } from '@repo/db'
import type { SQLiteTable } from 'drizzle-orm/sqlite-core'

const WINDOW = 4096
type Event = {
  id: string
  locale: string
  operation: string
  versionHash: string | null
  producerDatasetCode: string | null
  step: number
  deletedSteps: string | null
}
export type SnapshotRecordVersions = {
  id: string
  versions: ResolvedSnapshotVersion[]
}

/** Stream resolved base/locale versions by record ID without retaining a whole snapshot. */
export async function* iterateSnapshotVersions(
  plan: SnapshotReplayStep[],
  shards: ReadonlyMap<string, ReplayShard>,
  recordType: string,
  definition: readonly [SQLiteTable, SQLiteTable?, string?],
): AsyncGenerator<SnapshotRecordVersions> {
  const stepsByBinding = new Map<string, Array<{ id: string; step: number }>>()
  for (const [step, snapshot] of plan.entries()) {
    if (!snapshot.resourceReleaseId && !snapshot.producerReleases)
      throw new Error(
        `Snapshot ${snapshot.snapshotId} is missing its HISTORY producer.`,
      )
    for (const assignment of snapshot.shards) {
      if (!shards.has(assignment.bindingName))
        throw new Error(`Unavailable history binding ${assignment.bindingName}.`)
      const steps = stepsByBinding.get(assignment.bindingName) ?? []
      steps.push({ id: snapshot.snapshotId, step })
      stepsByBinding.set(assignment.bindingName, steps)
    }
  }
  const sources = [...stepsByBinding].flatMap(([binding, steps]) =>
    [false, true].flatMap(translated => {
      const table = translated ? definition[1] : definition[0]
      if (!table) return []
      const columns = getTableColumns(table)
      const id = sql`event.${sql.identifier(translated ? definition[2]! : 'id')}`
      const locale = translated ? sql`event.locale` : sql`''`
      return [
        {
          shard: shards.get(binding)!,
          recordType: `${recordType}${translated ? 'I18n' : ''}`,
          translated,
          rows: [] as Event[],
          index: 0,
          // CROSS JOIN keeps the ID index as the outer scan. Bound IDs before
          // grouping locales so every page avoids sorting the remaining branch.
          // The single MAX chooses the newest row; GROUP_CONCAT preserves delete
          // steps without a second MIN/MAX making bare-column selection ambiguous.
          events: (after?: Event) => sql`(
            with branch as materialized (
              select json_extract(value, '$.id') as id,
                cast(json_extract(value, '$.step') as integer) as step
              from json_each(${JSON.stringify(steps)})
            ), ids as materialized (
              select distinct ${id} as id from ${table} as event
              cross join branch on event.snapshotId = branch.id
              ${after ? sql`where ${id} >= ${after.id}` : sql``}
              order by ${id} limit ${WINDOW}
            )
            select ${id} as id, ${locale} as locale, event.operation, event.versionHash,
              ${'producerDatasetCode' in columns ? sql`event.producerDatasetCode` : sql`null`} as producerDatasetCode,
              max(branch.step) as step,
              group_concat(case when event.operation = 'delete'
                then branch.step end) as deletedSteps
            from ${table} as event
            cross join branch on event.snapshotId = branch.id
            where ${id} <= (select max(id) from ids)
              ${after ? sql`and ${id} >= ${after.id} and (${id}, ${locale}) > (${after.id}, ${after.locale})` : sql``}
            group by ${id}, ${locale}
            order by ${id}, ${locale} limit ${WINDOW}
          ) as live`,
        },
      ]
    }),
  )
  async function refill(source: (typeof sources)[number]) {
    const after = source.rows.at(-1)
    source.rows = await source.shard.db
      .select({
        id: sql<string>`live.id`,
        locale: sql<string>`live.locale`,
        operation: sql<string>`live.operation`,
        versionHash: sql<string | null>`live.versionHash`,
        producerDatasetCode: sql<string | null>`live.producerDatasetCode`,
        step: sql<number>`live.step`,
        deletedSteps: sql<string | null>`live.deletedSteps`,
      })
      .from(source.events(after))
      .orderBy(sql`live.id`, sql`live.locale`)
      .limit(WINDOW)
      .all()
    source.index = 0
  }
  await Promise.all(sources.map(refill))
  for (;;) {
    let id: string | undefined
    for (const source of sources) {
      const candidate = source.rows[source.index]?.id
      if (candidate !== undefined && (id === undefined || candidate < id))
        id = candidate
    }
    if (id === undefined) return
    const latest = new Map<string, { row: Event; source: (typeof sources)[number] }>()
    let deletedAt = -1
    for (const source of sources) {
      while (source.rows[source.index]?.id === id) {
        const row = source.rows[source.index]!
        if (!source.translated)
          deletedAt = Math.max(
            deletedAt,
            ...(row.deletedSteps?.split(',').map(Number) ?? [-1]),
          )
        const key = `${source.recordType}\u0000${row.locale}`
        const previous = latest.get(key)
        if (previous?.row.step === row.step)
          throw new Error(`Snapshot has multiple owners for ${id}/${key}.`)
        if (!previous || row.step > previous.row.step) latest.set(key, { row, source })
        source.index++
        if (source.index === source.rows.length) {
          await refill(source)
        }
      }
    }
    const base = latest.get(`${recordType}\u0000`)
    const versions: ResolvedSnapshotVersion[] = []
    if (base?.row.operation === 'upsert') {
      for (const { row, source } of latest.values()) {
        if (row.operation === 'delete' || (source.translated && row.step < deletedAt))
          continue
        if (row.operation !== 'upsert' || !row.versionHash)
          throw new Error(`Snapshot has an invalid content event for ${id}.`)
        const step = plan[row.step]!
        versions.push({
          recordType: source.recordType,
          recordId: id,
          locale: row.locale,
          versionHash: row.versionHash,
          snapshotId: step.snapshotId,
          sourceReleaseId: snapshotEventProducer(step, row.producerDatasetCode),
          shard: source.shard,
        })
      }
    }
    yield { id, versions }
  }
}
