import {
  and,
  eq,
  metaDatasets,
  metaPublishers,
  metaReleases,
  metaSourceReleases,
  or,
  toIsoTimestamp,
} from '@repo/db'
import {
  publisherCodeForSource,
  resolveSourceSchemaVersion,
  type ResourceType,
} from '@repo/core'
import {
  buildDeterministicSourceReleaseId,
  buildSourceReleaseCode,
} from '@repo/core/db/metaRegistry'
import { runWithWriteRetry } from '@repo/core/pipeline/utils'
import type { MetaDatabase } from '@repo/db'

type StagedReleaseSyncPlan = {
  cohortKey: string
  regionCode: 'hk' | 'mo'
  source: string
  sourceVersion: string
  theme: string
  type: ResourceType
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
        processingRules: metaDatasets.processingRules,
      })
      .from(metaDatasets)
      .innerJoin(metaPublishers, eq(metaDatasets.publisherId, metaPublishers.id))
      .where(
        and(
          eq(metaDatasets.code, release.datasetCode),
          eq(metaPublishers.code, publisherCodeForSource(plan.source)),
        ),
      )
      .limit(1)
      .get()) as { id: string; processingRules: unknown } | undefined) ?? null

  if (!dataset) {
    throw new Error(
      `Dataset definition not found in local meta cache: ${plan.source}/${release.datasetCode}`,
    )
  }

  const existingRelease = await metaDb
    .select({ status: metaReleases.status })
    .from(metaReleases)
    .where(eq(metaReleases.code, release.releaseCode))
    .limit(1)
    .get()
  if (
    existingRelease &&
    existingRelease.status !== 'staged' &&
    existingRelease.status !== 'failed'
  ) {
    throw new Error(
      `Cannot replace source release ${release.releaseCode}: ${existingRelease.status} releases are immutable.`,
    )
  }

  const now = toIsoTimestamp()
  const sourceSchemaVersion = await resolveSourceSchemaVersion({
    source: plan.source,
    sourceVersion: plan.sourceVersion,
    allowOlderMappedRelease: true,
  })
  const processingRules = dataset.processingRules
  const sourceReleaseCode = buildSourceReleaseCode(
    release.datasetCode,
    plan.sourceVersion,
  )
  const sourceReleaseId = buildDeterministicSourceReleaseId(sourceReleaseCode)

  const result = await runWithWriteRetry(() =>
    metaDb.transaction(async tx => {
      await tx
        .insert(metaSourceReleases)
        .values({
          id: sourceReleaseId,
          datasetId: dataset.id,
          code: sourceReleaseCode,
          sourceVersion: plan.sourceVersion,
          sourceSchemaVersion,
          publicationDate: plan.sourceVersion.split('.')[0] ?? null,
          cohortKey: plan.cohortKey,
          rawObjectKey: release.rawObjectKey,
          originalFileName: release.rawObjectKey.split('/').at(-1) ?? null,
          notes: null,
          status: 'staged',
          revokedAt: null,
          revocationReason: null,
          supersededBySourceReleaseId: null,
          processingRules,
          ingestedAt: now,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoNothing()
        .run()

      return tx
        .insert(metaReleases)
        .values({
          id: release.releaseId,
          sourceReleaseId,
          datasetId: dataset.id,
          code: release.releaseCode,
          resourceType: plan.type,
          sourceVersion: plan.sourceVersion,
          sourceSchemaVersion,
          processingRules,
          publicationDate: plan.sourceVersion.split('.')[0] ?? null,
          cohortKey: plan.cohortKey,
          rawObjectKey: release.rawObjectKey,
          originalFileName: release.rawObjectKey.split('/').at(-1) ?? null,
          notes: null,
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
            sourceReleaseId,
            datasetId: dataset.id,
            sourceVersion: plan.sourceVersion,
            sourceSchemaVersion,
            processingRules,
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
          where: or(
            eq(metaReleases.status, 'staged'),
            eq(metaReleases.status, 'failed'),
          ),
        })
        .run()
    }),
  )
  if (result.changes === 0) {
    throw new Error(
      `Cannot replace source release ${release.releaseCode}: its status changed while preparing the local cache.`,
    )
  }
}
