import {
  and,
  eq,
  metaDatasets,
  metaPublishers,
  metaReleases,
  toIsoTimestamp,
} from '@repo/db'
import { resolveSourceSchemaVersion } from '@repo/core'
import type { MetaDatabase } from '@repo/db'

type StagedReleaseSyncPlan = {
  cohortKey: string
  regionCode: 'hk' | 'mo'
  source: string
  sourceVersion: string
  theme: string
  type: string
}

export async function syncStagedReleaseIntoLocalMetaCache(
  metaDb: MetaDatabase,
  release: {
    datasetCode: string
    rawObjectKey: string
    releaseCode: string
    releaseId: string
  },
  plan: StagedReleaseSyncPlan,
) {
  const dataset =
    ((await metaDb
      .select({
        id: metaDatasets.id,
      })
      .from(metaDatasets)
      .innerJoin(metaPublishers, eq(metaDatasets.publisherId, metaPublishers.id))
      .where(
        and(
          eq(metaDatasets.code, release.datasetCode),
          eq(metaPublishers.code, plan.source),
        ),
      )
      .limit(1)
      .get()) as { id: string } | undefined) ?? null

  if (!dataset) {
    throw new Error(
      `Dataset definition not found in local meta cache: ${plan.source}/${release.datasetCode}`,
    )
  }

  const now = toIsoTimestamp()
  const sourceSchemaVersion = await resolveSourceSchemaVersion({
    source: plan.source,
    sourceVersion: plan.sourceVersion,
    allowOlderMappedRelease: true,
  })

  await metaDb
    .insert(metaReleases)
    .values({
      id: release.releaseId,
      datasetId: dataset.id,
      code: release.releaseCode,
      sourceVersion: plan.sourceVersion,
      sourceSchemaVersion,
      publicationDate: plan.sourceVersion.split('.')[0] ?? null,
      cohortKey: plan.cohortKey,
      rawObjectKey: release.rawObjectKey,
      originalFileName: release.rawObjectKey.split('/').at(-1) ?? null,
      status: 'staged',
      revokedAt: null,
      revocationReason: null,
      supersededByReleaseId: null,
      ingestedAt: now,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: metaReleases.code,
      set: {
        id: release.releaseId,
        datasetId: dataset.id,
        sourceVersion: plan.sourceVersion,
        sourceSchemaVersion,
        publicationDate: plan.sourceVersion.split('.')[0] ?? null,
        cohortKey: plan.cohortKey,
        rawObjectKey: release.rawObjectKey,
        originalFileName: release.rawObjectKey.split('/').at(-1) ?? null,
        status: 'staged',
        revokedAt: null,
        revocationReason: null,
        supersededByReleaseId: null,
        ingestedAt: now,
        updatedAt: now,
      },
    })
    .run()
}
