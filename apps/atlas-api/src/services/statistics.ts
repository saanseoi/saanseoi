import { resolveDataRegion, type ApiRegion } from '../schema/region'
import {
  defaultApiLocalesByProfile,
  parseRequestedApiLocales,
  type ApiProfileName,
  type RequestedApiLocaleSelection,
} from '@repo/core/apiLocales'
import {
  listApiReleaseSetSnapshotsForRegistryRequest,
  listSnapshotSourceReleases,
  resolvePublishedSnapshotForResourceTypeRegionCohortKey,
  resolveApiReleaseSetSnapshotsForRequest,
} from '@repo/core/db/metaRegistry'

import {
  countStatisticRecords,
  getStatisticRecord,
  listStatisticFieldDefinitions,
  listStatisticMeasureDefinitions,
  listStatisticRecordsForGeography,
  listStatisticRecords,
  type StatisticFilters,
  type StatisticFieldDefinition,
  type StatisticRecord,
} from '../db/statistics'
import {
  listDivisionAreasCurrentByDivisionIds,
  listDivisionRecordsCurrentByIds,
} from '../db/divisions'
import {
  buildApiVersionMetadata,
  buildJsonApiDetailDocument,
  buildJsonApiListDocument,
  buildSnapshotNotReadyResponse,
  resolveApiMetaLocales,
  type ApiDocumentLocales,
  type ApiVersionMetadata,
  type SnapshotNotReadyResponse,
} from '../lib/api'
import { runWithD1ReadRetry } from '../lib/d1'
import {
  createIncludedDivisionGeometryResource,
  createIncludedDivisionResource,
} from './divisions'
import type { AppEnv } from '../types'

export type RequestedStatisticVersion = 'stats/v0' | 'stats/v0.1'
export type RequestedStatisticApiVersion = '0.1'
export type ResolvedStatisticApiVersion = 'api-stats-v0.1'
export type StatisticProfile = ApiProfileName

export type StatisticListQuery = {
  region?: ApiRegion
  catalogRevision?: string
  cohort?: string
  domain?: 'government'
  effectiveAt?: string
  knownAt?: string
  releaseSet?: string
  profile?: string
  locales?: string
  include?: string
  'page[limit]'?: number
  'page[offset]'?: number
  'filter[dataset]'?: string
  'filter[division]'?: string
  'filter[referencePeriod]'?: string
  'filter[field]'?: string
}

export type StatisticDetailQuery = Pick<
  StatisticListQuery,
  | 'region'
  | 'catalogRevision'
  | 'cohort'
  | 'domain'
  | 'effectiveAt'
  | 'knownAt'
  | 'releaseSet'
  | 'profile'
  | 'locales'
  | 'include'
>

export type StatisticGeographiesQuery = Pick<
  StatisticListQuery,
  | 'region'
  | 'catalogRevision'
  | 'cohort'
  | 'domain'
  | 'effectiveAt'
  | 'knownAt'
  | 'releaseSet'
  | 'profile'
  | 'locales'
> & {
  'filter[dataset]'?: string
  'filter[field]': string
  'filter[referencePeriod]': string
  'filter[geographyKind]'?: 'division' | 'buildingGroup' | 'majorHousingEstate'
  'filter[geographyLevel]'?: number
  'filter[geographyDomain]'?: string
}

export type StatisticSeriesQuery = Omit<
  StatisticGeographiesQuery,
  'filter[referencePeriod]'
>

