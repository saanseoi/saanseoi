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
import type { BBox } from '@repo/core/pipeline/geojson.ts'

import {
  listAddressRecordsCurrent,
  listAddressRecordsCurrentByIds,
  searchAddressIdsCurrent,
  type AddressSearchComponent,
  type AddressSearchMode,
  type AddressLocaleValue,
  type AddressRecord,
} from '../db/addresses'
import { listReplayedAddressRecords } from '../db/addressesHistory'
import { listDivisionRecordsCurrentByIds } from '../db/divisions'
import { createIncludedDivisionResource } from './divisions'
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
import type { AppEnv } from '../types'
import type { AccessAttribution } from './accessAnalytics'
import {
  resolveApiReleaseSetAccessAttribution,
  resolveOptionalApiReleaseSetAccessAttribution,
} from './accessAnalytics'

export type RequestedAddressVersion = 'addresses/v0' | 'addresses/v0.1'
export type RequestedAddressApiVersion = '0.1'
export type ResolvedAddressApiVersion = 'api-addresses-v0.1'
export type AddressProfile = ApiProfileName

type JsonObject = Record<string, unknown>

type AddressResourcePayload = {
  type: 'addresses'
  id: string
  attributes: {
    datasetCode: string
    parentAddressId: string | null
    granularity: AddressRecord['address']['granularity']
    snapshotId?: string
    geometry?: JsonObject | null
    bbox?: BBox | null
    createdAt?: string
    updatedAt?: string
    identifiers?: unknown
    sources?: unknown
    i18n?: Record<string, AddressLocaleValue>
  }
  relationships: {
    country: { data: { type: 'divisions'; id: string } | null }
    area: { data: { type: 'divisions'; id: string } | null }
    district: { data: { type: 'divisions'; id: string } | null }
    town: { data: { type: 'divisions'; id: string } | null }
    macrohood: { data: { type: 'divisions'; id: string } | null }
    neighbourhood: { data: { type: 'divisions'; id: string } | null }
    microhood: { data: { type: 'divisions'; id: string } | null }
    village: { data: { type: 'divisions'; id: string } | null }
    hamlet: { data: { type: 'divisions'; id: string } | null }
    hierarchy: { data: Array<{ type: 'divisions'; id: string }> }
  }
  links: { self: string }
}

type AddressRouteState = {
  requestedVersionPath: RequestedAddressVersion
  requestedApiVersion: RequestedAddressApiVersion
  requestedApiFamily: 'addresses'
  resolvedApiVersion: ResolvedAddressApiVersion
  profile: AddressProfile
  localeSelection: RequestedApiLocaleSelection
}

type AddressFilters = {
  dataset?: string
  country?: string
  area?: string
  district?: string
  town?: string
  macrohood?: string
  neighbourhood?: string
  microhood?: string
  village?: string
  hamlet?: string
}

type AddressDocumentMeta = ApiVersionMetadata & {
  apiCatalogRevision: string
  catalogPublishedAt: string
  cohort: string
  domain: string
  profile: AddressProfile
  locales: ApiDocumentLocales
  filters?: AddressFilters
  page?: { limit: number; offset: number; total?: number }
  search?: {
    component?: AddressSearchComponent
    mode: AddressSearchMode
    query: string
  }
}

type AddressListDocument = {
  jsonapi: { version: '1.1' }
  links: Record<string, string>
  data: AddressResourcePayload[]
  included?: unknown[]
  meta: AddressDocumentMeta
}

type AddressDetailDocument = {
  jsonapi: { version: '1.1' }
  links: { self: string; permalink?: string }
  data: AddressResourcePayload
  included?: unknown[]
  meta: AddressDocumentMeta
}

