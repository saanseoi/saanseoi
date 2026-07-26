import type { CurrentDatabase, StreetChangelogKind } from '@repo/db'
import { and, currentSchema, eq } from '@repo/db'

const { streetChangelog, streets, streetsI18n } = currentSchema

export type StreetCurrentRecord = {
  id: string
  districtIds: string[] | null
  gazetteDate: string | null
  i18n: Array<{
    description: string | null
    locale: string
    name: string
  }>
  sourceKeys: unknown
  version: number
  status: 'active' | 'deleted'
  deletedAt: string | null
  changelog: Array<{
    evidenceAssets: unknown
    effectiveDate: string | null
    gazetteDate: string | null
    isPartialNameChange: boolean
    kind: StreetChangelogKind
    noticeRef: string | null
    recordKey: string
    sourceReleaseId: string | null
    sourceShardId: string | null
  }>
}

export async function getStreetCurrentById(
  db: CurrentDatabase,
  input: { id: string; snapshotId: string },
): Promise<StreetCurrentRecord | null> {
  const street = await db
    .select({
      deletedAt: streets.deletedAt,
      districtIds: streets.districtIds,
      id: streets.id,
      gazetteDate: streets.gazetteDate,
      sourceKeys: streets.sourceKeys,
      status: streets.status,
      version: streets.version,
    })
    .from(streets)
    .where(
      and(
        eq(streets.snapshotId, input.snapshotId),
        eq(streets.id, input.id),
        eq(streets.status, 'active'),
      ),
    )
    .get()
  if (!street) return null

  const [i18n, changelog] = await Promise.all([
    db
      .select({
        description: streetsI18n.description,
        locale: streetsI18n.locale,
        name: streetsI18n.name,
      })
      .from(streetsI18n)
      .where(
        and(
          eq(streetsI18n.snapshotId, input.snapshotId),
          eq(streetsI18n.streetId, input.id),
        ),
      )
      .all(),
    db
      .select({
        evidenceAssets: streetChangelog.evidenceAssets,
        effectiveDate: streetChangelog.effectiveDate,
        isPartialNameChange: streetChangelog.isPartialNameChange,
        kind: streetChangelog.kind,
        gazetteDate: streetChangelog.gazetteDate,
        noticeRef: streetChangelog.noticeRef,
        recordKey: streetChangelog.recordKey,
        sourceReleaseId: streetChangelog.sourceReleaseId,
        sourceShardId: streetChangelog.sourceShardId,
      })
      .from(streetChangelog)
      .where(
        and(
          eq(streetChangelog.snapshotId, input.snapshotId),
          eq(streetChangelog.streetId, input.id),
        ),
      )
      .all(),
  ])
  return { ...street, changelog, i18n }
}