export type StatisticServiceDependencies = {
  listApiReleaseSetSnapshotsForRegistryRequest: typeof listApiReleaseSetSnapshotsForRegistryRequest
  resolveApiReleaseSetSnapshotsForRequest: typeof resolveApiReleaseSetSnapshotsForRequest
  listSnapshotSourceReleases: typeof listSnapshotSourceReleases
  resolvePublishedSnapshotForResourceTypeRegionCohortKey: typeof resolvePublishedSnapshotForResourceTypeRegionCohortKey
  listStatisticRecords: typeof listStatisticRecords
  listStatisticRecordsForGeography: typeof listStatisticRecordsForGeography
  countStatisticRecords: typeof countStatisticRecords
  getStatisticRecord: typeof getStatisticRecord
  listStatisticFieldDefinitions: typeof listStatisticFieldDefinitions
  listStatisticMeasureDefinitions: typeof listStatisticMeasureDefinitions
  listDivisionRecordsCurrentByIds: typeof listDivisionRecordsCurrentByIds
  listDivisionAreasCurrentByDivisionIds: typeof listDivisionAreasCurrentByDivisionIds
}

export const defaultDependencies: StatisticServiceDependencies = {
  listApiReleaseSetSnapshotsForRegistryRequest,
  resolveApiReleaseSetSnapshotsForRequest,
  listSnapshotSourceReleases,
  resolvePublishedSnapshotForResourceTypeRegionCohortKey,
  listStatisticRecords,
  listStatisticRecordsForGeography,
  countStatisticRecords,
  getStatisticRecord,
  listStatisticFieldDefinitions,
  listStatisticMeasureDefinitions,
  listDivisionRecordsCurrentByIds,
  listDivisionAreasCurrentByDivisionIds,
}

export type StatisticRouteState = {
  requestedVersionPath: RequestedStatisticVersion
  requestedApiVersion: RequestedStatisticApiVersion
  resolvedApiVersion: ResolvedStatisticApiVersion
  profile: StatisticProfile
  localeSelection: RequestedApiLocaleSelection
}

export type ActiveStatisticSnapshot = {
  region?: ApiRegion
  datasetCodes: string[]
  snapshotIds: string[]
  sourceReleaseIds: string[]
  apiReleaseSet: string
  apiCatalogRevision: string
  catalogPublishedAt: string
  cohortKey: string
  domainCode: 'government'
  schemaVersion: string
  rulesetVersion: string
}

export type StatisticRegistrySnapshot = {
  datasetCodes: string[]
  snapshotIds: string[]
  sourceReleaseIds: string[]
  apiCatalogRevision: string
  catalogPublishedAt: string
  apiReleaseSets: string[]
  cohorts: string[]
  domainCode: 'government'
  rulesetVersions: string[]
  schemaVersions: string[]
}

type RelatedDivisionSelection = {
  domainCode: string
  divisionSnapshotIds: string[]
}

type StatisticResourcePayload = {
  type: 'statistics'
  id: string
  attributes: {
    datasetCode: string
    referencePeriod: {
      code: string
      start: string | null
      end: string | null
      endYear: string
      granularity: string
    }
    geography: StatisticRecord['geography']
    dimensions: Record<string, string>
    values: Record<string, string>
    comparability?: Record<
      string,
      NonNullable<StatisticFieldDefinition['comparability']>
    >
    sourceReleaseId?: string
    sourceFeatureRef?: string
    createdAt?: string
    updatedAt?: string
  }
  relationships: {
    division: {
      data: { type: 'divisions'; id: string } | null
    }
  }
  links: { self: string }
}

type IncludedResourcePayload =
  | ReturnType<typeof createIncludedDivisionResource>
  | ReturnType<typeof createIncludedDivisionGeometryResource>
  | ReturnType<typeof createIncludedStatisticFieldResource>

export function createIncludedStatisticFieldResource(args: {
  definition: StatisticFieldDefinition
}) {
  const { definition } = args
  return {
    type: 'statistic-fields' as const,
    id: `${definition.datasetCode}:${definition.fieldName}`,
    attributes: {
      datasetCode: definition.datasetCode,
      fieldName: definition.fieldName,
      measureCode: definition.measureCode,
      sourceField: definition.sourceField,
      dimensions: definition.dimensions,
      sourceNullOption: definition.sourceNullOption,
      statisticKind: definition.statisticKind,
      aggregation: definition.aggregation,
      aggregationPercentile: definition.aggregationPercentile,
      periodicity: definition.periodicity,
      comparability: definition.comparability,
      denominatorFieldName: definition.denominatorFieldName,
      valueKind: definition.valueKind,
      unitCode: definition.unitCode,
      i18n: definition.i18n,
    },
  }
}

