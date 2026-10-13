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
      datasetId: metaSchema.metaResourceReleaseDetails.datasetId,
      resourceType: metaSchema.metaResourceReleaseDetails.resourceType,
      sourceSchemaVersion: metaSchema.metaResourceReleaseDetails.sourceSchemaVersion,
    })
    .from(metaSchema.metaResourceReleaseDetails)
    .where(eq(metaSchema.metaResourceReleaseDetails.id, resourceReleaseId))
    .get()
  if (!release)
    throw new Error(`Cannot resolve previous C&SD release stats: ${resourceReleaseId}.`)

  const candidates = await metaDb
    .select({ id: metaSchema.metaResourceReleaseDetails.id })
    .from(metaSchema.metaResourceReleaseDetails)
    .where(
      and(
        eq(metaSchema.metaResourceReleaseDetails.datasetId, release.datasetId),
        eq(metaSchema.metaResourceReleaseDetails.resourceType, release.resourceType),
        ne(metaSchema.metaResourceReleaseDetails.id, resourceReleaseId),
        eq(metaSchema.metaResourceReleaseDetails.status, 'current'),
        release.sourceSchemaVersion === null
          ? isNull(metaSchema.metaResourceReleaseDetails.sourceSchemaVersion)
          : eq(
              metaSchema.metaResourceReleaseDetails.sourceSchemaVersion,
              release.sourceSchemaVersion,
            ),
      ),
    )
    .orderBy(desc(metaSchema.metaResourceReleaseDetails.createdAt))
    .all()

  for (const candidate of candidates) {
    const rows = await metaDb
      .select()
      .from(metaSchema.stats)
      .where(
        and(
          eq(metaSchema.stats.resourceReleaseId, candidate.id),
          sql`${metaSchema.stats.category} != 'processing'`,
        ),
      )
      .all()
    if (rows.length > 0) return rows as ReleaseStatsRow[]
  }
  return null
}
