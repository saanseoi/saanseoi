import type { MetaDatabase } from '@repo/db'
import { and, desc, eq } from '@repo/db'
import { metaSchema } from '@repo/db'

const { metaDatasets, metaPublishers, metaReleases } = metaSchema

type RegionCode = 'hk' | 'mo'

type DatasetFilters = {
  regionCode?: RegionCode
  cohortKey?: string
  theme?: typeof metaDatasets.$inferSelect.theme
  status?: typeof metaReleases.$inferSelect.status
  limit?: number
}

export async function listDatasets(db: MetaDatabase, filters: DatasetFilters = {}) {
  const limit =
    filters.limit === undefined ? 100 : Math.min(100, Math.max(1, filters.limit))
  const conditions = [
    filters.regionCode ? eq(metaDatasets.regionCode, filters.regionCode) : undefined,
    filters.cohortKey ? eq(metaReleases.cohortKey, filters.cohortKey) : undefined,
    filters.theme ? eq(metaDatasets.theme, filters.theme) : undefined,
    filters.status ? eq(metaReleases.status, filters.status) : undefined,
  ].filter(condition => condition !== undefined)

  return db
    .select({
      id: metaReleases.id,
      datasetId: metaDatasets.id,
      datasetCode: metaDatasets.code,
      releaseCode: metaReleases.code,
      regionCode: metaDatasets.regionCode,
      cohortKey: metaReleases.cohortKey,
      theme: metaDatasets.theme,
      type: metaDatasets.type,
      source: metaPublishers.code,
      sourceVersion: metaReleases.sourceVersion,
      rawObjectKey: metaReleases.rawObjectKey,
      originalFileName: metaReleases.originalFileName,
      status: metaReleases.status,
      supersededByReleaseId: metaReleases.supersededByReleaseId,
      revokedAt: metaReleases.revokedAt,
      revocationReason: metaReleases.revocationReason,
      ingestedAt: metaReleases.ingestedAt,
      createdAt: metaReleases.createdAt,
      updatedAt: metaReleases.updatedAt,
    })
    .from(metaReleases)
    .innerJoin(metaDatasets, eq(metaReleases.datasetId, metaDatasets.id))
    .innerJoin(metaPublishers, eq(metaDatasets.publisherId, metaPublishers.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(metaReleases.cohortKey), desc(metaReleases.ingestedAt))
    .limit(limit)
    .all()
}
