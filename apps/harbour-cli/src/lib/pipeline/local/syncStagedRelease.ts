import { retainIngestionProcessingRules } from '@repo/core/db/processingRuleDefinitions'
import type { HarbourReadableDb, HarbourWritableDb } from '@repo/core/db/types'
import {
  and,
  eq,
  isNull,
  metaDatasets,
  metaPublishers,
  metaResourceReleases,
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
import { readFixturePublicationDate } from '../../upload/publicationDate.ts'
import { findPendingSqlDeliveryReleaseId } from './sqlDeliveryPending.ts'

type StagedReleaseSyncPlan = {
  cohortKey: string
  regionCode: 'hk' | 'mo'
  source: string
  sourceVersion: string
  publicationDate?: string
  theme: string
  resourceType: ResourceType
}

export async function syncStagedReleaseIntoLocalMetaCache(
  metaDb: MetaDatabase,
  release: {
    datasetCode: string
    rawObjectKey: string
    releaseCode: string
    resourceReleaseId: string
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
      id: metaResourceReleases.id,
      datasetId: metaResourceReleases.datasetId,
      sourceVersion: metaResourceReleases.sourceVersion,
      status: metaResourceReleases.status,
      resourceType: metaResourceReleases.resourceType,
    })
    .from(metaResourceReleases)
    .where(eq(metaResourceReleases.code, release.releaseCode))
    .limit(1)
    .get()
  if (existingRelease && existingRelease.resourceType !== plan.resourceType) {
    throw new Error(
      `Resource release ${release.releaseCode} belongs to ${existingRelease.resourceType}, not ${plan.resourceType}.`,
    )
  }
  if (
    existingRelease?.status === 'processing' &&
    existingRelease.id === release.resourceReleaseId &&
    existingRelease.datasetId === dataset.id &&
    existingRelease.sourceVersion === plan.sourceVersion &&
    options.retainedDeliveryCacheDir &&
    (await findPendingSqlDeliveryReleaseId(
      options.retainedDeliveryCacheDir,
      release.releaseCode,
    )) === release.resourceReleaseId
  )
    return
  if (
    existingRelease &&
    existingRelease.status !== 'staged' &&
    existingRelease.status !== 'failed' &&
    !(
      options.reuseExistingRelease &&
      (existingRelease.status === 'processing' || existingRelease.status === 'current')
    )
  ) {
    throw new Error(
      `Cannot replace source release ${release.releaseCode}: ${existingRelease.status} releases are immutable.`,
    )
  }

  const publicationDate = releasePublicationDate(
    plan.sourceVersion,
    plan.publicationDate ?? (await readFixturePublicationDate({ ...plan, ...release })),
  )
  const now = toIsoTimestamp()
  const sourceSchemaVersion = await resolveSourceSchemaVersion({
    source: plan.source,
    sourceVersion: plan.sourceVersion,
    allowOlderMappedRelease: true,
  })
  const processingRules = await retainIngestionProcessingRules(
    metaDb as unknown as HarbourReadableDb & HarbourWritableDb,
    dataset.processingRules,
  )
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
          publicationDate,
          cohortKey: plan.cohortKey,
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

      return tx
        .insert(metaResourceReleases)
        .values({
          id: release.resourceReleaseId,
          sourceReleaseId,
          datasetId: dataset.id,
          code: release.releaseCode,
          resourceType: plan.resourceType,
          sourceVersion: plan.sourceVersion,
          sourceSchemaVersion,
          processingRules,
          publicationDate,
          cohortKey: plan.cohortKey,
          status: 'staged',
          revokedAt: null,
          revocationReason: null,
          supersededByResourceReleaseId: null,
          ingestedAt: now,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: metaResourceReleases.code,
          set: {
            sourceReleaseId,
            datasetId: dataset.id,
            resourceType: plan.resourceType,
            sourceVersion: plan.sourceVersion,
            sourceSchemaVersion,
            processingRules,
            publicationDate,
            cohortKey: plan.cohortKey,
            status: 'staged',
            revokedAt: null,
            revocationReason: null,
            supersededByResourceReleaseId: null,
            ingestedAt: now,
            updatedAt: now,
          },
          where: or(
            eq(metaResourceReleases.status, 'staged'),
            eq(metaResourceReleases.status, 'failed'),
            ...(options.reuseExistingRelease
              ? [
                  eq(metaResourceReleases.status, 'processing'),
                  eq(metaResourceReleases.status, 'current'),
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
