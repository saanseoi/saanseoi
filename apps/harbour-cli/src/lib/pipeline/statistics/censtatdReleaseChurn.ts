import type { HarbourReadableDb } from '@repo/core/db/types'
import type { ReleaseStatsRow } from '@repo/db/metaSchema'
import { metaSchema } from '@repo/db'
import { and, desc, eq, isNull, ne, sql } from 'drizzle-orm'

/**
 * Returns the latest compatible frozen source-release facts. Reading
 * `meta.stats`, rather than canonical-current rows, keeps reruns deterministic
 * after a compilation has replaced the current observation view.
 */
export async function findPreviousComparableCenstatdReleaseStats(
  metaDb: HarbourReadableDb,
  resourceReleaseId: string,
): Promise<ReleaseStatsRow[] | null> {
  const release = await metaDb
    .select({
      datasetId: metaSchema.metaResourceReleases.datasetId,
      resourceType: metaSchema.metaResourceReleases.resourceType,
      sourceSchemaVersion: metaSchema.metaResourceReleases.sourceSchemaVersion,
    })
    .from(metaSchema.metaResourceReleases)
    .where(eq(metaSchema.metaResourceReleases.id, resourceReleaseId))
    .get()
  if (!release)
    throw new Error(`Cannot resolve previous C&SD release stats: ${resourceReleaseId}.`)

  const candidates = await metaDb
    .select({ id: metaSchema.metaResourceReleases.id })
    .from(metaSchema.metaResourceReleases)
    .where(
      and(
        eq(metaSchema.metaResourceReleases.datasetId, release.datasetId),
        eq(metaSchema.metaResourceReleases.resourceType, release.resourceType),
        ne(metaSchema.metaResourceReleases.id, resourceReleaseId),
        eq(metaSchema.metaResourceReleases.status, 'published'),
        release.sourceSchemaVersion === null
          ? isNull(metaSchema.metaResourceReleases.sourceSchemaVersion)
          : eq(
              metaSchema.metaResourceReleases.sourceSchemaVersion,
              release.sourceSchemaVersion,
            ),
      ),
    )
    .orderBy(desc(metaSchema.metaResourceReleases.createdAt))
    .all()

  for (const candidate of candidates) {
    const rows = await metaDb
      .select()
      .from(metaSchema.stats)
      .where(
        and(
          eq(metaSchema.stats.resourceReleaseId, candidate.id),
          sql`${metaSchema.stats.metric} != 'processing'`,
        ),
      )
      .all()
    if (rows.length > 0) return rows as ReleaseStatsRow[]
  }
  return null
}
