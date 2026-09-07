import type {
  StatisticFieldDefinition,
  StatisticMeasureDefinition,
} from '../db/statistics'
import {
  buildJsonApiDetailDocument,
  buildJsonApiListDocument,
  buildSnapshotNotReadyResponse,
  resolveApiMetaLocales,
} from '../lib/api'
import { runWithD1ReadRetry } from '../lib/d1'
import type { AppEnv } from '../types'
import {
  buildRouteState,
  createIncludedStatisticFieldResource,
  defaultDependencies,
  type NotFoundResponse,
  type StatisticListQuery,
  type StatisticRegistrySnapshot,
  type StatisticRouteState,
  type StatisticServiceDependencies,
  type StatisticSnapshotNotReadyResponse,
} from './statistics'

export type StatisticRegistryQuery = Pick<
  StatisticListQuery,
  | 'catalogRevision'
  | 'cohort'
  | 'domain'
  | 'effectiveAt'
  | 'knownAt'
  | 'releaseSet'
  | 'locales'
  | 'page[limit]'
  | 'page[offset]'
> & {
  q?: string
  'filter[dataset]'?: string
  'filter[measure]'?: string
  'filter[field]'?: string
  'filter[dimension]'?: string[]
}

type StatisticsRegistryResult =
  | { status: 200; body: Record<string, unknown> }
  | { status: 404; body: NotFoundResponse }
  | { status: 503; body: StatisticSnapshotNotReadyResponse }

function registryRouteState(locales?: string) {
  return buildRouteState({
    requestedVersionPath: 'stats/v0.1',
    requestedApiVersion: '0.1',
    resolvedApiVersion: 'api-stats-v0.1',
    locales,
  })
}

function registryMeta(
  activeSnapshot: StatisticRegistrySnapshot,
  routeState: StatisticRouteState,
) {
  return {
    requestedApiVersion: routeState.requestedApiVersion,
    requestedApiFamily: 'stats' as const,
    resolvedApiVersion: routeState.resolvedApiVersion,
    apiCatalogRevision: activeSnapshot.apiCatalogRevision,
    catalogPublishedAt: activeSnapshot.catalogPublishedAt,
    apiReleaseSets: activeSnapshot.apiReleaseSets,
    cohorts: activeSnapshot.cohorts,
    domain: 'government' as const,
    profile: routeState.profile,
    locales: resolveApiMetaLocales(routeState.localeSelection),
    schemaVersions: activeSnapshot.schemaVersions,
    rulesetVersions: activeSnapshot.rulesetVersions,
    registry: true,
  }
}

function registryPermalink(args: {
  activeSnapshot: StatisticRegistrySnapshot
  routeState: StatisticRouteState
  url: URL
}) {
  const permalink = new URL(args.url)
  permalink.pathname = permalink.pathname.replace(
    /^\/stats\/v0(?:\.\d+)?/,
    '/stats/v0.1',
  )
  permalink.searchParams.set('catalogRevision', args.activeSnapshot.apiCatalogRevision)
  permalink.searchParams.set('knownAt', args.activeSnapshot.catalogPublishedAt)
  permalink.searchParams.set('domain', 'government')
  permalink.searchParams.set('profile', args.routeState.profile)
  permalink.searchParams.set(
    'locales',
    args.routeState.localeSelection.mode === 'all'
      ? '*'
      : args.routeState.localeSelection.locales.join(','),
  )
  permalink.searchParams.set('include', 'none')
  permalink.searchParams.sort()
  return permalink.toString()
}

function fieldRegistryResource(definition: StatisticFieldDefinition) {
  return {
    ...createIncludedStatisticFieldResource({ definition }),
    type: 'statistic-fields' as const,
    links: {
      self: `/stats/v0.1/registry/fields/${encodeURIComponent(definition.datasetCode)}/${encodeURIComponent(definition.fieldName)}`,
    },
  }
}

