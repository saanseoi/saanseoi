import { retainCompositionAudits } from '../../provenance/compositionAudit'
import {
  readFieldLineage,
  retainFieldLineage,
} from '../../provenance/fieldLineageStorage'
import type { ProvenanceStore } from '../../provenance/types'
import {
  assertApiReleaseVersions,
  type ApiReleaseVersions,
} from '@repo/db/apiReleaseVersions'
import { selectApiInventory } from './apiInventory'
import { assertCuratedReleaseInputs } from './curatedReleaseInputs'
import {
  retainIngestionProcessingRules,
  processingRulesSelection,
} from './processingRuleDefinitions'
import {
  buildFieldLineageDefinition,
  expandFieldLineage,
  resolveApiResponseFields,
  validateFieldLineageBinding,
} from '@repo/db'
import { recordProcessingRun } from './processingRuns'
import {
  pinApiFieldRules,
  resolvePublisherFieldPaths,
  type ApiFieldInput,
} from '@repo/db/apiFieldInputs'
import { sourceReleasePublicationCondition } from './sourceReleasePublication'
export { resolveAcceptedStatisticSnapshotParent } from './statisticSnapshotParent'
import {
  assertAcceptedDraftSnapshotParent,
  resolveAcceptedSnapshotParent,
} from './snapshotParent'
import { listRetainedGeometrySnapshotIds } from './geometrySnapshotRetention'
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
import { chunkArray } from '../../pipeline/utils'
import { recordEffectiveSnapshotAssembly } from '../../pipeline/db/snapshotAssembly'
import {
  buildDatasetCode,
  datasetVariantForSource,
  publisherCodeForSource,
  resourceTypeCodeSlug,
} from '../../codes'

import type {
  DatasetRecord,
  GeometryStatus,
  RegionCode,
  ResourceType,
  UploadPlan,
} from '../../types'
import { isGeometryResourceType } from '../../types'
import type { HarbourReadableDb, HarbourWritableDb } from './types'
import type {
  ApiFamilyType,
  DataShardType,
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
  metaApiLifecycleJournal,
  metaFieldLineageDefinitions,
  metaApiReleaseSets,
  metaApiVersionReleaseSets,
  metaApiReleaseSetSnapshots,
  metaApiVersions,
  processingRuns,
  metaDatasetTransforms,
  metaDatasets,
  metaLicenses,
  metaPublishers,
  metaDataShards,
  metaReleaseSetLifecycleJournal,
  metaReleaseShardAssignments,
  metaSourceReleases,
  metaSnapshotShardAssignments,
  metaResourceReleases,
  metaSnapshotLineages,
  metaSnapshots,
  metaSnapshotAssemblies,
  metaSnapshotRecipeInputs,
  metaSnapshotResourceReleases,
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
    (compositionRole !== null && compositionRole !== 'primary') ||
    (assemblySourceRole !== null && assemblySourceRole !== 'primary') ||
    sourceRole !== 'primary'
    ? 'supporting'
    : 'primary'
}

type ReleaseProcessingRules = {
  rulesets: Array<{
    rulesetVersion: string
    rules: Array<{
      condition?: string
      i18n: Record<string, { description: string }>
      mappings?: Array<{ from: string; to: string }>
      operationCode: string
      inputs?: string[]
      outputs?: string[]
      kind: 'bulk' | 'record'
    }>
  }>
}

function localeMapFromStoredValue(
  value: unknown,
): Record<string, Record<string, unknown>> {
  if (Array.isArray(value)) {
    return Object.fromEntries(
      value.flatMap(row =>
        row && typeof row === 'object' && typeof row.locale === 'string'
          ? [
              [
                row.locale,
                Object.fromEntries(
                  Object.entries(row).filter(([key]) => key !== 'locale'),
                ),
              ],
            ]
          : [],
      ),
    )
  }
  return value && typeof value === 'object'
    ? (value as Record<string, Record<string, unknown>>)
    : {}
}

function bulkRulesFromProcessingRules(processingRules: unknown) {
  if (!processingRules || typeof processingRules !== 'object') return []
  const rulesets = (processingRules as { rulesets?: unknown }).rulesets
  if (!Array.isArray(rulesets)) return []

  return rulesets.flatMap(ruleset => {
    if (!ruleset || typeof ruleset !== 'object') return []
    const { rules, rulesetVersion } = ruleset as {
      rules?: unknown
      rulesetVersion?: unknown
    }
    if (!Array.isArray(rules) || typeof rulesetVersion !== 'string') return []

    return rules
      .filter(
        (rule): rule is ReleaseProcessingRules['rulesets'][number]['rules'][number] =>
          !!rule && typeof rule === 'object' && rule.kind === 'bulk',
      )
      .map((rule, index) => ({
        rule: {
          ...rule,
          i18n: localeMapFromStoredValue(rule.i18n) as typeof rule.i18n,
        },
        rulesetVersion,
        index,
      }))
  })
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
      status: metaApiVersionReleaseSets.status,
    })
    .from(metaApiReleaseSets)
    .innerJoin(
      metaApiVersionReleaseSets,
      eq(metaApiVersionReleaseSets.apiReleaseSetId, metaApiReleaseSets.id),
    )
    .innerJoin(
      metaApiVersions,
      eq(metaApiVersionReleaseSets.apiVersionId, metaApiVersions.id),
    )
    .where(
      apiVersionId
        ? eq(metaApiVersionReleaseSets.apiVersionId, apiVersionId)
        : undefined,
    )
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
          eq(metaApiVersionReleaseSets.apiVersionId, apiVersionId),
          eq(metaApiReleaseSets.code, releaseCode),
        )
      : apiVersionId
        ? eq(metaApiVersionReleaseSets.apiVersionId, apiVersionId)
        : releaseCode
          ? eq(metaApiReleaseSets.code, releaseCode)
          : undefined
  const releases = await db
    .select({
      id: metaApiReleaseSets.id,
      apiVersionId: metaApiVersionReleaseSets.apiVersionId,
      apiFamily: metaApiVersions.familyType,
      apiVersion: metaApiVersions.code,
      code: metaApiReleaseSets.code,
      regionCode: metaApiReleaseSets.regionCode,
      domainCode: metaApiReleaseSets.domainCode,
      cohortKey: metaApiReleaseSets.cohortKey,
      revision: metaApiReleaseSets.revision,
      schemaVersion: metaApiReleaseSets.schemaVersion,
      rulesetVersion: metaApiReleaseSets.rulesetVersion,
      status: metaApiVersionReleaseSets.status,
      publishedAt: metaApiVersionReleaseSets.publishedAt,
      validFrom: metaApiVersionReleaseSets.validFrom,
      validTo: metaApiVersionReleaseSets.validTo,
      notes: metaApiVersionReleaseSets.notes,
      guide: metaApiVersionReleaseSets.guide,
      versionHash: metaApiReleaseSets.versionHash,
      createdAt: metaApiReleaseSets.createdAt,
      updatedAt: metaApiReleaseSets.updatedAt,
    })
    .from(metaApiReleaseSets)
    .innerJoin(
      metaApiVersionReleaseSets,
      eq(metaApiVersionReleaseSets.apiReleaseSetId, metaApiReleaseSets.id),
    )
    .innerJoin(
      metaApiVersions,
      eq(metaApiVersionReleaseSets.apiVersionId, metaApiVersions.id),
    )
    .where(releaseCondition)
    .orderBy(
      desc(
        sql`coalesce(${metaApiVersionReleaseSets.publishedAt}, ${metaApiReleaseSets.createdAt})`,
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
          category: stats.category,
          measure: stats.measure,
          unit: stats.unit,
          value: stats.value,
          dimension: stats.dimension,
          dimensionValue: stats.dimensionValue,
        })
        .from(stats)
        .where(inArray(stats.apiReleaseSetId, ids))
        .all(),
    ),
  ])

  const snapshotIds = releaseSnapshots.map(
    releaseSnapshot => releaseSnapshot.snapshotId,
  )
  const snapshotResourceReleases = await queryInBatches(snapshotIds, ids =>
    db
      .select()
      .from(metaSnapshotResourceReleases)
      .where(inArray(metaSnapshotResourceReleases.snapshotId, ids))
      .all(),
  )
  const snapshotPolicies = await queryInBatches(snapshotIds, ids =>
    db
      .select({
        snapshotId: metaSchema.metaSnapshotAssemblies.snapshotId,
        snapshotRecipeId: metaSchema.metaSnapshotRecipes.id,
        processingRules: processingRulesSelection(
          metaSchema.metaSnapshotRecipes.processingRules,
        ),
      })
      .from(metaSchema.metaSnapshotAssemblies)
      .innerJoin(
        metaSchema.metaSnapshotRecipes,
        eq(
          metaSchema.metaSnapshotAssemblies.snapshotRecipeId,
          metaSchema.metaSnapshotRecipes.id,
        ),
      )
      .where(inArray(metaSchema.metaSnapshotAssemblies.snapshotId, ids))
      .all(),
  )
  const sourceReleaseIds = [
    ...new Set(snapshotResourceReleases.map(source => source.resourceReleaseId)),
  ]
  const datasetIds = [
    ...new Set(snapshotResourceReleases.map(source => source.datasetId)),
  ]
  const [sourceReleases, datasetI18n] = await Promise.all([
    queryInBatches(sourceReleaseIds, ids =>
      db
        .select({
          id: metaResourceReleases.id,
          datasetId: metaResourceReleases.datasetId,
          code: metaResourceReleases.code,
          datasetCode: metaDatasets.code,
          publisherCode: metaPublishers.code,
          sourceVersion: metaResourceReleases.sourceVersion,
          kind: metaDatasets.kind,
          ingestedAt: metaResourceReleases.ingestedAt,
          processingRules: processingRulesSelection(
            metaResourceReleases.processingRules,
          ),
          resourceTypes: metaDatasets.resourceTypes,
        })
        .from(metaResourceReleases)
        .innerJoin(metaDatasets, eq(metaResourceReleases.datasetId, metaDatasets.id))
        .innerJoin(metaPublishers, eq(metaDatasets.publisherId, metaPublishers.id))
        .where(inArray(metaResourceReleases.id, ids))
        .all(),
    ),
    queryInBatches(datasetIds, ids =>
      db
        .select({ id: metaDatasets.id, i18n: metaDatasets.i18n })
        .from(metaDatasets)
        .where(inArray(metaDatasets.id, ids))
        .all(),
    ).then(
      rows =>
        new Map(
          rows.map(row => [
            row.id,
            localeMapFromStoredValue(row.i18n) as typeof row.i18n,
          ]),
        ),
    ),
  ])
  const resourceTypesByDatasetId = new Map(
    sourceReleases.map(release => [
      release.datasetId,
      new Set<string>(release.resourceTypes),
    ]),
  )

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
        snapshotResourceReleases
          .filter(source => source.snapshotId === snapshot.snapshotId)
          .map(source => source.resourceReleaseId),
      ),
    )
    const ingestedAt = sourceReleases
      .filter(source => releaseSourceIds.has(source.id))
      .map(source => source.ingestedAt)
      .filter((value): value is string => value !== null)
      .sort()
      .at(-1)
    const bulkActions: Array<
      ReleaseProcessingRules['rulesets'][number]['rules'][number] & {
        id: string
        sourceCode?: string
        sourceReleaseCode?: string
        snapshotCode?: string
      }
    > = sourceReleases
      .filter(source => releaseSourceIds.has(source.id))
      .flatMap(source => {
        return bulkRulesFromProcessingRules(source.processingRules).map(
          ({ rule, rulesetVersion, index }) => ({
            ...rule,
            id: `${source.id}:${rulesetVersion}:${index}`,
            sourceCode: source.datasetCode,
            sourceReleaseCode: source.code,
          }),
        )
      })

    for (const policy of snapshotPolicies.filter(policy =>
      snapshots.some(snapshot => snapshot.snapshotId === policy.snapshotId),
    )) {
      const snapshot = snapshots.find(
        snapshot => snapshot.snapshotId === policy.snapshotId,
      )
      for (const { rule, rulesetVersion, index } of bulkRulesFromProcessingRules(
        policy.processingRules,
      )) {
        bulkActions.push({
          ...rule,
          id: `${policy.snapshotRecipeId}:${rulesetVersion}:${index}`,
          snapshotCode: snapshot?.snapshot.code ?? policy.snapshotId,
        })
      }
    }

    return {
      ...release,
      displayStatus,
      ingestedAt: ingestedAt ?? null,
      stats: apiReleaseSetStats.filter(stat => stat.apiReleaseSetId === release.id),
      bulkActions,
      apiReleaseSetSnapshots: snapshots.map(snapshot => ({
        ...snapshot,
        snapshotResourceReleases: snapshotResourceReleases.filter(
          source => source.snapshotId === snapshot.snapshotId,
        ),
      })),
      contributingSources: snapshots.flatMap(snapshot =>
        snapshotResourceReleases
          .filter(
            source =>
              source.snapshotId === snapshot.snapshotId &&
              resourceTypesByDatasetId
                .get(source.datasetId)
                ?.has(snapshot.snapshot.resourceType),
          )
          .flatMap(source => {
            const release = sourceReleases.find(
              candidate => candidate.id === source.resourceReleaseId,
            )
            return release
              ? [
                  {
                    sourceCode: release.datasetCode,
                    sourceReleaseCode: release.code,
                    datasetI18n: datasetI18n.get(release.datasetId) ?? {},
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
                    kind: release.kind,
                    variant: snapshot.variant,
                  },
                ]
              : []
          }),
      ),
    }
  })
}

async function listRegistryReleaseSummaries(
  db: MetaDatabase,
  apiVersionId: string,
  familyType?: (typeof metaApiVersions.$inferSelect)['familyType'],
) {
  const releases = await db
    .select({
      id: metaApiReleaseSets.id,
      apiVersionId: metaApiVersionReleaseSets.apiVersionId,
      apiFamily: metaApiVersions.familyType,
      apiVersion: metaApiVersions.code,
      code: metaApiReleaseSets.code,
      regionCode: metaApiReleaseSets.regionCode,
      domainCode: metaApiReleaseSets.domainCode,
      cohortKey: metaApiReleaseSets.cohortKey,
      revision: metaApiReleaseSets.revision,
      schemaVersion: metaApiReleaseSets.schemaVersion,
      rulesetVersion: metaApiReleaseSets.rulesetVersion,
      status: metaApiVersionReleaseSets.status,
      publishedAt: metaApiVersionReleaseSets.publishedAt,
      validFrom: metaApiVersionReleaseSets.validFrom,
      validTo: metaApiVersionReleaseSets.validTo,
      notes: metaApiVersionReleaseSets.notes,
      guide: metaApiVersionReleaseSets.guide,
      createdAt: metaApiReleaseSets.createdAt,
      updatedAt: metaApiReleaseSets.updatedAt,
    })
    .from(metaApiReleaseSets)
    .innerJoin(
      metaApiVersionReleaseSets,
      eq(metaApiVersionReleaseSets.apiReleaseSetId, metaApiReleaseSets.id),
    )
    .innerJoin(
      metaApiVersions,
      eq(metaApiVersionReleaseSets.apiVersionId, metaApiVersions.id),
    )
    .where(
      familyType
        ? eq(metaApiVersions.familyType, familyType)
        : eq(metaApiVersionReleaseSets.apiVersionId, apiVersionId),
    )
    .orderBy(
      desc(
        sql`coalesce(${metaApiVersionReleaseSets.publishedAt}, ${metaApiReleaseSets.createdAt})`,
      ),
      desc(metaApiReleaseSets.id),
    )
    .all()

  const latestByScope = new Map<string, { cohortKey: string; revision: number }>()
  for (const release of releases) {
    if (release.status === 'draft' || release.cohortKey === null) continue
    const scope = getRegistryReleaseLifecycleScope(
      release.apiFamily,
      release.regionCode,
      release.domainCode,
    )
    const latest = latestByScope.get(scope)
    if (
      !latest ||
      release.cohortKey > latest.cohortKey ||
      (release.cohortKey === latest.cohortKey && release.revision > latest.revision)
    ) {
      latestByScope.set(scope, {
        cohortKey: release.cohortKey,
        revision: release.revision,
      })
    }
  }

  return releases.map(release => ({
    ...release,
    displayStatus: resolveRegistryReleaseDisplayStatus(
      release,
      latestByScope.get(
        getRegistryReleaseLifecycleScope(
          release.apiFamily,
          release.regionCode,
          release.domainCode,
        ),
      ),
    ),
  }))
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
    .orderBy(desc(metaApiVersions.createdAt))
    .limit(registryLimit(limit))
    .all()

  const apiIds = apis.map(api => api.id)
  const lifecycleEvents = await queryInBatches(apiIds, ids =>
    db
      .select()
      .from(metaApiLifecycleJournal)
      .where(inArray(metaApiLifecycleJournal.apiVersionId, ids))
      .orderBy(asc(metaApiLifecycleJournal.occurredAt))
      .all(),
  )
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
  for (const member of members)
    member.i18n = localeMapFromStoredValue(member.i18n) as typeof member.i18n
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

  const firstCurrentAt = new Map<string, string>()
  for (const event of lifecycleEvents) {
    if (event.statusTo === 'current' && !firstCurrentAt.has(event.apiVersionId)) {
      firstCurrentAt.set(event.apiVersionId, event.occurredAt)
    }
  }

  return apis
    .sort((left, right) =>
      (firstCurrentAt.get(right.id) ?? right.createdAt).localeCompare(
        firstCurrentAt.get(left.id) ?? left.createdAt,
      ),
    )
    .map(api => ({
      ...api,
      publishedAt: firstCurrentAt.get(api.id) ?? null,
      lifecycleEvents: lifecycleEvents.filter(event => event.apiVersionId === api.id),
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
      .orderBy(
        desc(sql`(
          SELECT MIN(${metaApiLifecycleJournal.occurredAt})
          FROM ${metaApiLifecycleJournal}
          WHERE ${metaApiLifecycleJournal.apiVersionId} = ${metaApiVersions.id}
            AND ${metaApiLifecycleJournal.statusTo} = 'current'
        )`),
        desc(metaApiVersions.createdAt),
      )
      .limit(registryLimit(limit))
      .all(),
    db
      .select({
        id: metaApiComposition.id,
        apiVersionId: metaApiComposition.apiVersionId,
        defaultDomainCode: metaApiComposition.defaultDomainCode,
        status: metaApiComposition.status,
        version: metaApiComposition.version,
      })
      .from(metaApiComposition)
      .where(eq(metaApiComposition.status, 'current'))
      .orderBy(desc(metaApiComposition.version))
      .all(),
  ])

  const members = await queryInBatches(
    compositions.map(row => row.id),
    ids =>
      db
        .select()
        .from(metaApiCompositionMembers)
        .where(inArray(metaApiCompositionMembers.apiCompositionId, ids))
        .all(),
  )
  for (const member of members)
    member.i18n = localeMapFromStoredValue(member.i18n) as typeof member.i18n

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
      apiComposition: composition
        ? [
            {
              ...composition,
              apiCompositionMembers: members.filter(
                member => member.apiCompositionId === composition.id,
              ),
            },
          ]
        : [],
    }
  })
}

