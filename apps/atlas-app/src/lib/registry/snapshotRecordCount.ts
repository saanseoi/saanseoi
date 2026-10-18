import type { SnapshotReplayStep } from '@repo/core/db/metaRegistry'
import type { ReplayShard } from '@repo/core/pipeline/db/snapshotReplay.ts'
import { sql } from '@repo/db'
import type { SQLiteTable } from 'drizzle-orm/sqlite-core'

// Only compact base identities cross the binding; never locales or payloads.
const COUNT_WINDOW = 8192
type Identity = { id: string; operation: string; step: number }

/** Count live base records without constructing a full resolved version map. */
export async function countSnapshotRecords(
  plan: SnapshotReplayStep[],
  shards: ReadonlyMap<string, ReplayShard>,
  table: SQLiteTable,
): Promise<number> {
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

  const sources = [...stepsByBinding].map(([binding, steps]) => {
    // SQLite's single MAX aggregate selects the operation belonging to the latest
    // event. IDs are unique within a snapshot; chronology comes from the plan.
    // One JSON parameter keeps long snapshot branches within D1's parameter bound.
    const events = (after?: string) => sql`(
      select event.id, event.operation,
        max(cast(json_extract(branch.value, '$.step') as integer)) as step
      from ${table} as event
      inner join json_each(${JSON.stringify(steps)}) as branch
        on event.snapshotId = json_extract(branch.value, '$.id')
      ${after === undefined ? sql`` : sql`where event.id > ${after}`}
      group by event.id
    ) as live`
    return { db: shards.get(binding)!.db, events, rows: [] as Identity[], index: 0 }
  })

  // A single shard can aggregate entirely inside D1 and return just one number.
  if (sources.length === 1) {
    const source = sources[0]!
    const row = await source.db
      .select({ total: sql<number>`count(*)` })
      .from(source.events())
      .where(sql`live.operation = 'upsert'`)
      .get()
    return Number(row?.total ?? 0)
  }

  // Across annual shards merge sorted identity windows. A later delete must
  // suppress an earlier upsert, and a resurrection must be counted only once.
  async function refill(source: (typeof sources)[number]) {
    const after = source.rows.at(-1)?.id
    source.rows = await source.db
      .select({
        id: sql<string>`live.id`,
        operation: sql<string>`live.operation`,
        step: sql<number>`live.step`,
      })
      .from(source.events(after))
      .orderBy(sql`live.id`)
      .limit(COUNT_WINDOW)
      .all()
    source.index = 0
  }
  await Promise.all(sources.map(refill))
  let total = 0
  for (;;) {
    let id: string | undefined
    for (const source of sources) {
      const candidate = source.rows[source.index]?.id
      if (candidate !== undefined && (id === undefined || candidate < id))
        id = candidate
    }
    if (id === undefined) return total
    let latest: Identity | undefined
    for (const source of sources) {
      const row = source.rows[source.index]
      if (row?.id !== id) continue
      if (latest?.step === row.step)
        throw new Error(`Snapshot has multiple owners for ${id}.`)
      if (!latest || row.step > latest.step) latest = row
      source.index++
      if (source.index === source.rows.length) {
        if (source.rows.length === COUNT_WINDOW) await refill(source)
        else source.rows = []
      }
    }
    if (latest?.operation === 'upsert') total++
  }
}