function measureRegistryResource(definition: StatisticMeasureDefinition) {
  return {
    type: 'statistic-measures' as const,
    id: `${definition.datasetCode}:${definition.measureCode}`,
    attributes: {
      datasetCode: definition.datasetCode,
      measureCode: definition.measureCode,
      i18n: definition.i18n,
    },
    links: {
      self: `/stats/v0.1/registry/measures/${encodeURIComponent(definition.datasetCode)}/${encodeURIComponent(definition.measureCode)}`,
    },
  }
}

function parseDimensionFilters(filters: string[] | undefined) {
  return (filters ?? []).map(filter => {
    const separator = filter.indexOf(':')
    return {
      code: filter.slice(0, separator),
      value: filter.slice(separator + 1),
    }
  })
}

function matchesRegistryField(
  definition: StatisticFieldDefinition,
  query: StatisticRegistryQuery,
) {
  if (query['filter[dataset]'] && definition.datasetCode !== query['filter[dataset]'])
    return false
  if (query['filter[measure]'] && definition.measureCode !== query['filter[measure]'])
    return false
  if (query['filter[field]'] && definition.fieldName !== query['filter[field]'])
    return false
  return parseDimensionFilters(query['filter[dimension]']).every(
    filter => definition.dimensions[filter.code] === filter.value,
  )
}

function normalisedSearchText(value: string) {
  return value
    .normalize('NFKD')
    .toLocaleLowerCase('en')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
}

function matchesSearch(
  definition: StatisticFieldDefinition | StatisticMeasureDefinition,
  query: string,
) {
  const needle = normalisedSearchText(query).trim()
  if (!needle) return false
  const values = [
    definition.datasetCode,
    'fieldName' in definition ? definition.fieldName : definition.measureCode,
    ...Object.values(definition.i18n).flatMap(value => [
      value.name,
      value.description ?? '',
    ]),
    ...('dimensions' in definition ? Object.entries(definition.dimensions).flat() : []),
  ]
  return values.some(value => normalisedSearchText(value).includes(needle))
}

async function loadStatisticsRegistry(args: {
  historyDbs: AppEnv['Variables']['historyDbs']
  metaDb: AppEnv['Variables']['metaDb']
  query: StatisticRegistryQuery
  dependencies: StatisticServiceDependencies
}) {
  const routeState = registryRouteState(args.query.locales)
  const selection = await runWithD1ReadRetry(() =>
    args.dependencies.listApiReleaseSetSnapshotsForRegistryRequest(
      args.metaDb as never,
      'divisionStatistic',
      {
        catalogRevision: args.query.catalogRevision,
        cohortKey: args.query.cohort,
        domainCode: 'government',
        effectiveAt: args.query.effectiveAt,
        knownAt: args.query.knownAt,
        regionCode: 'hk',
        releaseSet: args.query.releaseSet,
      },
    ),
  )
  if (!selection) return null
  const snapshotIds = selection.releaseSets.flatMap(releaseSet =>
    releaseSet.snapshots
      .filter(snapshot => snapshot.snapshotResourceType === 'divisionStatistic')
      .map(snapshot => snapshot.snapshotId),
  )
  if (snapshotIds.length === 0) return null
  const sources = await runWithD1ReadRetry(() =>
    args.dependencies.listSnapshotSourceReleases(args.metaDb as never, snapshotIds),
  )
  const activeSnapshot = {
    datasetCodes: [...new Set(sources.map(source => source.datasetCode))],
    snapshotIds: [...new Set(snapshotIds)],
    sourceReleaseIds: [...new Set(sources.map(source => source.sourceReleaseId))],
    apiCatalogRevision: selection.apiCatalogRevision,
    catalogPublishedAt: selection.catalogPublishedAt,
    apiReleaseSets: selection.releaseSets.map(releaseSet => releaseSet.code),
    cohorts: [
      ...new Set(selection.releaseSets.map(releaseSet => releaseSet.cohortKey)),
    ],
    domainCode: 'government',
    rulesetVersions: [
      ...new Set(selection.releaseSets.map(releaseSet => releaseSet.rulesetVersion)),
    ],
    schemaVersions: [
      ...new Set(selection.releaseSets.map(releaseSet => releaseSet.schemaVersion)),
    ],
  } satisfies StatisticRegistrySnapshot
  const [fields, measures] = await runWithD1ReadRetry(() =>
    Promise.all([
      args.dependencies.listStatisticFieldDefinitions(args.historyDbs, {
        datasetCodes: activeSnapshot.datasetCodes,
        localeSelection: routeState.localeSelection,
        sourceReleaseIds: activeSnapshot.sourceReleaseIds,
      }),
      args.dependencies.listStatisticMeasureDefinitions(args.historyDbs, {
        datasetCodes: activeSnapshot.datasetCodes,
        localeSelection: routeState.localeSelection,
        sourceReleaseIds: activeSnapshot.sourceReleaseIds,
      }),
    ]),
  )
  return { activeSnapshot, fields, measures, routeState }
}