type StatisticDocumentMeta = ApiVersionMetadata & {
  apiCatalogRevision: string
  catalogPublishedAt: string
  cohort: string
  domain: 'government'
  profile: StatisticProfile
  locales: ApiDocumentLocales
  filters?: {
    dataset?: string
    division?: string
    referencePeriod?: string
    field?: string
  }
  page?: { limit: number; offset: number; total: number }
}

type StatisticListDocument = {
  jsonapi: { version: '1.1' }
  links: Record<string, string>
  data: StatisticResourcePayload[]
  included?: IncludedResourcePayload[]
  meta: StatisticDocumentMeta
}

type StatisticDetailDocument = {
  jsonapi: { version: '1.1' }
  links: Record<string, string>
  data: StatisticResourcePayload
  included?: IncludedResourcePayload[]
  meta: StatisticDocumentMeta
}

export type StatisticSnapshotNotReadyResponse = SnapshotNotReadyResponse<'statistic'>
export type NotFoundResponse = {
  httpStatus: 404
  error: 'not_found'
  message: string
}
type RelatedVariantUnavailableResponse = {
  httpStatus: 409
  error: 'variant_cohort_unavailable'
  message: string
}

export type StatisticListResult =
  | { status: 200; body: StatisticListDocument }
  | { status: 409; body: RelatedVariantUnavailableResponse }
  | { status: 503; body: StatisticSnapshotNotReadyResponse }

export type StatisticDetailResult =
  | { status: 200; body: StatisticDetailDocument }
  | { status: 404; body: NotFoundResponse }
  | { status: 409; body: RelatedVariantUnavailableResponse }
  | { status: 503; body: StatisticSnapshotNotReadyResponse }

export function buildRouteState(args: {
  requestedVersionPath: RequestedStatisticVersion
  requestedApiVersion: RequestedStatisticApiVersion
  resolvedApiVersion: ResolvedStatisticApiVersion
  profile?: string
  locales?: string
}): StatisticRouteState {
  const profile: StatisticProfile =
    args.profile === 'compact' || args.profile === 'full' || args.profile === 'map'
      ? args.profile
      : 'default'
  const defaults: RequestedApiLocaleSelection =
    profile === 'full'
      ? { mode: 'all', locales: ['*'] }
      : {
          mode: 'requested',
          locales: defaultApiLocalesByProfile[profile],
        }
  return {
    requestedVersionPath: args.requestedVersionPath,
    requestedApiVersion: args.requestedApiVersion,
    resolvedApiVersion: args.resolvedApiVersion,
    profile,
    localeSelection: parseRequestedApiLocales(args.locales, defaults),
  }
}

function requestedIncludes(value?: string) {
  return new Set(
    (value ?? '')
      .split(',')
      .map(item => item.trim())
      .filter(item => Boolean(item) && item !== 'none'),
  )
}

function requestedQualifiedAreaVariant(value?: string) {
  return [...requestedIncludes(value)]
    .find(item => item.startsWith('areas:'))
    ?.slice('areas:'.length)
}

function defaultAreaCompanion(record: StatisticRecord) {
  return record.geography.areaCompanion ?? null
}

function relatedDivisionDomain(record: StatisticRecord) {
  return defaultAreaCompanion(record)?.domainCode ?? 'geographic'
}

