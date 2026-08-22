import {
  defaultApiLocalesByProfile,
  parseRequestedApiLocales,
  type ApiProfileName,
  type RequestedApiLocaleSelection,
} from '@repo/core/apiLocales'
import {
  listSnapshotSourceReleases,
  resolveApiReleaseSetSnapshotsForRequest,
} from '@repo/core/db/metaRegistry'

import {
  countStatisticRecords,
  getStatisticRecord,
  listStatisticFieldDefinitions,
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

export type RequestedStatisticVersion = 'v0' | 'v0.1'
export type RequestedStatisticApiVersion = '0.1'
export type ResolvedStatisticApiVersion = 'api-stats-v0.1'
export type StatisticProfile = ApiProfileName

export type StatisticListQuery = {
  catalogRevision?: string
  cohort?: string
  domain?: 'official'
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
  'filter[geographyKind]'?: AggregateGeography['kind']
  'filter[geographyLevel]'?: number
  'filter[geographyDomain]'?: string
}

export type StatisticSeriesQuery = Omit<
  StatisticGeographiesQuery,
  'filter[referencePeriod]'
>

type StatisticServiceDependencies = {
  resolveApiReleaseSetSnapshotsForRequest: typeof resolveApiReleaseSetSnapshotsForRequest
  listSnapshotSourceReleases: typeof listSnapshotSourceReleases
  listStatisticRecords: typeof listStatisticRecords
  listStatisticRecordsForGeography: typeof listStatisticRecordsForGeography
  countStatisticRecords: typeof countStatisticRecords
  getStatisticRecord: typeof getStatisticRecord
  listStatisticFieldDefinitions: typeof listStatisticFieldDefinitions
  listDivisionRecordsCurrentByIds: typeof listDivisionRecordsCurrentByIds
  listDivisionAreasCurrentByDivisionIds: typeof listDivisionAreasCurrentByDivisionIds
}

const defaultDependencies: StatisticServiceDependencies = {
  resolveApiReleaseSetSnapshotsForRequest,
  listSnapshotSourceReleases,
  listStatisticRecords,
  listStatisticRecordsForGeography,
  countStatisticRecords,
  getStatisticRecord,
  listStatisticFieldDefinitions,
  listDivisionRecordsCurrentByIds,
  listDivisionAreasCurrentByDivisionIds,
}

type StatisticRouteState = {
  requestedVersionPath: RequestedStatisticVersion
  requestedApiVersion: RequestedStatisticApiVersion
  resolvedApiVersion: ResolvedStatisticApiVersion
  profile: StatisticProfile
  localeSelection: RequestedApiLocaleSelection
}

type ActiveStatisticSnapshot = {
  snapshotIds: string[]
  sourceReleaseIds: string[]
  apiReleaseSet: string
  apiCatalogRevision: string
  catalogPublishedAt: string
  cohortKey: string
  domainCode: 'official'
  schemaVersion: string
  rulesetVersion: string
}

type RelatedDivisionSelection = {
  domainCode: string
  divisionSnapshotIds: string[]
  areaSnapshotByVariant: Map<string, string>
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

function createIncludedStatisticFieldResource(args: {
  definition: StatisticFieldDefinition
}) {
  const { definition } = args
  return {
    type: 'statistic-fields' as const,
    id: `${definition.datasetCode}:${definition.fieldName}`,
    attributes: {
      datasetCode: definition.datasetCode,
      fieldName: definition.fieldName,
      sourceField: definition.sourceField,
      dimensions: definition.dimensions,
      sourceNullOption: definition.sourceNullOption,
      statisticKind: definition.statisticKind,
      aggregation: definition.aggregation,
      aggregationPercentile: definition.aggregationPercentile,
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
  domain: 'official'
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

type StatisticSnapshotNotReadyResponse = SnapshotNotReadyResponse<'statistic'>
type NotFoundResponse = {
  httpStatus: 404
  error: 'not_found'
  message: string
}
type RelatedVariantUnavailableResponse = {
  httpStatus: 409
  error: 'variant_unavailable'
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

function buildRouteState(args: {
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

function defaultAreaVariant(record: StatisticRecord) {
  if (
    record.datasetCode ===
    'ds-hk-hkgov-censtatd-division-statistic-permanent-living-quarters-area-type'
  ) {
    return 'hkgov-censtatd-area'
  }
  if (
    record.datasetCode ===
    'ds-hk-hkgov-censtatd-division-statistic-housing-market-areas-building-groups'
  ) {
    return 'hkgov-censtatd-hma'
  }
  if (record.datasetCode === NEW_TOWNS_DATASET) {
    return 'hkgov-pland-new-town'
  }
  const sourceVersion = record.sourceFeatureRef.split('/')[2]
  return /^(?:2016|2021)$/.test(sourceVersion ?? '')
    ? `hkgov-censtatd:${sourceVersion}`
    : null
}

function relatedDivisionDomain(record: StatisticRecord) {
  if (record.datasetCode === NEW_TOWNS_DATASET) return 'hkgov-pland-new-town'
  return record.datasetCode ===
    'ds-hk-hkgov-censtatd-division-statistic-housing-market-areas-building-groups'
    ? 'hkgov-censtatd-hma'
    : 'geographic'
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
      self: `${args.baseUrl}/${args.routeState.requestedVersionPath}/stats/${args.record.id}`,
    },
  } satisfies StatisticResourcePayload
}

async function getActiveStatisticSnapshot(
  metaDb: AppEnv['Variables']['metaDb'],
  selectors: Pick<
    StatisticListQuery,
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
        domainCode: 'official',
        effectiveAt: selectors.effectiveAt,
        knownAt: selectors.knownAt,
        regionCode: 'hk',
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
    snapshotIds,
    sourceReleaseIds: [...new Set(sources.map(source => source.sourceReleaseId))],
    apiReleaseSet: selection.releaseSet.code,
    apiCatalogRevision: selection.releaseSet.apiCatalogRevision,
    catalogPublishedAt: selection.releaseSet.catalogPublishedAt,
    cohortKey: selection.releaseSet.cohortKey,
    domainCode: 'official',
    schemaVersion: selection.releaseSet.schemaVersion,
    rulesetVersion: selection.releaseSet.rulesetVersion,
  } satisfies ActiveStatisticSnapshot
}

async function resolveRelatedDivisionSelection(
  metaDb: AppEnv['Variables']['metaDb'],
  domainCode: string,
  knownAt: string,
  dependencies: StatisticServiceDependencies,
): Promise<RelatedDivisionSelection | null> {
  const selection = await runWithD1ReadRetry(() =>
    dependencies.resolveApiReleaseSetSnapshotsForRequest(metaDb as never, 'division', {
      domainCode,
      knownAt,
      regionCode: 'hk',
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
    areaSnapshotByVariant: new Map(
      selection.snapshots
        .filter(snapshot => snapshot.snapshotResourceType === 'divisionArea')
        .map(snapshot => [snapshot.variant, snapshot.snapshotId]),
    ),
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
            requestedVersionPath: args.routeState.requestedVersionPath,
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
    { domain: string; selection: RelatedDivisionSelection; divisionIds: Set<string> }
  >()
  if (includeAreas) {
    for (const record of linkedRecords) {
      const domain = relatedDivisionDomain(record)
      const selection = selections.get(domain)
      if (!selection) continue
      const variant = qualifiedVariant ?? defaultAreaVariant(record)
      if (!variant) continue
      const snapshotId = selection.areaSnapshotByVariant.get(variant)
      if (!snapshotId) {
        if (qualifiedVariant) {
          return {
            status: 409,
            body: {
              httpStatus: 409,
              error: 'variant_unavailable',
              message: `The requested areas:${variant} variant is not available for the related divisions.`,
            },
          }
        }
        continue
      }
      const key = `${domain}\u0000${variant}\u0000${snapshotId}`
      const group = areaGroups.get(key) ?? {
        domain,
        selection,
        divisionIds: new Set<string>(),
      }
      group.divisionIds.add(record.divisionId)
      areaGroups.set(key, group)
    }
  }
  for (const [key, group] of areaGroups) {
    const [, variant, snapshotId] = key.split('\u0000')
    if (!variant || !snapshotId) continue
    const areas = await runWithD1ReadRetry(() =>
      args.dependencies.listDivisionAreasCurrentByDivisionIds(args.currentDb, {
        snapshotId,
        divisionIds: [...group.divisionIds],
        variant,
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
  permalink.pathname = permalink.pathname.replace(/^\/v0(?:\.1)?\//, '/v0.1/')
  permalink.searchParams.delete('effectiveAt')
  permalink.searchParams.set('catalogRevision', args.activeSnapshot.apiCatalogRevision)
  permalink.searchParams.set('knownAt', args.activeSnapshot.catalogPublishedAt)
  permalink.searchParams.set('releaseSet', args.activeSnapshot.apiReleaseSet)
  permalink.searchParams.set('cohort', args.activeSnapshot.cohortKey)
  permalink.searchParams.set('domain', 'official')
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
    domain: 'official',
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

type AggregateGeography =
  | { kind: 'division'; divisionId: string }
  | { kind: 'buildingGroup'; geographyCode: string }
  | { kind: 'majorHousingEstate'; geographyCode: string }

type ResolvedAggregateGeography =
  | {
      kind: 'division'
      codeAttribute: 'divisionCode'
      domainCode: string
      level?: number
    }
  | { kind: 'buildingGroup'; geographyCode: string }
  | { kind: 'majorHousingEstate'; geographyCode: string }

type AggregateErrorResponse = {
  httpStatus: 404 | 409
  error: 'not_found' | 'incomplete_geography_dimension'
  message: string
}
type AmbiguousMeasureResponse = {
  httpStatus: 409
  error: 'ambiguous_measure'
  message: string
  candidates: Array<{
    datasetCode: string
    geography: GeographyAggregateMeta['geography']
  }>
}

type GeographyAggregateMeta = ApiVersionMetadata & {
  measure: { datasetCode: string; fieldName: string; unitCode: string }
  geography:
    | {
        kind: 'division'
        codeAttribute: 'divisionCode'
        domainCode: string
        level?: number
      }
    | { kind: 'buildingGroup'; codeAttribute: 'geographyCode' }
    | { kind: 'majorHousingEstate'; codeAttribute: 'geographyCode' }
  dimensions: Record<string, string>
}

type GeographyAggregateResult =
  | {
      status: 200
      body: {
        meta: GeographyAggregateMeta & { referencePeriod: string }
        values: Record<string, string>
      }
    }
  | { status: 404 | 409; body: AggregateErrorResponse | AmbiguousMeasureResponse }
  | { status: 503; body: StatisticSnapshotNotReadyResponse }

type SeriesAggregateResult =
  | {
      status: 200
      body: {
        meta: GeographyAggregateMeta
        valuesByReferencePeriod: Record<string, Record<string, string>>
      }
    }
  | { status: 404 | 409; body: AggregateErrorResponse | AmbiguousMeasureResponse }
  | { status: 503; body: StatisticSnapshotNotReadyResponse }

const BUILDING_GROUP_DATASET =
  'ds-hk-hkgov-censtatd-division-statistic-housing-market-areas-building-groups'
const MAJOR_HOUSING_ESTATE_DATASET =
  'ds-hk-hkgov-censtatd-division-statistic-major-housing-estates'
const NEW_TOWNS_DATASET = 'ds-hk-hkgov-censtatd-division-statistic-new-towns'

function aggregateGeographyFor(record: StatisticRecord): AggregateGeography | null {
  if (record.datasetCode === BUILDING_GROUP_DATASET) {
    const buildingGroupCode = record.dimensions['building-group']
    if (buildingGroupCode)
      return { kind: 'buildingGroup', geographyCode: buildingGroupCode }
  }
  if (record.datasetCode === MAJOR_HOUSING_ESTATE_DATASET) {
    const geographyCode = record.dimensions['housing-estate']
    return geographyCode ? { kind: 'majorHousingEstate', geographyCode } : null
  }
  return record.divisionId ? { kind: 'division', divisionId: record.divisionId } : null
}

function divisionDomainForStatisticDataset(datasetCode: string) {
  if (datasetCode === BUILDING_GROUP_DATASET) return 'hkgov-censtatd-hma'
  if (datasetCode === NEW_TOWNS_DATASET) return 'hkgov-pland-new-town'
  return 'geographic'
}

function equalJsonObjects(left: Record<string, string>, right: Record<string, string>) {
  const leftEntries = Object.entries(left).sort(([a], [b]) => a.localeCompare(b))
  const rightEntries = Object.entries(right).sort(([a], [b]) => a.localeCompare(b))
  return JSON.stringify(leftEntries) === JSON.stringify(rightEntries)
}

/** Geography labels identify rows; they are not a second analytical dimension. */
function analyticalDimensions(dimensions: Record<string, string>) {
  const geographyDimensions = new Set([
    'area',
    'district',
    'district-class',
    'housing-market-area',
    'building-group',
    'building-group-class',
    'housing-estate',
    'new-town',
  ])
  return Object.fromEntries(
    Object.entries(dimensions).filter(([key]) => !geographyDimensions.has(key)),
  )
}

async function resolveAggregateValues(args: {
  activeSnapshot: ActiveStatisticSnapshot
  currentDb: AppEnv['Variables']['currentDb']
  datasetCode: string
  dependencies: StatisticServiceDependencies
  fieldName: string
  metaDb: AppEnv['Variables']['metaDb']
  records: StatisticRecord[]
}) {
  if (args.records.length === 0) {
    return {
      error: {
        httpStatus: 404 as const,
        error: 'not_found' as const,
        message:
          'No statistics match the selected dataset, measure, and reference period.',
      },
    }
  }
  const first = args.records[0]
  const geography = first ? aggregateGeographyFor(first) : null
  if (!first || !geography) {
    return {
      error: {
        httpStatus: 409 as const,
        error: 'incomplete_geography_dimension' as const,
        message: 'The selected statistic has no complete geography dimension.',
      },
    }
  }
  const dimensions = analyticalDimensions(first.dimensions)
  for (const record of args.records) {
    const candidate = aggregateGeographyFor(record)
    if (
      !candidate ||
      candidate.kind !== geography.kind ||
      !equalJsonObjects(analyticalDimensions(record.dimensions), dimensions)
    ) {
      return {
        error: {
          httpStatus: 409 as const,
          error: 'incomplete_geography_dimension' as const,
          message:
            'The selected statistic mixes geography or analytical dimension sets.',
        },
      }
    }
  }

  if (geography.kind !== 'division') {
    const values: Record<string, string> = {}
    for (const record of args.records) {
      const candidate = aggregateGeographyFor(record)
      if (!candidate || candidate.kind === 'division') continue
      const value = record.values[args.fieldName]
      if (value === undefined || values[candidate.geographyCode] !== undefined) {
        return {
          error: {
            httpStatus: 409 as const,
            error: 'incomplete_geography_dimension' as const,
            message:
              'The selected statistic does not provide one value for each geography code.',
          },
        }
      }
      values[candidate.geographyCode] = value
    }
    return {
      geography,
      dimensions,
      values,
    }
  }

  const domainCode = divisionDomainForStatisticDataset(args.datasetCode)
  const selection = await resolveRelatedDivisionSelection(
    args.metaDb,
    domainCode,
    args.activeSnapshot.catalogPublishedAt,
    args.dependencies,
  )
  const snapshotId = selection?.divisionSnapshotIds[0]
  if (!selection || !snapshotId) {
    return {
      error: {
        httpStatus: 409 as const,
        error: 'incomplete_geography_dimension' as const,
        message: `No selected Divisions snapshot is available for ${domainCode}.`,
      },
    }
  }
  const divisionIds = [
    ...new Set(
      args.records.flatMap(record => (record.divisionId ? [record.divisionId] : [])),
    ),
  ]
  const divisions = await args.dependencies.listDivisionRecordsCurrentByIds(
    args.currentDb,
    {
      snapshotId,
      snapshotIds: selection.divisionSnapshotIds,
      divisionIds,
      localeSelection: { mode: 'none', locales: [] },
    },
  )
  const divisionCodes = new Map(
    divisions.flatMap(division =>
      division.division.divisionCode
        ? [[division.division.id, division.division.divisionCode] as const]
        : [],
    ),
  )
  const values: Record<string, string> = {}
  for (const record of args.records) {
    const divisionId = record.divisionId
    const divisionCode = divisionId ? divisionCodes.get(divisionId) : null
    const value = record.values[args.fieldName]
    if (!divisionCode || value === undefined || values[divisionCode] !== undefined) {
      return {
        error: {
          httpStatus: 409 as const,
          error: 'incomplete_geography_dimension' as const,
          message: 'The selected Divisions snapshot has no complete curated code map.',
        },
      }
    }
    values[divisionCode] = value
  }
  const levels = new Set(
    divisions.flatMap(division =>
      division.division.level === null ? [] : [division.division.level],
    ),
  )
  if (levels.size !== 1) {
    return {
      error: {
        httpStatus: 409 as const,
        error: 'incomplete_geography_dimension' as const,
        message: 'The selected statistic resolves to more than one Division level.',
      },
    }
  }
  return {
    geography: {
      codeAttribute: 'divisionCode' as const,
      domainCode,
      kind: 'division' as const,
      ...([...levels][0] === undefined ? {} : { level: [...levels][0] as number }),
    },
    dimensions,
    values,
  }
}

async function buildAggregateMeta(args: {
  activeSnapshot: ActiveStatisticSnapshot
  datasetCode: string
  dependencies: StatisticServiceDependencies
  fieldName: string
  geography: ResolvedAggregateGeography
  historyDbs: AppEnv['Variables']['historyDbs']
}) {
  const definitions = await args.dependencies.listStatisticFieldDefinitions(
    args.historyDbs,
    {
      datasetCodes: [args.datasetCode],
      localeSelection: { mode: 'none', locales: [] },
      sourceReleaseIds: args.activeSnapshot.sourceReleaseIds,
    },
  )
  const definition = definitions.find(
    candidate =>
      candidate.datasetCode === args.datasetCode &&
      candidate.fieldName === args.fieldName,
  )
  if (!definition)
    throw new Error(
      `No curated measure metadata for ${args.datasetCode}/${args.fieldName}.`,
    )
  const geography =
    args.geography.kind === 'division'
      ? args.geography
      : {
          kind: args.geography.kind,
          codeAttribute: 'geographyCode' as const,
        }
  return {
    ...buildApiVersionMetadata({
      requestedApiVersion: '0.1',
      requestedApiFamily: 'stats',
      resolvedApiVersion: 'api-stats-v0.1',
      apiReleaseSet: args.activeSnapshot.apiReleaseSet,
      schemaVersion: args.activeSnapshot.schemaVersion,
      rulesetVersion: args.activeSnapshot.rulesetVersion,
      profile: 'default',
    }),
    measure: {
      datasetCode: args.datasetCode,
      fieldName: args.fieldName,
      unitCode: definition.unitCode,
    },
    geography,
  } satisfies Omit<GeographyAggregateMeta, 'dimensions'>
}

type ResolvedAggregateValues = {
  geography: ResolvedAggregateGeography
  dimensions: Record<string, string>
  values: Record<string, string>
}

type ResolvedAggregateSeriesValues = {
  geography: ResolvedAggregateGeography
  dimensions: Record<string, string>
  valuesByReferencePeriod: Record<string, Record<string, string>>
}

function matchesAggregateGeographyFilters(
  geography: ResolvedAggregateGeography,
  query: StatisticGeographiesQuery | StatisticSeriesQuery,
) {
  if (
    query['filter[geographyKind]'] &&
    geography.kind !== query['filter[geographyKind]']
  ) {
    return false
  }
  if (query['filter[geographyLevel]'] !== undefined) {
    if (
      geography.kind !== 'division' ||
      geography.level !== query['filter[geographyLevel]']
    ) {
      return false
    }
  }
  if (query['filter[geographyDomain]'] !== undefined) {
    if (
      geography.kind !== 'division' ||
      geography.domainCode !== query['filter[geographyDomain]']
    ) {
      return false
    }
  }
  return true
}

function aggregateGeographyMeta(
  geography: ResolvedAggregateGeography,
): GeographyAggregateMeta['geography'] {
  return geography.kind === 'division'
    ? geography
    : { kind: geography.kind, codeAttribute: 'geographyCode' }
}

function ambiguousMeasureResponse(
  candidates: Array<{ datasetCode: string; geography: ResolvedAggregateGeography }>,
): AmbiguousMeasureResponse {
  return {
    httpStatus: 409,
    error: 'ambiguous_measure',
    message:
      'The selected field matches multiple datasets. Add a geography filter or filter[dataset].',
    candidates: candidates
      .map(candidate => ({
        datasetCode: candidate.datasetCode,
        geography: aggregateGeographyMeta(candidate.geography),
      }))
      .sort((left, right) => left.datasetCode.localeCompare(right.datasetCode)),
  }
}

function groupRecordsByDataset(records: StatisticRecord[]) {
  const recordsByDataset = new Map<string, StatisticRecord[]>()
  for (const record of records) {
    const datasetRecords = recordsByDataset.get(record.datasetCode) ?? []
    datasetRecords.push(record)
    recordsByDataset.set(record.datasetCode, datasetRecords)
  }
  return recordsByDataset
}

export async function getStatisticsGeographies(args: {
  currentDb: AppEnv['Variables']['currentDb']
  historyDbs: AppEnv['Variables']['historyDbs']
  metaDb: AppEnv['Variables']['metaDb']
  query: StatisticGeographiesQuery
  dependencies?: Partial<StatisticServiceDependencies>
}): Promise<GeographyAggregateResult> {
  const dependencies = { ...defaultDependencies, ...args.dependencies }
  const activeSnapshot = await getActiveStatisticSnapshot(
    args.metaDb,
    args.query,
    dependencies,
  )
  if (!activeSnapshot)
    return { status: 503, body: buildSnapshotNotReadyResponse('statistic') }
  const records = await dependencies.listStatisticRecordsForGeography(args.historyDbs, {
    datasetCode: args.query['filter[dataset]'],
    fieldName: args.query['filter[field]'],
    referencePeriod: args.query['filter[referencePeriod]'],
    sourceReleaseIds: activeSnapshot.sourceReleaseIds,
  })
  const candidates: Array<{
    datasetCode: string
    resolved: ResolvedAggregateValues
  }> = []
  for (const [datasetCode, datasetRecords] of groupRecordsByDataset(records)) {
    const resolved = await resolveAggregateValues({
      activeSnapshot,
      currentDb: args.currentDb,
      datasetCode,
      dependencies,
      fieldName: args.query['filter[field]'],
      metaDb: args.metaDb,
      records: datasetRecords,
    })
    if ('error' in resolved && resolved.error) {
      if (args.query['filter[dataset]']) {
        return { status: resolved.error.httpStatus, body: resolved.error }
      }
      continue
    }
    if (matchesAggregateGeographyFilters(resolved.geography, args.query)) {
      candidates.push({ datasetCode, resolved })
    }
  }
  if (candidates.length === 0) {
    return {
      status: 404,
      body: {
        httpStatus: 404,
        error: 'not_found',
        message: 'No statistics match the selected field and geography filters.',
      },
    }
  }
  if (candidates.length > 1) {
    return {
      status: 409,
      body: ambiguousMeasureResponse(
        candidates.map(candidate => ({
          datasetCode: candidate.datasetCode,
          geography: candidate.resolved.geography,
        })),
      ),
    }
  }
  const candidate = candidates[0] as {
    datasetCode: string
    resolved: ResolvedAggregateValues
  }
  const meta = await buildAggregateMeta({
    activeSnapshot,
    datasetCode: candidate.datasetCode,
    dependencies,
    fieldName: args.query['filter[field]'],
    geography: candidate.resolved.geography,
    historyDbs: args.historyDbs,
  })
  return {
    status: 200,
    body: {
      meta: {
        ...meta,
        dimensions: candidate.resolved.dimensions,
        referencePeriod: args.query['filter[referencePeriod]'],
      },
      values: candidate.resolved.values,
    },
  }
}

async function resolveAggregateSeriesValues(args: {
  activeSnapshot: ActiveStatisticSnapshot
  currentDb: AppEnv['Variables']['currentDb']
  datasetCode: string
  dependencies: StatisticServiceDependencies
  fieldName: string
  metaDb: AppEnv['Variables']['metaDb']
  records: StatisticRecord[]
}): Promise<{ error: AggregateErrorResponse } | ResolvedAggregateSeriesValues> {
  const byReferencePeriod = new Map<string, StatisticRecord[]>()
  for (const record of args.records) {
    const period = byReferencePeriod.get(record.referencePeriodCode) ?? []
    period.push(record)
    byReferencePeriod.set(record.referencePeriodCode, period)
  }
  if (byReferencePeriod.size === 0) {
    return {
      error: {
        httpStatus: 404,
        error: 'not_found',
        message: 'No statistics match the selected field.',
      },
    }
  }
  let commonGeography: ResolvedAggregateGeography | undefined
  let commonDimensions: Record<string, string> | undefined
  const valuesByReferencePeriod: Record<string, Record<string, string>> = {}
  for (const [referencePeriod, periodRecords] of [...byReferencePeriod.entries()].sort(
    ([left], [right]) => left.localeCompare(right),
  )) {
    const resolved = await resolveAggregateValues({
      activeSnapshot: args.activeSnapshot,
      currentDb: args.currentDb,
      datasetCode: args.datasetCode,
      dependencies: args.dependencies,
      fieldName: args.fieldName,
      metaDb: args.metaDb,
      records: periodRecords,
    })
    if ('error' in resolved && resolved.error) return { error: resolved.error }
    if (
      commonGeography &&
      JSON.stringify(commonGeography) !== JSON.stringify(resolved.geography)
    ) {
      return {
        error: {
          httpStatus: 409,
          error: 'incomplete_geography_dimension',
          message: 'The selected series mixes geography dimensions.',
        },
      }
    }
    if (commonDimensions && !equalJsonObjects(commonDimensions, resolved.dimensions)) {
      return {
        error: {
          httpStatus: 409,
          error: 'incomplete_geography_dimension',
          message: 'The selected series mixes analytical dimension sets.',
        },
      }
    }
    commonGeography = resolved.geography
    commonDimensions = resolved.dimensions
    valuesByReferencePeriod[referencePeriod] = resolved.values
  }
  return {
    geography: commonGeography as ResolvedAggregateGeography,
    dimensions: commonDimensions ?? {},
    valuesByReferencePeriod,
  }
}

export async function getStatisticsSeries(args: {
  currentDb: AppEnv['Variables']['currentDb']
  historyDbs: AppEnv['Variables']['historyDbs']
  metaDb: AppEnv['Variables']['metaDb']
  query: StatisticSeriesQuery
  dependencies?: Partial<StatisticServiceDependencies>
}): Promise<SeriesAggregateResult> {
  const dependencies = { ...defaultDependencies, ...args.dependencies }
  const activeSnapshot = await getActiveStatisticSnapshot(
    args.metaDb,
    args.query,
    dependencies,
  )
  if (!activeSnapshot)
    return { status: 503, body: buildSnapshotNotReadyResponse('statistic') }
  const records = await dependencies.listStatisticRecordsForGeography(args.historyDbs, {
    datasetCode: args.query['filter[dataset]'],
    fieldName: args.query['filter[field]'],
    sourceReleaseIds: activeSnapshot.sourceReleaseIds,
  })
  const candidates: Array<{
    datasetCode: string
    resolved: ResolvedAggregateSeriesValues
  }> = []
  for (const [datasetCode, datasetRecords] of groupRecordsByDataset(records)) {
    const resolved = await resolveAggregateSeriesValues({
      activeSnapshot,
      currentDb: args.currentDb,
      datasetCode,
      dependencies,
      fieldName: args.query['filter[field]'],
      metaDb: args.metaDb,
      records: datasetRecords,
    })
    if ('error' in resolved) {
      if (args.query['filter[dataset]']) {
        return { status: resolved.error.httpStatus, body: resolved.error }
      }
      continue
    }
    if (matchesAggregateGeographyFilters(resolved.geography, args.query)) {
      candidates.push({ datasetCode, resolved })
    }
  }
  if (candidates.length === 0) {
    return {
      status: 404,
      body: {
        httpStatus: 404,
        error: 'not_found',
        message: 'No statistics match the selected field and geography filters.',
      },
    }
  }
  if (candidates.length > 1) {
    return {
      status: 409,
      body: ambiguousMeasureResponse(
        candidates.map(candidate => ({
          datasetCode: candidate.datasetCode,
          geography: candidate.resolved.geography,
        })),
      ),
    }
  }
  const candidate = candidates[0] as (typeof candidates)[number]
  const meta = await buildAggregateMeta({
    activeSnapshot,
    datasetCode: candidate.datasetCode,
    dependencies,
    fieldName: args.query['filter[field]'],
    geography: candidate.resolved.geography,
    historyDbs: args.historyDbs,
  })
  return {
    status: 200,
    body: {
      meta: { ...meta, dimensions: candidate.resolved.dimensions },
      valuesByReferencePeriod: candidate.resolved.valuesByReferencePeriod,
    },
  }
}