async function loadIncludedAddressHierarchy(args: {
  currentDb: AppEnv['Variables']['currentDb']
  records: AddressRecord[]
  snapshotId: string
  routeState: AddressRouteState
  include?: 'hierarchy'
  baseUrl: string
}) {
  if (args.include !== 'hierarchy') return []

  const idsBySnapshot = new Map<string, Set<string>>()
  for (const record of args.records) {
    const snapshotId = record.address.divisionSnapshotId ?? args.snapshotId
    const ids = idsBySnapshot.get(snapshotId) ?? new Set<string>()
    for (const id of addressHierarchyIds(record.address)) ids.add(id)
    idsBySnapshot.set(snapshotId, ids)
  }
  const recordsById = new Map<
    string,
    Awaited<ReturnType<typeof listDivisionRecordsCurrentByIds>>[number]
  >()
  for (const [snapshotId, divisionIds] of idsBySnapshot) {
    const records = await listDivisionRecordsCurrentByIds(args.currentDb, {
      snapshotId,
      divisionIds: [...divisionIds],
      localeSelection: args.routeState.localeSelection,
    })
    for (const record of records) recordsById.set(record.division.id, record)
  }
  const records = [...recordsById.values()]
  return records.map(record =>
    createIncludedDivisionResource({
      baseUrl: args.baseUrl,
      requestedVersionPath: 'divisions/v0.1',
      profile: args.routeState.profile,
      localeSelection: args.routeState.localeSelection,
      record,
    }),
  )
}

type ActiveAddressSnapshot = {
  snapshotIds: string[]
  datasetBySnapshot: Map<string, string>
  divisionSnapshotId: string
  apiReleaseSet: string
  apiCatalogRevision: string
  catalogPublishedAt: string
  cohortKey: string
  domainCode: string
  schemaVersion: string
  rulesetVersion: string
}

export type AddressListQuery = {
  catalogRevision?: string
  cohort?: string
  domain?: string
  effectiveAt?: string
  knownAt?: string
  releaseSet?: string
  profile?: string
  locales?: string
  'page[limit]'?: number
  'page[offset]'?: number
  'filter[country]'?: string
  'filter[dataset]'?: string
  'filter[area]'?: string
  'filter[district]'?: string
  include?: 'hierarchy'
}

export type AddressSearchQuery = AddressListQuery & {
  component?: AddressSearchComponent
  match: AddressSearchMode
  q: string
}

export type AddressDetailQuery = Omit<
  AddressListQuery,
  | 'page[limit]'
  | 'page[offset]'
  | 'filter[country]'
  | 'filter[dataset]'
  | 'filter[area]'
  | 'filter[district]'
>

type AddressNotFoundResponse = {
  httpStatus: 404
  error: 'not_found'
  message: string
}

export type AddressListResult =
  | { status: 200; body: AddressListDocument }
  | { status: 503; body: SnapshotNotReadyResponse<'address'> }

export type AddressDetailResult =
  | { status: 200; body: AddressDetailDocument }
  | { status: 404; body: AddressNotFoundResponse }
  | { status: 503; body: SnapshotNotReadyResponse<'address'> }

type AddressSearchUnavailableResponse = {
  httpStatus: 503
  error: 'fts_not_ready'
  message: 'FTS index is not initialised. Rebuild addressesFts before using search.'
}

function addressMatchesFilters(record: AddressRecord, filters: AddressFilters) {
  const { address } = record
  return (
    (!filters.country || address.countryId === filters.country) &&
    (!filters.area || address.areaId === filters.area) &&
    (!filters.district || address.districtId === filters.district)
  )
}

async function loadSelectedAddressRecords(args: {
  activeSnapshot: ActiveAddressSnapshot
  currentDb: AppEnv['Variables']['currentDb']
  filters: AddressFilters
  historyDbsByBinding?: AppEnv['Variables']['historyDbsByBinding']
  localeSelection: RequestedApiLocaleSelection
  metaDb: AppEnv['Variables']['metaDb']
}) {
  if (args.historyDbsByBinding) {
    const records = await listReplayedAddressRecords({
      divisionSnapshotId: args.activeSnapshot.divisionSnapshotId,
      historyDbsByBinding: args.historyDbsByBinding,
      localeSelection: args.localeSelection,
      metaDb: args.metaDb,
      snapshotIds: args.activeSnapshot.snapshotIds,
    })
    return records
      .filter(record => addressMatchesFilters(record, args.filters))
      .sort((left, right) => left.address.id.localeCompare(right.address.id))
  }

  return listAddressRecordsCurrent(args.currentDb, {
    snapshotIds: args.activeSnapshot.snapshotIds,
    countryId: args.filters.country,
    areaId: args.filters.area,
    districtId: args.filters.district,
    limit: Number.MAX_SAFE_INTEGER,
    localeSelection: args.localeSelection,
  })
}

