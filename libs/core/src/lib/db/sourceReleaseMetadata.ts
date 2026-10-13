import { and, eq, isNull, or, sql, toIsoTimestamp, metaSourceReleases } from '@repo/db'
import type { HarbourReadableDb, HarbourWritableDb } from './types'

type SourceMetadata = Pick<
  typeof metaSourceReleases.$inferSelect,
  | 'datasetId'
  | 'sourceVersion'
  | 'sourceSchemaVersion'
  | 'publicationDate'
  | 'cohortKey'
  | 'releaseNotesUrl'
>

/** Retain one source assertion across independently registered resource types. */
export async function retainSourceReleaseMetadata(
  db: HarbourReadableDb & HarbourWritableDb,
  sourceReleaseId: string,
  metadata: SourceMetadata,
) {
  const nullableFields = [
    'sourceSchemaVersion',
    'publicationDate',
    'cohortKey',
    'releaseNotesUrl',
  ] as const
  const supplied = nullableFields.filter(field => metadata[field] !== null)
  if (supplied.length) {
    await db
      .update(metaSourceReleases)
      .set({
        updatedAt: toIsoTimestamp(),
        ...Object.fromEntries(
          supplied.map(field => [
            field,
            sql`coalesce(${metaSourceReleases[field]}, ${metadata[field]})`,
          ]),
        ),
      })
      .where(
        and(
          eq(metaSourceReleases.id, sourceReleaseId),
          or(...supplied.map(field => isNull(metaSourceReleases[field]))),
          eq(metaSourceReleases.datasetId, metadata.datasetId),
          eq(metaSourceReleases.sourceVersion, metadata.sourceVersion),
          ...supplied.map(field =>
            or(
              isNull(metaSourceReleases[field]),
              eq(metaSourceReleases[field], metadata[field]!),
            ),
          ),
        ),
      )
      .run()
  }
  const retained = await db
    .select()
    .from(metaSourceReleases)
    .where(eq(metaSourceReleases.id, sourceReleaseId))
    .get()
  if (!retained) throw new Error(`Source release ${sourceReleaseId} does not exist.`)
  for (const field of ['datasetId', 'sourceVersion', ...supplied] as const) {
    if (retained[field] !== metadata[field]) {
      throw new Error(
        `Source release ${retained.code} has conflicting ${field}: retained ${JSON.stringify(retained[field])}, received ${JSON.stringify(metadata[field])}.`,
      )
    }
  }
}