export async function getRegistryApi(
  db: MetaDatabase,
  id: string,
  options: { releaseCode?: string } = {},
) {
  const candidates = await db
    .select()
    .from(metaApiVersions)
    .where(
      or(
        eq(metaApiVersions.id, id),
        eq(metaApiVersions.code, id),
        sql`${metaApiVersions.familyType} = ${id}`,
      ),
    )
    .all()
  candidates.sort(
    (left, right) =>
      Number(right.status === 'current') - Number(left.status === 'current') ||
      right.version.localeCompare(left.version, undefined, { numeric: true }),
  )
  const defaultApi =
    candidates.find(candidate => candidate.id === id || candidate.code === id) ??
    candidates[0]
  if (!defaultApi) return null

  // Family URLs span contract versions; explicit API IDs remain version-scoped.
  const isFamily = id === defaultApi.familyType
  const summaries = await listRegistryReleaseSummaries(
    db,
    defaultApi.id,
    isFamily ? defaultApi.familyType : undefined,
  )
  const rank = new Map(candidates.map((candidate, index) => [candidate.id, index]))
  summaries.sort(
    (left, right) =>
      (rank.get(left.apiVersionId) ?? 0) - (rank.get(right.apiVersionId) ?? 0),
  )
  const seen = new Set<string>()
  const familyReleases = summaries.filter(release => {
    if (seen.has(release.id)) return false
    seen.add(release.id)
    return true
  })
  const selected = familyReleases.find(release => release.code === options.releaseCode)
  const api =
    candidates.find(candidate => candidate.id === selected?.apiVersionId) ?? defaultApi

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
  for (const member of members)
    member.i18n = localeMapFromStoredValue(member.i18n) as typeof member.i18n
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
  const detailed = options.releaseCode
    ? await listRegistryReleases(db, undefined, 0, api.id, options.releaseCode)
    : (
        await Promise.all(
          (isFamily ? candidates : [api]).map(candidate =>
            listRegistryReleases(db, undefined, 0, candidate.id),
          ),
        )
      ).flat()
  const releases = familyReleases.map(release => {
    const detail = detailed.find(
      item => item.id === release.id && item.apiVersionId === release.apiVersionId,
    )
    return detail ? { ...detail, displayStatus: release.displayStatus } : release
  })

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

const apiFieldLineageSelection = {
  id: metaApiFieldProvenance.apiReleaseSetId,
  definitionId: metaApiFieldProvenance.definitionId,
  binding: metaApiFieldProvenance.binding,
  schemaVersion: metaFieldLineageDefinitions.schemaVersion,
  manifestHash: metaFieldLineageDefinitions.manifestHash,
  manifestByteLength: metaFieldLineageDefinitions.manifestByteLength,
  compositionId: metaApiVersionReleaseSets.apiCompositionId,
}

export async function listRegistryApiFields(db: MetaDatabase, limit?: number) {
  return db
    .select(apiFieldLineageSelection)
    .from(metaApiFieldProvenance)
    .innerJoin(
      metaFieldLineageDefinitions,
      eq(metaApiFieldProvenance.definitionId, metaFieldLineageDefinitions.id),
    )
    .innerJoin(
      metaApiReleaseSets,
      eq(metaApiFieldProvenance.apiReleaseSetId, metaApiReleaseSets.id),
    )
    .innerJoin(
      metaApiVersionReleaseSets,
      eq(metaApiVersionReleaseSets.apiReleaseSetId, metaApiReleaseSets.id),
    )
    .orderBy(metaApiFieldProvenance.apiReleaseSetId)
    .limit(registryLimit(limit))
    .all()
}

export async function getRegistryApiField(
  db: MetaDatabase,
  id: string,
  store: ProvenanceStore,
) {
  const row =
    (await db
      .select(apiFieldLineageSelection)
      .from(metaApiFieldProvenance)
      .innerJoin(
        metaFieldLineageDefinitions,
        eq(metaApiFieldProvenance.definitionId, metaFieldLineageDefinitions.id),
      )
      .innerJoin(
        metaApiReleaseSets,
        eq(metaApiFieldProvenance.apiReleaseSetId, metaApiReleaseSets.id),
      )
      .innerJoin(
        metaApiVersionReleaseSets,
        eq(metaApiVersionReleaseSets.apiReleaseSetId, metaApiReleaseSets.id),
      )
      .where(eq(metaApiFieldProvenance.apiReleaseSetId, id))
      .get()) ?? null
  return row
    ? {
        ...row,
        definition: await readFieldLineage(store, { ...row, id: row.definitionId }),
      }
    : null
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
  kind: metaDatasets.kind,
  sourceVariant: metaDatasets.sourceVariant,
  sourceCrs: metaDatasets.sourceCrs,
  sourceUrl: metaDatasets.sourceUrl,
  schemaURL: metaDatasets.schemaURL,
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
  i18n: metaDatasets.i18n,
  resourceTypes: metaDatasets.resourceTypes,
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
  const [transforms, sourceVersions, publishers] = await Promise.all([
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
    datasetI18n: localeMapFromStoredValue(source.i18n) as typeof source.i18n,
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
      i18n: metaDatasets.i18n,
      publisherI18n: metaPublishers.i18n,
      publisherId: metaDatasets.publisherId,
      publisherCode: metaPublishers.code,
      code: metaDatasets.code,
      regionCode: metaDatasets.regionCode,
      releaseFrequency: metaDatasets.releaseFrequency,
      resourceTypes: metaDatasets.resourceTypes,
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
  const [sourceVersions] = await Promise.all([
    queryInBatches(sourceIds, ids =>
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
            inArray(metaSourceReleases.datasetId, ids),
            eq(metaSourceReleases.status, 'current'),
          ),
        )
        .orderBy(
          desc(metaSourceReleases.publicationDate),
          desc(metaSourceReleases.createdAt),
        )
        .all(),
    ),
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
            id: metaResourceReleases.id,
            sourceReleaseId: metaResourceReleases.sourceReleaseId,
          })
          .from(metaResourceReleases)
          .where(inArray(metaResourceReleases.sourceReleaseId, ids))
          .all(),
      )
    : []
  const resourceReleaseIds = resourceReleases.map(release => release.id)

  const [releaseStats, releaseAs] = resourceReleaseIds.length
    ? await Promise.all([
        queryInBatches(resourceReleaseIds, ids =>
          db
            .select({
              resourceReleaseId: stats.resourceReleaseId,
              category: stats.category,
              measure: stats.measure,
              unit: stats.unit,
              value: stats.value,
              dimension: stats.dimension,
              dimensionValue: stats.dimensionValue,
            })
            .from(stats)
            .where(
              and(
                inArray(stats.resourceReleaseId, ids),
                eq(stats.category, 'records'),
                eq(stats.measure, 'count'),
                eq(stats.unit, 'count'),
                isNull(stats.dimension),
                isNull(stats.dimensionValue),
              ),
            )
            .all(),
        ),
        queryInBatches(resourceReleaseIds, ids =>
          db
            .select({
              sourceReleaseId: metaResourceReleases.sourceReleaseId,
              apiFamily: metaApiVersions.familyType,
              domainCode: metaApiReleaseSets.domainCode,
            })
            .from(metaSnapshotResourceReleases)
            .innerJoin(
              metaResourceReleases,
              eq(
                metaSnapshotResourceReleases.resourceReleaseId,
                metaResourceReleases.id,
              ),
            )
            .innerJoin(
              metaSnapshots,
              eq(metaSnapshotResourceReleases.snapshotId, metaSnapshots.id),
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
              metaApiVersionReleaseSets,
              eq(metaApiVersionReleaseSets.apiReleaseSetId, metaApiReleaseSets.id),
            )
            .innerJoin(
              metaApiVersions,
              eq(metaApiVersionReleaseSets.apiVersionId, metaApiVersions.id),
            )
            .where(
              and(
                inArray(metaSnapshotResourceReleases.resourceReleaseId, ids),
                ne(metaSnapshotResourceReleases.role, 'lookup'),
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
      publisherI18n: localeMapFromStoredValue(
        source.publisherI18n,
      ) as typeof source.publisherI18n,
    },
    datasetI18n: localeMapFromStoredValue(source.i18n) as typeof source.i18n,
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
          stats:
            resourceIds.length === 1
              ? releaseStats.filter(stat =>
                  resourceIds.includes(stat.resourceReleaseId ?? ''),
                )
              : [],
        }
      }),
  }))
}