export type AddressSearchResult =
  | { status: 200; body: AddressListDocument }
  | {
      status: 503
      body: AddressSearchUnavailableResponse | SnapshotNotReadyResponse<'address'>
    }

function parseAddressProfile(value?: string): AddressProfile {
  if (value === 'compact' || value === 'full' || value === 'map') return value
  return 'default'
}

function buildAddressRouteState(args: {
  requestedVersionPath: RequestedAddressVersion
  requestedApiVersion: RequestedAddressApiVersion
  resolvedApiVersion: ResolvedAddressApiVersion
  query: { profile?: string; locales?: string }
}) {
  const profile = parseAddressProfile(args.query.profile)
  const defaults: RequestedApiLocaleSelection =
    profile === 'full'
      ? { mode: 'all', locales: ['*'] }
      : { mode: 'requested', locales: defaultApiLocalesByProfile[profile] }

  return {
    requestedVersionPath: args.requestedVersionPath,
    requestedApiVersion: args.requestedApiVersion,
    requestedApiFamily: 'addresses',
    resolvedApiVersion: args.resolvedApiVersion,
    profile,
    localeSelection: parseRequestedApiLocales(args.query.locales, defaults),
  } satisfies AddressRouteState
}

function isMapAddressProfile(profile: AddressProfile) {
  return profile === 'map' || profile === 'full'
}

function projectAddressI18n(i18n: AddressRecord['i18n'], profile: AddressProfile) {
  const entries = Object.entries(i18n).map(([locale, value]) => [
    locale,
    profile === 'full'
      ? value
      : {
          formattedAddress: value.formattedAddress,
        },
  ])

  return entries.length > 0 ? Object.fromEntries(entries) : undefined
}

function divisionRelationship(id: string | null) {
  return id ? { type: 'divisions' as const, id } : null
}

function addressHierarchyIds(address: AddressRecord['address']) {
  return [
    address.countryId,
    address.areaId,
    address.districtId,
    address.townId,
    address.macrohoodId,
    address.neighbourhoodId,
    address.villageId,
    address.microhoodId,
    address.hamletId,
  ].filter((id): id is string => Boolean(id))
}

function createAddressResource(args: {
  baseUrl: string
  routeState: AddressRouteState
  record: AddressRecord
  activeSnapshot: ActiveAddressSnapshot
}): AddressResourcePayload {
  const { address } = args.record
  const attributes: AddressResourcePayload['attributes'] = {
    datasetCode: args.activeSnapshot.datasetBySnapshot.get(address.snapshotId)!,
    parentAddressId: address.parentAddressId,
    granularity: address.granularity,
  }

  if (args.routeState.profile !== 'compact') {
    attributes.createdAt = address.createdAt
    attributes.updatedAt = address.updatedAt
  }

  if (isMapAddressProfile(args.routeState.profile)) {
    attributes.geometry = (address.geometry as JsonObject | null) ?? null
    attributes.bbox = (address.bbox as BBox | null) ?? null
  }

  if (args.routeState.profile === 'full') {
    attributes.snapshotId = address.snapshotId
    attributes.identifiers = address.identifiers
    attributes.sources = address.sources ?? null
  }

  const i18n = projectAddressI18n(args.record.i18n, args.routeState.profile)
  if (i18n) attributes.i18n = i18n

  return {
    type: 'addresses',
    id: address.id,
    attributes,
    relationships: {
      country: { data: divisionRelationship(address.countryId) },
      area: { data: divisionRelationship(address.areaId) },
      district: { data: divisionRelationship(address.districtId) },
      town: { data: divisionRelationship(address.townId) },
      macrohood: { data: divisionRelationship(address.macrohoodId) },
      neighbourhood: { data: divisionRelationship(address.neighbourhoodId) },
      microhood: { data: divisionRelationship(address.microhoodId) },
      village: { data: divisionRelationship(address.villageId) },
      hamlet: { data: divisionRelationship(address.hamletId) },
      hierarchy: {
        data: addressHierarchyIds(address).map(id => ({
          type: 'divisions' as const,
          id,
        })),
      },
    },
    links: {
      self: `${args.baseUrl}/${args.routeState.requestedVersionPath}/${address.id}`,
    },
  }
}

