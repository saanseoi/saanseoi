import {
  and,
  buildApiCatalogRevisionCode,
  buildApiVersionCode,
  buildDataReleaseSetCode,
  buildSnapshotLineageCode,
  buildSnapshotVersionCode,
  buildDeterministicUuidV5,
  cohortKeyEffectiveFrom,
  computeVersionHash,
  asc,
  desc,
  eq,
  inArray,
  isNull,
  ne,
  or,
  sql,
  toIsoTimestamp,
} from '@repo/db'
import { listApiFieldFixtures, resolveApiFieldFixture } from '@repo/db/apiFieldFixtures'
import { metaSchema } from '@repo/db'
import { compareReleaseVersions, resolveSourceSchemaVersion } from '../../sourceSchemas'
import {
  buildDatasetCode,
  datasetVariantForSource,
  publisherCodeForSource,
  resourceTypeCodeSlug,
} from '../../codes'

import type { DatasetRecord, RegionCode, ResourceType, UploadPlan } from '../../types'
import type { HarbourReadableDb, HarbourWritableDb } from './types'
import type {
  ApiFamilyType,
  DataShardType,
  IngestRunStatus,
  ReleaseStatus,
  MetaDatabase,
} from '@repo/db'

const {
  metaApiComposition,
  metaApiCompositionMembers,
  metaApiCatalogRevisionReleaseSets,
  metaApiCatalogRevisions,
  metaApiEndpoints,
  metaApiFieldProvenance,
  metaApiReleaseSets,
  metaApiReleaseSetSnapshots,
  metaApiVersions,
  ingestRuns,
  metaDatasetI18n,
  metaDatasetResourceTypes,
  metaDatasetTransforms,
  metaDatasets,
  metaLicenses,
  metaPublishers,
  metaPublisherI18n,
  metaDataShards,
  metaPublishedDataJournal,
  metaReleaseSetShardAssignments,
  metaReleaseShardAssignments,
  metaSourceReleases,
  metaSnapshotShardAssignments,
  metaReleases,
  metaSnapshotAssembly,
  metaSnapshotLineages,
  metaSnapshots,
  metaSnapshotAssemblyRuns,
  metaSnapshotAssemblySources,
  metaSnapshotSources,
  releaseProcessingActions,
  stats,
} = metaSchema

function releaseAsRole({
  apiReleaseSetRole,
  assemblySourceRole,
  compositionRole,
  sourceRole,
}: {
  apiReleaseSetRole: string
  assemblySourceRole: string | null
  compositionRole: string | null
  sourceRole: string
}) {
  // A source can support a primary snapshot, or a snapshot can support an API
  // release. Either case is supporting use of the source release.
  return apiReleaseSetRole !== 'primary' ||
    compositionRole === 'supporting' ||
    (assemblySourceRole !== null && assemblySourceRole !== 'primary') ||
    sourceRole !== 'primary'
    ? 'supporting'
    : 'primary'
}

type DatasetFilters = {
  regionCode?: RegionCode
  cohortKey?: string
  theme?: typeof metaDatasets.$inferSelect.theme
  status?: typeof metaReleases.$inferSelect.status
  limit?: number
}

