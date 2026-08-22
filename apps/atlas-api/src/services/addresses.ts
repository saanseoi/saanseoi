import {
  defaultApiLocalesByProfile,
  parseRequestedApiLocales,
  type ApiProfileName,
  type RequestedApiLocaleSelection,
} from '@repo/core/apiLocales'
import { resolveApiReleaseSetSnapshotsForRequest } from '@repo/core/db/metaRegistry'

import {
  countAddressRecordsCurrent,
  getAddressRecordCurrent,
  listAddressRecordsCurrent,
  type AddressLocaleValue,
  type AddressRecord,
} from '../db/addresses'
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

export type RequestedAddressVersion = 'v0' | 'v0.1'
export type RequestedAddressApiVersion = '0.1'
export type ResolvedAddressApiVersion = 'api-addresses-v0.1'
export type AddressProfile = ApiProfileName

type JsonObject = Record<string, unknown>

type AddressResourcePayload = {
  type: 'addresses'
  id: string
  attributes: {
    snapshotId?: string
    geometry?: JsonObject | null
    bbox?: [number, number, number, number] | null
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
  page?: { limit: number; offset: number; total: number }
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

  const divisionIds = [
    ...new Set(args.records.flatMap(record => addressHierarchyIds(record.address))),
  ]
  const records = await listDivisionRecordsCurrentByIds(args.currentDb, {
    snapshotId: args.snapshotId,
    divisionIds,
    localeSelection: args.routeState.localeSelection,
  })
  return records.map(record =>
    createIncludedDivisionResource({
      baseUrl: args.baseUrl,
      requestedVersionPath: args.routeState.requestedVersionPath,
      profile: args.routeState.profile,
      localeSelection: args.routeState.localeSelection,
      record,
    }),
  )
}

type ActiveAddressSnapshot = {
  snapshotId: string
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
  'filter[area]'?: string
  'filter[district]'?: string
  include?: 'hierarchy'
}

export type AddressDetailQuery = Omit<
  AddressListQuery,
  | 'page[limit]'
  | 'page[offset]'
  | 'filter[country]'
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

function parseAddressProfile(value?: string): AddressProfile {
  if (value === 'compact' || value === 'full' || value === 'map') return value
  return 'default'
}

function buildAddressRouteState(args: {
  requestedVersionPath: RequestedAddressVersion
  requestedApiVersion: RequestedAddressApiVersion
  resolvedApiVersion: ResolvedAddressApiVersion
  profile?: string
  locales?: string
}) {
  const profile = parseAddressProfile(args.profile)
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
    localeSelection: parseRequestedApiLocales(args.locales, defaults),
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
}): AddressResourcePayload {
  const { address } = args.record
  const attributes: AddressResourcePayload['attributes'] = {}

  if (args.routeState.profile !== 'compact') {
    attributes.createdAt = address.createdAt
    attributes.updatedAt = address.updatedAt
  }

  if (isMapAddressProfile(args.routeState.profile)) {
    attributes.geometry = (address.geometry as JsonObject | null) ?? null
    attributes.bbox = (address.bbox as [number, number, number, number] | null) ?? null
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
      self: `${args.baseUrl}/${args.routeState.requestedVersionPath}/addresses/${address.id}`,
    },
  }
}

function buildMetadata(args: {
  routeState: AddressRouteState
  activeSnapshot: ActiveAddressSnapshot
  filters?: AddressFilters
  page?: { limit: number; offset: number; total: number }
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
    /^\/v0(?:\.1)?\//,
    `/${args.routeState.resolvedApiVersion.replace(/^api-addresses-/, '')}/`,
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
    'catalogRevision' | 'cohort' | 'effectiveAt' | 'knownAt' | 'releaseSet'
  >,
): Promise<ActiveAddressSnapshot | null> {
  const selection = await runWithD1ReadRetry(() =>
    resolveApiReleaseSetSnapshotsForRequest(metaDb as never, 'address', {
      catalogRevision: selectors.catalogRevision,
      cohortKey: selectors.cohort,
      domainCode: 'official',
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

  return {
    snapshotId: primarySnapshot.snapshotId,
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
    ...(args.query['filter[country]']
      ? { country: args.query['filter[country]'] }
      : {}),
    ...(args.query['filter[area]'] ? { area: args.query['filter[area]'] } : {}),
    ...(args.query['filter[district]']
      ? { district: args.query['filter[district]'] }
      : {}),
  }
  const lookup = {
    snapshotId: activeSnapshot.snapshotId,
    limit,
    offset,
    countryId: filters.country,
    areaId: filters.area,
    districtId: filters.district,
    localeSelection: routeState.localeSelection,
  }
  const [records, total] = await runWithD1ReadRetry(() =>
    Promise.all([
      listAddressRecordsCurrent(args.currentDb, lookup),
      countAddressRecordsCurrent(args.currentDb, {
        snapshotId: activeSnapshot.snapshotId,
        countryId: filters.country,
        areaId: filters.area,
        districtId: filters.district,
      }),
    ]),
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
      createAddressResource({ baseUrl: url.origin, routeState, record }),
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

export async function getAddressDetail(args: {
  currentDb: AppEnv['Variables']['currentDb']
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

  const record = await runWithD1ReadRetry(() =>
    getAddressRecordCurrent(args.currentDb, {
      snapshotId: activeSnapshot.snapshotId,
      addressId: args.id,
      localeSelection: routeState.localeSelection,
    }),
  )
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
    data: createAddressResource({ baseUrl: url.origin, routeState, record }),
    meta: buildMetadata({ routeState, activeSnapshot }),
    included: included.length > 0 ? included : undefined,
    permalink: buildAddressPermalink({ url, routeState, activeSnapshot }),
  })
  return { status: 200, body }
}