function createStatisticResource(args: {
  baseUrl: string
  definitions: Map<string, StatisticFieldDefinition>
  record: StatisticRecord
  routeState: StatisticRouteState
}) {
  const comparability = Object.fromEntries(
    Object.keys(args.record.values).flatMap(fieldName => {
      const definition = args.definitions.get(
        `${args.record.datasetCode}\u0000${fieldName}`,
      )
      return definition?.comparability ? [[fieldName, definition.comparability]] : []
    }),
  )
  return {
    type: 'statistics' as const,
    id: args.record.id,
    attributes: {
      datasetCode: args.record.datasetCode,
      referencePeriod: {
        code: args.record.referencePeriodCode,
        start: args.record.referencePeriodStart,
        end: args.record.referencePeriodEnd,
        endYear: args.record.referencePeriodEndYear,
        granularity: args.record.referencePeriodGranularity,
      },
      geography: args.record.geography,
      dimensions: args.record.dimensions,
      values: args.record.values,
      ...(Object.keys(comparability).length > 0 ? { comparability } : {}),
      ...(args.routeState.profile === 'full'
        ? {
            sourceReleaseId: args.record.sourceReleaseId,
            sourceFeatureRef: args.record.sourceFeatureRef,
            createdAt: args.record.createdAt,
            updatedAt: args.record.updatedAt,
          }
        : {}),
    },
    relationships: {
      division: {
        data: args.record.divisionId
          ? { type: 'divisions' as const, id: args.record.divisionId }
          : null,
      },
    },
    links: {
      self: `${args.baseUrl}/${args.routeState.requestedVersionPath}/${args.record.id}`,
    },
  } satisfies StatisticResourcePayload
}

export async function getActiveStatisticSnapshot(
  metaDb: AppEnv['Variables']['metaDb'],
  selectors: Pick<
    StatisticListQuery,
    | 'region'
    | 'catalogRevision'
    | 'cohort'
    | 'effectiveAt'
    | 'knownAt'
    | 'releaseSet'
    | 'filter[referencePeriod]'
  >,
  dependencies: StatisticServiceDependencies,
) {
  const selection = await runWithD1ReadRetry(() =>
    dependencies.resolveApiReleaseSetSnapshotsForRequest(
      metaDb as never,
      'divisionStatistic',
      {
        catalogRevision: selectors.catalogRevision,
        // Statistics release sets are published per exact reference period.
        // Keep explicit publication selectors authoritative, but make the
        // required geography period useful without a redundant cohort param.
        cohortKey: selectors.cohort ?? selectors['filter[referencePeriod]'],
        domainCode: 'government',
        effectiveAt: selectors.effectiveAt,
        knownAt: selectors.knownAt,
        regionCode: resolveDataRegion(selectors.region),
        releaseSet: selectors.releaseSet,
      },
    ),
  )
  if (!selection) return null
  const snapshotIds = selection.snapshots
    .filter(snapshot => snapshot.snapshotResourceType === 'divisionStatistic')
    .map(snapshot => snapshot.snapshotId)
  if (snapshotIds.length === 0) return null
  const sources = await runWithD1ReadRetry(() =>
    dependencies.listSnapshotSourceReleases(metaDb as never, snapshotIds),
  )
  return {
    region: resolveDataRegion(selectors.region),
    datasetCodes: [...new Set(sources.map(source => source.datasetCode))],
    snapshotIds,
    sourceReleaseIds: [...new Set(sources.map(source => source.sourceReleaseId))],
    apiReleaseSet: selection.releaseSet.code,
    apiCatalogRevision: selection.releaseSet.apiCatalogRevision,
    catalogPublishedAt: selection.releaseSet.catalogPublishedAt,
    cohortKey: selection.releaseSet.cohortKey,
    domainCode: 'government',
    schemaVersion: selection.releaseSet.schemaVersion,
    rulesetVersion: selection.releaseSet.rulesetVersion,
  } satisfies ActiveStatisticSnapshot
}

