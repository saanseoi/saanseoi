import {
  getApiVersionCodeForType,
  listDraftReleaseSetsForTypeRegionAtOrAfterCohortKey,
  listCurrentApiCompositionMembersForType,
} from '@repo/core/db/metaRegistry'
import type { HarbourReadableDb } from '@repo/core/db/types'
import type { RegionCode, ResourceType } from '@repo/core'
import { and, eq, or, metaApiVersions } from '@repo/db'

/** A deprecated API can still publish its primary inventory and companions. */
export async function resolveDivisionPublicationVersion(
  db: HarbourReadableDb,
  resourceType: ResourceType,
  variant: string,
  pinnedVersion?: string,
  pendingScope?: { regionCode: RegionCode; cohortKey: string },
) {
  const versions = await db
    .select({ code: metaApiVersions.code, version: metaApiVersions.version })
    .from(metaApiVersions)
    .where(
      and(
        eq(metaApiVersions.familyType, 'divisions'),
        or(
          eq(metaApiVersions.status, 'current'),
          eq(metaApiVersions.status, 'deprecated'),
        ),
        pinnedVersion ? eq(metaApiVersions.code, pinnedVersion) : undefined,
      ),
    )
    .all()
  if (pinnedVersion && versions.length === 0)
    throw new Error(`Division API version is not publishable: ${pinnedVersion}`)
  versions.sort((a, b) => b.version.localeCompare(a.version, 'en', { numeric: true }))
  const candidates = await Promise.all(
    versions.map(async version => ({
      code: version.code,
      members: await listCurrentApiCompositionMembersForType(
        db,
        resourceType,
        version.code,
      ),
    })),
  )
  // A geometry companion follows the API whose domain primary has the same
  // variant. An upstream inventory in a newer API must not steal publication
  // from the API that exposes that inventory as its primary resource.
  const primary = candidates.find(candidate =>
    candidate.members.some(
      member =>
        member.resourceType === resourceType &&
        (member.variant === variant || variant === `${member.variant}:simplified`) &&
        candidate.members.some(
          primary =>
            primary.domainCode === member.domainCode &&
            primary.role === 'primary' &&
            primary.variant === member.variant,
        ),
    ),
  )
  if (primary) return primary.code
  // Shared government geometry completes the waiting inventory. During clean
  // initialisation v0.1 already has Overture drafts, while the curated primary
  // for v0.2 is assembled only after its source ingredients are retained.
  if (pendingScope && !pinnedVersion) {
    for (const candidate of candidates) {
      if (
        !candidate.members.some(
          member =>
            member.resourceType === resourceType &&
            (member.variant === variant || variant.startsWith(`${member.variant}:`)),
        )
      )
        continue
      const drafts = await listDraftReleaseSetsForTypeRegionAtOrAfterCohortKey(
        db,
        resourceType,
        pendingScope.regionCode,
        pendingScope.cohortKey,
        candidate.code,
      )
      if (drafts.length > 0) return candidate.code
    }
  }
  return candidates[0]?.code ?? getApiVersionCodeForType(resourceType)
}