function paginate<T>(items: T[], query: StatisticRegistryQuery) {
  const limit = query['page[limit]'] ?? 25
  const offset = query['page[offset]'] ?? 0
  return {
    items: items.slice(offset, offset + limit),
    limit,
    offset,
    total: items.length,
  }
}

export async function getStatisticsRegistryManifest(args: {
  historyDbs: AppEnv['Variables']['historyDbs']
  metaDb: AppEnv['Variables']['metaDb']
  requestUrl: string
  query: StatisticRegistryQuery
  dependencies?: Partial<StatisticServiceDependencies>
}): Promise<StatisticsRegistryResult> {
  const dependencies = { ...defaultDependencies, ...args.dependencies }
  const registry = await loadStatisticsRegistry({ ...args, dependencies })
  if (!registry)
    return { status: 503, body: buildSnapshotNotReadyResponse('statistic') }
  const url = new URL(args.requestUrl)
  return {
    status: 200,
    body: buildJsonApiDetailDocument({
      url,
      data: {
        type: 'statistic-registry',
        id: registry.activeSnapshot.apiCatalogRevision,
        attributes: {
          datasets: [...new Set(registry.fields.map(field => field.datasetCode))]
            .length,
          fields: registry.fields.length,
          measures: registry.measures.length,
        },
        links: {
          datasets: '/stats/v0.1/registry/datasets',
          dimensions: '/stats/v0.1/registry/dimensions',
          fields: '/stats/v0.1/registry/fields',
          measures: '/stats/v0.1/registry/measures',
          search: '/stats/v0.1/registry/search{?q}',
        },
      },
      meta: registryMeta(registry.activeSnapshot, registry.routeState),
      permalink: registryPermalink({
        activeSnapshot: registry.activeSnapshot,
        routeState: registry.routeState,
        url,
      }),
    }),
  }
}

export async function listStatisticsRegistryFields(args: {
  historyDbs: AppEnv['Variables']['historyDbs']
  metaDb: AppEnv['Variables']['metaDb']
  requestUrl: string
  query: StatisticRegistryQuery
  dependencies?: Partial<StatisticServiceDependencies>
}): Promise<StatisticsRegistryResult> {
  const dependencies = { ...defaultDependencies, ...args.dependencies }
  const registry = await loadStatisticsRegistry({ ...args, dependencies })
  if (!registry)
    return { status: 503, body: buildSnapshotNotReadyResponse('statistic') }
  const page = paginate(
    registry.fields
      .filter(field => matchesRegistryField(field, args.query))
      .sort((left, right) =>
        `${left.datasetCode}\u0000${left.fieldName}`.localeCompare(
          `${right.datasetCode}\u0000${right.fieldName}`,
        ),
      ),
    args.query,
  )
  const url = new URL(args.requestUrl)
  return {
    status: 200,
    body: buildJsonApiListDocument({
      url,
      data: page.items.map(fieldRegistryResource),
      limit: page.limit,
      offset: page.offset,
      total: page.total,
      meta: registryMeta(registry.activeSnapshot, registry.routeState),
      permalink: registryPermalink({
        activeSnapshot: registry.activeSnapshot,
        routeState: registry.routeState,
        url,
      }),
    }),
  }
}