export async function resolveRelatedDivisionSelection(
  metaDb: AppEnv['Variables']['metaDb'],
  domainCode: string,
  knownAt: string,
  dependencies: StatisticServiceDependencies,
  region?: ApiRegion,
): Promise<RelatedDivisionSelection | null> {
  const selection = await runWithD1ReadRetry(() =>
    dependencies.resolveApiReleaseSetSnapshotsForRequest(metaDb as never, 'division', {
      domainCode,
      knownAt,
      regionCode: resolveDataRegion(region),
    }),
  )
  if (!selection) return null
  const divisionSnapshotIds = selection.snapshots
    .filter(snapshot => snapshot.snapshotResourceType === 'division')
    .map(snapshot => snapshot.snapshotId)
  if (divisionSnapshotIds.length === 0) return null
  return {
    domainCode,
    divisionSnapshotIds,
  }
}

async function loadIncludedResources(args: {
  activeSnapshot: ActiveStatisticSnapshot
  currentDb: AppEnv['Variables']['currentDb']
  dependencies: StatisticServiceDependencies
  include?: string
  metaDb: AppEnv['Variables']['metaDb']
  records: StatisticRecord[]
  requestUrl: string
  routeState: StatisticRouteState
}): Promise<
  | { status: 200; included: IncludedResourcePayload[]; areaVariants: string[] }
  | { status: 409; body: RelatedVariantUnavailableResponse }
> {
  const includes = requestedIncludes(args.include)
  const includeDivisions = includes.has('divisions')
  const includeAreas =
    includes.has('areas') || [...includes].some(item => item.startsWith('areas:'))
  if (!includeDivisions && !includeAreas) {
    return { status: 200, included: [], areaVariants: [] }
  }
  const linkedRecords = args.records.filter(
    (record): record is StatisticRecord & { divisionId: string } =>
      Boolean(record.divisionId),
  )
  const domains = [...new Set(linkedRecords.map(relatedDivisionDomain))]
  const selections = new Map<string, RelatedDivisionSelection>()
  for (const domain of domains) {
    const selection = await resolveRelatedDivisionSelection(
      args.metaDb,
      domain,
      args.activeSnapshot.catalogPublishedAt,
      args.dependencies,
      args.activeSnapshot.region,
    )
    if (selection) selections.set(domain, selection)
  }

  const included: IncludedResourcePayload[] = []
  if (includeDivisions) {
    for (const [domain, selection] of selections) {
      const snapshotId = selection.divisionSnapshotIds[0]
      if (!snapshotId) continue
      const divisionIds = [
        ...new Set(
          linkedRecords
            .filter(record => relatedDivisionDomain(record) === domain)
            .map(record => record.divisionId),
        ),
      ]
      const records = await runWithD1ReadRetry(() =>
        args.dependencies.listDivisionRecordsCurrentByIds(args.currentDb, {
          snapshotId,
          snapshotIds: selection.divisionSnapshotIds,
          divisionIds,
          localeSelection: args.routeState.localeSelection,
        }),
      )
      included.push(
        ...records.map(record =>
          createIncludedDivisionResource({
            baseUrl: new URL(args.requestUrl).origin,
            requestedVersionPath: 'divisions/v0.1',
            profile: args.routeState.profile,
            localeSelection: args.routeState.localeSelection,
            record,
          }),
        ),
      )
    }
  }

  const qualifiedVariant = requestedQualifiedAreaVariant(args.include)
  const areaGroups = new Map<
    string,
    { divisionIds: Set<string>; snapshotId: string; variant: string }
  >()
  if (includeAreas) {
    for (const record of linkedRecords) {
      const companion = defaultAreaCompanion(record)
      if (!companion) continue
      const variant = qualifiedVariant ?? companion.variant
      const snapshot = await runWithD1ReadRetry(() =>
        args.dependencies.resolvePublishedSnapshotForResourceTypeRegionCohortKey(
          args.metaDb as never,
          'divisionArea',
          resolveDataRegion(args.activeSnapshot.region),
          companion.cohortKey,
          { variant },
        ),
      )
      const snapshotId = snapshot?.id
      if (!snapshotId) {
        return {
          status: 409,
          body: {
            httpStatus: 409,
            error: 'variant_cohort_unavailable',
            message: `The areas:${variant} variant is not available for geometry cohort ${companion.cohortKey}.`,
          },
        }
      }
      const key = `${companion.cohortKey}\u0000${variant}\u0000${snapshotId}`
      const group = areaGroups.get(key) ?? {
        divisionIds: new Set<string>(),
        snapshotId,
        variant,
      }
      group.divisionIds.add(record.divisionId)
      areaGroups.set(key, group)
    }
  }
  for (const group of areaGroups.values()) {
    const areas = await runWithD1ReadRetry(() =>
      args.dependencies.listDivisionAreasCurrentByDivisionIds(args.currentDb, {
        snapshotId: group.snapshotId,
        divisionIds: [...group.divisionIds],
        variant: group.variant,
      }),
    )
    included.push(
      ...areas.map(record =>
        createIncludedDivisionGeometryResource({ record, kind: 'area' }),
      ),
    )
  }

  const deduplicated = new Map(
    included.map(resource => [`${resource.type}\u0000${resource.id}`, resource]),
  )
  return {
    status: 200,
    included: [...deduplicated.values()],
    areaVariants: [
      ...new Set(
        [...areaGroups.keys()].flatMap(key => {
          const variant = key.split('\u0000')[1]
          return variant ? [variant] : []
        }),
      ),
    ].sort(),
  }
}

