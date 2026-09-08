import { and, eq, ne, sql, metaSourceReleases } from '@repo/db'

/** Evaluated in the publishing write, so a missing or unfinished child blocks visibility. */
export function sourceReleasePublicationCondition(sourceReleaseId: string) {
  return and(
    eq(metaSourceReleases.id, sourceReleaseId),
    ne(metaSourceReleases.status, 'revoked'),
    sql`json_array_length(${metaSourceReleases.expectedResourceTypes}) > 0`,
    sql`NOT EXISTS (
      SELECT 1 FROM json_each(${metaSourceReleases.expectedResourceTypes}) AS expected
      WHERE NOT EXISTS (
        SELECT 1 FROM releases AS child
        WHERE child.sourceReleaseId = ${metaSourceReleases.id}
          AND child.resourceType = expected.value
          AND child.status = 'published'
      )
    )`,
  )
}