export async function listStatisticsRegistryMeasures(args: {
  historyDbs: AppEnv['Variables']['historyDbs']
  metaDb: AppEnv['Variables']['metaDb']
  requestUrl: string
  query: StatisticRegistryQuery
  dependencies?: Partial<StatisticServiceDependencies>
}): Promise<StatisticsRegistryResult> {
  const dependencies = { ...defaultDependencies, ...args.dependencies }
  const registry = await loadStatisticsRegistry({ ...args, dependencies })
  if (!registry)
    return { status: 503, body: buildSnapshotNotReadyResponse('statistic') }
  const page = paginate(
    registry.measures
      .filter(measure =>
        args.query['filter[dataset]']
          ? measure.datasetCode === args.query['filter[dataset]']
          : true,
      )
      .sort((left, right) =>
        `${left.datasetCode}\u0000${left.measureCode}`.localeCompare(
          `${right.datasetCode}\u0000${right.measureCode}`,
        ),
      ),
    args.query,
  )
  const url = new URL(args.requestUrl)
  return {
    status: 200,
    body: buildJsonApiListDocument({
      url,
      data: page.items.map(measureRegistryResource),
      limit: page.limit,
      offset: page.offset,
      total: page.total,
      meta: registryMeta(registry.activeSnapshot, registry.routeState),
      permalink: registryPermalink({
        activeSnapshot: registry.activeSnapshot,
        routeState: registry.routeState,
        url,
      }),
    }),
  }
}

export async function getStatisticsRegistryMeasure(args: {
  datasetCode: string
  measureCode: string
  historyDbs: AppEnv['Variables']['historyDbs']
  metaDb: AppEnv['Variables']['metaDb']
  requestUrl: string
  query: StatisticRegistryQuery
  dependencies?: Partial<StatisticServiceDependencies>
}): Promise<StatisticsRegistryResult> {
  const dependencies = { ...defaultDependencies, ...args.dependencies }
  const registry = await loadStatisticsRegistry({ ...args, dependencies })
  if (!registry)
    return { status: 503, body: buildSnapshotNotReadyResponse('statistic') }
  const measure = registry.measures.find(
    candidate =>
      candidate.datasetCode === args.datasetCode &&
      candidate.measureCode === args.measureCode,
  )
  if (!measure) {
    return {
      status: 404,
      body: {
        httpStatus: 404,
        error: 'not_found',
        message: 'Statistic measure not found in the selected registry.',
      },
    }
  }
  const url = new URL(args.requestUrl)
  return {
    status: 200,
    body: buildJsonApiDetailDocument({
      url,
      data: measureRegistryResource(measure),
      meta: registryMeta(registry.activeSnapshot, registry.routeState),
      permalink: registryPermalink({
        activeSnapshot: registry.activeSnapshot,
        routeState: registry.routeState,
        url,
      }),
    }),
  }
}

export async function searchStatisticsRegistry(args: {
  historyDbs: AppEnv['Variables']['historyDbs']
  metaDb: AppEnv['Variables']['metaDb']
  requestUrl: string
  query: StatisticRegistryQuery & { q: string }
  dependencies?: Partial<StatisticServiceDependencies>
}): Promise<StatisticsRegistryResult> {
  const dependencies = { ...defaultDependencies, ...args.dependencies }
  const registry = await loadStatisticsRegistry({ ...args, dependencies })
  if (!registry)
    return { status: 503, body: buildSnapshotNotReadyResponse('statistic') }
  const matches = [
    ...registry.measures
      .filter(measure => matchesSearch(measure, args.query.q))
      .map(measureRegistryResource),
    ...registry.fields
      .filter(field => matchesRegistryField(field, args.query))
      .filter(field => matchesSearch(field, args.query.q))
      .map(fieldRegistryResource),
  ]
  const page = paginate(matches, args.query)
  const url = new URL(args.requestUrl)
  return {
    status: 200,
    body: buildJsonApiListDocument({
      url,
      data: page.items,
      limit: page.limit,
      offset: page.offset,
      total: page.total,
      meta: {
        ...registryMeta(registry.activeSnapshot, registry.routeState),
        query: args.query.q,
      },
      permalink: registryPermalink({
        activeSnapshot: registry.activeSnapshot,
        routeState: registry.routeState,
        url,
      }),
    }),
  }
}