function buildMetadata(args: {
  routeState: AddressRouteState
  activeSnapshot: ActiveAddressSnapshot
  filters?: AddressFilters
  page?: { limit: number; offset: number; total?: number }
  search?: AddressDocumentMeta['search']
}): AddressDocumentMeta {
  return {
    ...buildApiVersionMetadata({
      requestedApiVersion: args.routeState.requestedApiVersion,
      requestedApiFamily: args.routeState.requestedApiFamily,
      resolvedApiVersion: args.routeState.resolvedApiVersion,
      apiReleaseSet: args.activeSnapshot.apiReleaseSet,
      schemaVersion: args.activeSnapshot.schemaVersion,
      rulesetVersion: args.activeSnapshot.rulesetVersion,
      profile: args.routeState.profile,
    }),
    profile: args.routeState.profile,
    apiCatalogRevision: args.activeSnapshot.apiCatalogRevision,
    catalogPublishedAt: args.activeSnapshot.catalogPublishedAt,
    cohort: args.activeSnapshot.cohortKey,
    domain: args.activeSnapshot.domainCode,
    locales: resolveApiMetaLocales(args.routeState.localeSelection),
    ...(args.filters ? { filters: args.filters } : {}),
    ...(args.page ? { page: args.page } : {}),
    ...(args.search ? { search: args.search } : {}),
  }
}

function buildAddressPermalink(args: {
  url: URL
  routeState: AddressRouteState
  activeSnapshot: ActiveAddressSnapshot
  limit?: number
  offset?: number
}) {
  const permalink = new URL(args.url)
  permalink.pathname = permalink.pathname.replace(
    /^\/addresses\/v0(?:\.\d+)?/,
    `/addresses/${args.routeState.resolvedApiVersion.replace(/^api-addresses-/, '')}`,
  )
  permalink.searchParams.delete('effectiveAt')
  permalink.searchParams.set('catalogRevision', args.activeSnapshot.apiCatalogRevision)
  permalink.searchParams.set('knownAt', args.activeSnapshot.catalogPublishedAt)
  permalink.searchParams.set('releaseSet', args.activeSnapshot.apiReleaseSet)
  permalink.searchParams.set('cohort', args.activeSnapshot.cohortKey)
  permalink.searchParams.set('domain', args.activeSnapshot.domainCode)
  permalink.searchParams.set('profile', args.routeState.profile)
  permalink.searchParams.set(
    'locales',
    args.routeState.localeSelection.mode === 'all'
      ? '*'
      : args.routeState.localeSelection.locales.join(','),
  )
  if (args.limit !== undefined)
    permalink.searchParams.set('page[limit]', String(args.limit))
  if (args.offset !== undefined)
    permalink.searchParams.set('page[offset]', String(args.offset))
  permalink.searchParams.sort()
  return permalink.toString()
}

