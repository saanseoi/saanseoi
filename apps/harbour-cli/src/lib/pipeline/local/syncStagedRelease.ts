import {
  and,
  eq,
  isNull,
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
  releasePublicationDate,
} from '@repo/core/db/metaRegistry'
import { runWithWriteRetry } from '@repo/core/pipeline/utils'
import type { MetaDatabase } from '@repo/db'
import { findPendingSqlDeliveryReleaseId } from './sqlDeliveryPending.ts'

type StagedReleaseSyncPlan = {
  cohortKey: string
  regionCode: 'hk' | 'mo'
  source: string
  sourceVersion: string
  theme: string
  resourceType: ResourceType
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
  options: { reuseExistingRelease?: boolean; retainedDeliveryCacheDir?: string } = {},
) {
  const dataset =
    ((await metaDb
      .select({
        id: metaDatasets.id,
        processingRules: metaDatasets.processingRules,
        resourceTypes: metaDatasets.resourceTypes,
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
      .get()) as
      | { id: string; processingRules: unknown; resourceTypes: string[] }
      | undefined) ?? null

  if (!dataset) {
    throw new Error(
      `Dataset definition not found in local meta cache: ${plan.source}/${release.datasetCode}`,
    )
  }

  const existingRelease = await metaDb
    .select({
      id: metaReleases.id,
      datasetId: metaReleases.datasetId,
      sourceVersion: metaReleases.sourceVersion,
      status: metaReleases.status,
      resourceType: metaReleases.resourceType,
    })
    .from(metaReleases)
    .where(eq(metaReleases.code, release.releaseCode))
    .limit(1)
    .get()
  if (existingRelease && existingRelease.resourceType !== plan.resourceType) {
    throw new Error(
      `Resource release ${release.releaseCode} belongs to ${existingRelease.resourceType}, not ${plan.resourceType}.`,
    )
  }
  if (
    existingRelease?.status === 'processing' &&
    existingRelease.id === release.releaseId &&
    existingRelease.datasetId === dataset.id &&
    existingRelease.sourceVersion === plan.sourceVersion &&
    options.retainedDeliveryCacheDir &&
    (await findPendingSqlDeliveryReleaseId(
      options.retainedDeliveryCacheDir,
      release.releaseCode,
    )) === release.releaseId
  )
    return
  if (
    existingRelease &&
    existingRelease.status !== 'staged' &&
    existingRelease.status !== 'failed' &&
    !(
      options.reuseExistingRelease &&
      (existingRelease.status === 'processing' ||
        existingRelease.status === 'published')
    )
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
          expectedResourceTypes: dataset.resourceTypes,
          sourceSchemaVersion,
          publicationDate: releasePublicationDate(plan.sourceVersion),
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
        .onConflictDoNothing({ target: metaSourceReleases.code })
        .run()

      // Registration may precede acquisition of the prepared object. Complete
      // only a missing key on an unpublished source; preserve native archives.
      await tx
        .update(metaSourceReleases)
        .set({ rawObjectKey: release.rawObjectKey, updatedAt: now })
        .where(
          and(
            eq(metaSourceReleases.id, sourceReleaseId),
            isNull(metaSourceReleases.rawObjectKey),
            or(
              eq(metaSourceReleases.status, 'staged'),
              eq(metaSourceReleases.status, 'failed'),
            ),
          ),
        )
        .run()

      return tx
        .insert(metaReleases)
        .values({
          id: release.releaseId,
          sourceReleaseId,
          datasetId: dataset.id,
          code: release.releaseCode,
          resourceType: plan.resourceType,
          sourceVersion: plan.sourceVersion,
          sourceSchemaVersion,
          processingRules,
          publicationDate: releasePublicationDate(plan.sourceVersion),
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
            resourceType: plan.resourceType,
            sourceVersion: plan.sourceVersion,
            sourceSchemaVersion,
            processingRules,
            publicationDate: releasePublicationDate(plan.sourceVersion),
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
            ...(options.reuseExistingRelease
              ? [
                  eq(metaReleases.status, 'processing'),
                  eq(metaReleases.status, 'published'),
                ]
              : []),
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