function buildPermalink(args: {
  activeSnapshot: ActiveStatisticSnapshot
  areaVariants: string[]
  limit?: number
  offset?: number
  routeState: StatisticRouteState
  url: URL
}) {
  const permalink = new URL(args.url)
  permalink.pathname = permalink.pathname.replace(
    /^\/stats\/v0(?:\.\d+)?/,
    '/stats/v0.1',
  )
  permalink.searchParams.delete('effectiveAt')
  permalink.searchParams.set('catalogRevision', args.activeSnapshot.apiCatalogRevision)
  permalink.searchParams.set('knownAt', args.activeSnapshot.catalogPublishedAt)
  permalink.searchParams.set('releaseSet', args.activeSnapshot.apiReleaseSet)
  permalink.searchParams.set('cohort', args.activeSnapshot.cohortKey)
  permalink.searchParams.set('domain', 'government')
  permalink.searchParams.set('profile', args.routeState.profile)
  permalink.searchParams.set(
    'locales',
    args.routeState.localeSelection.mode === 'all'
      ? '*'
      : args.routeState.localeSelection.locales.join(','),
  )
  const includes = requestedIncludes(permalink.searchParams.get('include') ?? undefined)
  if (includes.has('areas')) {
    includes.delete('areas')
    for (const variant of args.areaVariants) includes.add(`areas:${variant}`)
  }
  permalink.searchParams.set(
    'include',
    includes.size > 0 ? [...includes].sort().join(',') : 'none',
  )
  if (args.limit !== undefined) {
    permalink.searchParams.set('page[limit]', String(args.limit))
  }
  if (args.offset !== undefined) {
    permalink.searchParams.set('page[offset]', String(args.offset))
  }
  permalink.searchParams.sort()
  return permalink.toString()
}

function documentMeta(
  activeSnapshot: ActiveStatisticSnapshot,
  routeState: StatisticRouteState,
): StatisticDocumentMeta {
  return {
    ...buildApiVersionMetadata({
      requestedApiVersion: routeState.requestedApiVersion,
      requestedApiFamily: 'stats',
      resolvedApiVersion: routeState.resolvedApiVersion,
      apiReleaseSet: activeSnapshot.apiReleaseSet,
      schemaVersion: activeSnapshot.schemaVersion,
      rulesetVersion: activeSnapshot.rulesetVersion,
      profile: routeState.profile,
    }),
    apiCatalogRevision: activeSnapshot.apiCatalogRevision,
    catalogPublishedAt: activeSnapshot.catalogPublishedAt,
    cohort: activeSnapshot.cohortKey,
    domain: 'government',
    profile: routeState.profile,
    locales: resolveApiMetaLocales(routeState.localeSelection),
  }
}

