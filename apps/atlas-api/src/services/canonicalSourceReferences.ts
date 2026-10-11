import { and, eq, sql, historySchema } from '@repo/db'
import { resolveSnapshotReplayPlan } from '@repo/core/db/metaRegistry'
import { resolveSnapshotSourceResolutions } from '@repo/core/pipeline/db/sourceResolutionReplay.ts'
import type { AppEnv } from '../types'

type EvidenceRecord = { id: string; snapshotId: string; sources?: unknown }

/** Expand only reference-bearing records, once per snapshot and resource type. */
export async function hydrateCanonicalSourceReferences(args: {
  metaDb: AppEnv['Variables']['metaDb']
  historyDbsByBinding: AppEnv['Variables']['historyDbsByBinding']
  resourceType: string
  records: EvidenceRecord[]
  resolvePlan?: typeof resolveSnapshotReplayPlan
}) {
  const groups = new Map<string, EvidenceRecord[]>()
  for (const record of args.records) {
    if (
      !record.sources ||
      typeof record.sources !== 'object' ||
      !('sourceResolutions' in record.sources)
    )
      continue
    const marker = (record.sources as { sourceResolutions: unknown }).sourceResolutions
    if (
      !marker ||
      typeof marker !== 'object' ||
      !('entityId' in marker) ||
      marker.entityId !== record.id
    )
      throw new Error(`Invalid source-resolution entity marker for ${record.id}.`)
    const group = groups.get(record.snapshotId) ?? []
    group.push(record)
    groups.set(record.snapshotId, group)
  }
  for (const [snapshotId, records] of groups) {
    const plan = await (args.resolvePlan ?? resolveSnapshotReplayPlan)(
      args.metaDb as never,
      snapshotId,
    )
    const shards = new Map(
      Object.entries(args.historyDbsByBinding).map(([bindingName, db]) => [
        bindingName,
        { bindingName, db },
      ]),
    )
    const candidates = new Set<string>()
    const table = historySchema.sourceResolutions
    // Discover every previously linked assertion, then replay all versions of those
    // assertions. Filtering only live entity matches would resurrect omissions.
    for (const step of plan) {
      for (const binding of new Set(step.shards.map(shard => shard.bindingName))) {
        const db = shards.get(binding)?.db
        if (!db) throw new Error(`Missing evidence history binding ${binding}.`)
        const rows = await db
          .selectDistinct({ id: table.sourceRecordId })
          .from(table)
          .where(
            and(
              eq(table.scopeId, `snapshot:${step.snapshotId}`),
              sql`EXISTS (SELECT 1 FROM json_each(${table.resolutions}, '$.entities') entity, json_each(entity.value) member WHERE entity.key = ${args.resourceType} AND member.value IN (SELECT value FROM json_each(${JSON.stringify(records.map(record => record.id))})))`,
            ),
          )
          .all()
        for (const row of rows) candidates.add(row.id)
      }
    }
    const selected = await resolveSnapshotSourceResolutions(plan, shards as never, [
      ...candidates,
    ])
    const references = new Map(
      records.map(record => [record.id, [] as Array<Record<string, unknown>>]),
    )
    for (const evidence of selected.values()) {
      for (const id of evidence.resolutions.entities[args.resourceType] ?? []) {
        references.get(id)?.push({
          record_id: evidence.sourceRecordId,
          versionHash: evidence.sourceVersionHash,
          resourceReleaseId: evidence.sourceReleaseId,
          snapshotId: evidence.snapshotId,
        })
      }
    }
    for (const record of records) {
      const evidence = references.get(record.id) ?? []
      if (!evidence.length)
        throw new Error(
          `Missing selected ${args.resourceType} evidence for ${record.id} in ${snapshotId}.`,
        )
      record.sources = { evidence }
    }
  }
}
