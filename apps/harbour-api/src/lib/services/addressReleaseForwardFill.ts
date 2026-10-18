import { listCurrentApiCompositionMembersForType } from '@repo/core/db/metaRegistry'
import type { HarbourReadableDb, HarbourWritableDb } from '@repo/core/db/types'
import { and, desc, eq, or, metaSchema } from '@repo/db'
import { resolveSupportingSnapshotsForMember } from './controlSnapshots'

/** Recompose pre-release Address cohorts in place after late Places assembly. */
export async function prepareAddressReleaseForwardFill(
  db: HarbourReadableDb & HarbourWritableDb,
  regionCode?: 'hk' | 'mo',
) {
  const {
    metaApiReleaseSets: sets,
    metaApiVersionReleaseSets: versions,
    metaApiVersions: apis,
    metaApiReleaseSetSnapshots: members,
  } = metaSchema
  const releases = await db
    .select({
      id: sets.id,
      code: sets.code,
      versionReleaseSetId: versions.id,
      cohortKey: sets.cohortKey,
      regionCode: sets.regionCode,
      domainCode: sets.domainCode,
      schemaVersion: sets.schemaVersion,
      rulesetVersion: sets.rulesetVersion,
      apiVersion: apis.code,
    })
    .from(sets)
    .innerJoin(versions, eq(versions.apiReleaseSetId, sets.id))
    .innerJoin(apis, eq(versions.apiVersionId, apis.id))
    .where(
      and(
        eq(apis.familyType, 'addresses'),
        or(eq(versions.status, 'current'), eq(versions.status, 'archived')),
        regionCode ? eq(sets.regionCode, regionCode) : undefined,
      ),
    )
    .orderBy(sets.cohortKey, desc(sets.revision))
    .all()
  const seen = new Set<string>()
  const prepared: string[] = []
  for (const release of releases) {
    if (!release.cohortKey || !release.regionCode) continue
    const key = JSON.stringify([
      release.apiVersion,
      release.regionCode,
      release.domainCode,
      release.cohortKey,
    ])
    if (seen.has(key)) continue
    seen.add(key)
    const composition = await listCurrentApiCompositionMembersForType(
      db,
      'address',
      release.apiVersion,
    )
    const member = composition.find(
      row =>
        row.domainCode === release.domainCode &&
        row.variant === 'overture-places' &&
        row.resourceType === 'address',
    )
    if (!member) continue
    const selected = await resolveSupportingSnapshotsForMember(
      db,
      member,
      release.regionCode as 'hk' | 'mo',
      release.cohortKey,
    )
    if (!selected.length) continue
    if (selected.length !== 1)
      throw new Error(
        `Ambiguous supplementary Address assembly for ${release.cohortKey}.`,
      )
    const snapshot = selected[0]!
    const existing = await db
      .select()
      .from(members)
      .where(eq(members.apiReleaseSetId, release.id))
      .all()
    if (
      existing.some(
        row => row.variant === member.variant && row.snapshotId === snapshot.id,
      )
    )
      continue
    // Re-open only this version association for normal publication. Keep the
    // release identity and every exact primary/lookup selection intact.
    await db
      .update(versions)
      .set({ status: 'draft' })
      .where(eq(versions.id, release.versionReleaseSetId))
      .run()
    await db
      .delete(members)
      .where(
        and(
          eq(members.apiReleaseSetId, release.id),
          eq(members.variant, member.variant),
        ),
      )
      .run()
    await db
      .insert(members)
      .values({
        apiReleaseSetId: release.id,
        snapshotId: snapshot.id,
        variant: member.variant,
        role: member.role,
        isRequired: member.isRequired,
        cohortMatchingMode: member.cohortMatchingMode,
      })
      .onConflictDoNothing()
      .run()
    prepared.push(release.code)
  }
  return prepared
}
