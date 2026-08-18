import type { HarbourReadableDb } from '@repo/core/db/types'
import type { ReleaseStatsRow } from '@repo/db/metaSchema'
import { metaSchema } from '@repo/db'
import { and, desc, eq, isNull, ne } from 'drizzle-orm'

/**
 * Returns the latest compatible frozen source-release facts. Reading
 * `meta.stats`, rather than canonical-current rows, keeps reruns deterministic
 * after a compilation has replaced the current observation view.
 */
export async function findPreviousComparableCenstatdReleaseStats(
  metaDb: HarbourReadableDb,
  releaseId: string,
): Promise<ReleaseStatsRow[] | null> {
  const release = await metaDb
    .select({
      datasetId: metaSchema.metaReleases.datasetId,
      resourceType: metaSchema.metaReleases.resourceType,
      sourceSchemaVersion: metaSchema.metaReleases.sourceSchemaVersion,
    })
    .from(metaSchema.metaReleases)
    .where(eq(metaSchema.metaReleases.id, releaseId))
    .get()
  if (!release)
    throw new Error(`Cannot resolve previous C&SD release stats: ${releaseId}.`)

  const candidates = await metaDb
    .select({ id: metaSchema.metaReleases.id })
    .from(metaSchema.metaReleases)
    .where(
      and(
        eq(metaSchema.metaReleases.datasetId, release.datasetId),
        eq(metaSchema.metaReleases.resourceType, release.resourceType),
        ne(metaSchema.metaReleases.id, releaseId),
        eq(metaSchema.metaReleases.status, 'published'),
        release.sourceSchemaVersion === null
          ? isNull(metaSchema.metaReleases.sourceSchemaVersion)
          : eq(
              metaSchema.metaReleases.sourceSchemaVersion,
              release.sourceSchemaVersion,
            ),
      ),
    )
    .orderBy(desc(metaSchema.metaReleases.createdAt))
    .all()

  for (const candidate of candidates) {
    const rows = await metaDb
      .select()
      .from(metaSchema.stats)
      .where(
        and(
          eq(metaSchema.stats.releaseId, candidate.id),
          eq(metaSchema.stats.type, 'release'),
        ),
      )
      .all()
    if (rows.length > 0) return rows as ReleaseStatsRow[]
  }
  return null
}
