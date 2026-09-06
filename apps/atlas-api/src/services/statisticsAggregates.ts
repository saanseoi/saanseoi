import type { StatisticRecord } from '../db/statistics'
import {
  buildApiVersionMetadata,
  buildSnapshotNotReadyResponse,
  type ApiVersionMetadata,
} from '../lib/api'
import type { AppEnv } from '../types'
import {
  defaultDependencies,
  getActiveStatisticSnapshot,
  resolveRelatedDivisionSelection,
  type ActiveStatisticSnapshot,
  type StatisticGeographiesQuery,
  type StatisticSeriesQuery,
  type StatisticServiceDependencies,
  type StatisticSnapshotNotReadyResponse,
} from './statistics'

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
  const directDistrictValues = directDistrictGeographyValues(
    args.records,
    args.fieldName,
  )
  const selection = await resolveRelatedDivisionSelection(
    args.metaDb,
    domainCode,
    args.activeSnapshot.catalogPublishedAt,
    args.dependencies,
  )
  const snapshotId = selection?.divisionSnapshotIds[0]
  if (!selection || !snapshotId) {
    if (directDistrictValues) {
      return directDistrictAggregate(domainCode, dimensions, directDistrictValues)
    }
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
      if (directDistrictValues) {
        return directDistrictAggregate(domainCode, dimensions, directDistrictValues)
      }
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

function directDistrictAggregate(
  domainCode: string,
  dimensions: Record<string, string>,
  values: Record<string, string>,
) {
  return {
    geography: {
      codeAttribute: 'divisionCode' as const,
      domainCode,
      kind: 'division' as const,
      level: 2,
    },
    dimensions,
    values,
  }
}

/**
 * C&SD district records retain their reviewed canonical district code. That
 * code remains sufficient for a map even while a newer Divisions current-view
 * snapshot has not materialised the matching IDs yet.
 */
function directDistrictGeographyValues(records: StatisticRecord[], fieldName: string) {
  const values: Record<string, string> = {}
  for (const record of records) {
    if (record.geography.kind !== 'district') return null
    const code = record.geography.code
    const value = record.values[fieldName]
    if (!code || value === undefined || values[code] !== undefined) return null
    values[code] = value
  }
  return Object.keys(values).length > 0 ? values : null
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