type ReleaseProcessingRules = {
  rulesets: Array<{
    rulesetVersion: string
    rules: Array<{
      condition?: string
      i18n: Array<{ description: string; locale: string }>
      mappings?: Array<{ from: string; to: string }>
      operationCode: string
      sourceFieldPath?: string
      targetFieldPath?: string
      type: 'bulk' | 'record'
    }>
  }>
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
      type: metaReleases.resourceType,
      subType: metaDatasets.subType,
      sourceVariant: metaDatasets.sourceVariant,
      sourceCrs: metaDatasets.sourceCrs,
      source: metaPublishers.code,
      sourceVersion: metaReleases.sourceVersion,
      rawObjectKey: metaReleases.rawObjectKey,
      originalFileName: metaReleases.originalFileName,
      releaseNotesUrl: metaReleases.releaseNotesUrl,
      notes: metaReleases.notes,
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

const DEFAULT_REGISTRY_LIMIT = 200
const D1_IN_ARRAY_BATCH_SIZE = 90

function registryLimit(limit?: number) {
  return limit === undefined
    ? DEFAULT_REGISTRY_LIMIT
    : Math.min(DEFAULT_REGISTRY_LIMIT, Math.max(1, limit))
}

async function queryInBatches<Input, Output>(
  items: Input[],
  query: (items: Input[]) => Promise<Output[]>,
) {
  const batches: Input[][] = []
  for (let index = 0; index < items.length; index += D1_IN_ARRAY_BATCH_SIZE) {
    batches.push(items.slice(index, index + D1_IN_ARRAY_BATCH_SIZE))
  }

  return (await Promise.all(batches.map(batch => query(batch)))).flat()
}

function firstByIdOrCode<T>(
  rows: T[],
  id: string,
  matches: (row: T, id: string) => boolean,
) {
  return rows.find(row => matches(row, id)) ?? null
}

type RegistryReleaseLifecycle = {
  cohortKey: string | null
  revision: number
  status: string
}

export function getRegistryReleaseLifecycleScope(
  apiFamily: string,
  regionCode: string | null,
  domainCode: string | null,
) {
  return `${apiFamily}\u0000${regionCode ?? ''}\u0000${domainCode ?? ''}`
}

export function resolveRegistryReleaseDisplayStatus(
  release: RegistryReleaseLifecycle,
  latest?: Pick<RegistryReleaseLifecycle, 'cohortKey' | 'revision'>,
) {
  if (
    release.status === 'draft' ||
    latest === undefined ||
    release.cohortKey === null
  ) {
    return release.status
  }

  if (release.cohortKey === latest.cohortKey && release.revision === latest.revision) {
    return 'current'
  }

  // A nonzero revision is an immutable correction or enrichment of its
  // cohort. Keep that reader-facing meaning even after a newer cohort exists.
  return release.revision > 0 ? 'revised' : 'superseded'
}

export async function listRegistryReleases(
  db: MetaDatabase,
  limit?: number,
  offset = 0,
  apiVersionId?: string,
  releaseCode?: string,
) {
  // `status` is an operational routing state. The registry also needs a
  // reader-facing lifecycle: a later cohort supersedes an earlier one, while
  // a later revision of the same cohort revises it. Load the small lifecycle
  // projection separately so this remains correct when the displayed list is
  // limited globally.
  const lifecycleRows = await db
    .select({
      id: metaApiReleaseSets.id,
      apiFamily: metaApiVersions.familyType,
      regionCode: metaApiReleaseSets.regionCode,
      domainCode: metaApiReleaseSets.domainCode,
      cohortKey: metaApiReleaseSets.cohortKey,
      revision: metaApiReleaseSets.revision,
      status: metaApiReleaseSets.status,
    })
    .from(metaApiReleaseSets)
    .innerJoin(metaApiVersions, eq(metaApiReleaseSets.apiVersionId, metaApiVersions.id))
    .where(apiVersionId ? eq(metaApiReleaseSets.apiVersionId, apiVersionId) : undefined)
    .all()

  const latestByScope = new Map<string, { cohortKey: string; revision: number }>()
  for (const row of lifecycleRows) {
    if (row.status === 'draft' || row.cohortKey === null) continue
    const scope = getRegistryReleaseLifecycleScope(
      row.apiFamily,
      row.regionCode,
      row.domainCode,
    )
    const latest = latestByScope.get(scope)
    if (
      !latest ||
      row.cohortKey > latest.cohortKey ||
      (row.cohortKey === latest.cohortKey && row.revision > latest.revision)
    ) {
      latestByScope.set(scope, {
        cohortKey: row.cohortKey,
        revision: row.revision,
      })
    }
  }

  const releaseCondition =
    apiVersionId && releaseCode
      ? and(
          eq(metaApiReleaseSets.apiVersionId, apiVersionId),
          eq(metaApiReleaseSets.code, releaseCode),
        )
      : apiVersionId
        ? eq(metaApiReleaseSets.apiVersionId, apiVersionId)
        : releaseCode
          ? eq(metaApiReleaseSets.code, releaseCode)
          : undefined
  const releases = await db
    .select({
      id: metaApiReleaseSets.id,
      apiVersionId: metaApiReleaseSets.apiVersionId,
      apiFamily: metaApiVersions.familyType,
      apiVersion: metaApiVersions.code,
      code: metaApiReleaseSets.code,
      regionCode: metaApiReleaseSets.regionCode,
      domainCode: metaApiReleaseSets.domainCode,
      cohortKey: metaApiReleaseSets.cohortKey,
      revision: metaApiReleaseSets.revision,
      schemaVersion: metaApiReleaseSets.schemaVersion,
      rulesetVersion: metaApiReleaseSets.rulesetVersion,
      status: metaApiReleaseSets.status,
      publishedAt: metaApiReleaseSets.publishedAt,
      validFrom: metaApiReleaseSets.validFrom,
      validTo: metaApiReleaseSets.validTo,
      notes: metaApiReleaseSets.notes,
      versionHash: metaApiReleaseSets.versionHash,
      createdAt: metaApiReleaseSets.createdAt,
      updatedAt: metaApiReleaseSets.updatedAt,
    })
    .from(metaApiReleaseSets)
    .innerJoin(metaApiVersions, eq(metaApiReleaseSets.apiVersionId, metaApiVersions.id))
    .where(releaseCondition)
    .orderBy(
      desc(
        sql`coalesce(${metaApiReleaseSets.publishedAt}, ${metaApiReleaseSets.createdAt})`,
      ),
      desc(metaApiReleaseSets.id),
    )
    .limit(registryLimit(limit))
    .offset(Math.max(0, offset))
    .all()

  const releaseIds = releases.map(release => release.id)
  const [releaseSnapshots, apiReleaseSetStats] = await Promise.all([
    queryInBatches(releaseIds, ids =>
      db
        .select({
          apiReleaseSetId: metaApiReleaseSetSnapshots.apiReleaseSetId,
          snapshotId: metaApiReleaseSetSnapshots.snapshotId,
          variant: metaApiReleaseSetSnapshots.variant,
          role: metaApiReleaseSetSnapshots.role,
          isRequired: metaApiReleaseSetSnapshots.isRequired,
          cohortMatchingMode: metaApiReleaseSetSnapshots.cohortMatchingMode,
          anchorSnapshotId: metaApiReleaseSetSnapshots.anchorSnapshotId,
          createdAt: metaApiReleaseSetSnapshots.createdAt,
          snapshot: {
            id: metaSnapshots.id,
            resourceType: metaSnapshots.resourceType,
            code: metaSnapshots.code,
            cohortKey: metaSnapshots.cohortKey,
            status: metaSnapshots.status,
            publishedAt: metaSnapshots.publishedAt,
            validFrom: metaSnapshots.validFrom,
            validTo: metaSnapshots.validTo,
            notes: metaSnapshots.notes,
            createdAt: metaSnapshots.createdAt,
            updatedAt: metaSnapshots.updatedAt,
          },
        })
        .from(metaApiReleaseSetSnapshots)
        .innerJoin(
          metaSnapshots,
          eq(metaApiReleaseSetSnapshots.snapshotId, metaSnapshots.id),
        )
        .where(inArray(metaApiReleaseSetSnapshots.apiReleaseSetId, ids))
        .all(),
    ),
    queryInBatches(releaseIds, ids =>
      db
        .select({
          apiReleaseSetId: stats.apiReleaseSetId,
          dimension: stats.dimension,
          metric: stats.metric,
          metricUnit: stats.metricUnit,
          value: stats.value,
          groupBy: stats.groupBy,
          groupValue: stats.groupValue,
        })
        .from(stats)
        .where(inArray(stats.apiReleaseSetId, ids))
        .all(),
    ),
  ])

  const snapshotIds = releaseSnapshots.map(
    releaseSnapshot => releaseSnapshot.snapshotId,
  )
  const snapshotSources = await queryInBatches(snapshotIds, ids =>
    db
      .select()
      .from(metaSnapshotSources)
      .where(inArray(metaSnapshotSources.snapshotId, ids))
      .all(),
  )
  const sourceReleaseIds = [
    ...new Set(snapshotSources.map(source => source.sourceReleaseId)),
  ]
  const datasetIds = [...new Set(snapshotSources.map(source => source.datasetId))]
  const [sourceReleases, processingActions, datasetResourceTypes] = await Promise.all([
    queryInBatches(sourceReleaseIds, ids =>
      db
        .select({
          id: metaReleases.id,
          code: metaReleases.code,
          datasetCode: metaDatasets.code,
          publisherCode: metaPublishers.code,
          sourceVersion: metaReleases.sourceVersion,
          subType: metaDatasets.subType,
          ingestedAt: metaReleases.ingestedAt,
          processingRules: metaReleases.processingRules,
        })
        .from(metaReleases)
        .innerJoin(metaDatasets, eq(metaReleases.datasetId, metaDatasets.id))
        .innerJoin(metaPublishers, eq(metaDatasets.publisherId, metaPublishers.id))
        .where(inArray(metaReleases.id, ids))
        .all(),
    ),
    queryInBatches(sourceReleaseIds, ids =>
      db
        .select({
          id: releaseProcessingActions.id,
          releaseId: releaseProcessingActions.releaseId,
          action: releaseProcessingActions.action,
          mode: releaseProcessingActions.mode,
          summary: releaseProcessingActions.summary,
          affectedRecordCount: releaseProcessingActions.affectedRecordCount,
          evidence: releaseProcessingActions.evidence,
          createdAt: releaseProcessingActions.createdAt,
          updatedAt: releaseProcessingActions.updatedAt,
        })
        .from(releaseProcessingActions)
        .where(inArray(releaseProcessingActions.releaseId, ids))
        .orderBy(
          desc(releaseProcessingActions.createdAt),
          desc(releaseProcessingActions.id),
        )
        .all(),
    ),
    queryInBatches(datasetIds, ids =>
      db
        .select({
          datasetId: metaDatasetResourceTypes.datasetId,
          resourceType: metaDatasetResourceTypes.resourceType,
        })
        .from(metaDatasetResourceTypes)
        .where(inArray(metaDatasetResourceTypes.datasetId, ids))
        .all(),
    ),
  ])
  const resourceTypesByDatasetId = new Map<string, Set<string>>()
  for (const resource of datasetResourceTypes) {
    const resourceTypes = resourceTypesByDatasetId.get(resource.datasetId) ?? new Set()
    resourceTypes.add(resource.resourceType)
    resourceTypesByDatasetId.set(resource.datasetId, resourceTypes)
  }

  return releases.map(release => {
    const latest = latestByScope.get(
      getRegistryReleaseLifecycleScope(
        release.apiFamily,
        release.regionCode,
        release.domainCode,
      ),
    )
    const displayStatus = resolveRegistryReleaseDisplayStatus(release, latest)
    const snapshots = releaseSnapshots.filter(
      snapshot => snapshot.apiReleaseSetId === release.id,
    )
    const releaseSourceIds = new Set(
      snapshots.flatMap(snapshot =>
        snapshotSources
          .filter(source => source.snapshotId === snapshot.snapshotId)
          .map(source => source.sourceReleaseId),
      ),
    )
    const ingestedAt = sourceReleases
      .filter(source => releaseSourceIds.has(source.id))
      .map(source => source.ingestedAt)
      .filter((value): value is string => value !== null)
      .sort()
      .at(-1)
    const sourceReleaseActions = processingActions
      .filter(action => releaseSourceIds.has(action.releaseId))
      .map(action => {
        const source = sourceReleases.find(
          candidate => candidate.id === action.releaseId,
        )
        return {
          ...action,
          sourceCode: source?.datasetCode,
          sourceReleaseCode: source?.code,
        }
      })
    const bulkActions = sourceReleases
      .filter(source => releaseSourceIds.has(source.id))
      .flatMap(source => {
        const processingRules = source.processingRules as ReleaseProcessingRules | null
        return (
          processingRules?.rulesets.flatMap(ruleset =>
            ruleset.rules
              .filter(rule => rule.type === 'bulk')
              .map((rule, index) => ({
                ...rule,
                id: `${source.id}:${ruleset.rulesetVersion}:${index}`,
                sourceCode: source.datasetCode,
                sourceReleaseCode: source.code,
              })),
          ) ?? []
        )
      })

    return {
      ...release,
      displayStatus,
      ingestedAt: ingestedAt ?? null,
      stats: apiReleaseSetStats.filter(stat => stat.apiReleaseSetId === release.id),
      processingActions: sourceReleaseActions,
      bulkActions,
      apiReleaseSetSnapshots: snapshots.map(snapshot => ({
        ...snapshot,
        snapshotSources: snapshotSources.filter(
          source => source.snapshotId === snapshot.snapshotId,
        ),
      })),
      contributingSources: snapshots.flatMap(snapshot =>
        snapshotSources
          .filter(
            source =>
              source.snapshotId === snapshot.snapshotId &&
              resourceTypesByDatasetId
                .get(source.datasetId)
                ?.has(snapshot.snapshot.resourceType),
          )
          .flatMap(source => {
            const release = sourceReleases.find(
              candidate => candidate.id === source.sourceReleaseId,
            )
            return release
              ? [
                  {
                    sourceCode: release.datasetCode,
                    sourceReleaseCode: release.code,
                    publisherCode: release.publisherCode,
                    snapshotCode: snapshot.snapshot.code,
                    role: releaseAsRole({
                      apiReleaseSetRole: snapshot.role,
                      assemblySourceRole: null,
                      compositionRole: null,
                      sourceRole: source.role,
                    }),
                    resourceType: snapshot.snapshot.resourceType,
                    sourceVersion: release.sourceVersion,
                    subType: release.subType,
                    variant: snapshot.variant,
                  },
                ]
              : []
          }),
      ),
    }
  })
}

export async function getRegistryRelease(db: MetaDatabase, id: string) {
  const releases = await listRegistryReleases(db)
  return firstByIdOrCode(
    releases,
    id,
    (release, value) => release.id === value || release.code === value,
  )
}

export async function listRegistryApis(db: MetaDatabase, limit?: number) {
  const apis = await db
    .select()
    .from(metaApiVersions)
    .orderBy(desc(metaApiVersions.publishedAt), desc(metaApiVersions.createdAt))
    .limit(registryLimit(limit))
    .all()

  const apiIds = apis.map(api => api.id)
  const compositions = await queryInBatches(apiIds, ids =>
    db
      .select()
      .from(metaApiComposition)
      .where(inArray(metaApiComposition.apiVersionId, ids))
      .all(),
  )
  const compositionIds = compositions.map(composition => composition.id)
  const members = await queryInBatches(compositionIds, ids =>
    db
      .select()
      .from(metaApiCompositionMembers)
      .where(inArray(metaApiCompositionMembers.apiCompositionId, ids))
      .all(),
  )
  const catalogRevisions = await queryInBatches(apiIds, ids =>
    db
      .select()
      .from(metaApiCatalogRevisions)
      .where(inArray(metaApiCatalogRevisions.apiVersionId, ids))
      .orderBy(
        desc(metaApiCatalogRevisions.publishedAt),
        desc(metaApiCatalogRevisions.revision),
      )
      .all(),
  )
  const catalogRevisionIds = catalogRevisions.map(revision => revision.id)
  const catalogReleaseSets = await queryInBatches(catalogRevisionIds, ids =>
    db
      .select()
      .from(metaApiCatalogRevisionReleaseSets)
      .where(inArray(metaApiCatalogRevisionReleaseSets.apiCatalogRevisionId, ids))
      .all(),
  )
  const releases = await listRegistryReleases(db)

  return apis.map(api => ({
    ...api,
    apiComposition: compositions
      .filter(composition => composition.apiVersionId === api.id)
      .map(composition => ({
        ...composition,
        apiCompositionMembers: members.filter(
          member => member.apiCompositionId === composition.id,
        ),
      })),
    apiCatalogRevisions: catalogRevisions
      .filter(revision => revision.apiVersionId === api.id)
      .map(revision => ({
        ...revision,
        releases: catalogReleaseSets.filter(
          release => release.apiCatalogRevisionId === revision.id,
        ),
      })),
    releases: releases.filter(release => release.apiVersionId === api.id),
  }))
}

/**
 * Load only the API composition metadata needed by the Sources directory.
 *
 * The full `listRegistryApis` projection deliberately follows every API
 * release, snapshot, source, statistic, and processing action. That is the
 * right shape for API release pages, but the Sources directory only needs the
 * current domain labels for each family.
 */
export async function listRegistryApiCompositions(db: MetaDatabase, limit?: number) {
  const [apis, compositions] = await Promise.all([
    db
      .select({
        id: metaApiVersions.id,
        code: metaApiVersions.code,
        familyType: metaApiVersions.familyType,
        version: metaApiVersions.version,
        status: metaApiVersions.status,
      })
      .from(metaApiVersions)
      .orderBy(desc(metaApiVersions.publishedAt), desc(metaApiVersions.createdAt))
      .limit(registryLimit(limit))
      .all(),
    db
      .select({
        id: metaApiComposition.id,
        apiVersionId: metaApiComposition.apiVersionId,
        defaultDomainCode: metaApiComposition.defaultDomainCode,
        i18n: metaApiComposition.i18n,
        status: metaApiComposition.status,
        version: metaApiComposition.version,
      })
      .from(metaApiComposition)
      .where(eq(metaApiComposition.status, 'current'))
      .orderBy(desc(metaApiComposition.version))
      .all(),
  ])

  const currentCompositionByApiVersionId = new Map<
    string,
    (typeof compositions)[number]
  >()
  for (const composition of compositions) {
    if (!currentCompositionByApiVersionId.has(composition.apiVersionId)) {
      currentCompositionByApiVersionId.set(composition.apiVersionId, composition)
    }
  }

  return apis.map(api => {
    const composition = currentCompositionByApiVersionId.get(api.id)
    return {
      ...api,
      apiComposition: composition ? [{ ...composition }] : [],
    }
  })
}

export async function getRegistryApi(db: MetaDatabase, id: string) {
  const api = await db
    .select()
    .from(metaApiVersions)
    .where(
      or(
        eq(metaApiVersions.id, id),
        eq(metaApiVersions.code, id),
        sql`${metaApiVersions.familyType} = ${id}`,
      ),
    )
    .limit(1)
    .get()
  if (!api) return null

  const compositions = await db
    .select()
    .from(metaApiComposition)
    .where(eq(metaApiComposition.apiVersionId, api.id))
    .all()
  const compositionIds = compositions.map(composition => composition.id)
  const members = await queryInBatches(compositionIds, ids =>
    db
      .select()
      .from(metaApiCompositionMembers)
      .where(inArray(metaApiCompositionMembers.apiCompositionId, ids))
      .all(),
  )
  const catalogRevisions = await db
    .select()
    .from(metaApiCatalogRevisions)
    .where(eq(metaApiCatalogRevisions.apiVersionId, api.id))
    .orderBy(
      desc(metaApiCatalogRevisions.publishedAt),
      desc(metaApiCatalogRevisions.revision),
    )
    .all()
  const catalogRevisionIds = catalogRevisions.map(revision => revision.id)
  const catalogReleaseSets = await queryInBatches(catalogRevisionIds, ids =>
    db
      .select()
      .from(metaApiCatalogRevisionReleaseSets)
      .where(inArray(metaApiCatalogRevisionReleaseSets.apiCatalogRevisionId, ids))
      .all(),
  )
  const releases = await listRegistryReleases(db, undefined, 0, api.id)

  return {
    ...api,
    apiComposition: compositions.map(composition => ({
      ...composition,
      apiCompositionMembers: members.filter(
        member => member.apiCompositionId === composition.id,
      ),
    })),
    apiCatalogRevisions: catalogRevisions.map(revision => ({
      ...revision,
      releases: catalogReleaseSets.filter(
        release => release.apiCatalogRevisionId === revision.id,
      ),
    })),
    releases,
  }
}

export async function listRegistryApiFields(db: MetaDatabase, limit?: number) {
  return db
    .select()
    .from(metaApiFieldProvenance)
    .orderBy(desc(metaApiFieldProvenance.createdAt))
    .limit(registryLimit(limit))
    .all()
}

export async function getRegistryApiField(db: MetaDatabase, id: string) {
  return (
    (await db
      .select()
      .from(metaApiFieldProvenance)
      .where(eq(metaApiFieldProvenance.id, id))
      .limit(1)
      .get()) ?? null
  )
}

export async function listRegistryEndpoints(db: MetaDatabase, limit?: number) {
  return db
    .select({
      id: metaApiEndpoints.id,
      apiVersionId: metaApiEndpoints.apiVersionId,
      apiFamily: metaApiVersions.familyType,
      apiVersion: metaApiVersions.code,
      method: metaApiEndpoints.method,
      path: metaApiEndpoints.path,
      operationId: metaApiEndpoints.operationId,
      versionHash: metaApiEndpoints.versionHash,
      createdAt: metaApiEndpoints.createdAt,
      updatedAt: metaApiEndpoints.updatedAt,
    })
    .from(metaApiEndpoints)
    .innerJoin(metaApiVersions, eq(metaApiEndpoints.apiVersionId, metaApiVersions.id))
    .orderBy(metaApiVersions.familyType, metaApiEndpoints.path)
    .limit(registryLimit(limit))
    .all()
}

export async function getRegistryEndpoint(db: MetaDatabase, id: string) {
  return (
    (await db
      .select()
      .from(metaApiEndpoints)
      .where(
        sql`${metaApiEndpoints.id} = ${id} or ${metaApiEndpoints.operationId} = ${id}`,
      )
      .limit(1)
      .get()) ?? null
  )
}

const registrySourceSelection = {
  id: metaDatasets.id,
  publisherId: metaDatasets.publisherId,
  publisherCode: metaPublishers.code,
  code: metaDatasets.code,
  regionCode: metaDatasets.regionCode,
  releaseType: metaDatasets.releaseType,
  releaseFrequency: metaDatasets.releaseFrequency,
  theme: metaDatasets.theme,
  subType: metaDatasets.subType,
  sourceVariant: metaDatasets.sourceVariant,
  sourceCrs: metaDatasets.sourceCrs,
  sourceUrl: metaDatasets.sourceUrl,
  licenseId: metaDatasets.licenseId,
  license: {
    id: metaLicenses.id,
    code: metaLicenses.code,
    name: metaLicenses.name,
    url: metaLicenses.url,
  },
  category: metaDatasets.category,
  attribution: metaDatasets.attribution,
  processingRules: metaDatasets.processingRules,
  tags: metaDatasets.tags,
  versionHash: metaDatasets.versionHash,
  createdAt: metaDatasets.createdAt,
  updatedAt: metaDatasets.updatedAt,
}

export async function listRegistrySources(db: MetaDatabase, limit?: number) {
  const sources = await db
    .select(registrySourceSelection)
    .from(metaDatasets)
    .innerJoin(metaPublishers, eq(metaDatasets.publisherId, metaPublishers.id))
    .leftJoin(metaLicenses, eq(metaDatasets.licenseId, metaLicenses.id))
    .orderBy(metaDatasets.regionCode, metaDatasets.code)
    .limit(registryLimit(limit))
    .all()

  const sourceIds = sources.map(source => source.id)
  const [resourceTypes, i18n, transforms, sourceVersions, publishers] =
    await Promise.all([
      queryInBatches(sourceIds, ids =>
        db
          .select()
          .from(metaDatasetResourceTypes)
          .where(inArray(metaDatasetResourceTypes.datasetId, ids))
          .all(),
      ),
      queryInBatches(sourceIds, ids =>
        db
          .select()
          .from(metaDatasetI18n)
          .where(inArray(metaDatasetI18n.datasetId, ids))
          .all(),
      ),
      queryInBatches(sourceIds, ids =>
        db
          .select()
          .from(metaDatasetTransforms)
          .where(inArray(metaDatasetTransforms.datasetId, ids))
          .all(),
      ),
      listRegistrySourceVersions(db),
      listRegistrySourcePublishers(db),
    ])

  return sources.map(source => ({
    ...source,
    publisher:
      publishers.find(publisher => publisher.id === source.publisherId) ?? null,
    datasetI18n: i18n.filter(row => row.datasetId === source.id),
    resourceTypes: resourceTypes
      .filter(row => row.datasetId === source.id)
      .map(row => row.resourceType),
    transforms: transforms.filter(row => row.datasetId === source.id),
    sourceVersions: sourceVersions.filter(version => version.datasetId === source.id),
  }))
}

/**
 * Load the deliberately small projection used by the Sources directory.
 * Keep this separate from `listRegistrySources`, whose source-version
 * projection is used for release and provenance views and is intentionally
 * much richer.
 */
export async function listRegistrySourcesPage(db: MetaDatabase, limit?: number) {
  const sources = await db
    .select({
      id: metaDatasets.id,
      publisherId: metaDatasets.publisherId,
      publisherCode: metaPublishers.code,
      code: metaDatasets.code,
      regionCode: metaDatasets.regionCode,
      releaseFrequency: metaDatasets.releaseFrequency,
      theme: metaDatasets.theme,
      sourceVariant: metaDatasets.sourceVariant,
      license: {
        code: metaLicenses.code,
      },
    })
    .from(metaDatasets)
    .innerJoin(metaPublishers, eq(metaDatasets.publisherId, metaPublishers.id))
    .leftJoin(metaLicenses, eq(metaDatasets.licenseId, metaLicenses.id))
    .orderBy(metaDatasets.regionCode, metaDatasets.code)
    .limit(registryLimit(limit))
    .all()

  if (!sources.length) return []

  const sourceIds = sources.map(source => source.id)
  const publisherIds = [...new Set(sources.map(source => source.publisherId))]
  const [resourceTypes, i18n, publisherI18n, sourceVersions] = await Promise.all([
    queryInBatches(sourceIds, ids =>
      db
        .select()
        .from(metaDatasetResourceTypes)
        .where(inArray(metaDatasetResourceTypes.datasetId, ids))
        .all(),
    ),
    queryInBatches(sourceIds, ids =>
      db
        .select()
        .from(metaDatasetI18n)
        .where(inArray(metaDatasetI18n.datasetId, ids))
        .all(),
    ),
    queryInBatches(publisherIds, ids =>
      db
        .select()
        .from(metaPublisherI18n)
        .where(inArray(metaPublisherI18n.publisherId, ids))
        .all(),
    ),
    db
      .select({
        id: metaSourceReleases.id,
        datasetId: metaSourceReleases.datasetId,
        datasetCode: metaDatasets.code,
        code: metaSourceReleases.code,
        sourceVersion: metaSourceReleases.sourceVersion,
        cohortKey: metaSourceReleases.cohortKey,
        status: metaSourceReleases.status,
        license: {
          code: metaLicenses.code,
        },
      })
      .from(metaSourceReleases)
      .innerJoin(metaDatasets, eq(metaSourceReleases.datasetId, metaDatasets.id))
      .leftJoin(metaLicenses, eq(metaDatasets.licenseId, metaLicenses.id))
      .where(
        and(
          inArray(metaSourceReleases.datasetId, sourceIds),
          eq(metaSourceReleases.status, 'published'),
        ),
      )
      .orderBy(
        desc(metaSourceReleases.publicationDate),
        desc(metaSourceReleases.createdAt),
      )
      .all(),
  ])

  const latestVersions = sourceVersions.filter(
    (version, index, versions) =>
      versions.findIndex(candidate => candidate.datasetId === version.datasetId) ===
      index,
  )
  const sourceReleaseIds = latestVersions.map(version => version.id)
  const resourceReleases = sourceReleaseIds.length
    ? await queryInBatches(sourceReleaseIds, ids =>
        db
          .select({
            id: metaReleases.id,
            sourceReleaseId: metaReleases.sourceReleaseId,
          })
          .from(metaReleases)
          .where(inArray(metaReleases.sourceReleaseId, ids))
          .all(),
      )
    : []
  const resourceReleaseIds = resourceReleases.map(release => release.id)

  const [releaseStats, releaseAs] = resourceReleaseIds.length
    ? await Promise.all([
        queryInBatches(resourceReleaseIds, ids =>
          db
            .select({
              releaseId: stats.releaseId,
              dimension: stats.dimension,
              metric: stats.metric,
              metricUnit: stats.metricUnit,
              value: stats.value,
              groupBy: stats.groupBy,
              groupValue: stats.groupValue,
            })
            .from(stats)
            .where(
              and(
                inArray(stats.releaseId, ids),
                eq(stats.dimension, 'records'),
                eq(stats.metric, 'count'),
                eq(stats.metricUnit, 'count'),
                isNull(stats.groupBy),
                isNull(stats.groupValue),
              ),
            )
            .all(),
        ),
        queryInBatches(resourceReleaseIds, ids =>
          db
            .select({
              sourceReleaseId: metaReleases.sourceReleaseId,
              apiFamily: metaApiVersions.familyType,
              domainCode: metaApiReleaseSets.domainCode,
            })
            .from(metaSnapshotSources)
            .innerJoin(
              metaReleases,
              eq(metaSnapshotSources.sourceReleaseId, metaReleases.id),
            )
            .innerJoin(
              metaSnapshots,
              eq(metaSnapshotSources.snapshotId, metaSnapshots.id),
            )
            .innerJoin(
              metaApiReleaseSetSnapshots,
              eq(metaApiReleaseSetSnapshots.snapshotId, metaSnapshots.id),
            )
            .innerJoin(
              metaApiReleaseSets,
              eq(metaApiReleaseSetSnapshots.apiReleaseSetId, metaApiReleaseSets.id),
            )
            .innerJoin(
              metaApiVersions,
              eq(metaApiReleaseSets.apiVersionId, metaApiVersions.id),
            )
            .where(
              and(
                inArray(metaSnapshotSources.sourceReleaseId, ids),
                ne(metaSnapshotSources.role, 'lookup'),
              ),
            )
            .all(),
        ),
      ])
    : [[], []]

  const resourceIdsBySourceReleaseId = new Map<string, string[]>()
  for (const release of resourceReleases) {
    const ids = resourceIdsBySourceReleaseId.get(release.sourceReleaseId) ?? []
    ids.push(release.id)
    resourceIdsBySourceReleaseId.set(release.sourceReleaseId, ids)
  }

  return sources.map(source => ({
    ...source,
    publisher: {
      publisherI18n: publisherI18n.filter(
        row => row.publisherId === source.publisherId,
      ),
    },
    datasetI18n: i18n.filter(row => row.datasetId === source.id),
    resourceTypes: resourceTypes
      .filter(row => row.datasetId === source.id)
      .map(row => row.resourceType),
    sourceVersions: latestVersions
      .filter(version => version.datasetId === source.id)
      .map(version => {
        const resourceIds = resourceIdsBySourceReleaseId.get(version.id) ?? []
        return {
          ...version,
          releaseAs: releaseAs
            .filter(release => release.sourceReleaseId === version.id)
            .filter(
              (release, index, releases) =>
                releases.findIndex(
                  candidate =>
                    candidate.apiFamily === release.apiFamily &&
                    candidate.domainCode === release.domainCode,
                ) === index,
            ),
          stats: releaseStats.filter(stat =>
            resourceIds.includes(stat.releaseId ?? ''),
          ),
        }
      }),
  }))
}

export async function getRegistrySource(db: MetaDatabase, id: string) {
  const source = await getRegistrySourceRecord(db, id)

  if (!source) return null

  const [datasetI18n, resourceTypes, transforms, sourceVersions, publisher] =
    await Promise.all([
      db
        .select()
        .from(metaDatasetI18n)
        .where(eq(metaDatasetI18n.datasetId, source.id))
        .all(),
      db
        .select()
        .from(metaDatasetResourceTypes)
        .where(eq(metaDatasetResourceTypes.datasetId, source.id))
        .all(),
      db
        .select()
        .from(metaDatasetTransforms)
        .where(eq(metaDatasetTransforms.datasetId, source.id))
        .all(),
      queryRegistrySourceVersions(db, source.id),
      getRegistrySourcePublisher(db, source.publisherId),
    ])

  return {
    ...source,
    publisher,
    datasetI18n,
    resourceTypes: resourceTypes.map(row => row.resourceType),
    transforms,
    sourceVersions,
  }
}

async function getRegistrySourceRecord(db: MetaDatabase, id: string) {
  return db
    .select(registrySourceSelection)
    .from(metaDatasets)
    .innerJoin(metaPublishers, eq(metaDatasets.publisherId, metaPublishers.id))
    .leftJoin(metaLicenses, eq(metaDatasets.licenseId, metaLicenses.id))
    .where(sql`${metaDatasets.id} = ${id} or ${metaDatasets.code} = ${id}`)
    .limit(1)
    .get()
}

export async function getRegistrySourceReleaseShell(
  db: MetaDatabase,
  id: string,
  releaseCode: string,
) {
  const timings: Record<string, number> = {}
  const timed = async <T>(name: string, fn: () => Promise<T>) => {
    const startedAt = performance.now()
    try {
      return await fn()
    } finally {
      timings[name] = performance.now() - startedAt
    }
  }

  const source = await timed('source', () => getRegistrySourceRecord(db, id))
  if (!source) return null

  const [datasetI18n, resourceTypes, sourceVersions, publisher] = await Promise.all([
    timed('header-i18n', () =>
      db
        .select()
        .from(metaDatasetI18n)
        .where(eq(metaDatasetI18n.datasetId, source.id))
        .all(),
    ),
    timed('header-resource-types', () =>
      db
        .select()
        .from(metaDatasetResourceTypes)
        .where(eq(metaDatasetResourceTypes.datasetId, source.id))
        .all(),
    ),
    timed('versions', () =>
      db
        .select({
          id: metaSourceReleases.id,
          datasetId: metaSourceReleases.datasetId,
          datasetCode: metaDatasets.code,
          code: metaSourceReleases.code,
          sourceVersion: metaSourceReleases.sourceVersion,
          sourceSchemaVersion: metaSourceReleases.sourceSchemaVersion,
          cohortKey: metaSourceReleases.cohortKey,
          publicationDate: metaSourceReleases.publicationDate,
          releaseNotesUrl: metaSourceReleases.releaseNotesUrl,
          status: metaSourceReleases.status,
          processingRules: metaSourceReleases.processingRules,
          ingestedAt: metaSourceReleases.ingestedAt,
          createdAt: metaSourceReleases.createdAt,
          updatedAt: metaSourceReleases.updatedAt,
        })
        .from(metaSourceReleases)
        .innerJoin(metaDatasets, eq(metaSourceReleases.datasetId, metaDatasets.id))
        .where(eq(metaSourceReleases.datasetId, source.id))
        .orderBy(
          desc(metaSourceReleases.publicationDate),
          desc(metaSourceReleases.createdAt),
        )
        .all(),
    ),
    timed('header-publisher', () => getRegistrySourcePublisher(db, source.publisherId)),
  ])

  return {
    ...source,
    publisher,
    datasetI18n,
    resourceTypes: resourceTypes.map(row => row.resourceType),
    sourceVersions,
    selectedReleaseCode: releaseCode,
    timings,
  }
}

export async function getRegistrySourceRelease(
  db: MetaDatabase,
  id: string,
  releaseCode: string,
) {
  const source = await getRegistrySourceRecord(db, id)
  if (!source) return null

  const [datasetI18n, resourceTypes, transforms, sourceVersions, publisher] =
    await Promise.all([
      db
        .select()
        .from(metaDatasetI18n)
        .where(eq(metaDatasetI18n.datasetId, source.id))
        .all(),
      db
        .select()
        .from(metaDatasetResourceTypes)
        .where(eq(metaDatasetResourceTypes.datasetId, source.id))
        .all(),
      db
        .select()
        .from(metaDatasetTransforms)
        .where(eq(metaDatasetTransforms.datasetId, source.id))
        .all(),
      queryRegistrySourceVersions(db, source.id, undefined, releaseCode),
      getRegistrySourcePublisher(db, source.publisherId),
    ])

  return {
    ...source,
    publisher,
    datasetI18n,
    resourceTypes: resourceTypes.map(row => row.resourceType),
    transforms,
    sourceVersions,
  }
}

async function queryRegistrySourceVersions(
  db: MetaDatabase,
  datasetId?: string,
  limit?: number,
  sourceReleaseCode?: string,
) {
  const sourceReleases = await db
    .select({
      id: metaSourceReleases.id,
      datasetId: metaSourceReleases.datasetId,
      datasetCode: metaDatasets.code,
      code: metaSourceReleases.code,
      sourceVersion: metaSourceReleases.sourceVersion,
      sourceSchemaVersion: metaSourceReleases.sourceSchemaVersion,
      processingRules: metaSourceReleases.processingRules,
      publicationDate: metaSourceReleases.publicationDate,
      cohortKey: metaSourceReleases.cohortKey,
      rawObjectKey: metaSourceReleases.rawObjectKey,
      originalFileName: metaSourceReleases.originalFileName,
      releaseNotesUrl: metaSourceReleases.releaseNotesUrl,
      notes: metaSourceReleases.notes,
      status: metaSourceReleases.status,
      revokedAt: metaSourceReleases.revokedAt,
      revocationReason: metaSourceReleases.revocationReason,
      supersededByReleaseId: metaSourceReleases.supersededBySourceReleaseId,
      ingestedAt: metaSourceReleases.ingestedAt,
      createdAt: metaSourceReleases.createdAt,
      updatedAt: metaSourceReleases.updatedAt,
      license: {
        id: metaLicenses.id,
        code: metaLicenses.code,
        name: metaLicenses.name,
        url: metaLicenses.url,
      },
    })
    .from(metaSourceReleases)
    .innerJoin(metaDatasets, eq(metaSourceReleases.datasetId, metaDatasets.id))
    .leftJoin(metaLicenses, eq(metaDatasets.licenseId, metaLicenses.id))
    .where(
      and(
        datasetId ? eq(metaSourceReleases.datasetId, datasetId) : undefined,
        sourceReleaseCode ? eq(metaSourceReleases.code, sourceReleaseCode) : undefined,
      ),
    )
    .orderBy(
      desc(metaSourceReleases.publicationDate),
      desc(metaSourceReleases.createdAt),
    )
    .limit(registryLimit(limit))
    .all()

  const sourceReleaseIds = sourceReleases.map(release => release.id)
  const resourceReleases = await queryInBatches(sourceReleaseIds, ids =>
    db
      .select({
        id: metaReleases.id,
        sourceReleaseId: metaReleases.sourceReleaseId,
      })
      .from(metaReleases)
      .where(inArray(metaReleases.sourceReleaseId, ids))
      .all(),
  )
  const resourceReleaseIds = resourceReleases.map(release => release.id)
  const resourceReleaseIdsBySourceReleaseId = new Map<string, string[]>()
  for (const resourceRelease of resourceReleases) {
    const ids = resourceReleaseIdsBySourceReleaseId.get(resourceRelease.sourceReleaseId)
    if (ids) ids.push(resourceRelease.id)
    else
      resourceReleaseIdsBySourceReleaseId.set(resourceRelease.sourceReleaseId, [
        resourceRelease.id,
      ])
  }
  const releaseStats = await queryInBatches(resourceReleaseIds, ids =>
    db
      .select({
        releaseId: stats.releaseId,
        dimension: stats.dimension,
        metric: stats.metric,
        metricUnit: stats.metricUnit,
        value: stats.value,
        groupBy: stats.groupBy,
        groupValue: stats.groupValue,
      })
      .from(stats)
      .where(inArray(stats.releaseId, ids))
      .all(),
  )
  const releaseAs = await queryInBatches(resourceReleaseIds, ids =>
    db
      .select({
        apiFamily: metaApiVersions.familyType,
        apiReleaseSetId: metaApiReleaseSets.id,
        apiVersion: metaApiVersions.version,
        apiReleaseSetRole: metaApiReleaseSetSnapshots.role,
        assemblySourceRole: metaSnapshotAssemblySources.role,
        cohortKey: metaApiReleaseSets.cohortKey,
        code: metaApiReleaseSets.code,
        revision: metaApiReleaseSets.revision,
        compositionRole: metaApiCompositionMembers.role,
        domainCode: metaApiReleaseSets.domainCode,
        resourceType: metaSnapshots.resourceType,
        sourceReleaseId: metaSnapshotSources.sourceReleaseId,
        sourceRole: metaSnapshotSources.role,
        snapshotCode: metaSnapshots.code,
        variant: metaApiReleaseSetSnapshots.variant,
      })
      .from(metaSnapshotSources)
      .innerJoin(metaSnapshots, eq(metaSnapshotSources.snapshotId, metaSnapshots.id))
      .innerJoin(
        metaApiReleaseSetSnapshots,
        eq(metaApiReleaseSetSnapshots.snapshotId, metaSnapshots.id),
      )
      .innerJoin(
        metaApiReleaseSets,
        eq(metaApiReleaseSetSnapshots.apiReleaseSetId, metaApiReleaseSets.id),
      )
      .innerJoin(
        metaApiVersions,
        eq(metaApiReleaseSets.apiVersionId, metaApiVersions.id),
      )
      .leftJoin(
        metaSnapshotAssemblyRuns,
        eq(metaSnapshotAssemblyRuns.snapshotId, metaSnapshots.id),
      )
      .leftJoin(
        metaSnapshotAssemblySources,
        and(
          eq(
            metaSnapshotAssemblySources.snapshotAssemblyId,
            metaSnapshotAssemblyRuns.snapshotAssemblyId,
          ),
          eq(metaSnapshotAssemblySources.datasetId, metaSnapshotSources.datasetId),
        ),
      )
      .leftJoin(
        metaApiComposition,
        eq(metaApiComposition.apiVersionId, metaApiReleaseSets.apiVersionId),
      )
      .leftJoin(
        metaApiCompositionMembers,
        and(
          eq(metaApiCompositionMembers.apiCompositionId, metaApiComposition.id),
          eq(metaApiCompositionMembers.resourceType, metaSnapshots.resourceType),
        ),
      )
      // Lookup rows capture an internal snapshot dependency. They do not mean
      // that the lookup source release supplied this snapshot, so they must
      // not appear as API releases on that source release's page.
      .where(
        and(
          inArray(metaSnapshotSources.sourceReleaseId, ids),
          ne(metaSnapshotSources.role, 'lookup'),
        ),
      )
      .orderBy(desc(metaApiReleaseSets.publishedAt), desc(metaApiReleaseSets.createdAt))
      .all(),
  )
  const assembledReleaseSetIds = [
    ...new Set(releaseAs.map(item => item.apiReleaseSetId)),
  ]
  const assemblySourceRows = await queryInBatches(assembledReleaseSetIds, ids =>
    db
      .select({
        apiReleaseSetId: metaApiReleaseSets.id,
        datasetCode: metaDatasets.code,
        datasetId: metaDatasets.id,
        publisherId: metaDatasets.publisherId,
        role: metaSnapshotSources.role,
        sourceReleaseCode: metaSourceReleases.code,
        sourceVersion: metaSourceReleases.sourceVersion,
      })
      .from(metaApiReleaseSets)
      .innerJoin(
        metaApiReleaseSetSnapshots,
        eq(metaApiReleaseSetSnapshots.apiReleaseSetId, metaApiReleaseSets.id),
      )
      .innerJoin(
        metaSnapshotSources,
        eq(metaSnapshotSources.snapshotId, metaApiReleaseSetSnapshots.snapshotId),
      )
      .innerJoin(metaReleases, eq(metaSnapshotSources.sourceReleaseId, metaReleases.id))
      .innerJoin(
        metaSourceReleases,
        eq(metaReleases.sourceReleaseId, metaSourceReleases.id),
      )
      .innerJoin(metaDatasets, eq(metaSourceReleases.datasetId, metaDatasets.id))
      .where(
        and(
          inArray(metaApiReleaseSets.id, ids),
          ne(metaSnapshotSources.role, 'lookup'),
        ),
      )
      .all(),
  )
  const assemblyDatasetIds = [
    ...new Set(assemblySourceRows.map(source => source.datasetId)),
  ]
  const assemblyDatasetI18n = await queryInBatches(assemblyDatasetIds, ids =>
    db
      .select()
      .from(metaDatasetI18n)
      .where(inArray(metaDatasetI18n.datasetId, ids))
      .all(),
  )
  const assemblyPublisherIds = [
    ...new Set(assemblySourceRows.map(source => source.publisherId)),
  ]
  const assemblyPublisherI18n = await queryInBatches(assemblyPublisherIds, ids =>
    db
      .select()
      .from(metaPublisherI18n)
      .where(inArray(metaPublisherI18n.publisherId, ids))
      .all(),
  )
  const processingActions = await queryInBatches(resourceReleaseIds, ids =>
    db
      .select({
        id: releaseProcessingActions.id,
        releaseId: releaseProcessingActions.releaseId,
        action: releaseProcessingActions.action,
        mode: releaseProcessingActions.mode,
        summary: releaseProcessingActions.summary,
        affectedRecordCount: releaseProcessingActions.affectedRecordCount,
        evidence: releaseProcessingActions.evidence,
        createdAt: releaseProcessingActions.createdAt,
        updatedAt: releaseProcessingActions.updatedAt,
      })
      .from(releaseProcessingActions)
      .where(inArray(releaseProcessingActions.releaseId, ids))
      .orderBy(
        desc(releaseProcessingActions.createdAt),
        desc(releaseProcessingActions.id),
      )
      .all(),
  )

  return sourceReleases.map(release => {
    const resourceIds = resourceReleaseIdsBySourceReleaseId.get(release.id) ?? []
    const assembledWith = releaseAs
      .filter(item => resourceIds.includes(item.sourceReleaseId))
      .flatMap(item =>
        assemblySourceRows
          .filter(source => source.apiReleaseSetId === item.apiReleaseSetId)
          .filter(source => source.datasetCode !== release.datasetCode)
          .map(source => ({
            datasetCode: source.datasetCode,
            datasetI18n: assemblyDatasetI18n.filter(
              item => item.datasetId === source.datasetId,
            ),
            publisherI18n: assemblyPublisherI18n.filter(
              item => item.publisherId === source.publisherId,
            ),
            role: source.role,
            sourceReleaseCode: source.sourceReleaseCode,
            sourceVersion: source.sourceVersion,
          })),
      )
      .filter(
        (source, index, sources) =>
          sources.findIndex(
            candidate =>
              candidate.datasetCode === source.datasetCode &&
              candidate.sourceReleaseCode === source.sourceReleaseCode,
          ) === index,
      )

    return {
      ...release,
      assembledWith,
      releaseAs: releaseAs
        .filter(item => resourceIds.includes(item.sourceReleaseId))
        .map(item => ({
          apiFamily: item.apiFamily,
          apiVersion: item.apiVersion,
          cohortKey: item.cohortKey,
          code: item.code,
          domainCode: item.domainCode,
          revision: item.revision,
          role: releaseAsRole(item),
          resourceType: item.resourceType,
          snapshotCode: item.snapshotCode,
          variant: item.variant,
        }))
        .filter(
          (item, index, items) =>
            items.findIndex(
              candidate =>
                candidate.apiFamily === item.apiFamily &&
                candidate.code === item.code &&
                candidate.variant === item.variant &&
                candidate.snapshotCode === item.snapshotCode &&
                candidate.role === item.role,
            ) === index,
        ),
      stats: releaseStats.filter(stat => resourceIds.includes(stat.releaseId ?? '')),
      processingActions: processingActions.filter(action =>
        resourceIds.includes(action.releaseId),
      ),
    }
  })
}

export async function listRegistrySourceVersions(db: MetaDatabase, limit?: number) {
  return queryRegistrySourceVersions(db, undefined, limit)
}

export async function getRegistrySourceVersion(db: MetaDatabase, id: string) {
  return (
    (await db
      .select()
      .from(metaReleases)
      .where(sql`${metaReleases.id} = ${id} or ${metaReleases.code} = ${id}`)
      .limit(1)
      .get()) ?? null
  )
}

export async function listRegistrySourcePublishers(db: MetaDatabase, limit?: number) {
  const publishers = await db
    .select()
    .from(metaPublishers)
    .orderBy(metaPublishers.code)
    .limit(registryLimit(limit))
    .all()

  const publisherIds = publishers.map(publisher => publisher.id)
  const i18n = await queryInBatches(publisherIds, ids =>
    db
      .select()
      .from(metaPublisherI18n)
      .where(inArray(metaPublisherI18n.publisherId, ids))
      .all(),
  )

  return publishers.map(publisher => ({
    ...publisher,
    publisherI18n: i18n.filter(row => row.publisherId === publisher.id),
  }))
}

export async function getRegistrySourcePublisher(db: MetaDatabase, id: string) {
  const publisher = await db
    .select()
    .from(metaPublishers)
    .where(sql`${metaPublishers.id} = ${id} or ${metaPublishers.code} = ${id}`)
    .limit(1)
    .get()

  if (!publisher) return null

  const publisherI18n = await db
    .select()
    .from(metaPublisherI18n)
    .where(eq(metaPublisherI18n.publisherId, publisher.id))
    .all()

  return { ...publisher, publisherI18n }
}

type LatestDatasetLookup = {
  latestDataset: DatasetRecord | null
}

type DatasetIdentityRecord = {
  source: string
  datasetId: string
  datasetCode: string
  releaseId: string
  releaseCode: string
  status: ReleaseStatus
}

export type DataShardRecord = {
  id: string
  bindingName: string
  databaseId: string
  databaseName: string
}

const RELEASE_LOOKUP_RETRY_LIMIT = 4
const RELEASE_LOOKUP_RETRY_DELAY_MS = 150
export const BEFORE_SHARD_CUTOFF_YEAR = 2025
const RELEASE_ID_NAMESPACE = '9b90fd4f-96d3-48b9-9b88-cc101b3667f7'
const SOURCE_RELEASE_ID_NAMESPACE = '6f2750bc-f159-5322-9a8d-264f4457c72d'
const SNAPSHOT_ID_NAMESPACE = '1a3f3f48-3176-5b4f-9b27-10d5b70fb8d5'
const SNAPSHOT_LINEAGE_ID_NAMESPACE = '7e781433-d14c-5820-89c4-60b9874d6d8e'
const API_RELEASE_SET_ID_NAMESPACE = 'd14f33c4-4fe8-5a9f-929f-2886d4e69c54'
const API_CATALOG_REVISION_ID_NAMESPACE = 'b330b775-aee7-5ee2-b426-4ffc3a115ca7'
const SNAPSHOT_ASSEMBLY_RUN_ID_NAMESPACE = '7b9dbd35-8d48-5205-8bc9-92d32e67916f'
const API_FIELD_PROVENANCE_ID_NAMESPACE = '98c57fe7-fcd3-5a2b-9e25-481b1e76ec54'

type WriteStatement = {
  run: () => unknown | Promise<unknown>
}

type AtomicWritableDb = HarbourReadableDb &
  HarbourWritableDb & {
    batch?: (statements: [unknown, ...unknown[]]) => Promise<unknown>
    transaction?: <T>(
      callback: (tx: HarbourReadableDb & HarbourWritableDb) => T | Promise<T>,
    ) => T | Promise<T>
  }

const releaseRecordSelection = {
  id: metaReleases.id,
  datasetId: metaDatasets.id,
  datasetCode: metaDatasets.code,
  releaseId: metaReleases.id,
  releaseCode: metaReleases.code,
  regionCode: metaDatasets.regionCode,
  cohortKey: metaReleases.cohortKey,
  theme: metaDatasets.theme,
  type: metaReleases.resourceType,
  sourceVariant: metaDatasets.sourceVariant,
  sourceCrs: metaDatasets.sourceCrs,
  source: metaPublishers.code,
  sourceVersion: metaReleases.sourceVersion,
  rawObjectKey: metaReleases.rawObjectKey,
  originalFileName: metaReleases.originalFileName,
  releaseNotesUrl: metaReleases.releaseNotesUrl,
  notes: metaReleases.notes,
  status: metaReleases.status,
  supersedesDatasetId: sql<string | null>`null`,
  supersededByReleaseId: metaReleases.supersededByReleaseId,
  revokedAt: metaReleases.revokedAt,
  revocationReason: metaReleases.revocationReason,
  ingestedAt: metaReleases.ingestedAt,
  createdAt: metaReleases.createdAt,
  updatedAt: metaReleases.updatedAt,
} as const

async function runAtomicWriteStatements(
  db: AtomicWritableDb,
  buildStatements: (tx: HarbourReadableDb & HarbourWritableDb) => WriteStatement[],
) {
  if (typeof db.batch === 'function') {
    const statements = buildStatements(db)

    if (statements.length === 0) {
      return
    }

    await db.batch(statements as [unknown, ...unknown[]])
    return
  }

  if (typeof db.transaction === 'function') {
    await db.transaction(async tx => {
      for (const statement of buildStatements(tx)) {
        await statement.run()
      }
    })
    return
  }

  for (const statement of buildStatements(db)) {
    await statement.run()
  }
}

export async function getLatestDatasetForRegionSourceDatasetType(
  db: HarbourReadableDb,
  regionCode: RegionCode,
  source: string,
  datasetCode: string,
  type: ResourceType,
): Promise<LatestDatasetLookup> {
  const datasetRows = (await db
    .select(releaseRecordSelection)
    .from(metaReleases)
    .innerJoin(metaDatasets, eq(metaReleases.datasetId, metaDatasets.id))
    .innerJoin(metaPublishers, eq(metaDatasets.publisherId, metaPublishers.id))
    .where(
      and(
        eq(metaDatasets.regionCode, regionCode),
        eq(metaPublishers.code, publisherCodeForSource(source)),
        // A publisher can publish more than one product in the same resource
        // type and cohort. Upload chronology and schema compatibility belong
        // to that product's dataset lineage, never to the publisher broadly.
        eq(metaDatasets.code, datasetCode),
        eq(metaReleases.resourceType, type),
        ne(metaReleases.status, 'failed'),
        ne(metaReleases.status, 'uploading'),
      ),
    )
    .orderBy(desc(metaReleases.ingestedAt))
    .all()) as unknown as DatasetRecord[]
  const latestDataset =
    datasetRows.slice().sort((left, right) => {
      const versionComparison = compareReleaseVersions(
        right.sourceVersion,
        left.sourceVersion,
      )

      if (versionComparison !== 0) {
        return versionComparison
      }

      return right.ingestedAt.localeCompare(left.ingestedAt)
    })[0] ?? null

  return {
    latestDataset,
  }
}

export async function getLatestNewerDatasetRelease(
  db: HarbourReadableDb,
  releaseId: string,
) {
  const release = await getDatasetRecordByReleaseId(db, releaseId)

  if (!release) {
    return null
  }

  const datasetRows = (await db
    .select(releaseRecordSelection)
    .from(metaReleases)
    .innerJoin(metaDatasets, eq(metaReleases.datasetId, metaDatasets.id))
    .innerJoin(metaPublishers, eq(metaDatasets.publisherId, metaPublishers.id))
    .where(
      and(
        eq(metaReleases.datasetId, release.datasetId),
        ne(metaReleases.id, releaseId),
        ne(metaReleases.status, 'failed'),
        ne(metaReleases.status, 'uploading'),
      ),
    )
    .orderBy(desc(metaReleases.ingestedAt))
    .all()) as unknown as DatasetRecord[]
  const latestNewerDataset =
    datasetRows
      .filter(
        candidate =>
          compareReleaseVersions(candidate.sourceVersion, release.sourceVersion) > 0,
      )
      .slice()
      .sort((left, right) => {
        const versionComparison = compareReleaseVersions(
          right.sourceVersion,
          left.sourceVersion,
        )

        if (versionComparison !== 0) {
          return versionComparison
        }

        return (
          right.ingestedAt.localeCompare(left.ingestedAt) ||
          right.createdAt.localeCompare(left.createdAt)
        )
      })[0] ?? null

  return latestNewerDataset
}

export async function hasDatasetForCohortKeySourceType(
  db: HarbourReadableDb,
  regionCode: RegionCode,
  cohortKey: string,
  source: string,
  type: ResourceType,
) {
  const existing =
    ((await db
      .select({
        datasetId: metaDatasets.id,
        releaseId: metaReleases.id,
        releaseCode: metaReleases.code,
      })
      .from(metaReleases)
      .innerJoin(metaDatasets, eq(metaReleases.datasetId, metaDatasets.id))
      .innerJoin(metaPublishers, eq(metaDatasets.publisherId, metaPublishers.id))
      .where(
        and(
          eq(metaDatasets.regionCode, regionCode),
          eq(metaReleases.cohortKey, cohortKey),
          eq(metaPublishers.code, publisherCodeForSource(source)),
          eq(metaReleases.resourceType, type),
          ne(metaReleases.status, 'failed'),
        ),
      )
      .limit(1)
      .get()) as
      | { datasetId: string; releaseId: string; releaseCode: string }
      | undefined) ?? null

  return existing
}

export async function getDatasetById(db: HarbourReadableDb, releaseCode: string) {
  return (
    ((await db
      .select({
        source: metaPublishers.code,
        datasetId: metaDatasets.id,
        datasetCode: metaDatasets.code,
        releaseId: metaReleases.id,
        releaseCode: metaReleases.code,
        status: metaReleases.status,
      })
      .from(metaReleases)
      .innerJoin(metaDatasets, eq(metaReleases.datasetId, metaDatasets.id))
      .innerJoin(metaPublishers, eq(metaDatasets.publisherId, metaPublishers.id))
      .where(eq(metaReleases.code, releaseCode))
      .limit(1)
      .get()) as DatasetIdentityRecord | undefined) ?? null
  )
}

export async function getDatasetRecordByReleaseId(
  db: HarbourReadableDb,
  releaseId: string,
) {
  return (
    ((await db
      .select(releaseRecordSelection)
      .from(metaReleases)
      .innerJoin(metaDatasets, eq(metaReleases.datasetId, metaDatasets.id))
      .innerJoin(metaPublishers, eq(metaDatasets.publisherId, metaPublishers.id))
      .where(eq(metaReleases.id, releaseId))
      .limit(1)
      .get()) as DatasetRecord | undefined) ?? null
  )
}

export async function getDatasetRecordByReleaseCode(
  db: HarbourReadableDb,
  releaseCode: string,
) {
  return (
    ((await db
      .select(releaseRecordSelection)
      .from(metaReleases)
      .innerJoin(metaDatasets, eq(metaReleases.datasetId, metaDatasets.id))
      .innerJoin(metaPublishers, eq(metaDatasets.publisherId, metaPublishers.id))
      .where(eq(metaReleases.code, releaseCode))
      .limit(1)
      .get()) as DatasetRecord | undefined) ?? null
  )
}

export async function resolveDatasetRecord(
  db: HarbourReadableDb,
  {
    releaseCode,
    releaseId,
  }: {
    releaseCode?: string | null
    releaseId?: string | null
  },
) {
  const normalisedReleaseId = releaseId?.trim()

  if (normalisedReleaseId) {
    const dataset = await getDatasetRecordByReleaseId(db, normalisedReleaseId)

    if (dataset) {
      return dataset
    }
  }

  const normalisedReleaseCode = releaseCode?.trim()

  if (!normalisedReleaseCode) {
    return null
  }

  return getDatasetRecordByReleaseCode(db, normalisedReleaseCode)
}

export async function waitForDatasetRecord(
  db: HarbourReadableDb,
  release: {
    releaseCode?: string | null
    releaseId?: string | null
  },
  {
    retryDelayMs = RELEASE_LOOKUP_RETRY_DELAY_MS,
    retryLimit = RELEASE_LOOKUP_RETRY_LIMIT,
  }: {
    retryDelayMs?: number
    retryLimit?: number
  } = {},
) {
  let lastError: unknown = null

  for (let attempt = 0; attempt <= retryLimit; attempt += 1) {
    try {
      const dataset = await resolveDatasetRecord(db, release)

      if (dataset) {
        return dataset
      }
    } catch (error) {
      lastError = error
    }

    if (attempt < retryLimit) {
      await sleep(retryDelayMs * (attempt + 1))
    }
  }

  if (lastError) {
    throw lastError
  }

  return null
}

export async function getCurrentReleaseForDatasetId(
  db: HarbourReadableDb,
  datasetId: string,
  resourceType: ResourceType,
  excludeReleaseId?: string,
) {
  const whereClause = excludeReleaseId
    ? and(
        eq(metaReleases.datasetId, datasetId),
        eq(metaReleases.resourceType, resourceType),
        eq(metaReleases.status, 'published'),
        ne(metaReleases.id, excludeReleaseId),
      )
    : and(
        eq(metaReleases.datasetId, datasetId),
        eq(metaReleases.resourceType, resourceType),
        eq(metaReleases.status, 'published'),
      )

  return (
    ((await db
      .select(releaseRecordSelection)
      .from(metaReleases)
      .innerJoin(metaDatasets, eq(metaReleases.datasetId, metaDatasets.id))
      .innerJoin(metaPublishers, eq(metaDatasets.publisherId, metaPublishers.id))
      .where(whereClause)
      .limit(1)
      .get()) as DatasetRecord | undefined) ?? null
  )
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export async function insertDataset(
  db: HarbourWritableDb & HarbourReadableDb,
  plan: UploadPlan,
  rawObjectKey: string | null,
  ingestedAt: string,
  status: ReleaseStatus = 'staged',
) {
  const dataset = await requireDatasetDefinition(db, plan)
  const now = toIsoTimestamp(ingestedAt)
  const sourceSchemaVersion = await resolveSourceSchemaVersion({
    source: plan.source,
    sourceVersion: plan.sourceVersion,
    allowOlderMappedRelease: true,
  })
  const sourceReleaseCode = buildSourceReleaseCode(plan.datasetCode, plan.sourceVersion)
  const sourceReleaseId = buildDeterministicSourceReleaseId(sourceReleaseCode)

  await db
    .insert(metaSourceReleases)
    .values({
      id: sourceReleaseId,
      datasetId: dataset.id,
      code: sourceReleaseCode,
      sourceVersion: plan.sourceVersion,
      sourceSchemaVersion,
      publicationDate: plan.sourceVersion.split('.')[0] ?? null,
      cohortKey: plan.cohortKey,
      rawObjectKey,
      originalFileName: plan.originalFileName,
      releaseNotesUrl: plan.releaseNotesUrl ?? null,
      notes: null,
      status,
      revokedAt: null,
      revocationReason: null,
      supersededBySourceReleaseId: null,
      processingRules: dataset.processingRules,
      ingestedAt: now,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing()
    .run()

  await db
    .insert(metaReleases)
    .values({
      id: buildDeterministicReleaseId(plan.releaseCode),
      sourceReleaseId,
      datasetId: dataset.id,
      code: plan.releaseCode,
      resourceType: plan.type,
      sourceVersion: plan.sourceVersion,
      sourceSchemaVersion,
      processingRules: dataset.processingRules,
      publicationDate: plan.sourceVersion.split('.')[0] ?? null,
      cohortKey: plan.cohortKey,
      rawObjectKey,
      originalFileName: plan.originalFileName,
      releaseNotesUrl: plan.releaseNotesUrl ?? null,
      notes: null,
      status,
      ingestedAt: now,
      revokedAt: null,
      revocationReason: null,
      supersededByReleaseId: null,
      createdAt: now,
      updatedAt: now,
    })
    .run()
}

export function buildDeterministicReleaseId(releaseCode: string) {
  return buildDeterministicUuidV5(RELEASE_ID_NAMESPACE, releaseCode)
}

export function buildSourceReleaseCode(datasetCode: string, sourceVersion: string) {
  if (!/^ds-[a-z0-9]+(?:-[a-z0-9]+)+$/.test(datasetCode)) {
    throw new Error(`Invalid source dataset code: ${datasetCode}.`)
  }
  return `dr-${datasetCode.slice('ds-'.length)}-${sourceVersion}`
}

export function buildDeterministicSourceReleaseId(sourceReleaseCode: string) {
  return buildDeterministicUuidV5(SOURCE_RELEASE_ID_NAMESPACE, sourceReleaseCode)
}

export function buildDeterministicSnapshotId(snapshotCode: string) {
  return buildDeterministicUuidV5(SNAPSHOT_ID_NAMESPACE, snapshotCode)
}

export function buildDeterministicSnapshotLineageId(lineageCode: string) {
  return buildDeterministicUuidV5(SNAPSHOT_LINEAGE_ID_NAMESPACE, lineageCode)
}

export function buildDeterministicApiReleaseSetId(releaseSetCode: string) {
  return buildDeterministicUuidV5(API_RELEASE_SET_ID_NAMESPACE, releaseSetCode)
}

export function buildDeterministicApiCatalogRevisionId(catalogRevisionCode: string) {
  return buildDeterministicUuidV5(
    API_CATALOG_REVISION_ID_NAMESPACE,
    catalogRevisionCode,
  )
}

export function buildDeterministicSnapshotAssemblyRunId(
  snapshotId: string,
  snapshotAssemblyId: string,
) {
  return buildDeterministicUuidV5(
    SNAPSHOT_ASSEMBLY_RUN_ID_NAMESPACE,
    `${snapshotId}:${snapshotAssemblyId}`,
  )
}

export function buildDeterministicApiFieldProvenanceId(args: {
  apiReleaseSetId: string
  apiField: string
  variant?: string | null
  contributionType: string
  priority: number
  sourceDatasetId: string
  sourceFieldPath: string
}) {
  return buildDeterministicUuidV5(
    API_FIELD_PROVENANCE_ID_NAMESPACE,
    [
      args.apiReleaseSetId,
      args.apiField,
      args.variant ?? 'default',
      args.sourceDatasetId,
      args.sourceFieldPath,
      args.contributionType,
      args.priority,
    ].join(':'),
  )
}

export async function resetFailedDataset(
  db: HarbourWritableDb & HarbourReadableDb,
  plan: UploadPlan,
  rawObjectKey: string | null,
  ingestedAt: string,
  status: ReleaseStatus,
) {
  const dataset = await requireDatasetDefinition(db, plan)
  const now = toIsoTimestamp(ingestedAt)
  const sourceSchemaVersion = await resolveSourceSchemaVersion({
    source: plan.source,
    sourceVersion: plan.sourceVersion,
    allowOlderMappedRelease: true,
  })

  await db
    .update(metaReleases)
    .set({
      sourceVersion: plan.sourceVersion,
      resourceType: plan.type,
      sourceSchemaVersion,
      processingRules: dataset.processingRules,
      publicationDate: plan.sourceVersion.split('.')[0] ?? null,
      cohortKey: plan.cohortKey,
      rawObjectKey,
      originalFileName: plan.originalFileName,
      releaseNotesUrl: plan.releaseNotesUrl ?? null,
      status,
      ingestedAt: now,
      revokedAt: null,
      revocationReason: null,
      supersededByReleaseId: null,
      updatedAt: now,
    })
    .where(eq(metaReleases.code, plan.releaseCode))
    .run()

  await db
    .update(metaSourceReleases)
    .set({
      sourceSchemaVersion,
      processingRules: dataset.processingRules,
      publicationDate: plan.sourceVersion.split('.')[0] ?? null,
      cohortKey: plan.cohortKey,
      rawObjectKey,
      originalFileName: plan.originalFileName,
      releaseNotesUrl: plan.releaseNotesUrl ?? null,
      status,
      ingestedAt: now,
      revokedAt: null,
      revocationReason: null,
      supersededBySourceReleaseId: null,
      updatedAt: now,
    })
    .where(
      eq(
        metaSourceReleases.code,
        buildSourceReleaseCode(plan.datasetCode, plan.sourceVersion),
      ),
    )
    .run()
}

async function resolveSourceReleaseId(db: HarbourReadableDb, releaseId: string) {
  return (
    (
      await db
        .select({ sourceReleaseId: metaReleases.sourceReleaseId })
        .from(metaReleases)
        .where(eq(metaReleases.id, releaseId))
        .limit(1)
        .get()
    )?.sourceReleaseId ?? null
  )
}

export async function updateDatasetStatus(
  db: HarbourWritableDb & HarbourReadableDb,
  releaseId: string,
  status: ReleaseStatus,
) {
  const sourceReleaseId = await resolveSourceReleaseId(db, releaseId)
  const updatedAt = toIsoTimestamp()

  await db
    .update(metaReleases)
    .set({
      status,
      updatedAt,
    })
    .where(eq(metaReleases.id, releaseId))
    .run()

  if (sourceReleaseId) {
    await db
      .update(metaSourceReleases)
      .set({
        status,
        updatedAt,
      })
      .where(eq(metaSourceReleases.id, sourceReleaseId))
      .run()
  }
}

export async function markDatasetCurrent(
  db: HarbourWritableDb & HarbourReadableDb,
  releaseId: string,
) {
  const sourceReleaseId = await resolveSourceReleaseId(db, releaseId)
  const now = toIsoTimestamp()

  await db
    .update(metaReleases)
    .set({
      status: 'published',
      revokedAt: null,
      revocationReason: null,
      updatedAt: now,
    })
    .where(eq(metaReleases.id, releaseId))
    .run()

  if (sourceReleaseId) {
    await db
      .update(metaSourceReleases)
      .set({
        status: 'published',
        revokedAt: null,
        revocationReason: null,
        updatedAt: now,
      })
      .where(eq(metaSourceReleases.id, sourceReleaseId))
      .run()
  }
}

export async function markDatasetHistoric(
  db: HarbourWritableDb,
  releaseId: string,
  historicAt: string,
) {
  const updatedAt = toIsoTimestamp(historicAt)

  await db
    .update(metaReleases)
    .set({
      status: 'superseded',
      updatedAt,
    })
    .where(eq(metaReleases.id, releaseId))
    .run()
}

export async function revokeDataset(
  db: HarbourWritableDb,
  releaseId: string,
  revocationReason: string,
  revokedAt: string,
) {
  const revokedAtTimestamp = toIsoTimestamp(revokedAt)

  await db
    .update(metaReleases)
    .set({
      revokedAt: revokedAtTimestamp,
      revocationReason,
      status: 'revoked',
      updatedAt: revokedAtTimestamp,
    })
    .where(eq(metaReleases.id, releaseId))
    .run()
}

export async function setSupersededByReleaseId(
  db: HarbourWritableDb,
  releaseId: string,
  supersededByReleaseId: string,
) {
  await db
    .update(metaReleases)
    .set({
      supersededByReleaseId,
      updatedAt: toIsoTimestamp(),
    })
    .where(eq(metaReleases.id, releaseId))
    .run()
}

export function getApiVersionCodeForType(type: ResourceType) {
  return buildApiVersionCode(type, '0.1')
}

async function resolveCurrentApiComposition(
  db: HarbourReadableDb,
  apiVersionCode: string,
) {
  return (
    (await db
      .select({
        id: metaApiComposition.id,
        apiVersionId: metaApiComposition.apiVersionId,
        code: metaApiComposition.code,
        version: metaApiComposition.version,
        primaryResourceType: metaApiComposition.primaryResourceType,
        defaultDomainCode: metaApiComposition.defaultDomainCode,
        status: metaApiComposition.status,
      })
      .from(metaApiComposition)
      .innerJoin(
        metaApiVersions,
        eq(metaApiComposition.apiVersionId, metaApiVersions.id),
      )
      .where(
        and(
          eq(metaApiVersions.code, apiVersionCode),
          eq(metaApiComposition.status, 'current'),
        ),
      )
      .orderBy(desc(metaApiComposition.version), desc(metaApiComposition.createdAt))
      .limit(1)
      .get()) ?? null
  )
}

async function resolveCurrentApiCompositionSafely(
  db: HarbourReadableDb,
  apiVersionCode: string,
) {
  try {
    return await resolveCurrentApiComposition(db, apiVersionCode)
  } catch (error) {
    if (
      error instanceof Error &&
      /no such table: apiComposition/i.test(error.message)
    ) {
      return null
    }
    throw error
  }
}

export async function listApiCompositionMembers(
  db: HarbourReadableDb,
  apiCompositionId: string,
) {
  return db
    .select({
      resourceType: metaApiCompositionMembers.resourceType,
      domainCode: metaApiCompositionMembers.domainCode,
      variant: metaApiCompositionMembers.variant,
      role: metaApiCompositionMembers.role,
      isRequired: metaApiCompositionMembers.isRequired,
      cohortMatchingMode: metaApiCompositionMembers.cohortMatchingMode,
      anchorResourceType: metaApiCompositionMembers.anchorResourceType,
      maxLagDays: metaApiCompositionMembers.maxLagDays,
      priority: metaApiCompositionMembers.priority,
    })
    .from(metaApiCompositionMembers)
    .where(eq(metaApiCompositionMembers.apiCompositionId, apiCompositionId))
    .orderBy(metaApiCompositionMembers.priority)
    .all()
}

async function listApiCompositionMembersSafely(
  db: HarbourReadableDb,
  apiCompositionId: string,
) {
  try {
    return await listApiCompositionMembers(db, apiCompositionId)
  } catch (error) {
    if (
      error instanceof Error &&
      /no such table: apiCompositionMembers/i.test(error.message)
    ) {
      return []
    }
    throw error
  }
}

export async function listCurrentApiCompositionMembersForType(
  db: HarbourReadableDb,
  type: ResourceType,
) {
  const composition = await resolveCurrentApiComposition(
    db,
    getApiVersionCodeForType(type),
  )

  return composition ? listApiCompositionMembers(db, composition.id) : []
}

export async function resolveLatestSnapshotForResourceType(
  db: HarbourReadableDb,
  resourceType: ResourceType,
) {
  return (
    (await db
      .select({
        id: metaSnapshots.id,
        code: metaSnapshots.code,
        resourceType: metaSnapshots.resourceType,
        status: metaSnapshots.status,
      })
      .from(metaSnapshots)
      .where(
        and(
          eq(metaSnapshots.resourceType, resourceType),
          ne(metaSnapshots.status, 'archived'),
        ),
      )
      .orderBy(desc(metaSnapshots.publishedAt), desc(metaSnapshots.createdAt))
      .limit(1)
      .get()) ?? null
  )
}

export async function resolveLatestSnapshotForResourceTypeExcludingId(
  db: HarbourReadableDb,
  resourceType: ResourceType,
  snapshotId: string,
) {
  return (
    (await db
      .select({
        id: metaSnapshots.id,
        code: metaSnapshots.code,
        resourceType: metaSnapshots.resourceType,
        status: metaSnapshots.status,
      })
      .from(metaSnapshots)
      .where(
        and(
          eq(metaSnapshots.resourceType, resourceType),
          eq(metaSnapshots.status, 'published'),
          ne(metaSnapshots.id, snapshotId),
        ),
      )
      .orderBy(desc(metaSnapshots.publishedAt), desc(metaSnapshots.createdAt))
      .limit(1)
      .get()) ?? null
  )
}

export async function resolveLatestPublishedSnapshotForResourceTypeRegionExcludingId(
  db: HarbourReadableDb,
  resourceType: ResourceType,
  regionCode: RegionCode,
  snapshotId: string,
) {
  return (
    (await db
      .select({
        id: metaSnapshots.id,
        code: metaSnapshots.code,
        resourceType: metaSnapshots.resourceType,
        status: metaSnapshots.status,
      })
      .from(metaSnapshots)
      .innerJoin(
        metaSnapshotSources,
        eq(metaSnapshots.id, metaSnapshotSources.snapshotId),
      )
      .innerJoin(metaDatasets, eq(metaSnapshotSources.datasetId, metaDatasets.id))
      .where(
        and(
          eq(metaSnapshots.resourceType, resourceType),
          eq(metaSnapshots.status, 'published'),
          ne(metaSnapshots.id, snapshotId),
          eq(metaDatasets.regionCode, regionCode),
          eq(metaSnapshotSources.role, 'primary'),
        ),
      )
      .orderBy(desc(metaSnapshots.publishedAt), desc(metaSnapshots.createdAt))
      .limit(1)
      .get()) ?? null
  )
}

export async function resolveLatestPublishedSnapshotForResourceType(
  db: HarbourReadableDb,
  resourceType: ResourceType,
) {
  return (
    (await db
      .select({
        id: metaSnapshots.id,
        code: metaSnapshots.code,
        resourceType: metaSnapshots.resourceType,
        status: metaSnapshots.status,
      })
      .from(metaSnapshots)
      .where(
        and(
          eq(metaSnapshots.resourceType, resourceType),
          eq(metaSnapshots.status, 'published'),
        ),
      )
      .orderBy(desc(metaSnapshots.publishedAt), desc(metaSnapshots.createdAt))
      .limit(1)
      .get()) ?? null
  )
}

export async function resolveLatestPublishedSnapshotForLineage(
  db: HarbourReadableDb,
  snapshotLineageId: string,
) {
  return (
    (await db
      .select({
        id: metaSnapshots.id,
        code: metaSnapshots.code,
        resourceType: metaSnapshots.resourceType,
        status: metaSnapshots.status,
      })
      .from(metaSnapshots)
      .where(
        and(
          eq(metaSnapshots.snapshotLineageId, snapshotLineageId),
          eq(metaSnapshots.status, 'published'),
        ),
      )
      .orderBy(desc(metaSnapshots.cohortKey), desc(metaSnapshots.revision))
      .limit(1)
      .get()) ?? null
  )
}

export async function resolveLatestPublishedSnapshotForResourceTypeRegion(
  db: HarbourReadableDb,
  resourceType: ResourceType,
  regionCode: RegionCode,
) {
  return (
    (await db
      .select({
        id: metaSnapshots.id,
        code: metaSnapshots.code,
        resourceType: metaSnapshots.resourceType,
        status: metaSnapshots.status,
      })
      .from(metaSnapshots)
      .innerJoin(
        metaSnapshotSources,
        eq(metaSnapshots.id, metaSnapshotSources.snapshotId),
      )
      .innerJoin(metaDatasets, eq(metaSnapshotSources.datasetId, metaDatasets.id))
      .where(
        and(
          eq(metaSnapshots.resourceType, resourceType),
          eq(metaSnapshots.status, 'published'),
          eq(metaDatasets.regionCode, regionCode),
          eq(metaSnapshotSources.role, 'primary'),
        ),
      )
      .orderBy(desc(metaSnapshots.publishedAt), desc(metaSnapshots.createdAt))
      .limit(1)
      .get()) ?? null
  )
}

export async function resolvePublishedSnapshotForResourceTypeRegionCohortKey(
  db: HarbourReadableDb,
  resourceType: ResourceType,
  regionCode: RegionCode,
  cohortKey: string,
  options: { variant?: string } = {},
) {
  // Overture's canonical division dataset is itself the durable domain
  // identity. This deliberately does not require a lineage join: it lets the
  // canonical snapshot remain resolvable while its lineage is being created
  // or repaired, and also matches every lineage-backed Overture snapshot.
  if (options.variant === 'overture') {
    return (
      (await db
        .select({
          id: metaSnapshots.id,
          code: metaSnapshots.code,
          resourceType: metaSnapshots.resourceType,
          status: metaSnapshots.status,
        })
        .from(metaSnapshots)
        .innerJoin(
          metaSnapshotSources,
          eq(metaSnapshots.id, metaSnapshotSources.snapshotId),
        )
        .innerJoin(metaDatasets, eq(metaSnapshotSources.datasetId, metaDatasets.id))
        .where(
          and(
            eq(metaSnapshots.resourceType, resourceType),
            eq(metaSnapshots.status, 'published'),
            eq(metaSnapshots.cohortKey, cohortKey),
            eq(metaDatasets.regionCode, regionCode),
            eq(metaDatasets.code, buildDatasetCode(regionCode, 'overture', 'division')),
            eq(metaSnapshotSources.role, 'primary'),
          ),
        )
        .orderBy(desc(metaSnapshots.publishedAt), desc(metaSnapshots.createdAt))
        .limit(1)
        .get()) ?? null
    )
  }

  return (
    (await db
      .select({
        id: metaSnapshots.id,
        code: metaSnapshots.code,
        resourceType: metaSnapshots.resourceType,
        status: metaSnapshots.status,
      })
      .from(metaSnapshots)
      .innerJoin(
        metaSnapshotLineages,
        eq(metaSnapshots.snapshotLineageId, metaSnapshotLineages.id),
      )
      .innerJoin(
        metaSnapshotSources,
        eq(metaSnapshots.id, metaSnapshotSources.snapshotId),
      )
      .innerJoin(metaDatasets, eq(metaSnapshotSources.datasetId, metaDatasets.id))
      .where(
        and(
          eq(metaSnapshots.resourceType, resourceType),
          eq(metaSnapshots.status, 'published'),
          eq(metaSnapshots.cohortKey, cohortKey),
          eq(metaDatasets.regionCode, regionCode),
          eq(metaSnapshotSources.role, 'primary'),
          options.variant
            ? eq(metaSnapshotLineages.variant, options.variant)
            : undefined,
        ),
      )
      .orderBy(desc(metaSnapshots.publishedAt), desc(metaSnapshots.createdAt))
      .limit(1)
      .get()) ?? null
  )
}

/**
 * Resolves the first published canonical snapshot on or after a source cohort.
 * This is used to give historical, provider-specific geometry a stable canonical
 * identity and naming anchor when no same-cohort canonical snapshot exists.
 */
export async function resolveEarliestPublishedSnapshotForResourceTypeRegionAtOrAfterCohortKey(
  db: HarbourReadableDb,
  resourceType: ResourceType,
  regionCode: RegionCode,
  cohortKey: string,
  options: { publisherCode?: string } = {},
) {
  return (
    (await db
      .select({
        id: metaSnapshots.id,
        code: metaSnapshots.code,
        cohortKey: metaSnapshots.cohortKey,
        resourceType: metaSnapshots.resourceType,
        status: metaSnapshots.status,
      })
      .from(metaSnapshots)
      .innerJoin(
        metaSnapshotSources,
        eq(metaSnapshots.id, metaSnapshotSources.snapshotId),
      )
      .innerJoin(metaDatasets, eq(metaSnapshotSources.datasetId, metaDatasets.id))
      .innerJoin(metaPublishers, eq(metaDatasets.publisherId, metaPublishers.id))
      .where(
        and(
          eq(metaSnapshots.resourceType, resourceType),
          eq(metaSnapshots.status, 'published'),
          sql`${metaSnapshots.cohortKey} >= ${cohortKey}`,
          eq(metaDatasets.regionCode, regionCode),
          eq(metaSnapshotSources.role, 'primary'),
          options.publisherCode
            ? eq(metaPublishers.code, options.publisherCode)
            : undefined,
        ),
      )
      .orderBy(
        metaSnapshots.cohortKey,
        metaSnapshots.publishedAt,
        metaSnapshots.createdAt,
      )
      .limit(1)
      .get()) ?? null
  )
}

/**
 * Resolves the newest published snapshot at or before a release-set cohort for
 * each primary source dataset. Provider variants therefore stay independent.
 */
export async function resolvePublishedSnapshotsForResourceTypeRegionAtOrBeforeCohortKey(
  db: HarbourReadableDb,
  resourceType: ResourceType,
  regionCode: RegionCode,
  cohortKey: string,
  options: { publisherCode?: string; variant?: string } = {},
) {
  const candidates = await db
    .select({
      id: metaSnapshots.id,
      code: metaSnapshots.code,
      cohortKey: metaSnapshots.cohortKey,
      resourceType: metaSnapshots.resourceType,
      status: metaSnapshots.status,
      datasetId: metaDatasets.id,
    })
    .from(metaSnapshots)
    .innerJoin(
      metaSnapshotSources,
      eq(metaSnapshots.id, metaSnapshotSources.snapshotId),
    )
    .innerJoin(metaDatasets, eq(metaSnapshotSources.datasetId, metaDatasets.id))
    .innerJoin(metaPublishers, eq(metaDatasets.publisherId, metaPublishers.id))
    .innerJoin(
      metaSnapshotLineages,
      eq(metaSnapshots.snapshotLineageId, metaSnapshotLineages.id),
    )
    .where(
      and(
        eq(metaSnapshots.resourceType, resourceType),
        eq(metaSnapshots.status, 'published'),
        sql`${metaSnapshots.cohortKey} <= ${cohortKey}`,
        eq(metaDatasets.regionCode, regionCode),
        eq(metaSnapshotSources.role, 'primary'),
        options.publisherCode
          ? eq(metaPublishers.code, options.publisherCode)
          : undefined,
        options.variant ? eq(metaSnapshotLineages.variant, options.variant) : undefined,
      ),
    )
    .orderBy(
      desc(metaSnapshots.cohortKey),
      desc(metaSnapshots.publishedAt),
      desc(metaSnapshots.createdAt),
    )
    .all()

  const latestSnapshotByDataset = new Map<string, (typeof candidates)[number]>()
  for (const candidate of candidates) {
    if (!latestSnapshotByDataset.has(candidate.datasetId)) {
      latestSnapshotByDataset.set(candidate.datasetId, candidate)
    }
  }

  return [...latestSnapshotByDataset.values()].map(
    ({ datasetId: _datasetId, ...snapshot }) => snapshot,
  )
}

export async function ensureDraftSnapshotForRelease(
  db: HarbourReadableDb & HarbourWritableDb,
  resourceType: ResourceType,
  args: {
    cohortKey: string
    datasetCode: string
    datasetId: string
    identityMode?: 'persistent' | 'cohort_scoped'
    regionCode: string
    sourceReleaseId: string
    variant?: string
  },
) {
  const snapshotForSourceRelease = await db
    .select({
      id: metaSnapshots.id,
      parentSnapshotId: metaSnapshots.parentSnapshotId,
      snapshotLineageId: metaSnapshots.snapshotLineageId,
      code: metaSnapshots.code,
      cohortKey: metaSnapshots.cohortKey,
      resourceType: metaSnapshots.resourceType,
      status: metaSnapshots.status,
    })
    .from(metaSnapshotSources)
    .innerJoin(metaSnapshots, eq(metaSnapshotSources.snapshotId, metaSnapshots.id))
    .where(
      and(
        eq(metaSnapshotSources.sourceReleaseId, args.sourceReleaseId),
        eq(metaSnapshots.resourceType, resourceType),
      ),
    )
    .orderBy(desc(metaSnapshots.revision))
    .limit(1)
    .get()

  if (snapshotForSourceRelease) {
    return snapshotForSourceRelease
  }

  const variant = args.variant ?? 'default'
  const lineageCode = buildSnapshotLineageCode(args.datasetCode, resourceType, variant)
  const deterministicLineageId = buildDeterministicSnapshotLineageId(lineageCode)
  const identityMode =
    args.identityMode ??
    (variant === 'hkgov-pland-new-town' ? 'cohort_scoped' : 'persistent')
  const now = toIsoTimestamp()
  const lineageVersionHash = computeVersionHash({
    code: lineageCode,
    regionCode: args.regionCode,
    resourceType,
    variant,
    identityMode,
    primaryDatasetId: args.datasetId,
  })

  await db
    .insert(metaSnapshotLineages)
    .values({
      id: deterministicLineageId,
      code: lineageCode,
      regionCode: args.regionCode,
      resourceType,
      variant,
      identityMode,
      primaryDatasetId: args.datasetId,
      versionHash: lineageVersionHash,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [
        metaSnapshotLineages.primaryDatasetId,
        metaSnapshotLineages.resourceType,
        metaSnapshotLineages.variant,
      ],
      set: {
        code: lineageCode,
        regionCode: args.regionCode,
        resourceType,
        variant,
        identityMode,
        versionHash: lineageVersionHash,
        updatedAt: now,
      },
    })
    .run()

  const lineage = await db
    .select({ id: metaSnapshotLineages.id })
    .from(metaSnapshotLineages)
    .where(
      and(
        eq(metaSnapshotLineages.primaryDatasetId, args.datasetId),
        eq(metaSnapshotLineages.variant, variant),
      ),
    )
    .limit(1)
    .get()

  if (!lineage) {
    throw new Error(`Snapshot lineage not found for dataset ${args.datasetCode}.`)
  }

  const lineageId = lineage.id

  const latestForCohort = await db
    .select({
      id: metaSnapshots.id,
      parentSnapshotId: metaSnapshots.parentSnapshotId,
      snapshotLineageId: metaSnapshots.snapshotLineageId,
      code: metaSnapshots.code,
      cohortKey: metaSnapshots.cohortKey,
      resourceType: metaSnapshots.resourceType,
      revision: metaSnapshots.revision,
      status: metaSnapshots.status,
    })
    .from(metaSnapshots)
    .where(
      and(
        eq(metaSnapshots.snapshotLineageId, lineageId),
        eq(metaSnapshots.cohortKey, args.cohortKey),
      ),
    )
    .orderBy(desc(metaSnapshots.revision))
    .limit(1)
    .get()

  if (latestForCohort?.status === 'draft') {
    return latestForCohort
  }

  const effectiveParent = latestForCohort
    ? { id: latestForCohort.id }
    : identityMode === 'cohort_scoped'
      ? null
      : await db
          .select({ id: metaSnapshots.id })
          .from(metaSnapshots)
          .where(
            and(
              eq(metaSnapshots.snapshotLineageId, lineageId),
              eq(metaSnapshots.status, 'published'),
              sql`${metaSnapshots.cohortKey} < ${args.cohortKey}`,
            ),
          )
          .orderBy(desc(metaSnapshots.cohortKey), desc(metaSnapshots.revision))
          .limit(1)
          .get()
  const parentSnapshotId = effectiveParent?.id ?? null

  const revision = latestForCohort ? latestForCohort.revision + 1 : 0
  const snapshotCode = buildSnapshotVersionCode(
    args.regionCode,
    resourceType,
    args.cohortKey,
    variant,
    revision,
  )
  const existing = await db
    .select({
      id: metaSnapshots.id,
      parentSnapshotId: metaSnapshots.parentSnapshotId,
      snapshotLineageId: metaSnapshots.snapshotLineageId,
      code: metaSnapshots.code,
      cohortKey: metaSnapshots.cohortKey,
      resourceType: metaSnapshots.resourceType,
      status: metaSnapshots.status,
    })
    .from(metaSnapshots)
    .where(
      and(
        eq(metaSnapshots.resourceType, resourceType),
        eq(metaSnapshots.snapshotLineageId, lineageId),
        eq(metaSnapshots.code, snapshotCode),
      ),
    )
    .limit(1)
    .get()

  if (existing) {
    return existing
  }

  const snapshotId = buildDeterministicSnapshotId(snapshotCode)

  await db
    .insert(metaSnapshots)
    .values({
      id: snapshotId,
      snapshotLineageId: lineageId,
      parentSnapshotId,
      resourceType,
      code: snapshotCode,
      cohortKey: args.cohortKey,
      revision,
      status: 'draft',
      publishedAt: null,
      validFrom: null,
      validTo: null,
      notes: null,
      createdAt: now,
      updatedAt: now,
    })
    .run()

  return {
    id: snapshotId,
    parentSnapshotId,
    snapshotLineageId: lineageId,
    code: snapshotCode,
    cohortKey: args.cohortKey,
    resourceType,
    status: 'draft' as const,
  }
}

export async function recordSnapshotAssemblyRun(
  db: HarbourReadableDb & HarbourWritableDb,
  args: {
    anchorCohortKey: string
    anchorReleaseId?: string | null
    resourceType: ResourceType
    selectionSummaryJson?: Record<string, unknown> | null
    snapshotId: string
  },
) {
  const assembly =
    (await db
      .select({
        id: metaSnapshotAssembly.id,
        code: metaSnapshotAssembly.code,
      })
      .from(metaSnapshotAssembly)
      .where(
        and(
          eq(metaSnapshotAssembly.resourceType, args.resourceType),
          eq(metaSnapshotAssembly.status, 'current'),
        ),
      )
      .orderBy(desc(metaSnapshotAssembly.version), desc(metaSnapshotAssembly.createdAt))
      .limit(1)
      .get()) ?? null

  if (!assembly) {
    return null
  }

  const existing =
    (await db
      .select({
        id: metaSnapshotAssemblyRuns.id,
      })
      .from(metaSnapshotAssemblyRuns)
      .where(
        and(
          eq(metaSnapshotAssemblyRuns.snapshotId, args.snapshotId),
          eq(metaSnapshotAssemblyRuns.snapshotAssemblyId, assembly.id),
        ),
      )
      .limit(1)
      .get()) ?? null

  if (existing) {
    return assembly
  }

  const now = toIsoTimestamp()

  await db
    .insert(metaSnapshotAssemblyRuns)
    .values({
      id: buildDeterministicSnapshotAssemblyRunId(args.snapshotId, assembly.id),
      snapshotId: args.snapshotId,
      snapshotAssemblyId: assembly.id,
      anchorReleaseId: args.anchorReleaseId ?? null,
      anchorCohortKey: args.anchorCohortKey,
      status: 'selected',
      selectionSummaryJson: args.selectionSummaryJson ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .run()

  return assembly
}

export async function resolveSnapshotForRelease(
  db: HarbourReadableDb,
  sourceReleaseId: string,
  resourceType: ResourceType,
) {
  return (
    (await db
      .select({
        id: metaSnapshots.id,
        code: metaSnapshots.code,
        resourceType: metaSnapshots.resourceType,
        status: metaSnapshots.status,
      })
      .from(metaSnapshotSources)
      .innerJoin(metaSnapshots, eq(metaSnapshotSources.snapshotId, metaSnapshots.id))
      .where(
        and(
          eq(metaSnapshotSources.sourceReleaseId, sourceReleaseId),
          eq(metaSnapshots.resourceType, resourceType),
        ),
      )
      .orderBy(desc(metaSnapshots.createdAt))
      .limit(1)
      .get()) ?? null
  )
}

export async function resolveReleaseSetForType(
  db: HarbourReadableDb,
  type: ResourceType,
) {
  const apiVersionCode = getApiVersionCodeForType(type)

  return (
    (await db
      .select({
        id: metaApiReleaseSets.id,
        code: metaApiReleaseSets.code,
        schemaVersion: metaApiReleaseSets.schemaVersion,
        rulesetVersion: metaApiReleaseSets.rulesetVersion,
        status: metaApiReleaseSets.status,
      })
      .from(metaApiReleaseSets)
      .innerJoin(
        metaApiVersions,
        eq(metaApiReleaseSets.apiVersionId, metaApiVersions.id),
      )
      .where(
        and(
          eq(metaApiVersions.code, apiVersionCode),
          ne(metaApiReleaseSets.status, 'archived'),
        ),
      )
      .orderBy(desc(metaApiReleaseSets.publishedAt), desc(metaApiReleaseSets.createdAt))
      .limit(1)
      .get()) ?? null
  )
}

export async function resolveActiveReleaseSetForType(
  db: HarbourReadableDb,
  type: ResourceType,
  domainCode = 'default',
) {
  const apiVersionCode = getApiVersionCodeForType(type)

  return (
    (await db
      .select({
        id: metaApiReleaseSets.id,
        code: metaApiReleaseSets.code,
        domainCode: metaApiReleaseSets.domainCode,
        schemaVersion: metaApiReleaseSets.schemaVersion,
        rulesetVersion: metaApiReleaseSets.rulesetVersion,
        status: metaApiReleaseSets.status,
      })
      .from(metaApiReleaseSets)
      .innerJoin(
        metaApiVersions,
        eq(metaApiReleaseSets.apiVersionId, metaApiVersions.id),
      )
      .where(
        and(
          eq(metaApiVersions.code, apiVersionCode),
          eq(metaApiReleaseSets.status, 'current'),
          eq(metaApiReleaseSets.domainCode, domainCode),
        ),
      )
      .orderBy(desc(metaApiReleaseSets.publishedAt), desc(metaApiReleaseSets.createdAt))
      .limit(1)
      .get()) ?? null
  )
}

export async function resolveLatestReleaseSetForTypeDomainCohort(
  db: HarbourReadableDb,
  type: ResourceType,
  domainCode: string,
  regionCode: RegionCode,
  cohortKey: string,
) {
  const apiVersionCode = getApiVersionCodeForType(type)
  const codePrefix = `data-${regionCode}-${getApiFamilyForType(type)}-${cohortKey}-r`

  return (
    (await db
      .select({
        id: metaApiReleaseSets.id,
        code: metaApiReleaseSets.code,
        domainCode: metaApiReleaseSets.domainCode,
        schemaVersion: metaApiReleaseSets.schemaVersion,
        rulesetVersion: metaApiReleaseSets.rulesetVersion,
        status: metaApiReleaseSets.status,
      })
      .from(metaApiReleaseSets)
      .innerJoin(
        metaApiVersions,
        eq(metaApiReleaseSets.apiVersionId, metaApiVersions.id),
      )
      .where(
        and(
          eq(metaApiVersions.code, apiVersionCode),
          eq(metaApiReleaseSets.domainCode, domainCode),
          ne(metaApiReleaseSets.status, 'draft'),
          sql`(${metaApiReleaseSets.cohortKey} = ${cohortKey} OR ${metaApiReleaseSets.code} LIKE ${`${codePrefix}%`})`,
        ),
      )
      .orderBy(desc(metaApiReleaseSets.revision), desc(metaApiReleaseSets.publishedAt))
      .limit(1)
      .get()) ?? null
  )
}

function getApiFamilyForType(type: ResourceType) {
  if (type === 'division' || type === 'divisionArea' || type === 'divisionBoundary') {
    return 'divisions'
  }
  if (type === 'divisionStatistic') return 'stats'
  if (type === 'address') return 'addresses'
  if (type === 'place') return 'places'
  return 'streets'
}

/**
 * Finds draft API release sets that can consume a cohort-independent source
 * snapshot. The source cohort must be at or before the release-set cohort.
 *
 * This is used for provider variants such as the HAD district geometry: one
 * source release can complete several pending division API release sets.
 */
export async function listDraftReleaseSetsForTypeRegionAtOrAfterCohortKey(
  db: HarbourReadableDb,
  type: ResourceType,
  regionCode: RegionCode,
  cohortKey: string,
) {
  const apiVersionCode = getApiVersionCodeForType(type)
  const apiVersion = await db
    .select({
      familyType: metaApiVersions.familyType,
      id: metaApiVersions.id,
    })
    .from(metaApiVersions)
    .where(eq(metaApiVersions.code, apiVersionCode))
    .limit(1)
    .get()

  if (!apiVersion) return []

  const rows = await db
    .select({
      cohortKey: metaApiReleaseSets.cohortKey,
      code: metaApiReleaseSets.code,
      id: metaApiReleaseSets.id,
    })
    .from(metaApiReleaseSets)
    .where(
      and(
        eq(metaApiReleaseSets.apiVersionId, apiVersion.id),
        eq(metaApiReleaseSets.status, 'draft'),
        eq(metaApiReleaseSets.regionCode, regionCode),
        sql`${metaApiReleaseSets.cohortKey} >= ${cohortKey}`,
      ),
    )
    .orderBy(desc(metaApiReleaseSets.createdAt))
    .all()

  return rows
    .flatMap(row => (row.cohortKey ? [{ ...row, cohortKey: row.cohortKey }] : []))
    .sort(
      (left, right) =>
        right.cohortKey.localeCompare(left.cohortKey) ||
        right.code.localeCompare(left.code),
    )
}

/**
 * Lists draft release sets with the published primary source release that can
 * safely be used to re-evaluate their composition. A release-set publication
 * is immutable, but a draft set may be completed after a resumed backfill
 * skips the dependency upload that would normally trigger publication.
 */
export async function listDraftReleaseSets(
  db: HarbourReadableDb,
  options: { apiFamily?: ApiFamilyType; regionCode?: RegionCode } = {},
) {
  return db
    .select({
      code: metaApiReleaseSets.code,
      id: metaApiReleaseSets.id,
    })
    .from(metaApiReleaseSets)
    .innerJoin(metaApiVersions, eq(metaApiReleaseSets.apiVersionId, metaApiVersions.id))
    .where(
      and(
        eq(metaApiReleaseSets.status, 'draft'),
        options.apiFamily
          ? eq(metaApiVersions.familyType, options.apiFamily)
          : undefined,
        options.regionCode
          ? eq(metaApiReleaseSets.regionCode, options.regionCode)
          : undefined,
      ),
    )
    .orderBy(asc(metaApiReleaseSets.cohortKey), asc(metaApiReleaseSets.revision))
    .all()
}

export async function listDraftReleaseSetPrimaryReleases(
  db: HarbourReadableDb,
  options: { apiFamily?: ApiFamilyType; regionCode?: RegionCode } = {},
) {
  const rows = await db
    .select({
      apiReleaseSetCode: metaApiReleaseSets.code,
      apiReleaseSetId: metaApiReleaseSets.id,
      releaseId: metaReleases.id,
    })
    .from(metaApiReleaseSets)
    .innerJoin(metaApiVersions, eq(metaApiReleaseSets.apiVersionId, metaApiVersions.id))
    .innerJoin(
      metaApiReleaseSetSnapshots,
      eq(metaApiReleaseSetSnapshots.apiReleaseSetId, metaApiReleaseSets.id),
    )
    .innerJoin(
      metaSnapshotSources,
      eq(metaSnapshotSources.snapshotId, metaApiReleaseSetSnapshots.snapshotId),
    )
    .innerJoin(metaReleases, eq(metaSnapshotSources.sourceReleaseId, metaReleases.id))
    .where(
      and(
        eq(metaApiReleaseSets.status, 'draft'),
        eq(metaApiReleaseSetSnapshots.role, 'primary'),
        eq(metaSnapshotSources.role, 'primary'),
        or(eq(metaReleases.status, 'published'), eq(metaReleases.status, 'superseded')),
        options.apiFamily
          ? eq(metaApiVersions.familyType, options.apiFamily)
          : undefined,
        options.regionCode
          ? eq(metaApiReleaseSets.regionCode, options.regionCode)
          : undefined,
      ),
    )
    .orderBy(asc(metaApiReleaseSets.cohortKey), asc(metaApiReleaseSets.revision))
    .all()

  const releasesByReleaseSet = new Map<string, (typeof rows)[number]>()
  for (const row of rows) {
    if (!releasesByReleaseSet.has(row.apiReleaseSetId)) {
      releasesByReleaseSet.set(row.apiReleaseSetId, row)
    }
  }

  return [...releasesByReleaseSet.values()]
}

/**
 * Lists Overture release-set cohorts that can receive a provider snapshot.
 * Draft sets are included so required companion data can complete an initial
 * publication; non-draft sets receive an immutable next revision instead.
 */
export async function listOvertureReleaseSetCohortsAtOrAfterCohortKey(
  db: HarbourReadableDb,
  type: ResourceType,
  regionCode: RegionCode,
  cohortKey: string,
  domainCode = 'geographic',
) {
  const apiVersionCode = getApiVersionCodeForType(type)
  const rows = await db
    .select({
      cohortKey: metaApiReleaseSets.cohortKey,
    })
    .from(metaApiReleaseSets)
    .innerJoin(metaApiVersions, eq(metaApiReleaseSets.apiVersionId, metaApiVersions.id))
    .innerJoin(
      metaApiReleaseSetSnapshots,
      eq(metaApiReleaseSetSnapshots.apiReleaseSetId, metaApiReleaseSets.id),
    )
    .innerJoin(
      metaSnapshots,
      eq(metaApiReleaseSetSnapshots.snapshotId, metaSnapshots.id),
    )
    .innerJoin(
      metaSnapshotSources,
      eq(metaSnapshotSources.snapshotId, metaSnapshots.id),
    )
    .innerJoin(metaDatasets, eq(metaSnapshotSources.datasetId, metaDatasets.id))
    .innerJoin(metaPublishers, eq(metaDatasets.publisherId, metaPublishers.id))
    .where(
      and(
        eq(metaApiVersions.code, apiVersionCode),
        eq(metaApiReleaseSets.regionCode, regionCode),
        eq(metaApiReleaseSets.domainCode, domainCode),
        sql`${metaApiReleaseSets.cohortKey} >= ${cohortKey}`,
        eq(metaApiReleaseSetSnapshots.role, 'primary'),
        eq(metaSnapshots.resourceType, type),
        eq(metaSnapshotSources.role, 'primary'),
        eq(metaPublishers.code, 'overture'),
      ),
    )
    .orderBy(asc(metaApiReleaseSets.cohortKey), asc(metaApiReleaseSets.revision))
    .all()

  return [...new Set(rows.flatMap(row => (row.cohortKey ? [row.cohortKey] : [])))]
}

export async function ensureDraftReleaseSetForRelease(
  db: HarbourReadableDb & HarbourWritableDb,
  type: ResourceType,
  release: Pick<DatasetRecord, 'cohortKey' | 'regionCode'>,
  options: { domainCode?: string; forceNew?: boolean } = {},
) {
  const apiVersionCode = getApiVersionCodeForType(type)
  const apiVersion = await db
    .select({
      id: metaApiVersions.id,
      familyType: metaApiVersions.familyType,
    })
    .from(metaApiVersions)
    .where(eq(metaApiVersions.code, apiVersionCode))
    .limit(1)
    .get()

  if (!apiVersion) {
    throw new Error(`API version not found for type: ${type}`)
  }

  const composition = await resolveCurrentApiCompositionSafely(db, apiVersionCode)

  const compositionMembers = composition
    ? await listApiCompositionMembersSafely(db, composition.id)
    : []
  const domainCode = options.domainCode ?? composition?.defaultDomainCode ?? 'default'
  const isCompositionMember = compositionMembers.some(
    member => member.domainCode === domainCode && member.resourceType === type,
  )

  if (
    composition?.primaryResourceType &&
    composition.primaryResourceType !== type &&
    !isCompositionMember
  ) {
    throw new Error(
      `API composition ${composition.code} expects primary resourceType=${composition.primaryResourceType}, not ${type}.`,
    )
  }

  const existing = options.forceNew
    ? null
    : await db
        .select({
          id: metaApiReleaseSets.id,
          code: metaApiReleaseSets.code,
          status: metaApiReleaseSets.status,
        })
        .from(metaApiReleaseSets)
        .where(
          and(
            eq(metaApiReleaseSets.apiVersionId, apiVersion.id),
            eq(metaApiReleaseSets.regionCode, release.regionCode),
            eq(metaApiReleaseSets.domainCode, domainCode),
            eq(metaApiReleaseSets.cohortKey, release.cohortKey),
            eq(metaApiReleaseSets.status, 'draft'),
          ),
        )
        .orderBy(desc(metaApiReleaseSets.createdAt))
        .limit(1)
        .get()

  if (existing) {
    return existing
  }

  const latestReleaseSet = await db
    .select({
      id: metaApiReleaseSets.id,
      revision: metaApiReleaseSets.revision,
      rulesetVersion: metaApiReleaseSets.rulesetVersion,
      schemaVersion: metaApiReleaseSets.schemaVersion,
    })
    .from(metaApiReleaseSets)
    .innerJoin(metaApiVersions, eq(metaApiReleaseSets.apiVersionId, metaApiVersions.id))
    .where(
      and(
        eq(metaApiVersions.code, apiVersionCode),
        eq(metaApiReleaseSets.regionCode, release.regionCode),
        eq(metaApiReleaseSets.domainCode, domainCode),
        eq(metaApiReleaseSets.cohortKey, release.cohortKey),
        ne(metaApiReleaseSets.status, 'draft'),
      ),
    )
    .orderBy(desc(metaApiReleaseSets.revision), desc(metaApiReleaseSets.createdAt))
    .limit(1)
    .get()
  const existingCodes = await db
    .select({
      revision: metaApiReleaseSets.revision,
    })
    .from(metaApiReleaseSets)
    .where(
      and(
        eq(metaApiReleaseSets.apiVersionId, apiVersion.id),
        eq(metaApiReleaseSets.regionCode, release.regionCode),
        eq(metaApiReleaseSets.domainCode, domainCode),
        eq(metaApiReleaseSets.cohortKey, release.cohortKey),
      ),
    )
    .all()
  const nextRevision =
    existingCodes.reduce(
      (maxRevision, row) => Math.max(maxRevision, row.revision),
      -1,
    ) + 1
  const releaseSetCode = [
    buildDataReleaseSetCode(
      release.regionCode,
      apiVersion.familyType,
      release.cohortKey,
      nextRevision,
    ),
    domainCode === (composition?.defaultDomainCode ?? 'default') ? null : domainCode,
  ]
    .filter((segment): segment is string => segment !== null)
    .join('--')
  const now = toIsoTimestamp()
  const releaseSetId = buildDeterministicApiReleaseSetId(releaseSetCode)
  const resourceCode = resourceTypeCodeSlug(type)
  const schemaVersion = latestReleaseSet?.schemaVersion ?? `sv-${resourceCode}-v1`
  const rulesetDomainSegment =
    domainCode === 'default' || domainCode === 'overture' ? '' : `-${domainCode}`
  const rulesetVersion =
    latestReleaseSet?.rulesetVersion ??
    `rs-${resourceCode}${rulesetDomainSegment}-merge-v1`
  const versionHash = computeVersionHash({
    apiVersion: apiVersionCode,
    releaseSetCode,
    apiCompositionId: composition?.id ?? null,
    domainCode,
    cohortKey: release.cohortKey,
    revision: nextRevision,
    supersedesApiReleaseSetId: latestReleaseSet?.id ?? null,
    schemaVersion,
    rulesetVersion,
    status: 'draft',
    publishedAt: null,
    validFrom: null,
    validTo: null,
    notes: null,
  })

  await db
    .insert(metaApiReleaseSets)
    .values({
      id: releaseSetId,
      apiVersionId: apiVersion.id,
      apiCompositionId: composition?.id ?? null,
      code: releaseSetCode,
      regionCode: release.regionCode,
      domainCode,
      cohortKey: release.cohortKey,
      revision: nextRevision,
      effectiveFrom: cohortKeyEffectiveFrom(release.cohortKey),
      effectiveTo: null,
      supersedesApiReleaseSetId: latestReleaseSet?.id ?? null,
      schemaVersion,
      rulesetVersion,
      status: 'draft',
      publishedAt: null,
      validFrom: null,
      validTo: null,
      notes: null,
      versionHash,
      createdAt: now,
      updatedAt: now,
    })
    .run()

  return {
    id: releaseSetId,
    code: releaseSetCode,
    status: 'draft' as const,
  }
}

export async function resolveReleaseSetForRelease(
  db: HarbourReadableDb,
  releaseId: string,
  type: ResourceType,
  domainCode = 'default',
) {
  const apiVersionCode = getApiVersionCodeForType(type)

  return (
    (await db
      .select({
        id: metaApiReleaseSets.id,
        code: metaApiReleaseSets.code,
        domainCode: metaApiReleaseSets.domainCode,
        schemaVersion: metaApiReleaseSets.schemaVersion,
        rulesetVersion: metaApiReleaseSets.rulesetVersion,
        status: metaApiReleaseSets.status,
      })
      .from(metaSnapshotSources)
      .innerJoin(metaSnapshots, eq(metaSnapshotSources.snapshotId, metaSnapshots.id))
      .innerJoin(
        metaApiReleaseSetSnapshots,
        eq(metaApiReleaseSetSnapshots.snapshotId, metaSnapshots.id),
      )
      .innerJoin(
        metaApiReleaseSets,
        eq(metaApiReleaseSetSnapshots.apiReleaseSetId, metaApiReleaseSets.id),
      )
      .innerJoin(
        metaApiVersions,
        eq(metaApiReleaseSets.apiVersionId, metaApiVersions.id),
      )
      .where(
        and(
          eq(metaSnapshotSources.sourceReleaseId, releaseId),
          eq(metaApiVersions.code, apiVersionCode),
          eq(metaApiReleaseSets.domainCode, domainCode),
        ),
      )
      .orderBy(desc(metaApiReleaseSets.createdAt))
      .limit(1)
      .get()) ?? null
  )
}

export async function activateReleaseSet(
  db: HarbourReadableDb & HarbourWritableDb,
  releaseSetId: string,
) {
  const releaseSet = await db
    .select({
      apiVersionId: metaApiReleaseSets.apiVersionId,
      id: metaApiReleaseSets.id,
      status: metaApiReleaseSets.status,
    })
    .from(metaApiReleaseSets)
    .where(eq(metaApiReleaseSets.id, releaseSetId))
    .limit(1)
    .get()

  if (!releaseSet) {
    throw new Error(`Release set not found: ${releaseSetId}`)
  }

  const now = toIsoTimestamp()
  await db
    .update(metaApiReleaseSets)
    .set({
      status: 'current',
      publishedAt: now,
      validFrom: now,
      validTo: null,
      updatedAt: now,
    })
    .where(eq(metaApiReleaseSets.id, releaseSetId))
    .run()

  return {
    previousActiveReleaseSetId: null,
  }
}

type CatalogReleaseSetMember = {
  apiReleaseSetId: string
  cohortKey: string
  domainCode: string
  effectiveFrom: string | null
  isDefault: boolean
  revision: number
}

function catalogMemberSortKey(
  member: Pick<CatalogReleaseSetMember, 'cohortKey' | 'effectiveFrom'>,
) {
  return (
    member.effectiveFrom ?? cohortKeyEffectiveFrom(member.cohortKey) ?? member.cohortKey
  )
}

async function prepareApiCatalogRevision(
  db: HarbourReadableDb,
  args: {
    apiFamily: 'addresses' | 'divisions' | 'places' | 'streets' | 'stats'
    apiVersion: string
    apiVersionId: string
    apiVersionNumber: string
    cohortKey: string
    defaultDomainCode: string | null
    domainCode: string
    publishedAt: string
    regionCode: string
    releaseSetId: string
    releaseSetRevision: number
  },
) {
  const previousCatalog = await db
    .select({ id: metaApiCatalogRevisions.id })
    .from(metaApiCatalogRevisions)
    .where(
      and(
        eq(metaApiCatalogRevisions.apiVersionId, args.apiVersionId),
        eq(metaApiCatalogRevisions.regionCode, args.regionCode),
        eq(metaApiCatalogRevisions.status, 'current'),
      ),
    )
    .orderBy(
      desc(metaApiCatalogRevisions.publishedAt),
      desc(metaApiCatalogRevisions.revision),
    )
    .limit(1)
    .get()

  const previousMembers = previousCatalog
    ? await db
        .select({
          apiReleaseSetId: metaApiCatalogRevisionReleaseSets.apiReleaseSetId,
          cohortKey: metaApiCatalogRevisionReleaseSets.cohortKey,
          domainCode: metaApiCatalogRevisionReleaseSets.domainCode,
          effectiveFrom: metaApiReleaseSets.effectiveFrom,
          isDefault: metaApiCatalogRevisionReleaseSets.isDefault,
          revision: metaApiReleaseSets.revision,
        })
        .from(metaApiCatalogRevisionReleaseSets)
        .innerJoin(
          metaApiReleaseSets,
          eq(metaApiCatalogRevisionReleaseSets.apiReleaseSetId, metaApiReleaseSets.id),
        )
        .where(
          eq(
            metaApiCatalogRevisionReleaseSets.apiCatalogRevisionId,
            previousCatalog.id,
          ),
        )
        .all()
    : await db
        .select({
          apiReleaseSetId: metaApiReleaseSets.id,
          cohortKey: metaApiReleaseSets.cohortKey,
          domainCode: metaApiReleaseSets.domainCode,
          effectiveFrom: metaApiReleaseSets.effectiveFrom,
          revision: metaApiReleaseSets.revision,
        })
        .from(metaApiReleaseSets)
        .where(
          and(
            eq(metaApiReleaseSets.apiVersionId, args.apiVersionId),
            eq(metaApiReleaseSets.regionCode, args.regionCode),
            ne(metaApiReleaseSets.status, 'draft'),
          ),
        )
        .all()

  const membersByDomainCohort = new Map<string, CatalogReleaseSetMember>()
  for (const member of previousMembers) {
    if (!member.cohortKey) continue
    const key = `${member.domainCode}\u0000${member.cohortKey}`
    const current = membersByDomainCohort.get(key)
    if (!current || member.revision > current.revision) {
      membersByDomainCohort.set(key, {
        ...member,
        cohortKey: member.cohortKey,
        isDefault: 'isDefault' in member ? Boolean(member.isDefault) : false,
      })
    }
  }

  membersByDomainCohort.set(`${args.domainCode}\u0000${args.cohortKey}`, {
    apiReleaseSetId: args.releaseSetId,
    cohortKey: args.cohortKey,
    domainCode: args.domainCode,
    effectiveFrom: cohortKeyEffectiveFrom(args.cohortKey),
    isDefault: false,
    revision: args.releaseSetRevision,
  })

  const members = [...membersByDomainCohort.values()]
  const latestMemberByDomain = new Map<string, CatalogReleaseSetMember>()
  for (const member of members) {
    const latest = latestMemberByDomain.get(member.domainCode)
    if (
      !latest ||
      catalogMemberSortKey(member) > catalogMemberSortKey(latest) ||
      (catalogMemberSortKey(member) === catalogMemberSortKey(latest) &&
        member.revision > latest.revision)
    ) {
      latestMemberByDomain.set(member.domainCode, member)
    }
  }
  for (const member of members) {
    member.isDefault =
      latestMemberByDomain.get(member.domainCode)?.apiReleaseSetId ===
      member.apiReleaseSetId
  }
  members.sort(
    (left, right) =>
      left.domainCode.localeCompare(right.domainCode) ||
      left.cohortKey.localeCompare(right.cohortKey),
  )

  const publicationDate = new Date(args.publishedAt).toISOString().slice(0, 10)
  const existingRevisions = await db
    .select({ revision: metaApiCatalogRevisions.revision })
    .from(metaApiCatalogRevisions)
    .where(
      and(
        eq(metaApiCatalogRevisions.apiVersionId, args.apiVersionId),
        eq(metaApiCatalogRevisions.regionCode, args.regionCode),
        eq(metaApiCatalogRevisions.publicationDate, publicationDate),
      ),
    )
    .all()
  const revision =
    existingRevisions.reduce((maximum, row) => Math.max(maximum, row.revision), -1) + 1
  const code = buildApiCatalogRevisionCode(
    args.regionCode,
    args.apiFamily,
    args.apiVersionNumber,
    publicationDate,
    revision,
  )
  const id = buildDeterministicApiCatalogRevisionId(code)

  return {
    id,
    code,
    publicationDate,
    revision,
    members,
    versionHash: computeVersionHash({
      apiVersion: args.apiVersion,
      code,
      defaultDomainCode: args.defaultDomainCode,
      members: members.map(member => ({
        apiReleaseSetId: member.apiReleaseSetId,
        cohortKey: member.cohortKey,
        domainCode: member.domainCode,
        isDefault: member.isDefault,
      })),
      publishedAt: args.publishedAt,
      regionCode: args.regionCode,
    }),
  }
}

export async function publishReleaseArtefacts(
  db: HarbourReadableDb & HarbourWritableDb,
  args: {
    carriedSnapshots: Array<{
      resourceType: ResourceType
      snapshotId: string
      variant?: string
    }>
    currentRelease: Pick<DatasetRecord, 'releaseId'> | null
    currentReleaseIsCorrected: boolean
    dataset: Pick<DatasetRecord, 'datasetId' | 'releaseCode' | 'releaseId'> & {
      cohortKey?: string
      datasetCode?: string
      source?: string
      sourceVariant?: string
      sourceVersion?: string
    }
    publishedAt: string
    releaseSetId: string
    snapshotId: string
    type: ResourceType
    /** Publish the dataset snapshot, but leave the API release set as draft. */
    deferApiReleaseSet?: boolean
    /** Whether this release-set publication should emit a catalogue revision. */
    publishApiCatalogRevision?: boolean
    /** Whether this release-set publication should update the source release. */
    updateDatasetRelease?: boolean
  },
) {
  const releaseSet = await db
    .select({
      apiCompositionId: metaApiReleaseSets.apiCompositionId,
      apiVersionId: metaApiReleaseSets.apiVersionId,
      apiVersion: metaApiVersions.code,
      apiVersionNumber: metaApiVersions.version,
      apiFamily: metaApiVersions.familyType,
      cohortKey: metaApiReleaseSets.cohortKey,
      code: metaApiReleaseSets.code,
      domainCode: metaApiReleaseSets.domainCode,
      id: metaApiReleaseSets.id,
      regionCode: metaApiReleaseSets.regionCode,
      revision: metaApiReleaseSets.revision,
      rulesetVersion: metaApiReleaseSets.rulesetVersion,
      schemaVersion: metaApiReleaseSets.schemaVersion,
      status: metaApiReleaseSets.status,
    })
    .from(metaApiReleaseSets)
    .innerJoin(metaApiVersions, eq(metaApiReleaseSets.apiVersionId, metaApiVersions.id))
    .where(eq(metaApiReleaseSets.id, args.releaseSetId))
    .limit(1)
    .get()

  if (!releaseSet) {
    throw new Error(`Release set not found: ${args.releaseSetId}`)
  }

  if (releaseSet.status !== 'draft') {
    throw new Error(
      `Published API release set ${releaseSet.code} is immutable; create the next cohort revision instead.`,
    )
  }

  const snapshot = await db
    .select({
      id: metaSnapshots.id,
      code: metaSnapshots.code,
    })
    .from(metaSnapshots)
    .where(eq(metaSnapshots.id, args.snapshotId))
    .limit(1)
    .get()

  if (!snapshot) {
    throw new Error(`Snapshot not found: ${args.snapshotId}`)
  }

  const existingReleaseSetSnapshots = await db
    .select({
      snapshotId: metaApiReleaseSetSnapshots.snapshotId,
      resourceType: metaSnapshots.resourceType,
      variant: metaApiReleaseSetSnapshots.variant,
      role: metaApiReleaseSetSnapshots.role,
      isRequired: metaApiReleaseSetSnapshots.isRequired,
      cohortMatchingMode: metaApiReleaseSetSnapshots.cohortMatchingMode,
      anchorSnapshotId: metaApiReleaseSetSnapshots.anchorSnapshotId,
    })
    .from(metaApiReleaseSetSnapshots)
    .innerJoin(
      metaSnapshots,
      eq(metaApiReleaseSetSnapshots.snapshotId, metaSnapshots.id),
    )
    .where(eq(metaApiReleaseSetSnapshots.apiReleaseSetId, args.releaseSetId))
    .all()

  const composition = await resolveCurrentApiCompositionSafely(
    db,
    releaseSet.apiVersion,
  )
  const compositionMembers = composition
    ? await listApiCompositionMembersSafely(db, composition.id)
    : []
  const datasetVariant = datasetVariantForSource(args.type, args.dataset.source, {
    cohortKey: args.dataset.cohortKey,
    datasetCode: args.dataset.datasetCode,
    sourceVariant: args.dataset.sourceVariant,
    sourceVersion: args.dataset.sourceVersion,
  })
  const datasetMember = compositionMembers.find(
    member =>
      member.domainCode === releaseSet.domainCode &&
      member.resourceType === args.type &&
      member.variant === datasetVariant,
  )
  const releaseSetSnapshots = new Map<
    string,
    {
      anchorSnapshotId: string | null
      isRequired: boolean
      role: string
      snapshotId: string
      cohortMatchingMode: string
      variant: string
    }
  >()

  for (const snapshot of existingReleaseSetSnapshots) {
    releaseSetSnapshots.set(
      buildReleaseSetSnapshotMemberKey(snapshot.resourceType, snapshot.variant),
      {
        role: snapshot.role,
        isRequired: Boolean(snapshot.isRequired),
        cohortMatchingMode: snapshot.cohortMatchingMode,
        anchorSnapshotId: snapshot.anchorSnapshotId ?? null,
        snapshotId: snapshot.snapshotId,
        variant: snapshot.variant,
      },
    )
  }

  for (const snapshot of args.carriedSnapshots) {
    const member = compositionMembers.find(
      candidate =>
        candidate.domainCode === releaseSet.domainCode &&
        candidate.resourceType === snapshot.resourceType &&
        candidate.variant === (snapshot.variant ?? 'default'),
    )
    releaseSetSnapshots.set(
      buildReleaseSetSnapshotMemberKey(
        snapshot.resourceType,
        snapshot.variant ?? 'default',
      ),
      {
        role: member?.role ?? 'supporting',
        isRequired: member?.isRequired ?? true,
        cohortMatchingMode: member?.cohortMatchingMode ?? 'carry_forward_optional',
        anchorSnapshotId: null,
        snapshotId: snapshot.snapshotId,
        variant: snapshot.variant ?? 'default',
      },
    )
  }

  releaseSetSnapshots.set(buildReleaseSetSnapshotMemberKey(args.type, datasetVariant), {
    role: datasetMember?.role ?? 'primary',
    isRequired: datasetMember?.isRequired ?? true,
    cohortMatchingMode: datasetMember?.cohortMatchingMode ?? 'exact_ref',
    anchorSnapshotId: null,
    snapshotId: args.snapshotId,
    variant: datasetVariant,
  })

  for (const member of compositionMembers) {
    if (member.domainCode !== releaseSet.domainCode || !member.anchorResourceType) {
      continue
    }

    const memberSnapshot = releaseSetSnapshots.get(
      buildReleaseSetSnapshotMemberKey(member.resourceType, member.variant),
    )
    const anchorMember = compositionMembers.find(
      candidate =>
        candidate.domainCode === releaseSet.domainCode &&
        candidate.resourceType === member.anchorResourceType,
    )

    if (!memberSnapshot || !anchorMember) continue

    memberSnapshot.anchorSnapshotId =
      releaseSetSnapshots.get(
        buildReleaseSetSnapshotMemberKey(
          anchorMember.resourceType,
          anchorMember.variant,
        ),
      )?.snapshotId ?? null
  }

  const publishedAt = toIsoTimestamp(args.publishedAt)
  const deferApiReleaseSet = args.deferApiReleaseSet === true
  const publishApiCatalogRevision =
    !deferApiReleaseSet && args.publishApiCatalogRevision !== false
  const updateDatasetRelease = args.updateDatasetRelease !== false
  const releaseSetRegionCode = releaseSet.regionCode
  const releaseSetCohortKey = releaseSet.cohortKey

  if (publishApiCatalogRevision && (!releaseSetRegionCode || !releaseSetCohortKey)) {
    throw new Error(
      `Cannot publish API catalogue revision for release set ${releaseSet.code}: regionCode or cohortKey is missing.`,
    )
  }

  // Upload time is not a measure of data currency: a correction for an older
  // cohort must not replace the newest cohort in the live API. The most recent
  // cohort (then its most complete revision) is the active release per API
  // family/version, region, and domain.
  const latestPublishedReleaseSet =
    !deferApiReleaseSet && releaseSetRegionCode && releaseSetCohortKey
      ? await db
          .select({
            id: metaApiReleaseSets.id,
            cohortKey: metaApiReleaseSets.cohortKey,
            revision: metaApiReleaseSets.revision,
          })
          .from(metaApiReleaseSets)
          .where(
            and(
              eq(metaApiReleaseSets.apiVersionId, releaseSet.apiVersionId),
              eq(metaApiReleaseSets.regionCode, releaseSetRegionCode),
              eq(metaApiReleaseSets.domainCode, releaseSet.domainCode),
              ne(metaApiReleaseSets.status, 'draft'),
            ),
          )
          .orderBy(
            desc(metaApiReleaseSets.cohortKey),
            desc(metaApiReleaseSets.revision),
          )
          .limit(1)
          .get()
      : null
  const shouldActivateReleaseSet =
    latestPublishedReleaseSet === null ||
    latestPublishedReleaseSet === undefined ||
    releaseSetCohortKey === null ||
    releaseSetCohortKey > latestPublishedReleaseSet.cohortKey ||
    (releaseSetCohortKey === latestPublishedReleaseSet.cohortKey &&
      releaseSet.revision > latestPublishedReleaseSet.revision)
  const activeReleaseSetId = shouldActivateReleaseSet
    ? args.releaseSetId
    : latestPublishedReleaseSet.id

  const apiCatalogRevision =
    publishApiCatalogRevision && releaseSetRegionCode && releaseSetCohortKey
      ? await prepareApiCatalogRevision(db, {
          apiFamily: releaseSet.apiFamily,
          apiVersion: releaseSet.apiVersion,
          apiVersionId: releaseSet.apiVersionId,
          apiVersionNumber: releaseSet.apiVersionNumber,
          cohortKey: releaseSetCohortKey,
          defaultDomainCode: composition?.defaultDomainCode ?? null,
          domainCode: releaseSet.domainCode,
          publishedAt,
          regionCode: releaseSetRegionCode,
          releaseSetId: releaseSet.id,
          releaseSetRevision: releaseSet.revision,
        })
      : null

  const releaseSetSnapshotIds = [
    ...new Set([...releaseSetSnapshots.values()].map(snapshot => snapshot.snapshotId)),
  ]
  const primarySnapshotId =
    [...releaseSetSnapshots.values()].find(snapshot => snapshot.role === 'primary')
      ?.snapshotId ?? null
  const primarySnapshot = primarySnapshotId
    ? await db
        .select({ id: metaSnapshots.id, code: metaSnapshots.code })
        .from(metaSnapshots)
        .where(eq(metaSnapshots.id, primarySnapshotId))
        .limit(1)
        .get()
    : null
  const primarySnapshotLineageVersions = primarySnapshot
    ? await resolveSnapshotLineageVersions(db, primarySnapshot.id)
    : await resolveSnapshotLineageVersions(db, snapshot.id)
  const sourceSchemaRows = await db
    .select({
      datasetCode: metaDatasets.code,
      source: metaPublishers.code,
      sourceSchemaVersion: metaReleases.sourceSchemaVersion,
      sourceVersion: metaReleases.sourceVersion,
    })
    .from(metaSnapshotSources)
    .innerJoin(metaDatasets, eq(metaSnapshotSources.datasetId, metaDatasets.id))
    .innerJoin(metaPublishers, eq(metaDatasets.publisherId, metaPublishers.id))
    .innerJoin(metaReleases, eq(metaSnapshotSources.sourceReleaseId, metaReleases.id))
    .where(inArray(metaSnapshotSources.snapshotId, releaseSetSnapshotIds))
    .all()
  const sourceReleaseId = await resolveSourceReleaseId(db, args.dataset.releaseId)

  const sourceSchemas = new Map<string, string>()

  for (const row of sourceSchemaRows) {
    const sourceSchemaVersion = await resolveSourceSchemaVersion({
      source: row.source,
      sourceVersion: row.sourceVersion,
      storedSourceSchemaVersion: row.sourceSchemaVersion,
    })
    const current = sourceSchemas.get(row.datasetCode)

    if (current && current !== sourceSchemaVersion) {
      throw new Error(
        `Conflicting source schema versions found for dataset ${row.datasetCode}: ${current} and ${sourceSchemaVersion}.`,
      )
    }

    sourceSchemas.set(row.datasetCode, sourceSchemaVersion)
  }

  const apiFieldFixtureLookup = {
    apiVersion: releaseSet.apiVersion,
    domainCode: releaseSet.domainCode,
    lineageSnapshotVersions: primarySnapshotLineageVersions,
    schemaVersion: releaseSet.schemaVersion,
    rulesetVersion: releaseSet.rulesetVersion,
    sourceSchemas: Object.fromEntries(
      [...sourceSchemas.entries()].sort(([left], [right]) => left.localeCompare(right)),
    ),
  }
  const resolvedApiFieldFixture = deferApiReleaseSet
    ? null
    : resolveApiFieldFixture(apiFieldFixtureLookup)
  const hasBundledApiFieldFixtures = listApiFieldFixtures().some(
    fixture =>
      fixture.apiVersion === releaseSet.apiVersion &&
      fixture.domainCode === releaseSet.domainCode,
  )

  if (!deferApiReleaseSet && !resolvedApiFieldFixture && hasBundledApiFieldFixtures) {
    throw new Error(
      `API field fixture not found. Lookup:\n${JSON.stringify(apiFieldFixtureLookup, null, 2)}`,
    )
  }

  // Some API families do not have bundled field provenance fixtures yet.
  const apiFieldProvenanceRows = resolvedApiFieldFixture
    ? await (async () => {
        const sourceDatasetCodes = [
          ...new Set(
            resolvedApiFieldFixture.fields.map(field => field.sourceDatasetCode),
          ),
        ]
        const sourceDatasets = await db
          .select({
            code: metaDatasets.code,
            id: metaDatasets.id,
          })
          .from(metaDatasets)
          .where(inArray(metaDatasets.code, sourceDatasetCodes))
          .all()
        const sourceDatasetIdsByCode = new Map(
          sourceDatasets.map(dataset => [dataset.code, dataset.id]),
        )

        return resolvedApiFieldFixture.fields.map(field => {
          const sourceDatasetId = sourceDatasetIdsByCode.get(field.sourceDatasetCode)

          if (!sourceDatasetId) {
            throw new Error(`Source dataset not found: ${field.sourceDatasetCode}`)
          }

          return {
            id: buildDeterministicApiFieldProvenanceId({
              apiReleaseSetId: args.releaseSetId,
              apiField: field.apiField,
              variant: field.variant,
              sourceDatasetId,
              sourceFieldPath: field.sourceFieldPath,
              contributionType: field.contributionType,
              priority: field.priority,
            }),
            apiReleaseSetId: args.releaseSetId,
            apiField: field.apiField,
            variant: field.variant ?? null,
            sourceDatasetId,
            sourceFieldPath: field.sourceFieldPath,
            resolverCode: field.resolverCode,
            contributionType: field.contributionType,
            priority: field.priority,
            confidence: field.confidence ?? null,
            versionHash: computeVersionHash({
              apiField: field.apiField,
              apiReleaseSetId: args.releaseSetId,
              variant: field.variant ?? null,
              confidence: field.confidence ?? null,
              contributionType: field.contributionType,
              fixtureVersionHash: resolvedApiFieldFixture.versionHash,
              priority: field.priority,
              resolverCode: field.resolverCode,
              sourceDatasetCode: field.sourceDatasetCode,
              sourceFieldPath: field.sourceFieldPath,
            }),
            createdAt: publishedAt,
            updatedAt: publishedAt,
          }
        })
      })()
    : []

  await runAtomicWriteStatements(db as AtomicWritableDb, tx => {
    const statements: WriteStatement[] = [
      tx
        .update(metaSnapshots)
        .set({
          status: 'published',
          publishedAt,
          validFrom: publishedAt,
          validTo: null,
          updatedAt: publishedAt,
        })
        .where(eq(metaSnapshots.id, args.snapshotId)),
    ]

    statements.push(
      tx
        .delete(metaApiReleaseSetSnapshots)
        .where(eq(metaApiReleaseSetSnapshots.apiReleaseSetId, args.releaseSetId)),
      ...(updateDatasetRelease
        ? [
            tx
              .update(metaReleases)
              .set({
                status: 'published',
                revokedAt: null,
                revocationReason: null,
                updatedAt: publishedAt,
              })
              .where(eq(metaReleases.id, args.dataset.releaseId)),
            ...(sourceReleaseId
              ? [
                  tx
                    .update(metaSourceReleases)
                    .set({
                      status: 'published',
                      revokedAt: null,
                      revocationReason: null,
                      updatedAt: publishedAt,
                    })
                    .where(eq(metaSourceReleases.id, sourceReleaseId)),
                ]
              : []),
          ]
        : []),
    )

    if (!deferApiReleaseSet) {
      statements.push(
        tx
          .update(metaApiReleaseSets)
          .set({
            status: 'archived',
            validTo: publishedAt,
            updatedAt: publishedAt,
          })
          .where(
            and(
              eq(metaApiReleaseSets.apiVersionId, releaseSet.apiVersionId),
              eq(metaApiReleaseSets.regionCode, releaseSet.regionCode),
              eq(metaApiReleaseSets.domainCode, releaseSet.domainCode),
              eq(metaApiReleaseSets.status, 'current'),
              ne(metaApiReleaseSets.id, activeReleaseSetId),
            ),
          ),
        tx
          .update(metaApiReleaseSets)
          .set({
            status: 'current',
            validTo: null,
            updatedAt: publishedAt,
            ...(shouldActivateReleaseSet
              ? { publishedAt, validFrom: publishedAt }
              : {}),
          })
          .where(eq(metaApiReleaseSets.id, activeReleaseSetId)),
        tx
          .delete(metaApiFieldProvenance)
          .where(eq(metaApiFieldProvenance.apiReleaseSetId, args.releaseSetId)),
      )

      if (!shouldActivateReleaseSet) {
        statements.push(
          tx
            .update(metaApiReleaseSets)
            .set({
              status: 'archived',
              publishedAt,
              validFrom: publishedAt,
              validTo: publishedAt,
              updatedAt: publishedAt,
            })
            .where(eq(metaApiReleaseSets.id, args.releaseSetId)),
        )
      }
    }

    if (apiCatalogRevision) {
      statements.push(
        tx.insert(metaApiCatalogRevisions).values({
          id: apiCatalogRevision.id,
          apiVersionId: releaseSet.apiVersionId,
          code: apiCatalogRevision.code,
          regionCode: releaseSetRegionCode,
          publicationDate: apiCatalogRevision.publicationDate,
          revision: apiCatalogRevision.revision,
          defaultDomainCode: composition?.defaultDomainCode ?? null,
          status: 'current',
          publishedAt,
          versionHash: apiCatalogRevision.versionHash,
          createdAt: publishedAt,
          updatedAt: publishedAt,
        }),
      )

      for (const member of apiCatalogRevision.members) {
        statements.push(
          tx.insert(metaApiCatalogRevisionReleaseSets).values({
            apiCatalogRevisionId: apiCatalogRevision.id,
            apiReleaseSetId: member.apiReleaseSetId,
            domainCode: member.domainCode,
            cohortKey: member.cohortKey,
            isDefault: member.isDefault,
            createdAt: publishedAt,
          }),
        )
      }
    }

    for (const snapshotMetadata of releaseSetSnapshots.values()) {
      statements.push(
        tx
          .insert(metaApiReleaseSetSnapshots)
          .values({
            apiReleaseSetId: args.releaseSetId,
            snapshotId: snapshotMetadata.snapshotId,
            variant: snapshotMetadata.variant,
            role: snapshotMetadata.role,
            isRequired: snapshotMetadata.isRequired,
            cohortMatchingMode: snapshotMetadata.cohortMatchingMode,
            anchorSnapshotId: snapshotMetadata.anchorSnapshotId,
            createdAt: publishedAt,
          })
          .onConflictDoUpdate({
            target: [
              metaApiReleaseSetSnapshots.apiReleaseSetId,
              metaApiReleaseSetSnapshots.snapshotId,
              metaApiReleaseSetSnapshots.variant,
            ],
            set: {
              role: snapshotMetadata.role,
              isRequired: snapshotMetadata.isRequired,
              cohortMatchingMode: snapshotMetadata.cohortMatchingMode,
              anchorSnapshotId: snapshotMetadata.anchorSnapshotId,
            },
          }),
      )
    }

    if (!deferApiReleaseSet) {
      for (const row of apiFieldProvenanceRows) {
        statements.push(tx.insert(metaApiFieldProvenance).values(row))
      }
    }

    if (updateDatasetRelease && args.currentRelease) {
      const replacedReason = args.currentReleaseIsCorrected
        ? `Superseded by corrected release ${args.dataset.releaseCode}.`
        : `Replaced by release ${args.dataset.releaseCode}.`

      statements.push(
        tx.insert(metaPublishedDataJournal).values({
          id: crypto.randomUUID(),
          releaseId: args.dataset.releaseId,
          relatedReleaseId: args.currentRelease.releaseId,
          snapshotId: args.snapshotId,
          apiReleaseSetId: args.releaseSetId,
          action: 'published',
          statusFrom: null,
          statusTo: 'published',
          reason: null,
          metadataJson: {
            replacedReleaseId: args.currentRelease.releaseId,
            type: args.type,
          },
          createdAt: publishedAt,
        }),
        tx.insert(metaPublishedDataJournal).values({
          id: crypto.randomUUID(),
          releaseId: args.currentRelease.releaseId,
          relatedReleaseId: args.dataset.releaseId,
          snapshotId: args.snapshotId,
          apiReleaseSetId: args.releaseSetId,
          action: args.currentReleaseIsCorrected ? 'revoked' : 'replaced',
          statusFrom: 'published',
          statusTo: args.currentReleaseIsCorrected ? 'revoked' : 'superseded',
          reason: replacedReason,
          metadataJson: {
            replacementReleaseId: args.dataset.releaseId,
            type: args.type,
          },
          createdAt: publishedAt,
        }),
        tx
          .update(metaReleases)
          .set({
            supersededByReleaseId: args.dataset.releaseId,
            updatedAt: publishedAt,
          })
          .where(eq(metaReleases.id, args.currentRelease.releaseId)),
      )

      if (args.currentReleaseIsCorrected) {
        statements.push(
          tx
            .update(metaReleases)
            .set({
              revokedAt: publishedAt,
              revocationReason: replacedReason,
              status: 'revoked',
              updatedAt: publishedAt,
            })
            .where(eq(metaReleases.id, args.currentRelease.releaseId)),
        )
      } else {
        statements.push(
          tx
            .update(metaReleases)
            .set({
              status: 'superseded',
              updatedAt: publishedAt,
            })
            .where(eq(metaReleases.id, args.currentRelease.releaseId)),
        )
      }
    } else if (updateDatasetRelease) {
      statements.push(
        tx.insert(metaPublishedDataJournal).values({
          id: crypto.randomUUID(),
          releaseId: args.dataset.releaseId,
          relatedReleaseId: null,
          snapshotId: args.snapshotId,
          apiReleaseSetId: args.releaseSetId,
          action: 'published',
          statusFrom: null,
          statusTo: 'published',
          reason: null,
          metadataJson: {
            type: args.type,
          },
          createdAt: publishedAt,
        }),
      )
    }

    return statements
  })

  return apiCatalogRevision
}

export async function publishSnapshot(
  db: HarbourReadableDb & HarbourWritableDb,
  snapshotId: string,
) {
  const snapshot = await db
    .select({
      id: metaSnapshots.id,
    })
    .from(metaSnapshots)
    .where(eq(metaSnapshots.id, snapshotId))
    .limit(1)
    .get()

  if (!snapshot) {
    throw new Error(`Snapshot not found: ${snapshotId}`)
  }

  const now = toIsoTimestamp()

  await db
    .update(metaSnapshots)
    .set({
      status: 'published',
      publishedAt: now,
      validFrom: now,
      validTo: null,
      updatedAt: now,
    })
    .where(eq(metaSnapshots.id, snapshotId))
    .run()
}

export async function resolveShardForTypeRegionYear(
  db: HarbourReadableDb,
  shardType: Extract<DataShardType, 'current' | 'history' | 'source'>,
  environment: 'preview' | 'production',
  regionCode?: string,
  year?: string,
): Promise<DataShardRecord | null> {
  if (shardType === 'current') {
    return (
      ((await db
        .select({
          id: metaDataShards.id,
          bindingName: metaDataShards.bindingName,
          databaseId: metaDataShards.databaseId,
          databaseName: metaDataShards.databaseName,
        })
        .from(metaDataShards)
        .where(
          and(
            eq(metaDataShards.shardType, shardType),
            eq(metaDataShards.environment, environment),
            eq(metaDataShards.status, 'active'),
            isNull(metaDataShards.regionCode),
            isNull(metaDataShards.year),
          ),
        )
        .limit(1)
        .get()) as DataShardRecord | undefined) ?? null
    )
  }

  const requestedYear = year ? Number.parseInt(year, 10) : Number.NaN
  const isBeforeShard =
    year !== undefined &&
    /^\d{4}$/.test(year) &&
    requestedYear < BEFORE_SHARD_CUTOFF_YEAR
  const baseConditions = and(
    eq(metaDataShards.shardType, shardType),
    eq(metaDataShards.environment, environment),
    eq(metaDataShards.status, 'active'),
    regionCode
      ? eq(metaDataShards.regionCode, regionCode)
      : isNull(metaDataShards.regionCode),
  )

  const exactMatch =
    ((await db
      .select({
        id: metaDataShards.id,
        bindingName: metaDataShards.bindingName,
        databaseId: metaDataShards.databaseId,
        databaseName: metaDataShards.databaseName,
      })
      .from(metaDataShards)
      .where(
        and(
          baseConditions,
          isBeforeShard || !year
            ? isNull(metaDataShards.year)
            : eq(metaDataShards.year, year),
        ),
      )
      .limit(1)
      .get()) as DataShardRecord | undefined) ?? null

  if (exactMatch || !year || isBeforeShard) {
    return exactMatch
  }

  if (Number.isNaN(requestedYear)) {
    return null
  }

  const fallbackRows = (await db
    .select({
      id: metaDataShards.id,
      bindingName: metaDataShards.bindingName,
      databaseId: metaDataShards.databaseId,
      databaseName: metaDataShards.databaseName,
      year: metaDataShards.year,
    })
    .from(metaDataShards)
    .where(and(baseConditions, sql`${metaDataShards.year} is not null`))
    .all()) as FallbackShardRow[]

  type FallbackShardRow = {
    id: string
    bindingName: string
    databaseId: string
    databaseName: string
    year: string | null
  }

  const rankedRows = fallbackRows
    .map((row: FallbackShardRow) => ({
      ...row,
      numericYear: row.year ? Number.parseInt(row.year, 10) : Number.NaN,
    }))
    .filter(
      (row: FallbackShardRow & { numericYear: number }) =>
        !Number.isNaN(row.numericYear),
    )
    .sort(
      (
        left: FallbackShardRow & { numericYear: number },
        right: FallbackShardRow & { numericYear: number },
      ) => {
        const leftDistance = Math.abs(left.numericYear - requestedYear)
        const rightDistance = Math.abs(right.numericYear - requestedYear)

        if (leftDistance !== rightDistance) {
          return leftDistance - rightDistance
        }

        return left.numericYear - right.numericYear
      },
    )

  const fallback = rankedRows[0]

  return fallback
    ? {
        id: fallback.id,
        bindingName: fallback.bindingName,
        databaseId: fallback.databaseId,
        databaseName: fallback.databaseName,
      }
    : null
}

function buildReleaseSetSnapshotMemberKey(resourceType: string, variant: string) {
  return `${resourceType}:${variant}`
}

export async function upsertSnapshotSource(
  db: HarbourWritableDb,
  snapshotId: string,
  datasetId: string,
  sourceReleaseId: string,
  role: 'primary' | 'enrichment' | 'fallback' | 'lookup',
  options: {
    anchorReleaseId?: string | null
    selectedByRule?: string | null
    selectionMode?: string | null
    sourceCohortKey?: string | null
  } = {},
) {
  await db
    .insert(metaSnapshotSources)
    .values({
      snapshotId,
      datasetId,
      sourceReleaseId,
      role,
      anchorReleaseId: options.anchorReleaseId ?? null,
      selectedByRule: options.selectedByRule ?? null,
      selectionMode: options.selectionMode ?? null,
      sourceCohortKey: options.sourceCohortKey ?? null,
      createdAt: toIsoTimestamp(),
    })
    .onConflictDoUpdate({
      target: [metaSnapshotSources.snapshotId, metaSnapshotSources.sourceReleaseId],
      set: {
        datasetId,
        role,
        anchorReleaseId: options.anchorReleaseId ?? null,
        selectedByRule: options.selectedByRule ?? null,
        selectionMode: options.selectionMode ?? null,
        sourceCohortKey: options.sourceCohortKey ?? null,
      },
    })
    .run()
}

/**
 * Records a resolved lookup selected by a composition while materialising a
 * snapshot. The lookup snapshot itself identifies the source release, so the
 * consumer never needs to restate a source-level dependency.
 */
export async function recordSnapshotLookupDependency(
  db: HarbourReadableDb & HarbourWritableDb,
  args: {
    anchorReleaseId: string
    lookupSnapshotId: string
    selectedByRule: string
    selectionMode: string
    snapshotId: string
  },
) {
  const lookupSource = await db
    .select({
      datasetId: metaSnapshotSources.datasetId,
      sourceCohortKey: metaSnapshots.cohortKey,
      sourceReleaseId: metaSnapshotSources.sourceReleaseId,
    })
    .from(metaSnapshotSources)
    .innerJoin(metaSnapshots, eq(metaSnapshotSources.snapshotId, metaSnapshots.id))
    .where(
      and(
        eq(metaSnapshotSources.snapshotId, args.lookupSnapshotId),
        eq(metaSnapshotSources.role, 'primary'),
      ),
    )
    .limit(1)
    .get()

  if (!lookupSource) {
    throw new Error(
      `Lookup snapshot ${args.lookupSnapshotId} has no primary source release.`,
    )
  }

  await upsertSnapshotSource(
    db,
    args.snapshotId,
    lookupSource.datasetId,
    lookupSource.sourceReleaseId,
    'lookup',
    {
      anchorReleaseId: args.anchorReleaseId,
      selectedByRule: args.selectedByRule,
      selectionMode: args.selectionMode,
      sourceCohortKey: lookupSource.sourceCohortKey,
    },
  )
}

export async function upsertApiReleaseSetSnapshot(
  db: HarbourWritableDb,
  releaseSetId: string,
  snapshotId: string,
  options: {
    anchorSnapshotId?: string | null
    isRequired?: boolean
    role?: string
    cohortMatchingMode?: string
    variant?: string
  } = {},
) {
  await db
    .insert(metaApiReleaseSetSnapshots)
    .values({
      apiReleaseSetId: releaseSetId,
      snapshotId,
      variant: options.variant ?? 'default',
      role: options.role ?? 'supporting',
      isRequired: options.isRequired ?? true,
      cohortMatchingMode: options.cohortMatchingMode ?? 'carry_forward_optional',
      anchorSnapshotId: options.anchorSnapshotId ?? null,
      createdAt: toIsoTimestamp(),
    })
    .onConflictDoUpdate({
      target: [
        metaApiReleaseSetSnapshots.apiReleaseSetId,
        metaApiReleaseSetSnapshots.snapshotId,
        metaApiReleaseSetSnapshots.variant,
      ],
      set: {
        variant: options.variant ?? 'default',
        role: options.role ?? 'supporting',
        isRequired: options.isRequired ?? true,
        cohortMatchingMode: options.cohortMatchingMode ?? 'carry_forward_optional',
        anchorSnapshotId: options.anchorSnapshotId ?? null,
      },
    })
    .run()
}

export async function deleteApiReleaseSetSnapshot(
  db: HarbourWritableDb,
  releaseSetId: string,
  snapshotId: string,
) {
  await db
    .delete(metaApiReleaseSetSnapshots)
    .where(
      and(
        eq(metaApiReleaseSetSnapshots.apiReleaseSetId, releaseSetId),
        eq(metaApiReleaseSetSnapshots.snapshotId, snapshotId),
      ),
    )
    .run()
}

export async function listApiReleaseSetSnapshots(
  db: HarbourReadableDb,
  releaseSetId: string,
) {
  return db
    .select({
      snapshotResourceType: metaSnapshots.resourceType,
      snapshotId: metaApiReleaseSetSnapshots.snapshotId,
      role: metaApiReleaseSetSnapshots.role,
      variant: metaApiReleaseSetSnapshots.variant,
    })
    .from(metaApiReleaseSetSnapshots)
    .innerJoin(
      metaSnapshots,
      eq(metaApiReleaseSetSnapshots.snapshotId, metaSnapshots.id),
    )
    .where(eq(metaApiReleaseSetSnapshots.apiReleaseSetId, releaseSetId))
    .all()
}

export async function listCurrentSnapshotCleanupCandidates(
  db: HarbourReadableDb,
  options: {
    resourceType?: ResourceType
    snapshotIds?: string[]
  } = {},
) {
  if (options.snapshotIds && options.snapshotIds.length === 0) {
    return []
  }

  const snapshotConditions = [eq(metaSnapshots.status, 'published')]

  if (options.resourceType) {
    snapshotConditions.push(eq(metaSnapshots.resourceType, options.resourceType))
  }

  if (options.snapshotIds && options.snapshotIds.length > 0) {
    snapshotConditions.push(inArray(metaSnapshots.id, options.snapshotIds))
  }

  const snapshots = await db
    .select({
      snapshotId: metaSnapshots.id,
      resourceType: metaSnapshots.resourceType,
    })
    .from(metaSnapshots)
    .where(and(...snapshotConditions))
    .all()

  if (snapshots.length === 0) {
    return []
  }

  let protectedRows: Array<{ snapshotId: string }>
  try {
    const catalogs = await db
      .select({ id: metaApiCatalogRevisions.id })
      .from(metaApiCatalogRevisions)
      .where(eq(metaApiCatalogRevisions.status, 'current'))
      .all()
    const retainedCatalogIds = catalogs.map(catalog => catalog.id)

    protectedRows =
      retainedCatalogIds.length > 0
        ? await db
            .select({ snapshotId: metaApiReleaseSetSnapshots.snapshotId })
            .from(metaApiCatalogRevisionReleaseSets)
            .innerJoin(
              metaApiReleaseSetSnapshots,
              eq(
                metaApiCatalogRevisionReleaseSets.apiReleaseSetId,
                metaApiReleaseSetSnapshots.apiReleaseSetId,
              ),
            )
            .where(
              and(
                inArray(
                  metaApiCatalogRevisionReleaseSets.apiCatalogRevisionId,
                  retainedCatalogIds,
                ),
              ),
            )
            .all()
        : []
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !/no such table: apiCatalog/i.test(error.message)
    ) {
      throw error
    }
    protectedRows = await db
      .select({ snapshotId: metaApiReleaseSetSnapshots.snapshotId })
      .from(metaApiReleaseSetSnapshots)
      .innerJoin(
        metaApiReleaseSets,
        eq(metaApiReleaseSetSnapshots.apiReleaseSetId, metaApiReleaseSets.id),
      )
      .where(ne(metaApiReleaseSets.status, 'archived'))
      .all()
  }
  const protectedSnapshotIds = new Set(protectedRows.map(row => row.snapshotId))

  return snapshots.filter(row => !protectedSnapshotIds.has(row.snapshotId))
}

export async function resolveActiveSnapshotForType(
  db: HarbourReadableDb,
  type: ResourceType,
  resourceType: ResourceType,
  options: {
    domainCode?: string
    regionCode?: RegionCode
    variant?: string
  } = {},
) {
  if (options.regionCode) {
    return (
      (await db
        .select({
          snapshotId: metaApiReleaseSetSnapshots.snapshotId,
          apiReleaseSet: metaApiReleaseSets.code,
          domainCode: metaApiReleaseSets.domainCode,
          schemaVersion: metaApiReleaseSets.schemaVersion,
          rulesetVersion: metaApiReleaseSets.rulesetVersion,
        })
        .from(metaApiReleaseSetSnapshots)
        .innerJoin(
          metaApiReleaseSets,
          eq(metaApiReleaseSetSnapshots.apiReleaseSetId, metaApiReleaseSets.id),
        )
        .innerJoin(
          metaApiVersions,
          eq(metaApiReleaseSets.apiVersionId, metaApiVersions.id),
        )
        .innerJoin(
          metaSnapshots,
          eq(metaApiReleaseSetSnapshots.snapshotId, metaSnapshots.id),
        )
        .innerJoin(
          metaSnapshotSources,
          eq(metaSnapshotSources.snapshotId, metaSnapshots.id),
        )
        .innerJoin(metaDatasets, eq(metaSnapshotSources.datasetId, metaDatasets.id))
        .where(
          and(
            eq(metaApiVersions.code, getApiVersionCodeForType(type)),
            eq(metaApiReleaseSets.status, 'current'),
            eq(metaApiReleaseSets.domainCode, options.domainCode ?? 'default'),
            eq(metaSnapshots.resourceType, resourceType),
            options.variant
              ? eq(metaApiReleaseSetSnapshots.variant, options.variant)
              : undefined,
            eq(metaSnapshotSources.role, 'primary'),
            eq(metaDatasets.regionCode, options.regionCode),
          ),
        )
        .orderBy(
          desc(metaApiReleaseSets.publishedAt),
          desc(metaApiReleaseSets.createdAt),
        )
        .limit(1)
        .get()) ?? null
    )
  }

  const activeReleaseSet = await resolveActiveReleaseSetForType(
    db,
    type,
    options.domainCode ?? 'default',
  )

  if (!activeReleaseSet) {
    return null
  }

  return (
    (await db
      .select({
        snapshotId: metaApiReleaseSetSnapshots.snapshotId,
        apiReleaseSet: metaApiReleaseSets.code,
        domainCode: metaApiReleaseSets.domainCode,
        schemaVersion: metaApiReleaseSets.schemaVersion,
        rulesetVersion: metaApiReleaseSets.rulesetVersion,
      })
      .from(metaApiReleaseSetSnapshots)
      .innerJoin(
        metaApiReleaseSets,
        eq(metaApiReleaseSetSnapshots.apiReleaseSetId, metaApiReleaseSets.id),
      )
      .innerJoin(
        metaSnapshots,
        eq(metaApiReleaseSetSnapshots.snapshotId, metaSnapshots.id),
      )
      .where(
        and(
          eq(metaApiReleaseSetSnapshots.apiReleaseSetId, activeReleaseSet.id),
          eq(metaSnapshots.resourceType, resourceType),
          options.variant
            ? eq(metaApiReleaseSetSnapshots.variant, options.variant)
            : undefined,
        ),
      )
      .limit(1)
      .get()) ?? null
  )
}

export async function resolveApiReleaseSetForRequest(
  db: HarbourReadableDb,
  type: ResourceType,
  args: {
    catalogRevision?: string
    cohortKey?: string
    domainCode: string
    effectiveAt?: string
    knownAt?: string
    regionCode: RegionCode
    releaseSet?: string
  },
) {
  const apiVersionCode = getApiVersionCodeForType(type)
  const apiVersion = await db
    .select({ id: metaApiVersions.id })
    .from(metaApiVersions)
    .where(eq(metaApiVersions.code, apiVersionCode))
    .limit(1)
    .get()
  if (!apiVersion) return null

  const knownAt = args.knownAt ? toIsoTimestamp(args.knownAt) : null
  const catalogRevision = await db
    .select({
      id: metaApiCatalogRevisions.id,
      code: metaApiCatalogRevisions.code,
      publishedAt: metaApiCatalogRevisions.publishedAt,
    })
    .from(metaApiCatalogRevisions)
    .where(
      and(
        eq(metaApiCatalogRevisions.apiVersionId, apiVersion.id),
        eq(metaApiCatalogRevisions.regionCode, args.regionCode),
        eq(metaApiCatalogRevisions.status, 'current'),
        args.catalogRevision
          ? eq(metaApiCatalogRevisions.code, args.catalogRevision)
          : undefined,
        !args.catalogRevision && knownAt
          ? sql`${metaApiCatalogRevisions.publishedAt} <= ${knownAt}`
          : undefined,
      ),
    )
    .orderBy(
      desc(metaApiCatalogRevisions.publishedAt),
      desc(metaApiCatalogRevisions.revision),
    )
    .limit(1)
    .get()
  if (!catalogRevision) return null

  const effectiveAt = args.effectiveAt ? toIsoTimestamp(args.effectiveAt) : null
  const selected = await db
    .select({
      id: metaApiReleaseSets.id,
      code: metaApiReleaseSets.code,
      cohortKey: metaApiCatalogRevisionReleaseSets.cohortKey,
      domainCode: metaApiCatalogRevisionReleaseSets.domainCode,
      effectiveFrom: metaApiReleaseSets.effectiveFrom,
      effectiveTo: metaApiReleaseSets.effectiveTo,
      revision: metaApiReleaseSets.revision,
      schemaVersion: metaApiReleaseSets.schemaVersion,
      rulesetVersion: metaApiReleaseSets.rulesetVersion,
    })
    .from(metaApiCatalogRevisionReleaseSets)
    .innerJoin(
      metaApiReleaseSets,
      eq(metaApiCatalogRevisionReleaseSets.apiReleaseSetId, metaApiReleaseSets.id),
    )
    .where(
      and(
        eq(metaApiCatalogRevisionReleaseSets.apiCatalogRevisionId, catalogRevision.id),
        eq(metaApiCatalogRevisionReleaseSets.domainCode, args.domainCode),
        args.releaseSet ? eq(metaApiReleaseSets.code, args.releaseSet) : undefined,
        !args.releaseSet && args.cohortKey
          ? eq(metaApiCatalogRevisionReleaseSets.cohortKey, args.cohortKey)
          : undefined,
        !args.releaseSet && !args.cohortKey && effectiveAt
          ? and(
              sql`${metaApiReleaseSets.effectiveFrom} <= ${effectiveAt}`,
              sql`(${metaApiReleaseSets.effectiveTo} IS NULL OR ${metaApiReleaseSets.effectiveTo} > ${effectiveAt})`,
            )
          : undefined,
        !args.releaseSet && !args.cohortKey && !effectiveAt
          ? eq(metaApiCatalogRevisionReleaseSets.isDefault, true)
          : undefined,
      ),
    )
    .orderBy(desc(metaApiReleaseSets.effectiveFrom), desc(metaApiReleaseSets.revision))
    .limit(1)
    .get()
  if (!selected) return null

  return {
    ...selected,
    apiCatalogRevision: catalogRevision.code,
    catalogPublishedAt: catalogRevision.publishedAt,
  }
}

export async function resolveApiReleaseSetSnapshotsForRequest(
  db: HarbourReadableDb,
  type: ResourceType,
  args: Parameters<typeof resolveApiReleaseSetForRequest>[2],
) {
  const releaseSet = await resolveApiReleaseSetForRequest(db, type, args)
  if (!releaseSet) return null

  const snapshots = await listApiReleaseSetSnapshots(db, releaseSet.id)
  return { releaseSet, snapshots }
}

export async function upsertReleaseShardAssignment(
  db: HarbourWritableDb,
  releaseId: string,
  dataShardId: string,
) {
  await db
    .insert(metaReleaseShardAssignments)
    .values({
      releaseId,
      dataShardId,
    })
    .onConflictDoNothing()
    .run()
}

export async function upsertSnapshotShardAssignment(
  db: HarbourWritableDb,
  snapshotId: string,
  dataShardId: string,
) {
  await db
    .insert(metaSnapshotShardAssignments)
    .values({ snapshotId, dataShardId })
    .onConflictDoNothing()
    .run()
}

export type SnapshotReplayStep = {
  snapshotId: string
  parentSnapshotId: string | null
  shards: Array<{
    dataShardId: string
    bindingName: string
  }>
}

/**
 * Returns the immutable root-to-leaf branch for fixture applicability. Snapshot
 * codes are labels only; parent links establish the branch relationship.
 */
async function resolveSnapshotLineageVersions(
  db: HarbourReadableDb,
  snapshotId: string,
): Promise<string[]> {
  const leafToRoot: Array<{ code: string; parentSnapshotId: string | null }> = []
  const seen = new Set<string>()
  let cursor: string | null = snapshotId

  while (cursor) {
    if (seen.has(cursor)) {
      throw new Error(`Snapshot parent cycle detected at ${cursor}.`)
    }
    seen.add(cursor)
    const snapshot: { code: string; parentSnapshotId: string | null } | undefined =
      await db
        .select({
          code: metaSnapshots.code,
          parentSnapshotId: metaSnapshots.parentSnapshotId,
        })
        .from(metaSnapshots)
        .where(eq(metaSnapshots.id, cursor))
        .limit(1)
        .get()
    if (!snapshot) throw new Error(`Snapshot not found: ${cursor}.`)
    leafToRoot.push(snapshot)
    cursor = snapshot.parentSnapshotId
  }

  return leafToRoot.reverse().map(snapshot => snapshot.code)
}

/**
 * Returns an immutable snapshot branch from root to leaf together with the
 * history shards containing each delta. It deliberately does not infer shard
 * placement from cohort dates: placement is publication metadata.
 */
export async function resolveSnapshotReplayPlan(
  db: HarbourReadableDb,
  snapshotId: string,
): Promise<SnapshotReplayStep[]> {
  const leafToRoot: Array<{ id: string; parentSnapshotId: string | null }> = []
  const seen = new Set<string>()
  let cursor: string | null = snapshotId

  while (cursor) {
    if (seen.has(cursor)) {
      throw new Error(`Snapshot parent cycle detected at ${cursor}.`)
    }
    seen.add(cursor)
    const snapshot: { id: string; parentSnapshotId: string | null } | undefined =
      await db
        .select({
          id: metaSnapshots.id,
          parentSnapshotId: metaSnapshots.parentSnapshotId,
        })
        .from(metaSnapshots)
        .where(eq(metaSnapshots.id, cursor))
        .limit(1)
        .get()
    if (!snapshot) throw new Error(`Snapshot not found: ${cursor}.`)
    leafToRoot.push(snapshot)
    cursor = snapshot.parentSnapshotId
  }

  const result: SnapshotReplayStep[] = []
  for (const snapshot of leafToRoot.reverse()) {
    const shards = await db
      .select({
        dataShardId: metaSnapshotShardAssignments.dataShardId,
        bindingName: metaDataShards.bindingName,
      })
      .from(metaSnapshotShardAssignments)
      .innerJoin(
        metaDataShards,
        eq(metaSnapshotShardAssignments.dataShardId, metaDataShards.id),
      )
      .where(eq(metaSnapshotShardAssignments.snapshotId, snapshot.id))
      .all()
    result.push({
      snapshotId: snapshot.id,
      parentSnapshotId: snapshot.parentSnapshotId,
      shards,
    })
  }
  return result
}

export async function upsertReleaseSetShardAssignment(
  db: HarbourWritableDb,
  releaseSetId: string,
  dataShardId: string,
) {
  await db
    .insert(metaReleaseSetShardAssignments)
    .values({
      apiReleaseSetId: releaseSetId,
      dataShardId,
    })
    .onConflictDoNothing()
    .run()
}

export async function insertIngestRun(
  db: HarbourReadableDb & HarbourWritableDb,
  releaseId: string,
  phase: string,
  status: IngestRunStatus,
  stats: Record<string, unknown> | string | null,
  startedAt: string,
  finishedAt: string | null,
  error: string | null = null,
) {
  const now = toIsoTimestamp(startedAt)

  await db
    .insert(ingestRuns)
    .values({
      runId: crypto.randomUUID(),
      releaseId,
      phase,
      status,
      stats: normaliseOptionalJsonText(stats),
      error,
      startedAt: now,
      finishedAt,
      createdAt: now,
      updatedAt: now,
    })
    .run()
}

export async function ensureIngestRunStarted(
  db: HarbourReadableDb & HarbourWritableDb,
  releaseId: string,
  phase: string,
  stats: Record<string, unknown> | string | null,
  startedAt: string,
) {
  const now = toIsoTimestamp(startedAt)
  await db
    .insert(ingestRuns)
    .values({
      runId: crypto.randomUUID(),
      releaseId,
      phase,
      status: 'running',
      stats: normaliseOptionalJsonText(stats),
      error: null,
      startedAt,
      finishedAt: null,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing({
      target: [ingestRuns.releaseId, ingestRuns.phase],
    })
    .run()

  const existingRun =
    ((await db
      .select({
        runId: ingestRuns.runId,
        status: ingestRuns.status,
      })
      .from(ingestRuns)
      .where(and(eq(ingestRuns.releaseId, releaseId), eq(ingestRuns.phase, phase)))
      .limit(1)
      .get()) as { runId: string; status: string } | undefined) ?? null

  if (!existingRun) {
    return
  }

  if (existingRun.status === 'running') {
    await db
      .update(ingestRuns)
      .set({
        stats: normaliseOptionalJsonText(stats),
        error: null,
        updatedAt: now,
      })
      .where(eq(ingestRuns.runId, existingRun.runId))
      .run()
    return
  }

  if (existingRun.status !== 'error') {
    return
  }

  await db
    .update(ingestRuns)
    .set({
      status: 'running',
      stats: normaliseOptionalJsonText(stats),
      error: null,
      startedAt,
      finishedAt: null,
      updatedAt: now,
    })
    .where(eq(ingestRuns.runId, existingRun.runId))
    .run()
}

export async function upsertIngestRunStatus(
  db: HarbourReadableDb & HarbourWritableDb,
  releaseId: string,
  phase: string,
  status: IngestRunStatus,
  startedAt: string,
  finishedAt: string | null,
  stats: Record<string, unknown> | string | null,
  error: string | null = null,
) {
  const createdAt = toIsoTimestamp(startedAt)
  const updatedAt = toIsoTimestamp(finishedAt ?? startedAt)
  const normalisedStats = normaliseOptionalJsonText(stats)

  await db
    .insert(ingestRuns)
    .values({
      runId: crypto.randomUUID(),
      releaseId,
      phase,
      status,
      stats: normalisedStats,
      error,
      startedAt,
      finishedAt,
      createdAt,
      updatedAt,
    })
    .onConflictDoUpdate({
      target: [ingestRuns.releaseId, ingestRuns.phase],
      set: {
        status,
        stats: normalisedStats,
        error,
        finishedAt,
        updatedAt,
      },
    })
    .run()
}

export async function updateLatestOpenIngestRun(
  db: HarbourReadableDb & HarbourWritableDb,
  releaseId: string,
  phase: string,
  status: IngestRunStatus,
  finishedAt: string,
  stats: Record<string, unknown> | string | null,
  error: string | null = null,
) {
  const normalisedStats = normaliseOptionalJsonText(stats)
  const openRun =
    ((await db
      .select({
        runId: ingestRuns.runId,
      })
      .from(ingestRuns)
      .where(
        and(
          eq(ingestRuns.releaseId, releaseId),
          eq(ingestRuns.phase, phase),
          eq(ingestRuns.status, 'running'),
        ),
      )
      .orderBy(desc(ingestRuns.startedAt), desc(ingestRuns.runId))
      .limit(1)
      .get()) as { runId: string } | undefined) ?? null

  if (!openRun) {
    return false
  }

  await db
    .update(ingestRuns)
    .set({
      status,
      stats: normalisedStats,
      error,
      finishedAt,
      updatedAt: toIsoTimestamp(finishedAt),
    })
    .where(eq(ingestRuns.runId, openRun.runId))
    .run()

  return true
}

function normaliseOptionalJsonText(
  value: Record<string, unknown> | string | null,
): Record<string, unknown> | string | null {
  if (!value || typeof value !== 'string') {
    return value
  }

  try {
    return JSON.parse(value) as Record<string, unknown>
  } catch {
    return value
  }
}

async function requireDatasetDefinition(
  db: HarbourReadableDb,
  plan: Pick<UploadPlan, 'datasetCode' | 'source' | 'type'>,
) {
  const dataset =
    ((await db
      .select({
        id: metaDatasets.id,
        processingRules: metaDatasets.processingRules,
      })
      .from(metaDatasets)
      .innerJoin(metaPublishers, eq(metaDatasets.publisherId, metaPublishers.id))
      .innerJoin(
        metaDatasetResourceTypes,
        eq(metaDatasetResourceTypes.datasetId, metaDatasets.id),
      )
      .where(
        and(
          eq(metaPublishers.code, publisherCodeForSource(plan.source)),
          eq(metaDatasets.code, plan.datasetCode),
          eq(metaDatasetResourceTypes.resourceType, plan.type),
        ),
      )
      .limit(1)
      .get()) as { id: string; processingRules: unknown } | undefined) ?? null

  if (!dataset) {
    throw new Error(
      `Dataset definition not found for ${plan.source}/${plan.datasetCode}. Seed meta datasets before uploading releases.`,
    )
  }

  return dataset
}