async function getActiveAddressSnapshot(
  metaDb: AppEnv['Variables']['metaDb'],
  selectors: Pick<
    AddressListQuery,
    | 'catalogRevision'
    | 'cohort'
    | 'effectiveAt'
    | 'knownAt'
    | 'releaseSet'
    | 'filter[dataset]'
  >,
): Promise<ActiveAddressSnapshot | null> {
  const selection = await runWithD1ReadRetry(() =>
    resolveApiReleaseSetSnapshotsForRequest(metaDb as never, 'address', {
      catalogRevision: selectors.catalogRevision,
      cohortKey: selectors.cohort,
      domainCode: 'saanseoi',
      effectiveAt: selectors.effectiveAt,
      knownAt: selectors.knownAt,
      regionCode: 'hk',
      releaseSet: selectors.releaseSet,
    }),
  )
  if (!selection) return null

  const primarySnapshot = selection.snapshots.find(
    snapshot =>
      snapshot.snapshotResourceType === 'address' && snapshot.role === 'primary',
  )
  const divisionSnapshot = selection.snapshots.find(
    snapshot =>
      snapshot.snapshotResourceType === 'division' && snapshot.variant === 'overture',
  )
  if (!primarySnapshot || !divisionSnapshot) return null

  const addressSnapshotIds = [
    ...new Set(
      selection.snapshots
        .filter(snapshot => snapshot.snapshotResourceType === 'address')
        .map(snapshot => snapshot.snapshotId),
    ),
  ]
  const sources = await runWithD1ReadRetry(() =>
    listSnapshotSourceReleases(metaDb as never, addressSnapshotIds),
  )
  const datasetBySnapshot = new Map<string, string>()
  for (const source of sources) {
    const dataset = datasetBySnapshot.get(source.snapshotId)
    if (dataset && dataset !== source.datasetCode) return null
    datasetBySnapshot.set(source.snapshotId, source.datasetCode)
  }
  if (addressSnapshotIds.some(id => !datasetBySnapshot.has(id))) return null
  const dataset = selectors['filter[dataset]']

  return {
    snapshotIds: dataset
      ? addressSnapshotIds.filter(id => datasetBySnapshot.get(id) === dataset)
      : addressSnapshotIds,
    datasetBySnapshot,
    divisionSnapshotId: divisionSnapshot.snapshotId,
    apiReleaseSet: selection.releaseSet.code,
    apiCatalogRevision: selection.releaseSet.apiCatalogRevision,
    catalogPublishedAt: selection.releaseSet.catalogPublishedAt,
    cohortKey: selection.releaseSet.cohortKey,
    domainCode: selection.releaseSet.domainCode,
    schemaVersion: selection.releaseSet.schemaVersion,
    rulesetVersion: selection.releaseSet.rulesetVersion,
  }
}

