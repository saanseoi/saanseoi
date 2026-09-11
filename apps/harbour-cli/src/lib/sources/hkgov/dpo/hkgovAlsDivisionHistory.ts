import { inArray } from 'drizzle-orm'
import { historySchema, type MetaDatabase } from '@repo/db'
import { resolveSnapshotReplayPlan } from '@repo/core/db/metaRegistry'
import {
  groupResolvedVersionsByShard,
  resolveSnapshotVersionState,
  type ReplayShard,
} from '@repo/core/pipeline/db/snapshotReplay'

/** Read the immutable parent-to-target membership, independently of current cleanup. */
export async function loadAlsDivisionHistory(
  metaDb: MetaDatabase,
  snapshotId: string,
  shards: ReadonlyMap<string, ReplayShard>,
) {
  const plan = await resolveSnapshotReplayPlan(metaDb as never, snapshotId)
  const state = await resolveSnapshotVersionState(plan, shards, [
    'division',
    'divisionI18n',
  ])
  const divisions = new Map<string, { level: number | null; class: string }>()
  const names: Array<{ divisionId: string; locale: string; name: string | null }> = []
  for (const versions of groupResolvedVersionsByShard(state.values()).values()) {
    const db = versions[0]?.shard.db
    if (!db) continue
    for (let index = 0; index < versions.length; index += 80) {
      const batch = versions.slice(index, index + 80)
      const hashes = [...new Set(batch.map(version => version.versionHash))]
      const expected = new Set(
        batch.map(
          version =>
            `${version.recordType}\0${version.recordId}\0${version.locale}\0${version.versionHash}`,
        ),
      )
      const rows = await db
        .select({
          id: historySchema.divisions.id,
          level: historySchema.divisions.level,
          category: historySchema.divisions.category,
          class: historySchema.divisions.class,
          versionHash: historySchema.divisions.versionHash,
        })
        .from(historySchema.divisions)
        .where(inArray(historySchema.divisions.versionHash, hashes))
        .all()
      for (const row of rows) {
        if (expected.has(`division\0${row.id}\0\0${row.versionHash}`)) {
          divisions.set(row.id, row)
        }
      }
      const translations = await db
        .select({
          divisionId: historySchema.divisionsI18n.divisionId,
          locale: historySchema.divisionsI18n.locale,
          name: historySchema.divisionsI18n.name,
          versionHash: historySchema.divisionsI18n.versionHash,
        })
        .from(historySchema.divisionsI18n)
        .where(inArray(historySchema.divisionsI18n.versionHash, hashes))
        .all()
      for (const row of translations) {
        if (
          expected.has(
            `divisionI18n\0${row.divisionId}\0${row.locale}\0${row.versionHash}`,
          )
        ) {
          names.push(row)
        }
      }
    }
  }
  return names.flatMap(row => {
    const division = divisions.get(row.divisionId)
    return division
      ? [
          {
            snapshotId,
            id: row.divisionId,
            level: division.level,
            class: division.class,
            locale: row.locale,
            name: row.name,
          },
        ]
      : []
  })
}