export async function listStatisticsRegistryDimensions(args: {
  historyDbs: AppEnv['Variables']['historyDbs']
  metaDb: AppEnv['Variables']['metaDb']
  requestUrl: string
  query: StatisticRegistryQuery
  dependencies?: Partial<StatisticServiceDependencies>
}): Promise<StatisticsRegistryResult> {
  const dependencies = { ...defaultDependencies, ...args.dependencies }
  const registry = await loadStatisticsRegistry({ ...args, dependencies })
  if (!registry)
    return { status: 503, body: buildSnapshotNotReadyResponse('statistic') }
  const counts = new Map<string, number>()
  for (const field of registry.fields.filter(field =>
    matchesRegistryField(field, args.query),
  )) {
    for (const [code, value] of Object.entries(field.dimensions)) {
      const key = `${code}\u0000${value}`
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
  }
  const dimensions = [...counts.entries()]
    .map(([key, fieldCount]) => {
      const [code, value] = key.split('\u0000')
      return {
        type: 'statistic-dimensions' as const,
        id: `${code}:${value}`,
        attributes: { code, fieldCount, value },
      }
    })
    .sort((left, right) => left.id.localeCompare(right.id))
  const page = paginate(dimensions, args.query)
  const url = new URL(args.requestUrl)
  return {
    status: 200,
    body: buildJsonApiListDocument({
      url,
      data: page.items,
      limit: page.limit,
      offset: page.offset,
      total: page.total,
      meta: registryMeta(registry.activeSnapshot, registry.routeState),
      permalink: registryPermalink({
        activeSnapshot: registry.activeSnapshot,
        routeState: registry.routeState,
        url,
      }),
    }),
  }
}

export async function listStatisticsRegistryDatasets(args: {
  historyDbs: AppEnv['Variables']['historyDbs']
  metaDb: AppEnv['Variables']['metaDb']
  requestUrl: string
  query: StatisticRegistryQuery
  dependencies?: Partial<StatisticServiceDependencies>
}): Promise<StatisticsRegistryResult> {
  const dependencies = { ...defaultDependencies, ...args.dependencies }
  const registry = await loadStatisticsRegistry({ ...args, dependencies })
  if (!registry)
    return { status: 503, body: buildSnapshotNotReadyResponse('statistic') }
  const datasets = [...new Set(registry.fields.map(field => field.datasetCode))]
    .filter(datasetCode =>
      args.query['filter[dataset]']
        ? datasetCode === args.query['filter[dataset]']
        : true,
    )
    .sort()
    .map(datasetCode => ({
      type: 'statistic-datasets' as const,
      id: datasetCode,
      attributes: {
        fieldCount: registry.fields.filter(field => field.datasetCode === datasetCode)
          .length,
        measureCount: registry.measures.filter(
          measure => measure.datasetCode === datasetCode,
        ).length,
      },
    }))
  const page = paginate(datasets, args.query)
  const url = new URL(args.requestUrl)
  return {
    status: 200,
    body: buildJsonApiListDocument({
      url,
      data: page.items,
      limit: page.limit,
      offset: page.offset,
      total: page.total,
      meta: registryMeta(registry.activeSnapshot, registry.routeState),
      permalink: registryPermalink({
        activeSnapshot: registry.activeSnapshot,
        routeState: registry.routeState,
        url,
      }),
    }),
  }
}

export async function getStatisticsRegistryField(args: {
  datasetCode: string
  fieldName: string
  historyDbs: AppEnv['Variables']['historyDbs']
  metaDb: AppEnv['Variables']['metaDb']
  requestUrl: string
  query: StatisticRegistryQuery
  dependencies?: Partial<StatisticServiceDependencies>
}): Promise<StatisticsRegistryResult> {
  const dependencies = { ...defaultDependencies, ...args.dependencies }
  const registry = await loadStatisticsRegistry({ ...args, dependencies })
  if (!registry)
    return { status: 503, body: buildSnapshotNotReadyResponse('statistic') }
  const field = registry.fields.find(
    candidate =>
      candidate.datasetCode === args.datasetCode &&
      candidate.fieldName === args.fieldName,
  )
  if (!field) {
    return {
      status: 404,
      body: {
        httpStatus: 404,
        error: 'not_found',
        message: 'Statistic field not found in the selected registry.',
      },
    }
  }
  const url = new URL(args.requestUrl)
  const path = `/stats/v0.1/registry/fields/${encodeURIComponent(field.datasetCode)}/${encodeURIComponent(field.fieldName)}`
  return {
    status: 200,
    body: buildJsonApiDetailDocument({
      url,
      data: {
        ...fieldRegistryResource(field),
        links: { availability: `${path}/availability`, self: path },
      },
      meta: registryMeta(registry.activeSnapshot, registry.routeState),
      permalink: registryPermalink({
        activeSnapshot: registry.activeSnapshot,
        routeState: registry.routeState,
        url,
      }),
    }),
  }
}

export async function getStatisticsRegistryFieldAvailability(args: {
  datasetCode: string
  fieldName: string
  historyDbs: AppEnv['Variables']['historyDbs']
  metaDb: AppEnv['Variables']['metaDb']
  requestUrl: string
  query: StatisticRegistryQuery
  dependencies?: Partial<StatisticServiceDependencies>
}): Promise<StatisticsRegistryResult> {
  const dependencies = { ...defaultDependencies, ...args.dependencies }
  const registry = await loadStatisticsRegistry({ ...args, dependencies })
  if (!registry)
    return { status: 503, body: buildSnapshotNotReadyResponse('statistic') }
  const field = registry.fields.find(
    candidate =>
      candidate.datasetCode === args.datasetCode &&
      candidate.fieldName === args.fieldName,
  )
  if (!field) {
    return {
      status: 404,
      body: {
        httpStatus: 404,
        error: 'not_found',
        message: 'Statistic field not found in the selected registry.',
      },
    }
  }
  const records = await runWithD1ReadRetry(() =>
    dependencies.listStatisticRecordsForGeography(args.historyDbs, {
      datasetCode: field.datasetCode,
      fieldName: field.fieldName,
      sourceReleaseIds: registry.activeSnapshot.sourceReleaseIds,
    }),
  )
  const coverageByPeriod = new Map<string, Map<string, number>>()
  for (const record of records) {
    const coverage = coverageByPeriod.get(record.referencePeriodCode) ?? new Map()
    const signature = `${record.geography.kind}\u0000${record.geography.class ?? ''}`
    coverage.set(signature, (coverage.get(signature) ?? 0) + 1)
    coverageByPeriod.set(record.referencePeriodCode, coverage)
  }
  const url = new URL(args.requestUrl)
  const referencePeriods = [...coverageByPeriod.entries()]
    .sort(([left], [right]) => right.localeCompare(left))
    .map(([code, coverage]) => {
      const mapUrl = new URL('/stats/v0.1/geographies', url.origin)
      mapUrl.searchParams.set('filter[dataset]', field.datasetCode)
      mapUrl.searchParams.set('filter[field]', field.fieldName)
      mapUrl.searchParams.set('filter[referencePeriod]', code)
      return {
        code,
        geographies: [...coverage.entries()]
          .map(([signature, recordCount]) => {
            const [kind, className] = signature.split('\u0000')
            return {
              ...(className ? { class: className } : {}),
              kind,
              recordCount,
            }
          })
          .sort((left, right) =>
            `${left.kind}:${left.class ?? ''}`.localeCompare(
              `${right.kind}:${right.class ?? ''}`,
            ),
          ),
        map: mapUrl.toString(),
      }
    })
  return {
    status: 200,
    body: buildJsonApiDetailDocument({
      url,
      data: {
        type: 'statistic-field-availability',
        id: `${field.datasetCode}:${field.fieldName}`,
        attributes: {
          datasetCode: field.datasetCode,
          fieldName: field.fieldName,
          referencePeriods,
        },
      },
      meta: registryMeta(registry.activeSnapshot, registry.routeState),
      permalink: registryPermalink({
        activeSnapshot: registry.activeSnapshot,
        routeState: registry.routeState,
        url,
      }),
    }),
  }
}