function definitionMap(definitions: StatisticFieldDefinition[]) {
  return new Map(
    definitions.map(definition => [
      `${definition.datasetCode}\u0000${definition.fieldName}`,
      definition,
    ]),
  )
}

function includedStatisticFieldResources(args: {
  definitions: StatisticFieldDefinition[]
  records: StatisticRecord[]
  include?: string
}) {
  if (!requestedIncludes(args.include).has('fields')) return []
  const fieldKeys = new Set(
    args.records.flatMap(record =>
      Object.keys(record.values).map(
        fieldName => `${record.datasetCode}\u0000${fieldName}`,
      ),
    ),
  )
  return args.definitions
    .filter(definition =>
      fieldKeys.has(`${definition.datasetCode}\u0000${definition.fieldName}`),
    )
    .sort((left, right) =>
      `${left.datasetCode}\u0000${left.fieldName}`.localeCompare(
        `${right.datasetCode}\u0000${right.fieldName}`,
      ),
    )
    .map(definition =>
      createIncludedStatisticFieldResource({
        definition,
      }),
    )
}

export async function listStatistics(args: {
  currentDb: AppEnv['Variables']['currentDb']
  historyDbs: AppEnv['Variables']['historyDbs']
  metaDb: AppEnv['Variables']['metaDb']
  requestUrl: string
  requestedVersionPath: RequestedStatisticVersion
  requestedApiVersion: RequestedStatisticApiVersion
  resolvedApiVersion: ResolvedStatisticApiVersion
  query: StatisticListQuery
  dependencies?: Partial<StatisticServiceDependencies>
}): Promise<StatisticListResult> {
  const dependencies = { ...defaultDependencies, ...args.dependencies }
  const routeState = buildRouteState({
    requestedVersionPath: args.requestedVersionPath,
    requestedApiVersion: args.requestedApiVersion,
    resolvedApiVersion: args.resolvedApiVersion,
    profile: args.query.profile,
    locales: args.query.locales,
  })
  const activeSnapshot = await getActiveStatisticSnapshot(
    args.metaDb,
    args.query,
    dependencies,
  )
  if (!activeSnapshot) {
    return { status: 503, body: buildSnapshotNotReadyResponse('statistic') }
  }
  const limit = args.query['page[limit]'] ?? 25
  const offset = args.query['page[offset]'] ?? 0
  const filters = {
    datasetCode: args.query['filter[dataset]'],
    divisionId: args.query['filter[division]'],
    referencePeriod: args.query['filter[referencePeriod]'] ?? activeSnapshot.cohortKey,
    fieldName: args.query['filter[field]'],
  } satisfies StatisticFilters
  const [records, total] = await runWithD1ReadRetry(() =>
    Promise.all([
      dependencies.listStatisticRecords(args.historyDbs, {
        cohortKey: activeSnapshot.cohortKey,
        sourceReleaseIds: activeSnapshot.sourceReleaseIds,
        filters,
        limit,
        offset,
      }),
      dependencies.countStatisticRecords(args.historyDbs, {
        cohortKey: activeSnapshot.cohortKey,
        sourceReleaseIds: activeSnapshot.sourceReleaseIds,
        filters,
      }),
    ]),
  )
  const definitions = await runWithD1ReadRetry(() =>
    dependencies.listStatisticFieldDefinitions(args.historyDbs, {
      datasetCodes: [...new Set(records.map(record => record.datasetCode))],
      localeSelection: routeState.localeSelection,
      sourceReleaseIds: activeSnapshot.sourceReleaseIds,
    }),
  )
  const definitionsByCode = definitionMap(definitions)
  const related = await loadIncludedResources({
    activeSnapshot,
    currentDb: args.currentDb,
    dependencies,
    include: args.query.include,
    metaDb: args.metaDb,
    records,
    requestUrl: args.requestUrl,
    routeState,
  })
  if (related.status === 409) return related
  const url = new URL(args.requestUrl)
  const includedFields = includedStatisticFieldResources({
    definitions,
    records,
    include: args.query.include,
  })
  const meta = documentMeta(activeSnapshot, routeState)
  meta.filters = {
    dataset: filters.datasetCode,
    division: filters.divisionId,
    referencePeriod: filters.referencePeriod,
    field: filters.fieldName,
  }
  meta.page = { limit, offset, total }
  return {
    status: 200,
    body: buildJsonApiListDocument({
      url,
      limit,
      offset,
      total,
      data: records.map(record =>
        createStatisticResource({
          baseUrl: url.origin,
          definitions: definitionsByCode,
          record,
          routeState,
        }),
      ),
      included: [...related.included, ...includedFields],
      meta,
      permalink: buildPermalink({
        activeSnapshot,
        areaVariants: related.areaVariants,
        limit,
        offset,
        routeState,
        url,
      }),
    }),
  }
}