export async function listAddresses(args: {
  currentDb: AppEnv['Variables']['currentDb']
  historyDbsByBinding?: AppEnv['Variables']['historyDbsByBinding']
  metaDb: AppEnv['Variables']['metaDb']
  requestUrl: string
  requestedVersionPath: RequestedAddressVersion
  requestedApiVersion: RequestedAddressApiVersion
  resolvedApiVersion: ResolvedAddressApiVersion
  query: AddressListQuery
  onResolved?: (attribution: AccessAttribution) => void
}): Promise<AddressListResult> {
  const routeState = buildAddressRouteState(args)
  const activeSnapshot = await getActiveAddressSnapshot(args.metaDb, args.query)
  if (!activeSnapshot) {
    return { status: 503, body: buildSnapshotNotReadyResponse('address') }
  }
  if (args.onResolved) {
    const accessAttribution = await resolveOptionalApiReleaseSetAccessAttribution(() =>
      resolveApiReleaseSetAccessAttribution(
        args.metaDb.$client,
        activeSnapshot.apiReleaseSet,
      ),
    )
    if (accessAttribution) args.onResolved(accessAttribution)
  }

  const limit = args.query['page[limit]'] ?? 25
  const offset = args.query['page[offset]'] ?? 0
  const filters = {
    ...(args.query['filter[dataset]']
      ? { dataset: args.query['filter[dataset]'] }
      : {}),
    ...(args.query['filter[country]']
      ? { country: args.query['filter[country]'] }
      : {}),
    ...(args.query['filter[area]'] ? { area: args.query['filter[area]'] } : {}),
    ...(args.query['filter[district]']
      ? { district: args.query['filter[district]'] }
      : {}),
  }
  const selectedRecords = await runWithD1ReadRetry(() =>
    loadSelectedAddressRecords({
      activeSnapshot,
      currentDb: args.currentDb,
      filters,
      historyDbsByBinding: args.historyDbsByBinding,
      localeSelection: routeState.localeSelection,
      metaDb: args.metaDb,
    }),
  )
  const total = selectedRecords.length
  const records = selectedRecords.slice(offset, offset + limit)

  const url = new URL(args.requestUrl)
  const included = await runWithD1ReadRetry(() =>
    loadIncludedAddressHierarchy({
      currentDb: args.currentDb,
      records,
      snapshotId: activeSnapshot.divisionSnapshotId,
      routeState,
      include: args.query.include,
      baseUrl: url.origin,
    }),
  )
  const body = buildJsonApiListDocument({
    url,
    data: records.map(record =>
      createAddressResource({
        baseUrl: url.origin,
        routeState,
        record,
        activeSnapshot,
      }),
    ),
    limit,
    offset,
    total,
    included: included.length > 0 ? included : undefined,
    meta: buildMetadata({
      routeState,
      activeSnapshot,
      filters,
      page: { limit, offset, total },
    }),
    permalink: buildAddressPermalink({
      url,
      routeState,
      activeSnapshot,
      limit,
      offset,
    }),
  })

  return { status: 200, body }
}

export async function searchAddresses(args: {
  currentDb: AppEnv['Variables']['currentDb']
  metaDb: AppEnv['Variables']['metaDb']
  requestUrl: string
  requestedVersionPath: RequestedAddressVersion
  requestedApiVersion: RequestedAddressApiVersion
  resolvedApiVersion: ResolvedAddressApiVersion
  query: AddressSearchQuery
  onResolved?: (attribution: AccessAttribution) => void
}): Promise<AddressSearchResult> {
  const routeState = buildAddressRouteState(args)
  const activeSnapshot = await getActiveAddressSnapshot(args.metaDb, args.query)
  if (!activeSnapshot) {
    return { status: 503, body: buildSnapshotNotReadyResponse('address') }
  }
  if (args.onResolved) {
    const accessAttribution = await resolveOptionalApiReleaseSetAccessAttribution(() =>
      resolveApiReleaseSetAccessAttribution(
        args.metaDb.$client,
        activeSnapshot.apiReleaseSet,
      ),
    )
    if (accessAttribution) args.onResolved(accessAttribution)
  }

  const limit = args.query['page[limit]'] ?? 25
  const offset = args.query['page[offset]'] ?? 0
  const filters = {
    ...(args.query['filter[dataset]']
      ? { dataset: args.query['filter[dataset]'] }
      : {}),
    ...(args.query['filter[country]']
      ? { country: args.query['filter[country]'] }
      : {}),
    ...(args.query['filter[area]'] ? { area: args.query['filter[area]'] } : {}),
    ...(args.query['filter[district]']
      ? { district: args.query['filter[district]'] }
      : {}),
  }

  let search: { addressIds: string[]; total: number }
  try {
    search = await runWithD1ReadRetry(() =>
      searchAddressIdsCurrent(args.currentDb, {
        snapshotIds: activeSnapshot.snapshotIds,
        countryId: filters.country,
        areaId: filters.area,
        districtId: filters.district,
        component: args.query.component,
        limit,
        mode: args.query.match,
        offset,
        query: args.query.q,
      }),
    )
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes('FTS index is not initialised')
    ) {
      return {
        status: 503,
        body: {
          httpStatus: 503,
          error: 'fts_not_ready',
          message:
            'FTS index is not initialised. Rebuild addressesFts before using search.',
        },
      }
    }
    throw error
  }

  const records = await runWithD1ReadRetry(() =>
    listAddressRecordsCurrentByIds(args.currentDb, {
      snapshotIds: activeSnapshot.snapshotIds,
      addressIds: search.addressIds,
      countryId: filters.country,
      areaId: filters.area,
      districtId: filters.district,
      localeSelection: routeState.localeSelection,
    }),
  )
  const url = new URL(args.requestUrl)
  const included = await runWithD1ReadRetry(() =>
    loadIncludedAddressHierarchy({
      currentDb: args.currentDb,
      records,
      snapshotId: activeSnapshot.divisionSnapshotId,
      routeState,
      include: args.query.include,
      baseUrl: url.origin,
    }),
  )
  const body = buildJsonApiListDocument({
    url,
    data: records.map(record =>
      createAddressResource({
        baseUrl: url.origin,
        routeState,
        record,
        activeSnapshot,
      }),
    ),
    limit,
    offset,
    total: search.total,
    included: included.length > 0 ? included : undefined,
    meta: buildMetadata({
      routeState,
      activeSnapshot,
      filters,
      page: { limit, offset, total: search.total },
      search: {
        ...(args.query.component ? { component: args.query.component } : {}),
        mode: args.query.match,
        query: args.query.q,
      },
    }),
    permalink: buildAddressPermalink({
      url,
      routeState,
      activeSnapshot,
      limit,
      offset,
    }),
  })
  return { status: 200, body }
}

