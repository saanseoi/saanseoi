import { and, eq, metaSchema, sql } from '@repo/db'
import type { HarbourReadableDb } from './types'

/** One producer per dataset; a dataset discriminator is needed only for mixed snapshots. */
export async function resolveSnapshotHistoryProducers(
  db: HarbourReadableDb,
  snapshotId: string,
) {
  const sources = metaSchema.metaSnapshotResourceReleases
  const rows = await db
    .select({ resourceReleaseId: sources.resourceReleaseId })
    .from(sources)
    .where(and(eq(sources.snapshotId, snapshotId), eq(sources.role, 'primary')))
    .all()
  if (!rows.length)
    throw new Error(`Snapshot ${snapshotId} requires a HISTORY producer.`)
  if (rows.length === 1)
    return {
      resourceReleaseId: rows[0]!.resourceReleaseId,
      producerReleases: undefined,
    }
  const details = await db
    .select({
      datasetCode: metaSchema.metaDatasets.code,
      resourceReleaseId: sources.resourceReleaseId,
    })
    .from(sources)
    .innerJoin(
      metaSchema.metaResourceReleaseDetails,
      eq(sources.resourceReleaseId, metaSchema.metaResourceReleaseDetails.id),
    )
    .innerJoin(
      metaSchema.metaDatasets,
      eq(metaSchema.metaResourceReleaseDetails.datasetId, metaSchema.metaDatasets.id),
    )
    .where(and(eq(sources.snapshotId, snapshotId), eq(sources.role, 'primary')))
    .all()
  const producerReleases: Record<string, string> = {}
  for (const row of details) {
    if (producerReleases[row.datasetCode])
      throw new Error(
        `Snapshot ${snapshotId} selects multiple producing releases for dataset ${row.datasetCode}.`,
      )
    producerReleases[row.datasetCode] = row.resourceReleaseId
  }
  if (details.length !== rows.length)
    throw new Error(`Snapshot ${snapshotId} has incomplete HISTORY producer metadata.`)
  return { resourceReleaseId: null, producerReleases }
}

/** Destructive callers must verify current META ownership before deleting snapshot events. */
export async function assertOwnedSnapshotProducers(
  db: HarbourReadableDb,
  snapshotIds: readonly string[],
  releaseIds: readonly string[],
) {
  if (!snapshotIds.length) return
  const sources = metaSchema.metaSnapshotResourceReleases
  const rows = await db
    .select({
      snapshotId: sources.snapshotId,
      resourceReleaseId: sources.resourceReleaseId,
    })
    .from(sources)
    .where(
      and(
        eq(sources.role, 'primary'),
        sql`${sources.snapshotId} in (select value from json_each(${JSON.stringify(snapshotIds)}))`,
      ),
    )
    .all()
  const owned = new Set(releaseIds),
    present = new Set(rows.map(row => row.snapshotId))
  if (
    rows.some(row => !owned.has(row.resourceReleaseId)) ||
    snapshotIds.some(id => !present.has(id))
  )
    throw new Error(
      'Refusing reset: introducing-snapshot HISTORY producers no longer match the initialisation manifest.',
    )
}