export async function getStatisticDetail(args: {
  currentDb: AppEnv['Variables']['currentDb']
  historyDbs: AppEnv['Variables']['historyDbs']
  metaDb: AppEnv['Variables']['metaDb']
  requestUrl: string
  requestedVersionPath: RequestedStatisticVersion
  requestedApiVersion: RequestedStatisticApiVersion
  resolvedApiVersion: ResolvedStatisticApiVersion
  id: string
  query: StatisticDetailQuery
  dependencies?: Partial<StatisticServiceDependencies>
}): Promise<StatisticDetailResult> {
  const dependencies = { ...defaultDependencies, ...args.dependencies }
  const routeState = buildRouteState({
    requestedVersionPath: args.requestedVersionPath,
    requestedApiVersion: args.requestedApiVersion,
    resolvedApiVersion: args.resolvedApiVersion,
    profile: args.query.profile,
    locales: args.query.locales,
  })
  const activeSnapshot = await getActiveStatisticSnapshot(
    args.metaDb,
    args.query,
    dependencies,
  )
  if (!activeSnapshot) {
    return { status: 503, body: buildSnapshotNotReadyResponse('statistic') }
  }
  const record = await runWithD1ReadRetry(() =>
    dependencies.getStatisticRecord(args.historyDbs, {
      cohortKey: activeSnapshot.cohortKey,
      id: args.id,
      sourceReleaseIds: activeSnapshot.sourceReleaseIds,
    }),
  )
  if (!record || record.referencePeriodCode !== activeSnapshot.cohortKey) {
    return {
      status: 404,
      body: {
        httpStatus: 404,
        error: 'not_found',
        message: `No statistic found for ${args.id}.`,
      },
    }
  }
  const definitions = await runWithD1ReadRetry(() =>
    dependencies.listStatisticFieldDefinitions(args.historyDbs, {
      datasetCodes: [record.datasetCode],
      localeSelection: routeState.localeSelection,
      sourceReleaseIds: activeSnapshot.sourceReleaseIds,
    }),
  )
  const definitionsByCode = definitionMap(definitions)
  const related = await loadIncludedResources({
    activeSnapshot,
    currentDb: args.currentDb,
    dependencies,
    include: args.query.include,
    metaDb: args.metaDb,
    records: [record],
    requestUrl: args.requestUrl,
    routeState,
  })
  if (related.status === 409) return related
  const url = new URL(args.requestUrl)
  const includedFields = includedStatisticFieldResources({
    definitions,
    records: [record],
    include: args.query.include,
  })
  return {
    status: 200,
    body: buildJsonApiDetailDocument({
      url,
      data: createStatisticResource({
        baseUrl: url.origin,
        definitions: definitionsByCode,
        record,
        routeState,
      }),
      included: [...related.included, ...includedFields],
      meta: documentMeta(activeSnapshot, routeState),
      permalink: buildPermalink({
        activeSnapshot,
        areaVariants: related.areaVariants,
        routeState,
        url,
      }),
    }),
  }
}
