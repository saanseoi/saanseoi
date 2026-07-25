import type { CurrentDatabase, StreetEvidenceAsset } from '@repo/db'
import { and, currentSchema, eq } from '@repo/db'

const { streets, streetsI18n } = currentSchema

export type StreetCurrentRecord = {
  id: string
  districtIds: string[] | null
  landsdPublicationDate: string | null
  references: unknown
  i18n: Array<{
    assetLinks: StreetEvidenceAsset[] | null
    description: string | null
    locale: string
    name: string
    translationProvenance: unknown
  }>
  sourceKeys: unknown
  version: number
  status: 'active' | 'deleted'
  deletedAt: string | null
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
      landsdPublicationDate: streets.landsdPublicationDate,
      references: streets.references,
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

  const i18n = await db
    .select({
      assetLinks: streetsI18n.assetLinks,
      description: streetsI18n.description,
      locale: streetsI18n.locale,
      name: streetsI18n.name,
      translationProvenance: streetsI18n.translationProvenance,
    })
    .from(streetsI18n)
    .where(
      and(
        eq(streetsI18n.snapshotId, input.snapshotId),
        eq(streetsI18n.streetId, input.id),
      ),
    )
    .all()
  return { ...street, i18n }
}
