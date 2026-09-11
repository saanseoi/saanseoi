import { resolveSnapshotReplayPlan } from '@repo/core/db/metaRegistry'
import type { HarbourReadableDb } from '@repo/core/db/types'
import {
  resolveSnapshotVersionState,
  groupResolvedVersionsByShard,
  type ReplayShard,
} from '@repo/core/pipeline/db/snapshotReplay'
import { chunkArray } from '@repo/core/pipeline/utils'
import { currentSchema, historySchema, eq, and, sql } from '@repo/db'

/** Geometry preparation can inspect an old revision without restoring it into current. */
export async function readDivisionSnapshot(
  currentDb: HarbourReadableDb,
  metaDb: HarbourReadableDb,
  snapshotId: string,
  historyTargets: readonly ReplayShard[] = [],
) {
  const receipt = await currentDb
    .select({ scopeId: currentSchema.divisionPublicationState.scopeId })
    .from(currentSchema.divisionPublicationState)
    .where(
      and(
        eq(currentSchema.divisionPublicationState.snapshotId, snapshotId),
        sql`${currentSchema.divisionPublicationState.preparedAt} IS NOT NULL`,
        sql`${currentSchema.divisionPublicationState.publicationToken} <> ''`,
      ),
    )
    .get()
  if (receipt) {
    const [divisions, i18n] = await Promise.all([
      currentDb
        .select()
        .from(currentSchema.divisions)
        .where(eq(currentSchema.divisions.snapshotId, receipt.scopeId))
        .all(),
      currentDb
        .select()
        .from(currentSchema.divisionsI18n)
        .where(eq(currentSchema.divisionsI18n.snapshotId, receipt.scopeId))
        .all(),
    ])
    return {
      divisions: divisions as unknown as Array<
        typeof currentSchema.divisions.$inferSelect
      >,
      i18n: i18n as unknown as Array<typeof currentSchema.divisionsI18n.$inferSelect>,
    }
  }
  const plan = await resolveSnapshotReplayPlan(metaDb, snapshotId)
  const versions = await resolveSnapshotVersionState(
    plan,
    new Map(historyTargets.map(target => [target.bindingName, target])),
    ['division', 'divisionI18n'],
  )
  const divisions: Array<typeof currentSchema.divisions.$inferSelect> = []
  const i18n: Array<typeof currentSchema.divisionsI18n.$inferSelect> = []
  for (const grouped of groupResolvedVersionsByShard(versions.values()).values()) {
    const db = grouped[0]!.shard.db
    for (const chunk of chunkArray(
      grouped.filter(row => row.recordType === 'division'),
      64,
    )) {
      const rows = await db
        .select()
        .from(historySchema.divisions)
        .where(
          sql`(id,versionHash) IN (SELECT json_extract(value,'$[0]'),json_extract(value,'$[1]') FROM json_each(${JSON.stringify(chunk.map(row => [row.recordId, row.versionHash]))}))`,
        )
        .all()
      divisions.push(...(rows as unknown as typeof divisions))
    }
    for (const chunk of chunkArray(
      grouped.filter(row => row.recordType === 'divisionI18n'),
      64,
    )) {
      const rows = await db
        .select()
        .from(historySchema.divisionsI18n)
        .where(
          sql`(divisionId,versionHash,locale) IN (SELECT json_extract(value,'$[0]'),json_extract(value,'$[1]'),json_extract(value,'$[2]') FROM json_each(${JSON.stringify(chunk.map(row => [row.recordId, row.versionHash, row.locale]))}))`,
        )
        .all()
      i18n.push(...(rows as unknown as typeof i18n))
    }
  }
  return { divisions, i18n }
}