export async function getAddressDetail(args: {
  currentDb: AppEnv['Variables']['currentDb']
  historyDbsByBinding?: AppEnv['Variables']['historyDbsByBinding']
  metaDb: AppEnv['Variables']['metaDb']
  requestUrl: string
  requestedVersionPath: RequestedAddressVersion
  requestedApiVersion: RequestedAddressApiVersion
  resolvedApiVersion: ResolvedAddressApiVersion
  id: string
  query: AddressDetailQuery
  onResolved?: (attribution: AccessAttribution) => void
}): Promise<AddressDetailResult> {
  const routeState = buildAddressRouteState(args)
  const activeSnapshot = await getActiveAddressSnapshot(args.metaDb, args.query)
  if (!activeSnapshot) {
    return { status: 503, body: buildSnapshotNotReadyResponse('address') }
  }
  if (args.onResolved) {
    const accessAttribution = await resolveOptionalApiReleaseSetAccessAttribution(() =>
      resolveApiReleaseSetAccessAttribution(
        args.metaDb.$client,
        activeSnapshot.apiReleaseSet,
      ),
    )
    if (accessAttribution) args.onResolved(accessAttribution)
  }

  const record = (
    await runWithD1ReadRetry(() =>
      loadSelectedAddressRecords({
        activeSnapshot,
        currentDb: args.currentDb,
        filters: {},
        historyDbsByBinding: args.historyDbsByBinding,
        localeSelection: routeState.localeSelection,
        metaDb: args.metaDb,
      }),
    )
  ).find(candidate => candidate.address.id === args.id)
  if (!record) {
    return {
      status: 404,
      body: {
        httpStatus: 404,
        error: 'not_found',
        message: `No address found for ${args.id}.`,
      },
    }
  }

  const url = new URL(args.requestUrl)
  const included = await runWithD1ReadRetry(() =>
    loadIncludedAddressHierarchy({
      currentDb: args.currentDb,
      records: [record],
      snapshotId: activeSnapshot.divisionSnapshotId,
      routeState,
      include: args.query.include,
      baseUrl: url.origin,
    }),
  )
  const body = buildJsonApiDetailDocument({
    url,
    data: createAddressResource({
      baseUrl: url.origin,
      routeState,
      record,
      activeSnapshot,
    }),
    meta: buildMetadata({ routeState, activeSnapshot }),
    included: included.length > 0 ? included : undefined,
    permalink: buildAddressPermalink({ url, routeState, activeSnapshot }),
  })
  return { status: 200, body }
}