export async function getRegistrySource(db: MetaDatabase, id: string) {
  const source = await getRegistrySourceRecord(db, id)

  if (!source) return null

  const [transforms, sourceVersions, publisher] = await Promise.all([
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
    datasetI18n: localeMapFromStoredValue(source.i18n) as typeof source.i18n,
    transforms,
    sourceVersions,
  }
}

async function getRegistrySourceRecord(db: MetaDatabase, id: string) {
  const source = await db
    .select(registrySourceSelection)
    .from(metaDatasets)
    .innerJoin(metaPublishers, eq(metaDatasets.publisherId, metaPublishers.id))
    .leftJoin(metaLicenses, eq(metaDatasets.licenseId, metaLicenses.id))
    .where(sql`${metaDatasets.id} = ${id} or ${metaDatasets.code} = ${id}`)
    .limit(1)
    .get()
  return source
    ? { ...source, i18n: localeMapFromStoredValue(source.i18n) as typeof source.i18n }
    : null
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

  const [sourceVersions, publisher] = await Promise.all([
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
          processingRules: processingRulesSelection(metaSourceReleases.processingRules),
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
    datasetI18n: localeMapFromStoredValue(source.i18n) as typeof source.i18n,
    sourceVersions,
    selectedReleaseCode: releaseCode,
    timings,
  }
}

export async function getRegistrySourceRelease(
  db: MetaDatabase,
  id: string,
  releaseCode: string,
  options: {
    content?:
      | 'all'
      | 'assembly'
      | 'audit'
      | 'minimal'
      | 'notes'
      | 'releases'
      | 'resources'
      | 'stats'
  } = {},
) {
  const source = await getRegistrySourceRecord(db, id)
  if (!source) return null

  const [transforms, sourceVersions, publisher] = await Promise.all([
    db
      .select()
      .from(metaDatasetTransforms)
      .where(eq(metaDatasetTransforms.datasetId, source.id))
      .all(),
    queryRegistrySourceVersions(db, source.id, undefined, releaseCode, options),
    getRegistrySourcePublisher(db, source.publisherId),
  ])

  return {
    ...source,
    publisher,
    datasetI18n: localeMapFromStoredValue(source.i18n) as typeof source.i18n,
    transforms,
    sourceVersions,
  }
}

async function queryRegistrySourceVersions(
  db: MetaDatabase,
  datasetId?: string,
  limit?: number,
  sourceReleaseCode?: string,
  options: {
    content?:
      | 'all'
      | 'assembly'
      | 'audit'
      | 'minimal'
      | 'notes'
      | 'releases'
      | 'resources'
      | 'stats'
  } = {},
) {
  const content = options.content ?? 'all'
  const includeStats = content === 'all' || content === 'stats'
  const includeReleaseAs =
    content === 'all' || content === 'assembly' || content === 'releases'
  const includeAssembly = content === 'all' || content === 'assembly'
  const sourceReleases = await db
    .select({
      id: metaSourceReleases.id,
      datasetId: metaSourceReleases.datasetId,
      datasetCode: metaDatasets.code,
      code: metaSourceReleases.code,
      sourceVersion: metaSourceReleases.sourceVersion,
      sourceSchemaVersion: metaSourceReleases.sourceSchemaVersion,
      processingRules: processingRulesSelection(metaSourceReleases.processingRules),
      publicationDate: metaSourceReleases.publicationDate,
      cohortKey: metaSourceReleases.cohortKey,
      releaseNotesUrl: metaSourceReleases.releaseNotesUrl,
      notes: metaSourceReleases.notes,
      status: metaSourceReleases.status,
      revokedAt: metaSourceReleases.revokedAt,
      revocationReason: metaSourceReleases.revocationReason,
      supersededByResourceReleaseId: metaSourceReleases.supersededBySourceReleaseId,
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
  const resourceReleases =
    includeStats || includeReleaseAs || content === 'resources'
      ? await queryInBatches(sourceReleaseIds, ids =>
          db
            .select({
              id: metaResourceReleases.id,
              sourceReleaseId: metaResourceReleases.sourceReleaseId,
              resourceType: metaResourceReleases.resourceType,
              status: metaResourceReleases.status,
            })
            .from(metaResourceReleases)
            .where(inArray(metaResourceReleases.sourceReleaseId, ids))
            .all(),
        )
      : []
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
  const releaseStats = includeStats
    ? await queryInBatches(resourceReleaseIds, ids =>
        db
          .select({
            resourceReleaseId: stats.resourceReleaseId,
            category: stats.category,
            measure: stats.measure,
            unit: stats.unit,
            value: stats.value,
            dimension: stats.dimension,
            dimensionValue: stats.dimensionValue,
          })
          .from(stats)
          .where(inArray(stats.resourceReleaseId, ids))
          .all(),
      )
    : []
  const releaseAs = includeReleaseAs
    ? await queryInBatches(resourceReleaseIds, ids =>
        db
          .select({
            apiFamily: metaApiVersions.familyType,
            apiReleaseSetId: metaApiReleaseSets.id,
            apiVersion: metaApiVersions.version,
            apiReleaseSetRole: metaApiReleaseSetSnapshots.role,
            assemblySourceRole: metaSnapshotRecipeInputs.role,
            cohortKey: metaApiReleaseSets.cohortKey,
            code: metaApiReleaseSets.code,
            revision: metaApiReleaseSets.revision,
            compositionRole: metaApiCompositionMembers.role,
            domainCode: metaApiReleaseSets.domainCode,
            resourceType: metaSnapshots.resourceType,
            sourceReleaseId: metaSnapshotResourceReleases.resourceReleaseId,
            sourceRole: metaSnapshotResourceReleases.role,
            snapshotCode: metaSnapshots.code,
            variant: metaApiReleaseSetSnapshots.variant,
          })
          .from(metaSnapshotResourceReleases)
          .innerJoin(
            metaSnapshots,
            eq(metaSnapshotResourceReleases.snapshotId, metaSnapshots.id),
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
            metaApiVersionReleaseSets,
            eq(metaApiVersionReleaseSets.apiReleaseSetId, metaApiReleaseSets.id),
          )
          .innerJoin(
            metaApiVersions,
            eq(metaApiVersionReleaseSets.apiVersionId, metaApiVersions.id),
          )
          .leftJoin(
            metaSnapshotAssemblies,
            eq(metaSnapshotAssemblies.snapshotId, metaSnapshots.id),
          )
          .leftJoin(
            metaSnapshotRecipeInputs,
            and(
              eq(
                metaSnapshotRecipeInputs.snapshotRecipeId,
                metaSnapshotAssemblies.snapshotRecipeId,
              ),
              eq(
                metaSnapshotRecipeInputs.datasetId,
                metaSnapshotResourceReleases.datasetId,
              ),
              eq(metaSnapshotRecipeInputs.role, metaSnapshotResourceReleases.role),
            ),
          )
          .leftJoin(
            metaApiComposition,
            eq(metaApiComposition.apiVersionId, metaApiVersionReleaseSets.apiVersionId),
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
              inArray(metaSnapshotResourceReleases.resourceReleaseId, ids),
              ne(metaSnapshotResourceReleases.role, 'lookup'),
            ),
          )
          .orderBy(
            desc(metaApiVersionReleaseSets.publishedAt),
            desc(metaApiReleaseSets.createdAt),
          )
          .all(),
      )
    : []
  const assembledReleaseSetIds = [
    ...new Set(releaseAs.map(item => item.apiReleaseSetId)),
  ]
  const assemblySourceRows = includeAssembly
    ? await queryInBatches(assembledReleaseSetIds, ids =>
        db
          .select({
            apiReleaseSetId: metaApiReleaseSets.id,
            datasetCode: metaDatasets.code,
            datasetId: metaDatasets.id,
            publisherId: metaDatasets.publisherId,
            role: metaSnapshotResourceReleases.role,
            sourceReleaseCode: metaSourceReleases.code,
            sourceVersion: metaSourceReleases.sourceVersion,
          })
          .from(metaApiReleaseSets)
          .innerJoin(
            metaApiVersionReleaseSets,
            eq(metaApiVersionReleaseSets.apiReleaseSetId, metaApiReleaseSets.id),
          )
          .innerJoin(
            metaApiReleaseSetSnapshots,
            eq(metaApiReleaseSetSnapshots.apiReleaseSetId, metaApiReleaseSets.id),
          )
          .innerJoin(
            metaSnapshotResourceReleases,
            eq(
              metaSnapshotResourceReleases.snapshotId,
              metaApiReleaseSetSnapshots.snapshotId,
            ),
          )
          .innerJoin(
            metaResourceReleases,
            eq(metaSnapshotResourceReleases.resourceReleaseId, metaResourceReleases.id),
          )
          .innerJoin(
            metaSourceReleases,
            eq(metaResourceReleases.sourceReleaseId, metaSourceReleases.id),
          )
          .innerJoin(metaDatasets, eq(metaSourceReleases.datasetId, metaDatasets.id))
          .where(
            and(
              inArray(metaApiReleaseSets.id, ids),
              ne(metaSnapshotResourceReleases.role, 'lookup'),
            ),
          )
          .all(),
      )
    : []
  const assemblyDatasetIds = [
    ...new Set(assemblySourceRows.map(source => source.datasetId)),
  ]
  const assemblyDatasetI18n = await queryInBatches(assemblyDatasetIds, ids =>
    db
      .select({ id: metaDatasets.id, i18n: metaDatasets.i18n })
      .from(metaDatasets)
      .where(inArray(metaDatasets.id, ids))
      .all(),
  ).then(
    rows =>
      new Map(
        rows.map(row => [
          row.id,
          localeMapFromStoredValue(row.i18n) as typeof row.i18n,
        ]),
      ),
  )
  const assemblyPublisherIds = [
    ...new Set(assemblySourceRows.map(source => source.publisherId)),
  ]
  const assemblyPublisherI18n = await queryInBatches(assemblyPublisherIds, ids =>
    db
      .select({ id: metaPublishers.id, i18n: metaPublishers.i18n })
      .from(metaPublishers)
      .where(inArray(metaPublishers.id, ids))
      .all(),
  ).then(
    rows =>
      new Map(
        rows.map(row => [
          row.id,
          localeMapFromStoredValue(row.i18n) as typeof row.i18n,
        ]),
      ),
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
            datasetI18n: assemblyDatasetI18n.get(source.datasetId) ?? {},
            publisherI18n: assemblyPublisherI18n.get(source.publisherId) ?? {},
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
      resources: resourceReleases
        .filter(resource => resource.sourceReleaseId === release.id)
        .map(resource => ({
          id: resource.id,
          resourceType: resource.resourceType,
          status: resource.status,
          stats: releaseStats.filter(stat => stat.resourceReleaseId === resource.id),
        })),
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
      stats:
        resourceIds.length === 1
          ? releaseStats.filter(stat =>
              resourceIds.includes(stat.resourceReleaseId ?? ''),
            )
          : [],
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
      .from(metaResourceReleases)
      .where(
        sql`${metaResourceReleases.id} = ${id} or ${metaResourceReleases.code} = ${id}`,
      )
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

  return publishers.map(publisher => ({
    ...publisher,
    publisherI18n: localeMapFromStoredValue(publisher.i18n) as typeof publisher.i18n,
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

  return {
    ...publisher,
    publisherI18n: localeMapFromStoredValue(publisher.i18n) as typeof publisher.i18n,
  }
}

type LatestDatasetLookup = {
  latestDataset: DatasetRecord | null
}

type DatasetIdentityRecord = {
  resourceType: ResourceType
  source: string
  datasetId: string
  datasetCode: string
  resourceReleaseId: string
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
  id: metaResourceReleases.id,
  datasetId: metaDatasets.id,
  datasetCode: metaDatasets.code,
  resourceReleaseId: metaResourceReleases.id,
  releaseCode: metaResourceReleases.code,
  regionCode: metaDatasets.regionCode,
  cohortKey: metaResourceReleases.cohortKey,
  geometryStatus: metaResourceReleases.geometryStatus,
  theme: metaDatasets.theme,
  resourceType: metaResourceReleases.resourceType,
  sourceVariant: metaDatasets.sourceVariant,
  sourceCrs: metaDatasets.sourceCrs,
  source: metaPublishers.code,
  sourceVersion: metaResourceReleases.sourceVersion,
  releaseNotesUrl: metaResourceReleases.releaseNotesUrl,
  status: metaResourceReleases.status,
  supersedesDatasetId: sql<string | null>`null`,
  supersededByResourceReleaseId: metaResourceReleases.supersededByResourceReleaseId,
  revokedAt: metaResourceReleases.revokedAt,
  revocationReason: metaResourceReleases.revocationReason,
  ingestedAt: metaResourceReleases.ingestedAt,
  createdAt: metaResourceReleases.createdAt,
  updatedAt: metaResourceReleases.updatedAt,
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
        try {
          await statement.run()
        } catch (error) {
          console.error('FAILING STATEMENT', (statement as any).toSQL())
          throw error
        }
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
  resourceType: ResourceType,
): Promise<LatestDatasetLookup> {
  const datasetRows = (await db
    .select(releaseRecordSelection)
    .from(metaResourceReleases)
    .innerJoin(metaDatasets, eq(metaResourceReleases.datasetId, metaDatasets.id))
    .innerJoin(metaPublishers, eq(metaDatasets.publisherId, metaPublishers.id))
    .where(
      and(
        eq(metaDatasets.regionCode, regionCode),
        eq(metaPublishers.code, publisherCodeForSource(source)),
        // A publisher can publish more than one product in the same resource
        // type and cohort. Upload chronology and schema compatibility belong
        // to that product's dataset lineage, never to the publisher broadly.
        eq(metaDatasets.code, datasetCode),
        eq(metaResourceReleases.resourceType, resourceType),
        ne(metaResourceReleases.status, 'failed'),
        ne(metaResourceReleases.status, 'uploading'),
      ),
    )
    .orderBy(desc(metaResourceReleases.ingestedAt))
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
  resourceReleaseId: string,
) {
  const release = await getDatasetRecordByReleaseId(db, resourceReleaseId)

  if (!release) {
    return null
  }

  const datasetRows = (await db
    .select(releaseRecordSelection)
    .from(metaResourceReleases)
    .innerJoin(metaDatasets, eq(metaResourceReleases.datasetId, metaDatasets.id))
    .innerJoin(metaPublishers, eq(metaDatasets.publisherId, metaPublishers.id))
    .where(
      and(
        eq(metaResourceReleases.datasetId, release.datasetId),
        ne(metaResourceReleases.id, resourceReleaseId),
        ne(metaResourceReleases.status, 'failed'),
        ne(metaResourceReleases.status, 'uploading'),
      ),
    )
    .orderBy(desc(metaResourceReleases.ingestedAt))
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
  resourceType: ResourceType,
) {
  const existing =
    ((await db
      .select({
        datasetId: metaDatasets.id,
        resourceReleaseId: metaResourceReleases.id,
        releaseCode: metaResourceReleases.code,
      })
      .from(metaResourceReleases)
      .innerJoin(metaDatasets, eq(metaResourceReleases.datasetId, metaDatasets.id))
      .innerJoin(metaPublishers, eq(metaDatasets.publisherId, metaPublishers.id))
      .where(
        and(
          eq(metaDatasets.regionCode, regionCode),
          eq(metaResourceReleases.cohortKey, cohortKey),
          eq(metaPublishers.code, publisherCodeForSource(source)),
          eq(metaResourceReleases.resourceType, resourceType),
          ne(metaResourceReleases.status, 'failed'),
        ),
      )
      .limit(1)
      .get()) as
      | { datasetId: string; resourceReleaseId: string; releaseCode: string }
      | undefined) ?? null

  return existing
}

export async function getDatasetById(db: HarbourReadableDb, releaseCode: string) {
  return (
    ((await db
      .select({
        resourceType: metaResourceReleases.resourceType,
        source: metaPublishers.code,
        datasetId: metaDatasets.id,
        datasetCode: metaDatasets.code,
        resourceReleaseId: metaResourceReleases.id,
        releaseCode: metaResourceReleases.code,
        status: metaResourceReleases.status,
      })
      .from(metaResourceReleases)
      .innerJoin(metaDatasets, eq(metaResourceReleases.datasetId, metaDatasets.id))
      .innerJoin(metaPublishers, eq(metaDatasets.publisherId, metaPublishers.id))
      .where(eq(metaResourceReleases.code, releaseCode))
      .limit(1)
      .get()) as DatasetIdentityRecord | undefined) ?? null
  )
}

export async function listProcessingRunStatesForRelease(
  db: HarbourReadableDb,
  resourceReleaseId: string,
) {
  return db
    .select({
      phase: metaSchema.processingRuns.phase,
      status: metaSchema.processingRuns.status,
    })
    .from(metaSchema.processingRuns)
    .where(eq(metaSchema.processingRuns.resourceReleaseId, resourceReleaseId))
    .all()
}

export async function getDatasetRecordByReleaseId(
  db: HarbourReadableDb,
  resourceReleaseId: string,
) {
  return (
    ((await db
      .select(releaseRecordSelection)
      .from(metaResourceReleases)
      .innerJoin(metaDatasets, eq(metaResourceReleases.datasetId, metaDatasets.id))
      .innerJoin(metaPublishers, eq(metaDatasets.publisherId, metaPublishers.id))
      .where(eq(metaResourceReleases.id, resourceReleaseId))
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
      .from(metaResourceReleases)
      .innerJoin(metaDatasets, eq(metaResourceReleases.datasetId, metaDatasets.id))
      .innerJoin(metaPublishers, eq(metaDatasets.publisherId, metaPublishers.id))
      .where(eq(metaResourceReleases.code, releaseCode))
      .limit(1)
      .get()) as DatasetRecord | undefined) ?? null
  )
}

export async function resolveDatasetRecord(
  db: HarbourReadableDb,
  {
    releaseCode,
    resourceReleaseId,
  }: {
    releaseCode?: string | null
    resourceReleaseId?: string | null
  },
) {
  const normalisedReleaseId = resourceReleaseId?.trim()

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
    resourceReleaseId?: string | null
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
        eq(metaResourceReleases.datasetId, datasetId),
        eq(metaResourceReleases.resourceType, resourceType),
        eq(metaResourceReleases.status, 'current'),
        ne(metaResourceReleases.id, excludeReleaseId),
      )
    : and(
        eq(metaResourceReleases.datasetId, datasetId),
        eq(metaResourceReleases.resourceType, resourceType),
        eq(metaResourceReleases.status, 'current'),
      )

  return (
    ((await db
      .select(releaseRecordSelection)
      .from(metaResourceReleases)
      .innerJoin(metaDatasets, eq(metaResourceReleases.datasetId, metaDatasets.id))
      .innerJoin(metaPublishers, eq(metaDatasets.publisherId, metaPublishers.id))
      .where(whereClause)
      .limit(1)
      .get()) as DatasetRecord | undefined) ?? null
  )
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/** Explicit publisher dates take precedence; periods do not imply a publication day. */
export function releasePublicationDate(
  sourceVersion: string,
  publicationDate?: string,
): string | null {
  const date = publicationDate ?? sourceVersion.split('.')[0] ?? ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    if (publicationDate !== undefined)
      throw new Error(`Invalid publicationDate: ${publicationDate}`)
    return null
  }
  const parsed = new Date(`${date}T00:00:00.000Z`)
  if (Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date)
    return date
  if (publicationDate !== undefined)
    throw new Error(`Invalid publicationDate: ${publicationDate}`)
  return null
}

export async function insertDataset(
  db: HarbourWritableDb & HarbourReadableDb,
  plan: UploadPlan,
  ingestedAt: string,
  status: ReleaseStatus = 'staged',
) {
  const dataset = await requireDatasetDefinition(db, plan)
  const processingRules = await retainIngestionProcessingRules(
    db,
    dataset.processingRules,
  )
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
      expectedResourceTypes: dataset.resourceTypes,
      sourceSchemaVersion,
      publicationDate: releasePublicationDate(plan.sourceVersion, plan.publicationDate),
      cohortKey: plan.cohortKey,
      releaseNotesUrl: plan.releaseNotesUrl ?? null,
      notes: null,
      status,
      processingRules,
      revokedAt: null,
      revocationReason: null,
      supersededBySourceReleaseId: null,
      ingestedAt: now,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing()
    .run()

  await db
    .insert(metaResourceReleases)
    .values({
      id: buildDeterministicReleaseId(plan.releaseCode),
      sourceReleaseId,
      datasetId: dataset.id,
      code: plan.releaseCode,
      resourceType: plan.resourceType,
      sourceVersion: plan.sourceVersion,
      sourceSchemaVersion,
      processingRules,
      publicationDate: releasePublicationDate(plan.sourceVersion, plan.publicationDate),
      cohortKey: plan.cohortKey,
      geometryStatus: isGeometryResourceType(plan.resourceType)
        ? (plan.geometryStatus ?? 'authoritative')
        : null,
      releaseNotesUrl: plan.releaseNotesUrl ?? null,
      status,
      ingestedAt: now,
      revokedAt: null,
      revocationReason: null,
      supersededByResourceReleaseId: null,
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

export function buildDeterministicApiReleaseSetId(
  releaseSetCode: string,
  schemaVersion: string,
  rulesetVersion: string,
) {
  return buildDeterministicUuidV5(
    API_RELEASE_SET_ID_NAMESPACE,
    `${releaseSetCode}--${schemaVersion}--${rulesetVersion}`,
  )
}

export function buildDeterministicApiVersionReleaseSetId(
  apiVersionId: string,
  apiReleaseSetId: string,
) {
  return buildDeterministicUuidV5(
    API_RELEASE_SET_ID_NAMESPACE,
    `api-version-release-set--${apiVersionId}--${apiReleaseSetId}`,
  )
}

export function buildDeterministicApiCatalogRevisionId(catalogRevisionCode: string) {
  return buildDeterministicUuidV5(
    API_CATALOG_REVISION_ID_NAMESPACE,
    catalogRevisionCode,
  )
}

export function buildDeterministicSnapshotAssemblyId(
  snapshotId: string,
  snapshotRecipeId: string,
) {
  return buildDeterministicUuidV5(
    SNAPSHOT_ASSEMBLY_RUN_ID_NAMESPACE,
    `${snapshotId}:${snapshotRecipeId}`,
  )
}

export function buildDeterministicApiFieldProvenanceId(args: {
  apiReleaseSetId: string
  apiField: string
  resourceType: string
  variant?: string | null
  contributionType: string
  priority: number
  sourceDatasetId: string
  inputs: ApiFieldInput[]
}) {
  return buildDeterministicUuidV5(
    API_FIELD_PROVENANCE_ID_NAMESPACE,
    [
      args.apiReleaseSetId,
      args.resourceType,
      args.apiField,
      args.variant ?? 'default',
      args.sourceDatasetId,
      JSON.stringify(args.inputs),
      args.contributionType,
      args.priority,
    ].join(':'),
  )
}

/** Resolve the pinned reusable graph and its exact release binding. */
export async function getApiFieldLineageForReleaseSet(
  db: HarbourReadableDb,
  releaseSetId: string,
  store: ProvenanceStore,
) {
  const row = await db
    .select({
      id: metaFieldLineageDefinitions.id,
      binding: metaApiFieldProvenance.binding,
      schemaVersion: metaFieldLineageDefinitions.schemaVersion,
      manifestHash: metaFieldLineageDefinitions.manifestHash,
      manifestByteLength: metaFieldLineageDefinitions.manifestByteLength,
    })
    .from(metaApiFieldProvenance)
    .innerJoin(
      metaFieldLineageDefinitions,
      eq(metaApiFieldProvenance.definitionId, metaFieldLineageDefinitions.id),
    )
    .where(eq(metaApiFieldProvenance.apiReleaseSetId, releaseSetId))
    .get()
  return row ? { ...row, definition: await readFieldLineage(store, row) } : undefined
}

export async function listApiFieldProvenanceForReleaseSet(
  db: HarbourReadableDb,
  releaseSetId: string,
  store: ProvenanceStore,
) {
  const lineage = await getApiFieldLineageForReleaseSet(db, releaseSetId, store)
  if (!lineage) return []
  if (lineage.definition.schemaVersion !== 2 || !lineage.binding)
    throw new Error(`Release ${releaseSetId} has no release-bound v2 field lineage.`)
  validateFieldLineageBinding(lineage.definition, lineage.binding)
  return lineage.definition.fields.map(field =>
    expandFieldLineage(lineage.definition, field),
  )
}

export async function resetFailedDataset(
  db: HarbourWritableDb & HarbourReadableDb,
  plan: UploadPlan,
  ingestedAt: string,
  status: ReleaseStatus,
  options: { preservePublishedSourceRelease?: boolean } = {},
) {
  const dataset = await requireDatasetDefinition(db, plan)
  const processingRules = await retainIngestionProcessingRules(
    db,
    dataset.processingRules,
  )
  const now = toIsoTimestamp(ingestedAt)
  const sourceSchemaVersion = await resolveSourceSchemaVersion({
    source: plan.source,
    sourceVersion: plan.sourceVersion,
    allowOlderMappedRelease: true,
  })
  const sourceReleaseCode = buildSourceReleaseCode(plan.datasetCode, plan.sourceVersion)
  const sourceRelease = options.preservePublishedSourceRelease
    ? await db
        .select({ status: metaSourceReleases.status })
        .from(metaSourceReleases)
        .where(eq(metaSourceReleases.code, sourceReleaseCode))
        .limit(1)
        .get()
    : null

  await db
    .update(metaResourceReleases)
    .set({
      sourceVersion: plan.sourceVersion,
      resourceType: plan.resourceType,
      sourceSchemaVersion,
      processingRules,
      publicationDate: releasePublicationDate(plan.sourceVersion, plan.publicationDate),
      cohortKey: plan.cohortKey,
      geometryStatus: isGeometryResourceType(plan.resourceType)
        ? (plan.geometryStatus ?? 'authoritative')
        : null,
      releaseNotesUrl: plan.releaseNotesUrl ?? null,
      status,
      ingestedAt: now,
      revokedAt: null,
      revocationReason: null,
      supersededByResourceReleaseId: null,
      updatedAt: now,
    })
    .where(eq(metaResourceReleases.code, plan.releaseCode))
    .run()

  await db
    .update(metaSourceReleases)
    .set({
      sourceSchemaVersion,
      processingRules,
      publicationDate: releasePublicationDate(plan.sourceVersion, plan.publicationDate),
      cohortKey: plan.cohortKey,
      releaseNotesUrl: plan.releaseNotesUrl ?? null,
      status: sourceRelease?.status === 'current' ? 'current' : status,
      ingestedAt: now,
      revokedAt: null,
      revocationReason: null,
      supersededBySourceReleaseId: null,
      updatedAt: now,
    })
    .where(eq(metaSourceReleases.code, sourceReleaseCode))
    .run()
}

async function resolveSourceReleaseId(
  db: HarbourReadableDb,
  resourceReleaseId: string,
) {
  return (
    (
      await db
        .select({ sourceReleaseId: metaResourceReleases.sourceReleaseId })
        .from(metaResourceReleases)
        .where(eq(metaResourceReleases.id, resourceReleaseId))
        .limit(1)
        .get()
    )?.sourceReleaseId ?? null
  )
}

export async function updateDatasetStatus(
  db: HarbourWritableDb & HarbourReadableDb,
  resourceReleaseId: string,
  status: ReleaseStatus,
) {
  const sourceReleaseId = await resolveSourceReleaseId(db, resourceReleaseId)
  const updatedAt = toIsoTimestamp()
  const releaseStatusCondition =
    status === 'current'
      ? eq(metaResourceReleases.id, resourceReleaseId)
      : and(
          eq(metaResourceReleases.id, resourceReleaseId),
          ne(metaResourceReleases.status, 'current'),
          ne(metaResourceReleases.status, 'archived'),
        )

  await db
    .update(metaResourceReleases)
    .set({
      status,
      updatedAt,
    })
    .where(releaseStatusCondition)
    .run()

  if (sourceReleaseId) {
    const sourceReleaseStatusCondition =
      status === 'current'
        ? sourceReleasePublicationCondition(sourceReleaseId)
        : and(
            eq(metaSourceReleases.id, sourceReleaseId),
            ne(metaSourceReleases.status, 'current'),
            ne(metaSourceReleases.status, 'archived'),
          )
    await db
      .update(metaSourceReleases)
      .set({
        status,
        updatedAt,
      })
      .where(sourceReleaseStatusCondition)
      .run()
  }
}

export async function markDatasetCurrent(
  db: HarbourWritableDb & HarbourReadableDb,
  resourceReleaseId: string,
) {
  const sourceReleaseId = await resolveSourceReleaseId(db, resourceReleaseId)
  const now = toIsoTimestamp()

  await db
    .update(metaResourceReleases)
    .set({
      status: 'current',
      revokedAt: null,
      revocationReason: null,
      updatedAt: now,
    })
    .where(eq(metaResourceReleases.id, resourceReleaseId))
    .run()

  if (sourceReleaseId) {
    await db
      .update(metaSourceReleases)
      .set({
        status: 'current',
        revokedAt: null,
        revocationReason: null,
        updatedAt: now,
      })
      .where(sourceReleasePublicationCondition(sourceReleaseId))
      .run()
  }
}

export async function markDatasetHistoric(
  db: HarbourWritableDb,
  resourceReleaseId: string,
  historicAt: string,
) {
  const updatedAt = toIsoTimestamp(historicAt)

  await db
    .update(metaResourceReleases)
    .set({
      status: 'archived',
      updatedAt,
    })
    .where(eq(metaResourceReleases.id, resourceReleaseId))
    .run()
}

export async function revokeDataset(
  db: HarbourWritableDb,
  resourceReleaseId: string,
  revocationReason: string,
  revokedAt: string,
) {
  const revokedAtTimestamp = toIsoTimestamp(revokedAt)

  await db
    .update(metaResourceReleases)
    .set({
      revokedAt: revokedAtTimestamp,
      revocationReason,
      status: 'revoked',
      updatedAt: revokedAtTimestamp,
    })
    .where(eq(metaResourceReleases.id, resourceReleaseId))
    .run()
}

export async function setSupersededByReleaseId(
  db: HarbourWritableDb,
  resourceReleaseId: string,
  supersededByResourceReleaseId: string,
) {
  await db
    .update(metaResourceReleases)
    .set({
      supersededByResourceReleaseId,
      updatedAt: toIsoTimestamp(),
    })
    .where(eq(metaResourceReleases.id, resourceReleaseId))
    .run()
}

export function getApiVersionCodeForType(resourceType: ResourceType) {
  return buildApiVersionCode(resourceType, '0.1')
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
  resourceType: ResourceType,
  apiVersionCode = getApiVersionCodeForType(resourceType),
) {
  const composition = await resolveCurrentApiComposition(db, apiVersionCode)

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
        metaSnapshotResourceReleases,
        eq(metaSnapshots.id, metaSnapshotResourceReleases.snapshotId),
      )
      .innerJoin(
        metaDatasets,
        eq(metaSnapshotResourceReleases.datasetId, metaDatasets.id),
      )
      .where(
        and(
          eq(metaSnapshots.resourceType, resourceType),
          eq(metaSnapshots.status, 'published'),
          ne(metaSnapshots.id, snapshotId),
          eq(metaDatasets.regionCode, regionCode),
          eq(metaSnapshotResourceReleases.role, 'primary'),
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
        metaSnapshotResourceReleases,
        eq(metaSnapshots.id, metaSnapshotResourceReleases.snapshotId),
      )
      .innerJoin(
        metaDatasets,
        eq(metaSnapshotResourceReleases.datasetId, metaDatasets.id),
      )
      .where(
        and(
          eq(metaSnapshots.resourceType, resourceType),
          eq(metaSnapshots.status, 'published'),
          eq(metaDatasets.regionCode, regionCode),
          eq(metaSnapshotResourceReleases.role, 'primary'),
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
  // Overture's canonical dataset for the requested resource type is itself a
  // durable domain identity. This deliberately does not require a lineage
  // join: it lets a snapshot remain resolvable while its lineage is being
  // created or repaired, and includes Overture geometry snapshots whose
  // primary source is divisionArea or divisionBoundary rather than division.
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
          metaSnapshotResourceReleases,
          eq(metaSnapshots.id, metaSnapshotResourceReleases.snapshotId),
        )
        .innerJoin(
          metaDatasets,
          eq(metaSnapshotResourceReleases.datasetId, metaDatasets.id),
        )
        .where(
          and(
            eq(metaSnapshots.resourceType, resourceType),
            eq(metaSnapshots.status, 'published'),
            eq(metaSnapshots.cohortKey, cohortKey),
            eq(metaDatasets.regionCode, regionCode),
            eq(
              metaDatasets.code,
              buildDatasetCode(regionCode, 'overture', resourceType),
            ),
            eq(metaSnapshotResourceReleases.role, 'primary'),
            snapshotVariantCondition(options.variant, resourceType, regionCode),
          ),
        )
        .orderBy(
          asc(
            sql`case ${metaSnapshots.geometryStatus} when 'authoritative' then 0 else 1 end`,
          ),
          desc(metaSnapshots.publishedAt),
          desc(metaSnapshots.createdAt),
        )
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
        metaSnapshotResourceReleases,
        eq(metaSnapshots.id, metaSnapshotResourceReleases.snapshotId),
      )
      .innerJoin(
        metaDatasets,
        eq(metaSnapshotResourceReleases.datasetId, metaDatasets.id),
      )
      .where(
        and(
          eq(metaSnapshots.resourceType, resourceType),
          eq(metaSnapshots.status, 'published'),
          eq(metaSnapshots.cohortKey, cohortKey),
          eq(metaDatasets.regionCode, regionCode),
          eq(metaSnapshotResourceReleases.role, 'primary'),
          snapshotVariantCondition(options.variant, resourceType, regionCode),
        ),
      )
      .orderBy(
        asc(
          sql`case ${metaSnapshots.geometryStatus} when 'authoritative' then 0 else 1 end`,
        ),
        desc(metaSnapshots.publishedAt),
        desc(metaSnapshots.createdAt),
      )
      .limit(1)
      .get()) ?? null
  )
}

function snapshotVariantCondition(
  variant: string | undefined,
  resourceType: ResourceType,
  regionCode: RegionCode,
) {
  if (!variant) return undefined
  const lineageVariant = sql`EXISTS (
    SELECT 1
    FROM snapshotLineages AS variant_lineage
    WHERE variant_lineage.id = ${metaSnapshots.snapshotLineageId}
      AND variant_lineage.variant = ${variant}
  )`
  if (variant === 'overture') {
    return or(
      lineageVariant,
      and(
        isNull(metaSnapshots.snapshotLineageId),
        eq(metaDatasets.code, buildDatasetCode(regionCode, 'overture', resourceType)),
      ),
    )
  }
  return lineageVariant
}

/**
 * Lists published canonical snapshots on or after a source cohort in chronological
 * order. Callers which need a particular referenced identity can inspect later
 * candidates without weakening the normal nearest-snapshot policy.
 */
export async function listPublishedSnapshotsForResourceTypeRegionAtOrAfterCohortKey(
  db: HarbourReadableDb,
  resourceType: ResourceType,
  regionCode: RegionCode,
  cohortKey: string,
  options: { datasetCode?: string; publisherCode?: string; variant?: string } = {},
) {
  return db
    .select({
      id: metaSnapshots.id,
      code: metaSnapshots.code,
      cohortKey: metaSnapshots.cohortKey,
      resourceType: metaSnapshots.resourceType,
      status: metaSnapshots.status,
    })
    .from(metaSnapshots)
    .innerJoin(
      metaSnapshotResourceReleases,
      eq(metaSnapshots.id, metaSnapshotResourceReleases.snapshotId),
    )
    .innerJoin(
      metaDatasets,
      eq(metaSnapshotResourceReleases.datasetId, metaDatasets.id),
    )
    .innerJoin(metaPublishers, eq(metaDatasets.publisherId, metaPublishers.id))
    .where(
      and(
        eq(metaSnapshots.resourceType, resourceType),
        eq(metaSnapshots.status, 'published'),
        sql`${metaSnapshots.cohortKey} >= ${cohortKey}`,
        eq(metaDatasets.regionCode, regionCode),
        eq(metaSnapshotResourceReleases.role, 'primary'),
        options.publisherCode
          ? eq(metaPublishers.code, options.publisherCode)
          : undefined,
        options.datasetCode ? eq(metaDatasets.code, options.datasetCode) : undefined,
        snapshotVariantCondition(options.variant, resourceType, regionCode),
      ),
    )
    .orderBy(
      asc(metaSnapshots.cohortKey),
      asc(metaSnapshots.publishedAt),
      asc(metaSnapshots.createdAt),
    )
    .all()
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
  options: { datasetCode?: string; publisherCode?: string; variant?: string } = {},
) {
  const [snapshot] =
    await listPublishedSnapshotsForResourceTypeRegionAtOrAfterCohortKey(
      db,
      resourceType,
      regionCode,
      cohortKey,
      options,
    )
  return snapshot ?? null
}

/**
 * Resolves the newest published snapshot at or before a source cohort. Together
 * with the forward lookup above, this lets historical provider geometry anchor
 * itself to the closest available canonical snapshot without assuming that the
 * two publishers release on the same cadence.
 */
export async function resolveLatestPublishedSnapshotForResourceTypeRegionAtOrBeforeCohortKey(
  db: HarbourReadableDb,
  resourceType: ResourceType,
  regionCode: RegionCode,
  cohortKey: string,
  options: { publisherCode?: string; variant?: string } = {},
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
        metaSnapshotResourceReleases,
        eq(metaSnapshots.id, metaSnapshotResourceReleases.snapshotId),
      )
      .innerJoin(
        metaDatasets,
        eq(metaSnapshotResourceReleases.datasetId, metaDatasets.id),
      )
      .innerJoin(metaPublishers, eq(metaDatasets.publisherId, metaPublishers.id))
      .where(
        and(
          eq(metaSnapshots.resourceType, resourceType),
          eq(metaSnapshots.status, 'published'),
          sql`${metaSnapshots.cohortKey} <= ${cohortKey}`,
          eq(metaDatasets.regionCode, regionCode),
          eq(metaSnapshotResourceReleases.role, 'primary'),
          options.publisherCode
            ? eq(metaPublishers.code, options.publisherCode)
            : undefined,
          snapshotVariantCondition(options.variant, resourceType, regionCode),
        ),
      )
      .orderBy(
        asc(
          sql`case ${metaSnapshots.geometryStatus} when 'authoritative' then 0 else 1 end`,
        ),
        desc(metaSnapshots.cohortKey),
        desc(metaSnapshots.publishedAt),
        desc(metaSnapshots.createdAt),
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
  options: { datasetCode?: string; publisherCode?: string; variant?: string } = {},
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
      metaSnapshotResourceReleases,
      eq(metaSnapshots.id, metaSnapshotResourceReleases.snapshotId),
    )
    .innerJoin(
      metaDatasets,
      eq(metaSnapshotResourceReleases.datasetId, metaDatasets.id),
    )
    .innerJoin(metaPublishers, eq(metaDatasets.publisherId, metaPublishers.id))
    .where(
      and(
        eq(metaSnapshots.resourceType, resourceType),
        eq(metaSnapshots.status, 'published'),
        sql`${metaSnapshots.cohortKey} <= ${cohortKey}`,
        eq(metaDatasets.regionCode, regionCode),
        eq(metaSnapshotResourceReleases.role, 'primary'),
        options.publisherCode
          ? eq(metaPublishers.code, options.publisherCode)
          : undefined,
        snapshotVariantCondition(options.variant, resourceType, regionCode),
        options.datasetCode ? eq(metaDatasets.code, options.datasetCode) : undefined,
      ),
    )
    .orderBy(
      asc(
        sql`case ${metaSnapshots.geometryStatus} when 'authoritative' then 0 else 1 end`,
      ),
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
    geometryStatus?: GeometryStatus
    identityMode?: 'persistent' | 'cohort_scoped'
    /**
     * C&SD statistical companions can combine several source releases (for
     * example annual districts and Area/type polygons) in one draft snapshot.
     */
    reuseDraftSnapshotForVariant?: boolean
    /**
     * Keep several publisher-authorised source datasets in one geometry
     * companion family. Their source releases remain distinct snapshot sources.
     */
    reuseSnapshotLineageForVariant?: boolean
    /** A complete snapshot whose replay never inherits a predecessor. */
    rootSnapshot?: boolean
    /**
     * Reprocess a source release whose latest snapshot is already published.
     * The source release may be attached to a new revision, but a published
     * snapshot itself remains immutable.
     */
    rebuildPublishedSnapshot?: boolean
    regionCode: string
    sourceReleaseId: string
    variant?: string
  },
) {
  const variant = args.variant ?? 'default'
  const geometryStatus = isGeometryResourceType(resourceType)
    ? (args.geometryStatus ?? 'authoritative')
    : null
  const preserveOrPromoteGeometryStatus = async (snapshotId: string) => {
    if (geometryStatus !== 'authoritative' || !isGeometryResourceType(resourceType))
      return
    await db
      .update(metaSnapshots)
      .set({ geometryStatus: 'authoritative', updatedAt: toIsoTimestamp() })
      .where(eq(metaSnapshots.id, snapshotId))
      .run()
  }
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
    .from(metaSnapshotResourceReleases)
    .innerJoin(
      metaSnapshots,
      eq(metaSnapshotResourceReleases.snapshotId, metaSnapshots.id),
    )
    .innerJoin(
      metaSnapshotLineages,
      eq(metaSnapshots.snapshotLineageId, metaSnapshotLineages.id),
    )
    .where(
      and(
        eq(metaSnapshotResourceReleases.resourceReleaseId, args.sourceReleaseId),
        eq(metaSnapshots.resourceType, resourceType),
        eq(metaSnapshots.cohortKey, args.cohortKey),
        eq(metaSnapshotLineages.variant, variant),
      ),
    )
    .orderBy(desc(metaSnapshots.revision))
    .limit(1)
    .get()

  const publishedSourceSnapshotForRebuild =
    args.rebuildPublishedSnapshot && snapshotForSourceRelease?.status === 'published'
      ? snapshotForSourceRelease
      : null

  if (
    snapshotForSourceRelease &&
    !(args.rebuildPublishedSnapshot && snapshotForSourceRelease.status === 'published')
  ) {
    if (args.rootSnapshot) {
      if (snapshotForSourceRelease.parentSnapshotId !== null)
        throw new Error('Root snapshot draft unexpectedly has a predecessor.')
    } else {
      await assertAcceptedDraftSnapshotParent(db, snapshotForSourceRelease)
    }
    await preserveOrPromoteGeometryStatus(snapshotForSourceRelease.id)
    return snapshotForSourceRelease
  }

  if (args.reuseDraftSnapshotForVariant) {
    const sharedDraft = await db
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
      .innerJoin(
        metaSnapshotLineages,
        eq(metaSnapshots.snapshotLineageId, metaSnapshotLineages.id),
      )
      .where(
        and(
          eq(metaSnapshots.resourceType, resourceType),
          eq(metaSnapshots.cohortKey, args.cohortKey),
          eq(metaSnapshots.status, 'draft'),
          eq(metaSnapshotLineages.regionCode, args.regionCode),
          eq(metaSnapshotLineages.variant, variant),
        ),
      )
      .orderBy(desc(metaSnapshots.revision), desc(metaSnapshots.createdAt))
      .limit(1)
      .get()
    if (sharedDraft) {
      if (args.rootSnapshot) {
        if (sharedDraft.parentSnapshotId !== null)
          throw new Error('Root snapshot draft unexpectedly has a predecessor.')
      } else {
        await assertAcceptedDraftSnapshotParent(db, sharedDraft)
      }
      await preserveOrPromoteGeometryStatus(sharedDraft.id)
      return sharedDraft
    }
  }

  const reusableLineage = args.reuseSnapshotLineageForVariant
    ? await db
        .select({
          id: metaSnapshotLineages.id,
          code: metaSnapshotLineages.code,
        })
        .from(metaSnapshotLineages)
        .where(
          and(
            eq(metaSnapshotLineages.regionCode, args.regionCode),
            eq(metaSnapshotLineages.resourceType, resourceType),
            eq(metaSnapshotLineages.variant, variant),
          ),
        )
        .orderBy(desc(metaSnapshotLineages.createdAt))
        .limit(1)
        .get()
    : null
  const lineageCode =
    reusableLineage?.code ??
    buildSnapshotLineageCode(args.datasetCode, resourceType, variant)
  const deterministicLineageId =
    reusableLineage?.id ?? buildDeterministicSnapshotLineageId(lineageCode)
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

  if (!reusableLineage) {
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
  }

  const lineage =
    reusableLineage ??
    (await db
      .select({ id: metaSnapshotLineages.id })
      .from(metaSnapshotLineages)
      .where(
        and(
          eq(metaSnapshotLineages.primaryDatasetId, args.datasetId),
          eq(metaSnapshotLineages.resourceType, resourceType),
          eq(metaSnapshotLineages.variant, variant),
        ),
      )
      .limit(1)
      .get())

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

  const effectiveParent = publishedSourceSnapshotForRebuild
    ? publishedSourceSnapshotForRebuild
    : await resolveAcceptedSnapshotParent(db, {
        lineageId,
        cohortKey: args.cohortKey,
        identityMode,
      })
  const parentSnapshotId = args.rootSnapshot ? null : (effectiveParent?.id ?? null)

  if (latestForCohort?.status === 'draft' && resourceType !== 'divisionStatistic') {
    if (latestForCohort.parentSnapshotId !== parentSnapshotId)
      throw new Error(
        'Draft snapshot predecessor is no longer selected; prepare a fresh draft before ingestion.',
      )
    await preserveOrPromoteGeometryStatus(latestForCohort.id)
    return latestForCohort
  }

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
    await preserveOrPromoteGeometryStatus(existing.id)
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
      geometryStatus,
      revision,
      status: 'draft',
      publishedAt: null,
      validFrom: null,
      validTo: null,
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

export async function recordSnapshotAssembly(
  db: HarbourReadableDb & HarbourWritableDb,
  args: {
    anchorCohortKey: string
    anchorReleaseId?: string | null
    resourceType: ResourceType
    dependencies?: Record<string, string>
    snapshotId: string
  },
) {
  return recordEffectiveSnapshotAssembly(db, args)
}

export async function resolveSnapshotForRelease(
  db: HarbourReadableDb,
  sourceReleaseId: string,
  resourceType: ResourceType,
  options: { variant?: string } = {},
) {
  if (options.variant) {
    const variantSnapshot = await db
      .select({
        cohortKey: metaSnapshots.cohortKey,
        id: metaSnapshots.id,
        code: metaSnapshots.code,
        resourceType: metaSnapshots.resourceType,
        status: metaSnapshots.status,
      })
      .from(metaSnapshotResourceReleases)
      .innerJoin(
        metaSnapshots,
        eq(metaSnapshotResourceReleases.snapshotId, metaSnapshots.id),
      )
      .innerJoin(
        metaSnapshotLineages,
        eq(metaSnapshots.snapshotLineageId, metaSnapshotLineages.id),
      )
      .where(
        and(
          eq(metaSnapshotResourceReleases.resourceReleaseId, sourceReleaseId),
          eq(metaSnapshots.resourceType, resourceType),
          eq(metaSnapshotLineages.variant, options.variant),
        ),
      )
      .orderBy(desc(metaSnapshots.createdAt))
      .limit(1)
      .get()

    if (variantSnapshot) return variantSnapshot
  }

  return (
    (await db
      .select({
        cohortKey: metaSnapshots.cohortKey,
        id: metaSnapshots.id,
        code: metaSnapshots.code,
        resourceType: metaSnapshots.resourceType,
        status: metaSnapshots.status,
      })
      .from(metaSnapshotResourceReleases)
      .innerJoin(
        metaSnapshots,
        eq(metaSnapshotResourceReleases.snapshotId, metaSnapshots.id),
      )
      .where(
        and(
          eq(metaSnapshotResourceReleases.resourceReleaseId, sourceReleaseId),
          eq(metaSnapshots.resourceType, resourceType),
          options.variant ? isNull(metaSnapshots.snapshotLineageId) : undefined,
        ),
      )
      .orderBy(desc(metaSnapshots.createdAt))
      .limit(1)
      .get()) ?? null
  )
}

/** Returns the latest snapshot revision for every cohort and variant materialised by a release. */
export async function listSnapshotsForRelease(
  db: HarbourReadableDb,
  resourceReleaseId: string,
  resourceType: ResourceType,
  options: { variant?: string } = {},
) {
  const rows = await db
    .select({
      cohortKey: metaSnapshots.cohortKey,
      code: metaSnapshots.code,
      id: metaSnapshots.id,
      revision: metaSnapshots.revision,
      status: metaSnapshots.status,
      variant: metaSnapshotLineages.variant,
    })
    .from(metaSnapshotResourceReleases)
    .innerJoin(
      metaSnapshots,
      eq(metaSnapshotResourceReleases.snapshotId, metaSnapshots.id),
    )
    .innerJoin(
      metaSnapshotLineages,
      eq(metaSnapshots.snapshotLineageId, metaSnapshotLineages.id),
    )
    .where(
      and(
        eq(metaSnapshotResourceReleases.resourceReleaseId, resourceReleaseId),
        eq(metaSnapshots.resourceType, resourceType),
        options.variant ? eq(metaSnapshotLineages.variant, options.variant) : undefined,
      ),
    )
    .orderBy(asc(metaSnapshots.cohortKey), desc(metaSnapshots.revision))
    .all()

  const latestByCohort = new Map<string, (typeof rows)[number]>()
  for (const row of rows) {
    const key = `${row.cohortKey}\u0000${row.variant}`
    if (!latestByCohort.has(key)) latestByCohort.set(key, row)
  }
  return [...latestByCohort.values()]
}

export async function resolveReleaseSetForType(
  db: HarbourReadableDb,
  resourceType: ResourceType,
) {
  const apiVersionCode = getApiVersionCodeForType(resourceType)

  return (
    (await db
      .select({
        id: metaApiReleaseSets.id,
        code: metaApiReleaseSets.code,
        schemaVersion: metaApiReleaseSets.schemaVersion,
        rulesetVersion: metaApiReleaseSets.rulesetVersion,
        status: metaApiVersionReleaseSets.status,
      })
      .from(metaApiReleaseSets)
      .innerJoin(
        metaApiVersionReleaseSets,
        eq(metaApiVersionReleaseSets.apiReleaseSetId, metaApiReleaseSets.id),
      )
      .innerJoin(
        metaApiVersions,
        eq(metaApiVersionReleaseSets.apiVersionId, metaApiVersions.id),
      )
      .where(
        and(
          eq(metaApiVersions.code, apiVersionCode),
          ne(metaApiVersionReleaseSets.status, 'archived'),
        ),
      )
      .orderBy(
        desc(metaApiVersionReleaseSets.publishedAt),
        desc(metaApiReleaseSets.createdAt),
      )
      .limit(1)
      .get()) ?? null
  )
}

async function resolveDomainCodeForType(
  db: HarbourReadableDb,
  resourceType: ResourceType,
  domainCode?: string,
) {
  if (domainCode) return domainCode

  const composition = await resolveCurrentApiCompositionSafely(
    db,
    getApiVersionCodeForType(resourceType),
  )
  return composition?.defaultDomainCode ?? 'default'
}

export async function resolveActiveReleaseSetForType(
  db: HarbourReadableDb,
  resourceType: ResourceType,
  domainCode?: string,
) {
  const apiVersionCode = getApiVersionCodeForType(resourceType)
  const resolvedDomainCode = await resolveDomainCodeForType(
    db,
    resourceType,
    domainCode,
  )

  return (
    (await db
      .select({
        id: metaApiReleaseSets.id,
        code: metaApiReleaseSets.code,
        domainCode: metaApiReleaseSets.domainCode,
        schemaVersion: metaApiReleaseSets.schemaVersion,
        rulesetVersion: metaApiReleaseSets.rulesetVersion,
        status: metaApiVersionReleaseSets.status,
      })
      .from(metaApiReleaseSets)
      .innerJoin(
        metaApiVersionReleaseSets,
        eq(metaApiVersionReleaseSets.apiReleaseSetId, metaApiReleaseSets.id),
      )
      .innerJoin(
        metaApiVersions,
        eq(metaApiVersionReleaseSets.apiVersionId, metaApiVersions.id),
      )
      .where(
        and(
          eq(metaApiVersions.code, apiVersionCode),
          eq(metaApiVersionReleaseSets.status, 'current'),
          eq(metaApiReleaseSets.domainCode, resolvedDomainCode),
        ),
      )
      .orderBy(
        desc(metaApiVersionReleaseSets.publishedAt),
        desc(metaApiReleaseSets.createdAt),
      )
      .limit(1)
      .get()) ?? null
  )
}

export async function resolveLatestReleaseSetForTypeDomainCohort(
  db: HarbourReadableDb,
  resourceType: ResourceType,
  domainCode: string,
  regionCode: RegionCode,
  cohortKey: string,
  apiVersionCode = getApiVersionCodeForType(resourceType),
) {
  return (
    (await db
      .select({
        id: metaApiReleaseSets.id,
        code: metaApiReleaseSets.code,
        domainCode: metaApiReleaseSets.domainCode,
        schemaVersion: metaApiReleaseSets.schemaVersion,
        rulesetVersion: metaApiReleaseSets.rulesetVersion,
        status: metaApiVersionReleaseSets.status,
      })
      .from(metaApiReleaseSets)
      .innerJoin(
        metaApiVersionReleaseSets,
        eq(metaApiVersionReleaseSets.apiReleaseSetId, metaApiReleaseSets.id),
      )
      .innerJoin(
        metaApiVersions,
        eq(metaApiVersionReleaseSets.apiVersionId, metaApiVersions.id),
      )
      .where(
        and(
          eq(metaApiVersions.code, apiVersionCode),
          eq(metaApiReleaseSets.regionCode, regionCode),
          eq(metaApiReleaseSets.domainCode, domainCode),
          ne(metaApiVersionReleaseSets.status, 'draft'),
          eq(metaApiReleaseSets.cohortKey, cohortKey),
        ),
      )
      .orderBy(
        desc(metaApiReleaseSets.revision),
        desc(metaApiVersionReleaseSets.publishedAt),
      )
      .limit(1)
      .get()) ?? null
  )
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
  resourceType: ResourceType,
  regionCode: RegionCode,
  cohortKey: string,
  apiVersionCode = getApiVersionCodeForType(resourceType),
) {
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
    .innerJoin(
      metaApiVersionReleaseSets,
      eq(metaApiVersionReleaseSets.apiReleaseSetId, metaApiReleaseSets.id),
    )
    .where(
      and(
        eq(metaApiVersionReleaseSets.apiVersionId, apiVersion.id),
        eq(metaApiVersionReleaseSets.status, 'draft'),
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
      cohortKey: metaApiReleaseSets.cohortKey,
      code: metaApiReleaseSets.code,
      id: metaApiReleaseSets.id,
      apiVersion: metaApiVersions.code,
    })
    .from(metaApiReleaseSets)
    .innerJoin(
      metaApiVersionReleaseSets,
      eq(metaApiVersionReleaseSets.apiReleaseSetId, metaApiReleaseSets.id),
    )
    .innerJoin(
      metaApiVersions,
      eq(metaApiVersionReleaseSets.apiVersionId, metaApiVersions.id),
    )
    .where(
      and(
        eq(metaApiVersionReleaseSets.status, 'draft'),
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
      resourceReleaseId: metaResourceReleases.id,
    })
    .from(metaApiReleaseSets)
    .innerJoin(
      metaApiVersionReleaseSets,
      eq(metaApiVersionReleaseSets.apiReleaseSetId, metaApiReleaseSets.id),
    )
    .innerJoin(
      metaApiVersions,
      eq(metaApiVersionReleaseSets.apiVersionId, metaApiVersions.id),
    )
    .innerJoin(
      metaApiReleaseSetSnapshots,
      eq(metaApiReleaseSetSnapshots.apiReleaseSetId, metaApiReleaseSets.id),
    )
    .innerJoin(
      metaSnapshotResourceReleases,
      eq(
        metaSnapshotResourceReleases.snapshotId,
        metaApiReleaseSetSnapshots.snapshotId,
      ),
    )
    .innerJoin(
      metaResourceReleases,
      eq(metaSnapshotResourceReleases.resourceReleaseId, metaResourceReleases.id),
    )
    .where(
      and(
        eq(metaApiVersionReleaseSets.status, 'draft'),
        eq(metaApiReleaseSetSnapshots.role, 'primary'),
        eq(metaSnapshotResourceReleases.role, 'primary'),
        or(
          eq(metaResourceReleases.status, 'current'),
          eq(metaResourceReleases.status, 'archived'),
        ),
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
  resourceType: ResourceType,
  regionCode: RegionCode,
  cohortKey: string,
  domainCode = 'geographic',
  apiVersionCode = getApiVersionCodeForType(resourceType),
) {
  const rows = await db
    .select({
      cohortKey: metaApiReleaseSets.cohortKey,
    })
    .from(metaApiReleaseSets)
    .innerJoin(
      metaApiVersionReleaseSets,
      eq(metaApiVersionReleaseSets.apiReleaseSetId, metaApiReleaseSets.id),
    )
    .innerJoin(
      metaApiVersions,
      eq(metaApiVersionReleaseSets.apiVersionId, metaApiVersions.id),
    )
    .innerJoin(
      metaApiReleaseSetSnapshots,
      eq(metaApiReleaseSetSnapshots.apiReleaseSetId, metaApiReleaseSets.id),
    )
    .innerJoin(
      metaSnapshots,
      eq(metaApiReleaseSetSnapshots.snapshotId, metaSnapshots.id),
    )
    .innerJoin(
      metaSnapshotResourceReleases,
      eq(metaSnapshotResourceReleases.snapshotId, metaSnapshots.id),
    )
    .innerJoin(
      metaDatasets,
      eq(metaSnapshotResourceReleases.datasetId, metaDatasets.id),
    )
    .innerJoin(metaPublishers, eq(metaDatasets.publisherId, metaPublishers.id))
    .where(
      and(
        eq(metaApiVersions.code, apiVersionCode),
        eq(metaApiReleaseSets.regionCode, regionCode),
        eq(metaApiReleaseSets.domainCode, domainCode),
        sql`${metaApiReleaseSets.cohortKey} >= ${cohortKey}`,
        eq(metaApiReleaseSetSnapshots.role, 'primary'),
        eq(metaSnapshots.resourceType, resourceType),
        eq(metaSnapshotResourceReleases.role, 'primary'),
        eq(metaPublishers.code, 'overture'),
      ),
    )
    .orderBy(asc(metaApiReleaseSets.cohortKey), asc(metaApiReleaseSets.revision))
    .all()

  return [...new Set(rows.flatMap(row => (row.cohortKey ? [row.cohortKey] : [])))]
}

export async function ensureDraftReleaseSetForRelease(
  db: HarbourReadableDb & HarbourWritableDb,
  resourceType: ResourceType,
  release: Pick<DatasetRecord, 'cohortKey' | 'regionCode'>,
  options: ApiReleaseVersions & {
    apiVersion?: string
    domainCode?: string
    forceNew?: boolean
  },
) {
  const apiVersionCode = options?.apiVersion ?? getApiVersionCodeForType(resourceType)
  const apiVersion = await db
    .select({
      id: metaApiVersions.id,
      familyType: metaApiVersions.familyType,
      status: metaApiVersions.status,
    })
    .from(metaApiVersions)
    .where(eq(metaApiVersions.code, apiVersionCode))
    .limit(1)
    .get()

  if (!apiVersion) {
    throw new Error(`API version not found for type: ${resourceType}`)
  }

  if (apiVersion.status === 'archived' || apiVersion.status === 'retired') {
    throw new Error(
      `Cannot create an API release for ${apiVersionCode} while its status is ${apiVersion.status}.`,
    )
  }

  assertApiReleaseVersions(options, apiVersion.familyType)
  const { schemaVersion, rulesetVersion } = options

  const composition = await resolveCurrentApiCompositionSafely(db, apiVersionCode)

  const compositionMembers = composition
    ? await listApiCompositionMembersSafely(db, composition.id)
    : []
  const domainCode = options.domainCode ?? composition?.defaultDomainCode ?? 'default'
  const isCompositionMember = compositionMembers.some(
    member => member.domainCode === domainCode && member.resourceType === resourceType,
  )

  if (
    composition?.primaryResourceType &&
    composition.primaryResourceType !== resourceType &&
    !isCompositionMember
  ) {
    throw new Error(
      `API composition ${composition.code} expects primary resourceType=${composition.primaryResourceType}, not ${resourceType}.`,
    )
  }

  const existing = options.forceNew
    ? null
    : await db
        .select({
          cohortKey: metaApiReleaseSets.cohortKey,
          id: metaApiReleaseSets.id,
          code: metaApiReleaseSets.code,
          status: metaApiVersionReleaseSets.status,
        })
        .from(metaApiReleaseSets)
        .innerJoin(
          metaApiVersionReleaseSets,
          eq(metaApiVersionReleaseSets.apiReleaseSetId, metaApiReleaseSets.id),
        )
        .where(
          and(
            eq(metaApiVersionReleaseSets.apiVersionId, apiVersion.id),
            eq(metaApiReleaseSets.regionCode, release.regionCode),
            eq(metaApiReleaseSets.domainCode, domainCode),
            eq(metaApiReleaseSets.cohortKey, release.cohortKey),
            eq(metaApiVersionReleaseSets.status, 'draft'),
            eq(metaApiReleaseSets.schemaVersion, schemaVersion),
            eq(metaApiReleaseSets.rulesetVersion, rulesetVersion),
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
    })
    .from(metaApiReleaseSets)
    .innerJoin(
      metaApiVersionReleaseSets,
      eq(metaApiVersionReleaseSets.apiReleaseSetId, metaApiReleaseSets.id),
    )
    .innerJoin(
      metaApiVersions,
      eq(metaApiVersionReleaseSets.apiVersionId, metaApiVersions.id),
    )
    .where(
      and(
        eq(metaApiVersions.code, apiVersionCode),
        eq(metaApiReleaseSets.regionCode, release.regionCode),
        eq(metaApiReleaseSets.domainCode, domainCode),
        eq(metaApiReleaseSets.cohortKey, release.cohortKey),
        ne(metaApiVersionReleaseSets.status, 'draft'),
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
    .innerJoin(
      metaApiVersionReleaseSets,
      eq(metaApiVersionReleaseSets.apiReleaseSetId, metaApiReleaseSets.id),
    )
    .where(
      and(
        eq(metaApiVersionReleaseSets.apiVersionId, apiVersion.id),
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
  const releaseSetId = buildDeterministicApiReleaseSetId(
    releaseSetCode,
    schemaVersion,
    rulesetVersion,
  )
  const apiVersionReleaseSetId = buildDeterministicApiVersionReleaseSetId(
    apiVersion.id,
    releaseSetId,
  )
  const existingContent = await db
    .select({ id: metaApiReleaseSets.id })
    .from(metaApiReleaseSets)
    .where(
      and(
        eq(metaApiReleaseSets.code, releaseSetCode),
        eq(metaApiReleaseSets.schemaVersion, schemaVersion),
        eq(metaApiReleaseSets.rulesetVersion, rulesetVersion),
      ),
    )
    .limit(1)
    .get()
  const versionHash = computeVersionHash({
    releaseSetCode,
    domainCode,
    cohortKey: release.cohortKey,
    revision: nextRevision,
    schemaVersion,
    rulesetVersion,
  })

  if (!existingContent) {
    await db
      .insert(metaApiReleaseSets)
      .values({
        id: releaseSetId,
        code: releaseSetCode,
        regionCode: release.regionCode,
        domainCode,
        cohortKey: release.cohortKey,
        revision: nextRevision,
        effectiveFrom: cohortKeyEffectiveFrom(release.cohortKey),
        schemaVersion,
        rulesetVersion,
        versionHash,
        createdAt: now,
        updatedAt: now,
      })
      .run()
  }
  await db
    .insert(metaApiVersionReleaseSets)
    .values({
      id: apiVersionReleaseSetId,
      apiVersionId: apiVersion.id,
      apiReleaseSetId: existingContent?.id ?? releaseSetId,
      apiCompositionId: composition?.id ?? null,
      supersedesApiReleaseSetId: latestReleaseSet?.id ?? null,
      status: 'draft',
      publishedAt: null,
      validFrom: null,
      validTo: null,
      notes: null,
      guide: null,
      versionHash: computeVersionHash({
        apiVersion: apiVersionCode,
        apiCompositionId: composition?.id ?? null,
        apiReleaseSetId: existingContent?.id ?? releaseSetId,
        status: 'draft',
      }),
      createdAt: now,
      updatedAt: now,
    })
    .run()

  return {
    cohortKey: release.cohortKey,
    id: releaseSetId,
    code: releaseSetCode,
    status: 'draft' as const,
  }
}

export async function resolveReleaseSetForRelease(
  db: HarbourReadableDb,
  resourceReleaseId: string,
  resourceType: ResourceType,
  domainCode?: string,
  apiVersionCode = getApiVersionCodeForType(resourceType),
) {
  const resolvedDomainCode = await resolveDomainCodeForType(
    db,
    resourceType,
    domainCode,
  )

  return (
    (await db
      .select({
        cohortKey: metaApiReleaseSets.cohortKey,
        id: metaApiReleaseSets.id,
        code: metaApiReleaseSets.code,
        domainCode: metaApiReleaseSets.domainCode,
        schemaVersion: metaApiReleaseSets.schemaVersion,
        rulesetVersion: metaApiReleaseSets.rulesetVersion,
        status: metaApiVersionReleaseSets.status,
      })
      .from(metaSnapshotResourceReleases)
      .innerJoin(
        metaSnapshots,
        eq(metaSnapshotResourceReleases.snapshotId, metaSnapshots.id),
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
        metaApiVersionReleaseSets,
        eq(metaApiVersionReleaseSets.apiReleaseSetId, metaApiReleaseSets.id),
      )
      .innerJoin(
        metaApiVersions,
        eq(metaApiVersionReleaseSets.apiVersionId, metaApiVersions.id),
      )
      .where(
        and(
          eq(metaSnapshotResourceReleases.resourceReleaseId, resourceReleaseId),
          eq(metaApiVersions.code, apiVersionCode),
          eq(metaApiReleaseSets.domainCode, resolvedDomainCode),
        ),
      )
      .orderBy(desc(metaApiReleaseSets.createdAt))
      .limit(1)
      .get()) ?? null
  )
}

export async function activateReleaseSet(
  db: HarbourReadableDb & HarbourWritableDb,
  apiVersionReleaseSetId: string,
) {
  const releaseSet = await db
    .select({
      id: metaApiVersionReleaseSets.id,
      status: metaApiVersionReleaseSets.status,
    })
    .from(metaApiVersionReleaseSets)
    .where(eq(metaApiVersionReleaseSets.id, apiVersionReleaseSetId))
    .limit(1)
    .get()

  if (!releaseSet) {
    throw new Error(`API version release-set link not found: ${apiVersionReleaseSetId}`)
  }

  const now = toIsoTimestamp()
  await db
    .update(metaApiVersionReleaseSets)
    .set({
      status: 'current',
      publishedAt: now,
      validFrom: now,
      validTo: null,
      updatedAt: now,
    })
    .where(eq(metaApiVersionReleaseSets.id, apiVersionReleaseSetId))
    .run()

  return {
    previousActiveReleaseSetId: null,
  }
}

type CatalogReleaseSetMember = {
  apiVersionReleaseSetId: string
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

export function compareCatalogMembers(
  left: Pick<CatalogReleaseSetMember, 'cohortKey' | 'effectiveFrom' | 'revision'>,
  right: Pick<CatalogReleaseSetMember, 'cohortKey' | 'effectiveFrom' | 'revision'>,
) {
  return (
    catalogMemberSortKey(left).localeCompare(catalogMemberSortKey(right)) ||
    compareReleaseVersions(left.cohortKey, right.cohortKey) ||
    left.revision - right.revision
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
    apiVersionReleaseSetId: string
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
          apiVersionReleaseSetId:
            metaApiCatalogRevisionReleaseSets.apiVersionReleaseSetId,
          cohortKey: metaApiCatalogRevisionReleaseSets.cohortKey,
          domainCode: metaApiCatalogRevisionReleaseSets.domainCode,
          effectiveFrom: metaApiReleaseSets.effectiveFrom,
          isDefault: metaApiCatalogRevisionReleaseSets.isDefault,
          revision: metaApiReleaseSets.revision,
        })
        .from(metaApiCatalogRevisionReleaseSets)
        .innerJoin(
          metaApiVersionReleaseSets,
          eq(
            metaApiCatalogRevisionReleaseSets.apiVersionReleaseSetId,
            metaApiVersionReleaseSets.id,
          ),
        )
        .innerJoin(
          metaApiReleaseSets,
          eq(metaApiVersionReleaseSets.apiReleaseSetId, metaApiReleaseSets.id),
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
          apiVersionReleaseSetId: metaApiVersionReleaseSets.id,
          cohortKey: metaApiReleaseSets.cohortKey,
          domainCode: metaApiReleaseSets.domainCode,
          effectiveFrom: metaApiReleaseSets.effectiveFrom,
          revision: metaApiReleaseSets.revision,
        })
        .from(metaApiReleaseSets)
        .innerJoin(
          metaApiVersionReleaseSets,
          eq(metaApiVersionReleaseSets.apiReleaseSetId, metaApiReleaseSets.id),
        )
        .where(
          and(
            eq(metaApiVersionReleaseSets.apiVersionId, args.apiVersionId),
            eq(metaApiReleaseSets.regionCode, args.regionCode),
            ne(metaApiVersionReleaseSets.status, 'draft'),
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
    apiVersionReleaseSetId: args.apiVersionReleaseSetId,
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
    if (!latest || compareCatalogMembers(member, latest) > 0) {
      latestMemberByDomain.set(member.domainCode, member)
    }
  }
  for (const member of members) {
    member.isDefault =
      latestMemberByDomain.get(member.domainCode)?.apiVersionReleaseSetId ===
      member.apiVersionReleaseSetId
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
        apiVersionReleaseSetId: member.apiVersionReleaseSetId,
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
    lineageStore: ProvenanceStore
    carriedSnapshots: Array<{
      resourceType: ResourceType
      snapshotId: string
      variant?: string
    }>
    currentRelease: Pick<DatasetRecord, 'resourceReleaseId'> | null
    currentReleaseIsCorrected: boolean
    dataset: Pick<DatasetRecord, 'datasetId' | 'releaseCode' | 'resourceReleaseId'> & {
      cohortKey?: string
      datasetCode?: string
      source?: string
      sourceVariant?: string
      sourceVersion?: string
    }
    publishedAt: string
    releaseSetId: string
    apiVersion?: string
    snapshotId: string
    /** The materialised snapshot variant, when it is more specific than its dataset. */
    snapshotVariant?: string
    resourceType: ResourceType
    /** Publish the dataset snapshot, but leave the API release set as draft. */
    deferApiReleaseSet?: boolean
    /** Whether this release-set publication should emit a catalogue revision. */
    publishApiCatalogRevision?: boolean
    /** Whether this release-set publication should update the source release. */
    updateDatasetRelease?: boolean
  },
) {
  await recordProcessingRun(db, {
    apiReleaseSetId: args.releaseSetId,
    stage: 'composition',
    phase: 'compose',
    status: 'running',
  })
  try {
    const releaseSet = await db
      .select({
        apiVersionReleaseSetId: metaApiVersionReleaseSets.id,
        apiCompositionId: metaApiVersionReleaseSets.apiCompositionId,
        apiVersionId: metaApiVersionReleaseSets.apiVersionId,
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
        status: metaApiVersionReleaseSets.status,
        supersedesApiReleaseSetId: metaApiVersionReleaseSets.supersedesApiReleaseSetId,
      })
      .from(metaApiReleaseSets)
      .innerJoin(
        metaApiVersionReleaseSets,
        eq(metaApiVersionReleaseSets.apiReleaseSetId, metaApiReleaseSets.id),
      )
      .innerJoin(
        metaApiVersions,
        eq(metaApiVersionReleaseSets.apiVersionId, metaApiVersions.id),
      )
      .where(
        and(
          eq(metaApiReleaseSets.id, args.releaseSetId),
          args.apiVersion ? eq(metaApiVersions.code, args.apiVersion) : undefined,
        ),
      )
      .limit(1)
      .get()

    if (!releaseSet) {
      throw new Error(`Release set not found: ${args.releaseSetId}`)
    }

    assertApiReleaseVersions(releaseSet, releaseSet.apiFamily)

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
    const datasetVariant =
      args.snapshotVariant ??
      datasetVariantForSource(args.resourceType, args.dataset.source, {
        cohortKey: args.dataset.cohortKey,
        datasetCode: args.dataset.datasetCode,
        sourceVariant: args.dataset.sourceVariant,
        sourceVersion: args.dataset.sourceVersion,
      })
    const datasetMember = compositionMembers.find(
      member =>
        member.domainCode === releaseSet.domainCode &&
        member.resourceType === args.resourceType &&
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
          role:
            member?.role ??
            (snapshot.resourceType === args.resourceType ? 'supplementary' : 'lookup'),
          isRequired: member?.isRequired ?? true,
          cohortMatchingMode: member?.cohortMatchingMode ?? 'carry_forward_optional',
          anchorSnapshotId: null,
          snapshotId: snapshot.snapshotId,
          variant: snapshot.variant ?? 'default',
        },
      )
    }

    releaseSetSnapshots.set(
      buildReleaseSetSnapshotMemberKey(args.resourceType, datasetVariant),
      {
        role: datasetMember?.role ?? 'primary',
        isRequired: datasetMember?.isRequired ?? true,
        cohortMatchingMode: datasetMember?.cohortMatchingMode ?? 'exact_ref',
        anchorSnapshotId: null,
        snapshotId: args.snapshotId,
        variant: datasetVariant,
      },
    )

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

    if (!deferApiReleaseSet) {
      await assertCuratedReleaseInputs(
        db,
        compositionMembers
          .filter(member => member.domainCode === releaseSet.domainCode)
          .flatMap(member => {
            const selected = releaseSetSnapshots.get(
              buildReleaseSetSnapshotMemberKey(member.resourceType, member.variant),
            )
            return selected
              ? [
                  {
                    snapshotId: selected.snapshotId,
                    resourceType: member.resourceType,
                    variant: member.variant,
                  },
                ]
              : []
          }),
      )
    }

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
            .innerJoin(
              metaApiVersionReleaseSets,
              eq(metaApiVersionReleaseSets.apiReleaseSetId, metaApiReleaseSets.id),
            )
            .where(
              and(
                eq(metaApiVersionReleaseSets.apiVersionId, releaseSet.apiVersionId),
                eq(metaApiReleaseSets.regionCode, releaseSetRegionCode),
                eq(metaApiReleaseSets.domainCode, releaseSet.domainCode),
                ne(metaApiVersionReleaseSets.status, 'draft'),
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
      compareReleaseVersions(releaseSetCohortKey, latestPublishedReleaseSet.cohortKey) >
        0 ||
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
            apiVersionReleaseSetId: releaseSet.apiVersionReleaseSetId,
            releaseSetRevision: releaseSet.revision,
          })
        : null

    const releaseSetSnapshotIds = [
      ...new Set(
        [...releaseSetSnapshots.values()].map(snapshot => snapshot.snapshotId),
      ),
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
    const selectedSourceSchemaRows = await queryInBatches(
      releaseSetSnapshotIds,
      async ids =>
        await db
          .select({
            anchorReleaseId: metaSnapshotResourceReleases.anchorReleaseId,
            producerSnapshotId: metaSnapshotResourceReleases.snapshotId,
            datasetId: metaDatasets.id,
            datasetCode: metaDatasets.code,
            source: metaPublishers.code,
            resourceReleaseId: metaResourceReleases.id,
            resourceType: metaResourceReleases.resourceType,
            sourceReleaseId: metaResourceReleases.sourceReleaseId,
            processingRules: processingRulesSelection(
              metaResourceReleases.processingRules,
            ),
            sourceSchemaVersion: metaResourceReleases.sourceSchemaVersion,
            sourceVersion: metaResourceReleases.sourceVersion,
          })
          .from(metaSnapshotResourceReleases)
          .innerJoin(
            metaDatasets,
            eq(metaSnapshotResourceReleases.datasetId, metaDatasets.id),
          )
          .innerJoin(metaPublishers, eq(metaDatasets.publisherId, metaPublishers.id))
          .innerJoin(
            metaResourceReleases,
            eq(metaSnapshotResourceReleases.resourceReleaseId, metaResourceReleases.id),
          )
          .where(
            and(
              inArray(metaSnapshotResourceReleases.snapshotId, ids),
              // Lookup dependencies identify the source used to resolve a snapshot,
              // rather than an API release-set input. Their schema must not override
              // the primary source selected for the same dataset in this release set.
              ne(metaSnapshotResourceReleases.role, 'lookup'),
            ),
          )
          .all(),
    )
    // A derived snapshot can retain its processing rules on the exact release that
    // anchored its materialisation. Include that immutable release when resolving API
    // field rule pins; the derived resource release can legitimately contain no copy of
    // the anchor's rules.
    const anchorReleaseIds = [
      ...new Set(
        selectedSourceSchemaRows.flatMap(row =>
          row.anchorReleaseId ? [row.anchorReleaseId] : [],
        ),
      ),
    ]
    const anchorSourceSchemaRows = anchorReleaseIds.length
      ? await queryInBatches(
          anchorReleaseIds,
          async ids =>
            await db
              .select({
                datasetId: metaDatasets.id,
                datasetCode: metaDatasets.code,
                source: metaPublishers.code,
                resourceReleaseId: metaResourceReleases.id,
                resourceType: metaResourceReleases.resourceType,
                sourceReleaseId: metaResourceReleases.sourceReleaseId,
                processingRules: processingRulesSelection(
                  metaResourceReleases.processingRules,
                ),
                sourceSchemaVersion: metaResourceReleases.sourceSchemaVersion,
                sourceVersion: metaResourceReleases.sourceVersion,
              })
              .from(metaResourceReleases)
              .innerJoin(
                metaDatasets,
                eq(metaResourceReleases.datasetId, metaDatasets.id),
              )
              .innerJoin(
                metaPublishers,
                eq(metaDatasets.publisherId, metaPublishers.id),
              )
              .where(inArray(metaResourceReleases.id, ids))
              .all(),
        )
      : []
    const sourceSchemaRows = [
      ...new Map(
        [...selectedSourceSchemaRows, ...anchorSourceSchemaRows].map(row => [
          row.resourceReleaseId,
          row,
        ]),
      ).values(),
    ]
    const assemblyPolicyRows = await queryInBatches(releaseSetSnapshotIds, async ids =>
      db
        .select({
          snapshotId: metaSchema.metaSnapshotAssemblies.snapshotId,
          snapshotRecipeId: metaSchema.metaSnapshotRecipes.id,
          resourceType: metaSchema.metaSnapshotRecipes.resourceType,
          processingRules: processingRulesSelection(
            metaSchema.metaSnapshotRecipes.processingRules,
          ),
        })
        .from(metaSchema.metaSnapshotAssemblies)
        .innerJoin(
          metaSchema.metaSnapshotRecipes,
          eq(
            metaSchema.metaSnapshotAssemblies.snapshotRecipeId,
            metaSchema.metaSnapshotRecipes.id,
          ),
        )
        .where(inArray(metaSchema.metaSnapshotAssemblies.snapshotId, ids))
        .all(),
    )
    const sourceReleaseId = await resolveSourceReleaseId(
      db,
      args.dataset.resourceReleaseId,
    )
    const sourceReleaseSnapshotIds = [
      ...new Set(
        (
          await db
            .select({ id: metaSnapshots.id })
            .from(metaSnapshotResourceReleases)
            .innerJoin(
              metaSnapshots,
              eq(metaSnapshotResourceReleases.snapshotId, metaSnapshots.id),
            )
            .where(
              and(
                eq(
                  metaSnapshotResourceReleases.resourceReleaseId,
                  args.dataset.resourceReleaseId,
                ),
                eq(metaSnapshots.resourceType, args.resourceType),
              ),
            )
            .all()
        ).map(row => row.id),
      ),
    ]

    const sourceSchemas = new Map<string, string>()
    const sourceSchemasByRelease = new Map<string, string>()
    const sourceSchemaVariants: Record<string, string[]> = {}

    for (const row of sourceSchemaRows) {
      const sourceSchemaVersion = await resolveSourceSchemaVersion({
        source: row.source,
        sourceVersion: row.sourceVersion,
        storedSourceSchemaVersion: row.sourceSchemaVersion,
      })
      sourceSchemasByRelease.set(row.resourceReleaseId, sourceSchemaVersion)
      const versions = sourceSchemaVariants[row.datasetCode] ?? []
      if (!versions.includes(sourceSchemaVersion)) versions.push(sourceSchemaVersion)
      versions.sort()
      sourceSchemaVariants[row.datasetCode] = versions
      sourceSchemas.set(row.datasetCode, versions[0]!)
    }

    const canonicalSourceSchemas = canonicaliseApiFieldSourceSchemas(
      Object.fromEntries(
        [...sourceSchemas.entries()].sort(([left], [right]) =>
          left.localeCompare(right),
        ),
      ),
    )
    const apiFieldFixtureLookup = {
      apiVersion: releaseSet.apiVersion,
      domainCode: releaseSet.domainCode,
      lineageSnapshotVersions: primarySnapshotLineageVersions,
      schemaVersion: releaseSet.schemaVersion,
      rulesetVersion: releaseSet.rulesetVersion,
      sourceSchemas: canonicalSourceSchemas.sourceSchemas,
      sourceSchemaVariants,
      redundantSourceDatasetCodes: canonicalSourceSchemas.redundantDatasetCodes,
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
    const { apiFieldProvenanceRows, publisherFieldsByDatasetId } =
      resolvedApiFieldFixture
        ? await (async () => {
            const sourceDatasetCodes = [
              ...new Set(
                resolvedApiFieldFixture.fields.map(field => field.sourceDatasetCode),
              ),
            ]
            const sourceDatasets = await queryInBatches(
              sourceDatasetCodes,
              async ids =>
                await db
                  .select({
                    code: metaDatasets.code,
                    id: metaDatasets.id,
                  })
                  .from(metaDatasets)
                  .where(inArray(metaDatasets.code, ids))
                  .all(),
            )
            const sourceDatasetIdsByCode = new Map(
              sourceDatasets.map(dataset => [dataset.code, dataset.id]),
            )
            const publisherFieldsByDatasetId = new Map<
              string,
              Record<string, string | string[]>
            >()
            for (const [datasetCode, publisherFields] of Object.entries(
              resolvedApiFieldFixture.publisherFields,
            )) {
              const sourceDatasetId = sourceDatasetIdsByCode.get(datasetCode)
              if (sourceDatasetId) {
                publisherFieldsByDatasetId.set(sourceDatasetId, publisherFields)
              }
            }

            const apiFieldProvenanceRows = resolvedApiFieldFixture.fields.map(field => {
              const sourceDatasetId = sourceDatasetIdsByCode.get(
                field.sourceDatasetCode,
              )

              if (!sourceDatasetId) {
                throw new Error(`Source dataset not found: ${field.sourceDatasetCode}`)
              }
              const resolverRules = pinApiFieldRules(field, [
                ...sourceSchemaRows.filter(
                  row => row.datasetCode === field.sourceDatasetCode,
                ),
                // A selected Division recipe can derive IDs used by its geometry
                // companions. Resolve against all selected recipes so those
                // fields retain the rule that actually produced their inputs.
                ...assemblyPolicyRows,
              ])

              return {
                id: buildDeterministicApiFieldProvenanceId({
                  apiReleaseSetId: args.releaseSetId,
                  apiField: field.apiField,
                  resourceType: field.resourceType,
                  variant: field.variant,
                  sourceDatasetId,
                  inputs: field.inputs,
                  contributionType: field.contributionType,
                  priority: field.priority,
                }),
                apiReleaseSetId: args.releaseSetId,
                apiField: field.apiField,
                resourceType: field.resourceType,
                variant: field.variant ?? null,
                sourceDatasetId,
                inputs: field.inputs,
                canonicalInputs: field.canonicalInputs,
                resolverRules,
                resolverCode: field.resolverCode,
                contributionType: field.contributionType,
                priority: field.priority,
                confidence: field.confidence ?? null,
                versionHash: computeVersionHash({
                  apiField: field.apiField,
                  resourceType: field.resourceType,
                  apiReleaseSetId: args.releaseSetId,
                  variant: field.variant ?? null,
                  confidence: field.confidence ?? null,
                  contributionType: field.contributionType,
                  fixtureVersionHash: resolvedApiFieldFixture.versionHash,
                  priority: field.priority,
                  resolverRules,
                  resolverCode: field.resolverCode,
                  sourceDatasetCode: field.sourceDatasetCode,
                  inputs: field.inputs,
                }),
                createdAt: publishedAt,
                updatedAt: publishedAt,
              }
            })
            return { apiFieldProvenanceRows, publisherFieldsByDatasetId }
          })()
        : { apiFieldProvenanceRows: [], publisherFieldsByDatasetId: null }

    const processingManifestRows = resolvedApiFieldFixture
      ? await queryInBatches(
          sourceSchemaRows.map(row => row.resourceReleaseId),
          async ids =>
            db
              .select({
                resourceReleaseId: metaSchema.processingAudits.resourceReleaseId,
                hash: metaSchema.processingAudits.manifestHash,
                byteLength: metaSchema.processingAudits.byteLength,
              })
              .from(metaSchema.processingAudits)
              .where(
                and(
                  inArray(metaSchema.processingAudits.resourceReleaseId, ids),
                  eq(metaSchema.processingAudits.attemptStatus, 'completed'),
                  eq(metaSchema.processingAudits.stage, 'ingestion'),
                ),
              )
              .all(),
        )
      : []
    const processingManifests = new Map(
      processingManifestRows.map(row => [
        row.resourceReleaseId,
        { hash: row.hash, byteLength: row.byteLength },
      ]),
    )

    const lineage = resolvedApiFieldFixture
      ? buildFieldLineageDefinition(
          apiFieldProvenanceRows.map(row => ({
            apiField: row.apiField,
            resourceType: row.resourceType,
            variant: row.variant,
            sourceDatasetId: row.sourceDatasetId,
            inputs: row.inputs,
            canonicalInputs: row.canonicalInputs,
            resolverRules: row.resolverRules,
            resolverCode: row.resolverCode,
            contributionType: row.contributionType,
            priority: row.priority,
            confidence: row.confidence,
          })),
          publisherFieldsByDatasetId ?? new Map(),
          {
            api: {
              version: releaseSet.apiVersion,
              responseSchemaVersion: releaseSet.schemaVersion,
              responseSchemaHash: resolvedApiFieldFixture.responseFieldsVersionHash,
            },
            apiReleaseSetId: args.releaseSetId,
            apiVersionReleaseSetId: releaseSet.apiVersionReleaseSetId,
            responseDefinition: resolveApiResponseFields(
              releaseSet.apiVersion,
              releaseSet.schemaVersion,
            ),
            sources: sourceSchemaRows.map(row => ({
              sourceDatasetId: row.datasetId,
              resourceType: row.resourceType,
              datasetCode: row.datasetCode,
              sourceSchemaVersion: sourceSchemasByRelease.get(row.resourceReleaseId)!,
              resourceReleaseId: row.resourceReleaseId,
              sourceReleaseId: row.sourceReleaseId,
              processingRules: row.processingRules,
              processingManifest: processingManifests.get(row.resourceReleaseId),
              producerSnapshotIds: [
                ...new Set(
                  selectedSourceSchemaRows
                    .filter(
                      selected =>
                        selected.resourceReleaseId === row.resourceReleaseId ||
                        selected.anchorReleaseId === row.resourceReleaseId,
                    )
                    .map(selected => selected.producerSnapshotId),
                ),
              ].sort(),
            })),
            snapshots: [...releaseSetSnapshots].map(([key, selected]) => ({
              snapshotId: selected.snapshotId,
              resourceType: key.slice(0, key.indexOf(':')),
              ...assemblyPolicyRows.find(
                recipe => recipe.snapshotId === selected.snapshotId,
              ),
            })),
          },
        )
      : null

    const lineageReference =
      !deferApiReleaseSet && lineage
        ? await retainFieldLineage(args.lineageStore, lineage.id, lineage.definition)
        : null

    if (lineageReference) {
      const retained = await db
        .select()
        .from(metaFieldLineageDefinitions)
        .where(eq(metaFieldLineageDefinitions.id, lineageReference.id))
        .get()
      if (
        retained &&
        (retained.manifestHash !== lineageReference.manifestHash ||
          retained.manifestByteLength !== lineageReference.manifestByteLength ||
          retained.schemaVersion !== lineageReference.schemaVersion)
      )
        throw new Error(
          `Conflicting immutable lineage catalogue entry: ${lineageReference.id}`,
        )
    }

    const compositionAudits = deferApiReleaseSet
      ? []
      : await retainCompositionAudits(
          args.lineageStore,
          args.releaseSetId,
          selectedSourceSchemaRows,
          { snapshots: [...releaseSetSnapshots.values()], policy: composition ?? null },
        )

    await runAtomicWriteStatements(db as AtomicWritableDb, tx => {
      const statements: WriteStatement[] = compositionAudits.map(audit =>
        tx
          .insert(metaSchema.processingAudits)
          .values(audit)
          .onConflictDoUpdate({
            target: [
              metaSchema.processingAudits.resourceReleaseId,
              metaSchema.processingAudits.stage,
              metaSchema.processingAudits.ownerId,
            ],
            set: {
              manifestHash: audit.manifestHash,
              byteLength: audit.byteLength,
              applicationCount: audit.applicationCount,
              attemptStatus: audit.attemptStatus,
            },
          }),
      )
      statements.push(
        ...chunkArray(sourceReleaseSnapshotIds, D1_IN_ARRAY_BATCH_SIZE).map(ids =>
          tx
            .update(metaSnapshots)
            .set({
              status: 'published',
              publishedAt,
              validFrom: publishedAt,
              validTo: null,
              updatedAt: publishedAt,
            })
            .where(inArray(metaSnapshots.id, ids)),
        ),
      )

      statements.push(
        tx
          .delete(metaApiReleaseSetSnapshots)
          .where(eq(metaApiReleaseSetSnapshots.apiReleaseSetId, args.releaseSetId)),
        ...(updateDatasetRelease
          ? [
              tx
                .update(metaResourceReleases)
                .set({
                  status: 'current',
                  revokedAt: null,
                  revocationReason: null,
                  updatedAt: publishedAt,
                })
                .where(eq(metaResourceReleases.id, args.dataset.resourceReleaseId)),
              ...(sourceReleaseId
                ? [
                    tx
                      .update(metaSourceReleases)
                      .set({
                        status: 'current',
                        revokedAt: null,
                        revocationReason: null,
                        updatedAt: publishedAt,
                      })
                      .where(sourceReleasePublicationCondition(sourceReleaseId)),
                  ]
                : []),
            ]
          : []),
      )

      if (!deferApiReleaseSet) {
        statements.push(
          ...(shouldActivateReleaseSet
            ? [
                tx
                  .update(metaApiVersionReleaseSets)
                  .set({
                    status: 'archived',
                    validTo: publishedAt,
                    updatedAt: publishedAt,
                  })
                  .where(
                    and(
                      eq(
                        metaApiVersionReleaseSets.apiVersionId,
                        releaseSet.apiVersionId,
                      ),
                      eq(metaApiVersionReleaseSets.status, 'current'),
                      ne(
                        metaApiVersionReleaseSets.id,
                        releaseSet.apiVersionReleaseSetId,
                      ),
                      sql`${metaApiVersionReleaseSets.apiReleaseSetId} IN (
                  SELECT id FROM apiReleaseSets
                  WHERE regionCode = ${releaseSet.regionCode}
                    AND domainCode = ${releaseSet.domainCode}
                )`,
                    ),
                  ),
              ]
            : []),
          tx
            .update(metaApiVersionReleaseSets)
            .set({
              status: 'current',
              validTo: null,
              updatedAt: publishedAt,
              ...(shouldActivateReleaseSet
                ? { publishedAt, validFrom: publishedAt }
                : {}),
            })
            .where(eq(metaApiVersionReleaseSets.id, releaseSet.apiVersionReleaseSetId)),
          tx
            .delete(metaApiFieldProvenance)
            .where(eq(metaApiFieldProvenance.apiReleaseSetId, args.releaseSetId)),
        )

        if (!shouldActivateReleaseSet) {
          statements.push(
            tx
              .update(metaApiVersionReleaseSets)
              .set({
                status: 'archived',
                publishedAt,
                validFrom: publishedAt,
                validTo: publishedAt,
                updatedAt: publishedAt,
              })
              .where(
                eq(metaApiVersionReleaseSets.id, releaseSet.apiVersionReleaseSetId),
              ),
          )
        }
      }

      if (apiCatalogRevision) {
        statements.push(
          tx
            .update(metaApiCatalogRevisions)
            .set({ status: 'archived', updatedAt: publishedAt })
            .where(
              and(
                eq(metaApiCatalogRevisions.apiVersionId, releaseSet.apiVersionId),
                eq(metaApiCatalogRevisions.regionCode, releaseSetRegionCode),
                eq(metaApiCatalogRevisions.status, 'current'),
              ),
            ),
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
              apiVersionReleaseSetId: member.apiVersionReleaseSetId,
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

      if (!deferApiReleaseSet && lineage && lineageReference) {
        statements.push(
          tx
            .insert(metaFieldLineageDefinitions)
            .values(lineageReference)
            .onConflictDoNothing(),
          tx.insert(metaApiFieldProvenance).values({
            apiReleaseSetId: args.releaseSetId,
            definitionId: lineage.id,
            binding: lineage.binding,
          }),
        )
      }

      if (updateDatasetRelease && args.currentRelease) {
        const replacedReason = args.currentReleaseIsCorrected
          ? `Superseded by corrected release ${args.dataset.releaseCode}.`
          : `Replaced by release ${args.dataset.releaseCode}.`

        statements.push(
          tx.insert(metaReleaseSetLifecycleJournal).values({
            id: crypto.randomUUID(),
            resourceReleaseId: args.dataset.resourceReleaseId,
            relatedResourceReleaseId: args.currentRelease.resourceReleaseId,
            snapshotId: args.snapshotId,
            apiVersionReleaseSetId: releaseSet.apiVersionReleaseSetId,
            action: 'published',
            statusFrom: null,
            statusTo: 'current',
            metadataJson: {
              replacedReleaseId: args.currentRelease.resourceReleaseId,
              resourceType: args.resourceType,
            },
            createdAt: publishedAt,
          }),
          tx.insert(metaReleaseSetLifecycleJournal).values({
            id: crypto.randomUUID(),
            resourceReleaseId: args.currentRelease.resourceReleaseId,
            relatedResourceReleaseId: args.dataset.resourceReleaseId,
            snapshotId: args.snapshotId,
            apiVersionReleaseSetId: releaseSet.apiVersionReleaseSetId,
            action: args.currentReleaseIsCorrected ? 'revoked' : 'replaced',
            statusFrom: 'current',
            statusTo: args.currentReleaseIsCorrected ? 'revoked' : 'archived',
            metadataJson: {
              replacementReleaseId: args.dataset.resourceReleaseId,
              resourceType: args.resourceType,
            },
            createdAt: publishedAt,
          }),
          tx
            .update(metaResourceReleases)
            .set({
              supersededByResourceReleaseId: args.dataset.resourceReleaseId,
              updatedAt: publishedAt,
            })
            .where(eq(metaResourceReleases.id, args.currentRelease.resourceReleaseId)),
        )

        if (args.currentReleaseIsCorrected) {
          statements.push(
            tx
              .update(metaResourceReleases)
              .set({
                revokedAt: publishedAt,
                revocationReason: replacedReason,
                status: 'revoked',
                updatedAt: publishedAt,
              })
              .where(
                eq(metaResourceReleases.id, args.currentRelease.resourceReleaseId),
              ),
          )
        } else {
          statements.push(
            tx
              .update(metaResourceReleases)
              .set({
                status: 'archived',
                updatedAt: publishedAt,
              })
              .where(
                eq(metaResourceReleases.id, args.currentRelease.resourceReleaseId),
              ),
          )
        }
      } else if (updateDatasetRelease) {
        statements.push(
          tx.insert(metaReleaseSetLifecycleJournal).values({
            id: crypto.randomUUID(),
            resourceReleaseId: args.dataset.resourceReleaseId,
            relatedResourceReleaseId: null,
            snapshotId: args.snapshotId,
            apiVersionReleaseSetId: releaseSet.apiVersionReleaseSetId,
            action: 'published',
            statusFrom: null,
            statusTo: 'current',
            metadataJson: {
              resourceType: args.resourceType,
            },
            createdAt: publishedAt,
          }),
        )
      }

      return statements
    })

    await recordProcessingRun(db, {
      apiReleaseSetId: args.releaseSetId,
      stage: 'composition',
      phase: 'compose',
      status: 'completed',
      results: {
        snapshotCount: releaseSetSnapshots.size,
        publication: deferApiReleaseSet ? 'draft' : 'published',
      },
    })
    return apiCatalogRevision
  } catch (error) {
    await recordProcessingRun(db, {
      apiReleaseSetId: args.releaseSetId,
      stage: 'composition',
      phase: 'compose',
      status: 'error',
      error: error instanceof Error ? error.message : String(error),
    })
    throw error
  }
}

const CENSTATD_DENSITY_DISTRICT_DATASET =
  'ds-hk-hkgov-censtatd-division-statistic-land-area-population-density-district'
const CENSTATD_PERMANENT_LIVING_QUARTERS_DATASET =
  'ds-hk-hkgov-censtatd-division-statistic-permanent-living-quarters'
const CENSTATD_POPULATION_HOUSEHOLDS_DISTRICT_DATASET =
  'ds-hk-hkgov-censtatd-division-statistic-population-households-district'

/**
 * Selects the canonical C&SD source relationship for API field provenance.
 *
 * Density remains a retained snapshot source because it can supply the first
 * reviewed district geometry. Once Population and Household Statistics or
 * Permanent Living Quarters is present, however, it is redundant for the API
 * field contract and must not create a second competing field signature.
 */
export function canonicaliseApiFieldSourceSchemas(
  sourceSchemas: Record<string, string>,
) {
  const canonicalSourceSchemas = { ...sourceSchemas }
  const hasDensity =
    canonicalSourceSchemas[CENSTATD_DENSITY_DISTRICT_DATASET] !== undefined
  const hasCanonicalCenstatdSource =
    canonicalSourceSchemas[CENSTATD_POPULATION_HOUSEHOLDS_DISTRICT_DATASET] !==
      undefined ||
    canonicalSourceSchemas[CENSTATD_PERMANENT_LIVING_QUARTERS_DATASET] !== undefined
  const redundantDatasetCodes =
    hasDensity && hasCanonicalCenstatdSource ? [CENSTATD_DENSITY_DISTRICT_DATASET] : []

  for (const datasetCode of redundantDatasetCodes) {
    delete canonicalSourceSchemas[datasetCode]
  }

  return {
    redundantDatasetCodes,
    sourceSchemas: canonicalSourceSchemas,
  }
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
  resourceReleaseId: string,
  role: 'primary' | 'enrichment' | 'fallback' | 'lookup',
  options: {
    anchorReleaseId?: string | null
    selectedByRule?: string | null
    selectionMode?: string | null
    sourceCohortKey?: string | null
  } = {},
) {
  await db
    .insert(metaSnapshotResourceReleases)
    .values({
      snapshotId,
      datasetId,
      resourceReleaseId,
      role,
      anchorReleaseId: options.anchorReleaseId ?? null,
      selectedByRule: options.selectedByRule ?? null,
      selectionMode: options.selectionMode ?? null,
      sourceCohortKey: options.sourceCohortKey ?? null,
      createdAt: toIsoTimestamp(),
    })
    .onConflictDoUpdate({
      target: [
        metaSnapshotResourceReleases.snapshotId,
        metaSnapshotResourceReleases.resourceReleaseId,
      ],
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
      datasetId: metaSnapshotResourceReleases.datasetId,
      resourceType: metaSnapshots.resourceType,
      sourceCohortKey: metaSnapshots.cohortKey,
      sourceReleaseId: metaSnapshotResourceReleases.resourceReleaseId,
    })
    .from(metaSnapshotResourceReleases)
    .innerJoin(
      metaSnapshots,
      eq(metaSnapshotResourceReleases.snapshotId, metaSnapshots.id),
    )
    .where(
      and(
        eq(metaSnapshotResourceReleases.snapshotId, args.lookupSnapshotId),
        eq(metaSnapshotResourceReleases.role, 'primary'),
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
  const snapshot = await db
    .select({
      resourceType: metaSnapshots.resourceType,
      cohortKey: metaSnapshots.cohortKey,
    })
    .from(metaSnapshots)
    .where(eq(metaSnapshots.id, args.snapshotId))
    .get()
  if (!snapshot)
    throw new Error(`Lookup consumer snapshot is missing: ${args.snapshotId}.`)
  await recordEffectiveSnapshotAssembly(db, {
    snapshotId: args.snapshotId,
    resourceType: snapshot.resourceType,
    anchorCohortKey: snapshot.cohortKey,
    anchorReleaseId: args.anchorReleaseId,
    dependencies: { [lookupSource.resourceType]: args.lookupSnapshotId },
  })
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
      role: options.role ?? 'lookup',
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
        role: options.role ?? 'lookup',
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

export async function listSnapshotResourceReleases(
  db: HarbourReadableDb,
  snapshotIds: string[],
) {
  if (snapshotIds.length === 0) return []

  return queryInBatches(
    snapshotIds,
    async ids =>
      await db
        .select({
          datasetCode: metaDatasets.code,
          snapshotId: metaSnapshotResourceReleases.snapshotId,
          sourceReleaseId: metaSnapshotResourceReleases.resourceReleaseId,
        })
        .from(metaSnapshotResourceReleases)
        .innerJoin(
          metaDatasets,
          eq(metaSnapshotResourceReleases.datasetId, metaDatasets.id),
        )
        .where(
          and(
            inArray(metaSnapshotResourceReleases.snapshotId, ids),
            ne(metaSnapshotResourceReleases.role, 'lookup'),
          ),
        )
        .all(),
  )
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

  const snapshots = options.snapshotIds
    ? await queryInBatches(
        options.snapshotIds,
        async ids =>
          await db
            .select({
              snapshotId: metaSnapshots.id,
              resourceType: metaSnapshots.resourceType,
            })
            .from(metaSnapshots)
            .where(and(...snapshotConditions, inArray(metaSnapshots.id, ids)))
            .all(),
      )
    : await db
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
    // A draft release set may be waiting for a dependent companion snapshot.
    // Its already materialised members must remain in current storage until
    // the release set is published or explicitly archived.
    protectedRows = await db
      .select({ snapshotId: metaApiReleaseSetSnapshots.snapshotId })
      .from(metaApiReleaseSetSnapshots)
      .innerJoin(
        metaApiReleaseSets,
        eq(metaApiReleaseSetSnapshots.apiReleaseSetId, metaApiReleaseSets.id),
      )
      .innerJoin(
        metaApiVersionReleaseSets,
        eq(metaApiVersionReleaseSets.apiReleaseSetId, metaApiReleaseSets.id),
      )
      .where(ne(metaApiVersionReleaseSets.status, 'archived'))
      .all()
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
      .innerJoin(
        metaApiVersionReleaseSets,
        eq(metaApiVersionReleaseSets.apiReleaseSetId, metaApiReleaseSets.id),
      )
      .where(ne(metaApiVersionReleaseSets.status, 'archived'))
      .all()
  }
  const protectedSnapshotIds = new Set(protectedRows.map(row => row.snapshotId))

  if (
    snapshots.some(
      row =>
        row.resourceType === 'divisionArea' || row.resourceType === 'divisionBoundary',
    )
  ) {
    for (const snapshotId of await listRetainedGeometrySnapshotIds(db)) {
      protectedSnapshotIds.add(snapshotId)
    }
  }

  return snapshots.filter(row => !protectedSnapshotIds.has(row.snapshotId))
}

export async function resolveActiveSnapshotForType(
  db: HarbourReadableDb,
  resourceType: ResourceType,
  options: {
    domainCode?: string
    regionCode?: RegionCode
    variant?: string
  } = {},
) {
  const domainCode = await resolveDomainCodeForType(
    db,
    resourceType,
    options.domainCode,
  )
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
          metaApiVersionReleaseSets,
          eq(metaApiVersionReleaseSets.apiReleaseSetId, metaApiReleaseSets.id),
        )
        .innerJoin(
          metaApiVersions,
          eq(metaApiVersionReleaseSets.apiVersionId, metaApiVersions.id),
        )
        .innerJoin(
          metaSnapshots,
          eq(metaApiReleaseSetSnapshots.snapshotId, metaSnapshots.id),
        )
        .innerJoin(
          metaSnapshotResourceReleases,
          eq(metaSnapshotResourceReleases.snapshotId, metaSnapshots.id),
        )
        .innerJoin(
          metaDatasets,
          eq(metaSnapshotResourceReleases.datasetId, metaDatasets.id),
        )
        .where(
          and(
            eq(metaApiVersions.code, getApiVersionCodeForType(resourceType)),
            eq(metaApiVersionReleaseSets.status, 'current'),
            eq(metaApiReleaseSets.domainCode, domainCode),
            eq(metaSnapshots.resourceType, resourceType),
            options.variant
              ? eq(metaApiReleaseSetSnapshots.variant, options.variant)
              : undefined,
            eq(metaSnapshotResourceReleases.role, 'primary'),
            eq(metaDatasets.regionCode, options.regionCode),
          ),
        )
        .orderBy(
          desc(metaApiVersionReleaseSets.publishedAt),
          desc(metaApiReleaseSets.createdAt),
        )
        .limit(1)
        .get()) ?? null
    )
  }

  const activeReleaseSet = await resolveActiveReleaseSetForType(
    db,
    resourceType,
    domainCode,
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
        metaApiVersionReleaseSets,
        eq(metaApiVersionReleaseSets.apiReleaseSetId, metaApiReleaseSets.id),
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

/** A pinned release set may belong to an archived catalogue checkpoint. */
function releaseSetCatalogCondition(args: {
  catalogRevision?: string
  releaseSet?: string
  domainCode: string
}) {
  if (!args.releaseSet || args.catalogRevision) return undefined
  return sql`exists (
    select 1 from ${metaApiCatalogRevisionReleaseSets} as membership
    join ${metaApiVersionReleaseSets} as version_release_set
      on version_release_set.id = membership.apiVersionReleaseSetId
    join ${metaApiReleaseSets} as release_set
      on release_set.id = version_release_set.apiReleaseSetId
    where membership.apiCatalogRevisionId = ${metaApiCatalogRevisions.id}
      and membership.domainCode = ${args.domainCode}
      and version_release_set.apiVersionId = ${metaApiCatalogRevisions.apiVersionId}
      and release_set.code = ${args.releaseSet}
  )`
}

/** Historical selectors may resolve retained catalogue checkpoints. */
function apiCatalogRevisionStatusCondition(args: {
  catalogRevision?: string
  knownAt?: string
  releaseSet?: string
}) {
  return args.catalogRevision || args.knownAt || args.releaseSet
    ? ne(metaApiCatalogRevisions.status, 'draft')
    : eq(metaApiCatalogRevisions.status, 'current')
}

export async function resolveApiReleaseSetForRequest(
  db: HarbourReadableDb,
  resourceType: ResourceType,
  args: {
    apiVersion?: string
    inventory?: string
    allInventories?: boolean
    catalogRevision?: string
    cohortKey?: string
    domainCode: string
    effectiveAt?: string
    knownAt?: string
    regionCode: RegionCode
    releaseSet?: string
  },
) {
  const apiVersionCode = args.apiVersion ?? getApiVersionCodeForType(resourceType)
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
        apiCatalogRevisionStatusCondition(args),
        releaseSetCatalogCondition(args),
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
      revision: metaApiReleaseSets.revision,
      schemaVersion: metaApiReleaseSets.schemaVersion,
      rulesetVersion: metaApiReleaseSets.rulesetVersion,
    })
    .from(metaApiCatalogRevisionReleaseSets)
    .innerJoin(
      metaApiVersionReleaseSets,
      eq(
        metaApiCatalogRevisionReleaseSets.apiVersionReleaseSetId,
        metaApiVersionReleaseSets.id,
      ),
    )
    .innerJoin(
      metaApiReleaseSets,
      eq(metaApiVersionReleaseSets.apiReleaseSetId, metaApiReleaseSets.id),
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
          ? sql`${metaApiReleaseSets.effectiveFrom} <= ${effectiveAt}`
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
  resourceType: ResourceType,
  args: Parameters<typeof resolveApiReleaseSetForRequest>[2],
) {
  const releaseSet = await resolveApiReleaseSetForRequest(db, resourceType, args)
  if (!releaseSet) return null

  const snapshots = await listApiReleaseSetSnapshots(db, releaseSet.id)
  if (
    !args.allInventories &&
    resourceType === 'division' &&
    (args.inventory || args.apiVersion === 'api-divisions-v0.2')
  ) {
    const selected = selectApiInventory(snapshots, resourceType, args.inventory)
    return {
      releaseSet: { ...releaseSet, inventory: selected.inventory },
      snapshots: selected.snapshots,
    }
  }
  return { releaseSet, snapshots }
}

/**
 * Resolves every release set in a published catalogue scope for discovery.
 *
 * Data requests deliberately resolve one default release set so that every
 * record in their response is coherent. Registry discovery is different:
 * Statistics sources publish independently, so omitting an explicit release
 * selector must retain every release set represented by the catalogue.
 */
export async function listApiReleaseSetSnapshotsForRegistryRequest(
  db: HarbourReadableDb,
  resourceType: ResourceType,
  args: Parameters<typeof resolveApiReleaseSetForRequest>[2],
) {
  const apiVersionCode = args.apiVersion ?? getApiVersionCodeForType(resourceType)
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
        apiCatalogRevisionStatusCondition(args),
        releaseSetCatalogCondition(args),
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
  const releaseSets = await db
    .select({
      id: metaApiReleaseSets.id,
      code: metaApiReleaseSets.code,
      status: metaApiVersionReleaseSets.status,
      cohortKey: metaApiCatalogRevisionReleaseSets.cohortKey,
      domainCode: metaApiCatalogRevisionReleaseSets.domainCode,
      effectiveFrom: metaApiReleaseSets.effectiveFrom,
      revision: metaApiReleaseSets.revision,
      schemaVersion: metaApiReleaseSets.schemaVersion,
      rulesetVersion: metaApiReleaseSets.rulesetVersion,
    })
    .from(metaApiCatalogRevisionReleaseSets)
    .innerJoin(
      metaApiVersionReleaseSets,
      eq(
        metaApiCatalogRevisionReleaseSets.apiVersionReleaseSetId,
        metaApiVersionReleaseSets.id,
      ),
    )
    .innerJoin(
      metaApiReleaseSets,
      eq(metaApiVersionReleaseSets.apiReleaseSetId, metaApiReleaseSets.id),
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
          ? sql`${metaApiReleaseSets.effectiveFrom} <= ${effectiveAt}`
          : undefined,
      ),
    )
    .orderBy(desc(metaApiReleaseSets.effectiveFrom), desc(metaApiReleaseSets.revision))
    .all()
  if (releaseSets.length === 0) return null

  const snapshots = await queryInBatches(
    releaseSets.map(releaseSet => releaseSet.id),
    async ids =>
      await db
        .select({
          apiReleaseSetId: metaApiReleaseSetSnapshots.apiReleaseSetId,
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
        .where(inArray(metaApiReleaseSetSnapshots.apiReleaseSetId, ids))
        .all(),
  )
  const snapshotsByReleaseSet = new Map<string, typeof snapshots>()
  for (const snapshot of snapshots) {
    const selected = snapshotsByReleaseSet.get(snapshot.apiReleaseSetId) ?? []
    selected.push(snapshot)
    snapshotsByReleaseSet.set(snapshot.apiReleaseSetId, selected)
  }

  return {
    apiCatalogRevision: catalogRevision.code,
    catalogPublishedAt: catalogRevision.publishedAt,
    releaseSets: releaseSets.map(releaseSet => ({
      ...releaseSet,
      snapshots: snapshotsByReleaseSet.get(releaseSet.id) ?? [],
    })),
  }
}

export async function upsertReleaseShardAssignment(
  db: HarbourWritableDb,
  resourceReleaseId: string,
  dataShardId: string,
) {
  await db
    .insert(metaReleaseShardAssignments)
    .values({
      resourceReleaseId,
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

export {
  insertProcessingRun,
  ensureProcessingRunStarted,
  upsertProcessingRunStatus,
  updateLatestOpenProcessingRun,
} from './processingRuns'

async function requireDatasetDefinition(
  db: HarbourReadableDb,
  plan: Pick<UploadPlan, 'datasetCode' | 'source' | 'resourceType'>,
) {
  const dataset =
    ((await db
      .select({
        id: metaDatasets.id,
        processingRules: metaDatasets.processingRules,
        resourceTypes: metaDatasets.resourceTypes,
      })
      .from(metaDatasets)
      .innerJoin(metaPublishers, eq(metaDatasets.publisherId, metaPublishers.id))
      .where(
        and(
          eq(metaPublishers.code, publisherCodeForSource(plan.source)),
          eq(metaDatasets.code, plan.datasetCode),
          sql`EXISTS (SELECT 1 FROM json_each(${metaDatasets.resourceTypes}) WHERE value = ${plan.resourceType})`,
        ),
      )
      .limit(1)
      .get()) as
      | { id: string; processingRules: unknown; resourceTypes: string[] }
      | undefined) ?? null

  if (!dataset) {
    throw new Error(
      `Dataset definition not found for ${plan.source}/${plan.datasetCode}. Seed meta datasets before uploading releases.`,
    )
  }

  return dataset
}
