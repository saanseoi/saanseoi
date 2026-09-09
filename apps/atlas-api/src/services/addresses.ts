import { resolveDataRegion, type ApiRegion } from '../schema/region'
import {
  defaultApiLocalesByProfile,
  parseRequestedApiLocales,
  type ApiProfileName,
  type RequestedApiLocaleSelection,
} from '@repo/core/apiLocales'
import {
  listSnapshotSourceReleases,
  resolveApiReleaseSetSnapshotsForRequest,
  resolveSnapshotReplayPlan,
} from '@repo/core/db/metaRegistry'
import { resolveSnapshotVersionState } from '@repo/core/pipeline/db/snapshotReplay.ts'
import type { BBox } from '@repo/core/pipeline/geojson.ts'

import {
  listAddressRecordsCurrent,
  countAddressRecordsCurrent,
  hasCurrentAddressSnapshot,
  listAddressRecordsCurrentByIds,
  searchAddressIdsCurrent,
  type AddressSearchComponent,
  type AddressSearchMode,
  type AddressLocaleValue,
  type AddressRecord,
} from '../db/addresses'
import {
  listReplayedAddressRecords,
  listReplayedAddressPage,
} from '../db/addressesHistory'
import { attachAddress3dCoverage, getAddress3dCollection } from '../db/address3d'
import type {
  Address3dCoverage,
  Address3dUnit,
  Address3dUnitI18n,
} from '@repo/db/address3d'
import {
  hasCurrentDivisionSnapshot,
  listDivisionRecordsCurrentByIds,
} from '../db/divisions'
import { listReplayedDivisionRecords } from '../db/divisions'
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

export async function getAddressUnits(args: Parameters<typeof getAddressDetail>[0]) {
  const result = await getAddressDetail({
    ...args,
    query: { ...args.query, include: undefined, profile: 'full' },
  })
  if (result.status !== 200) return result
  const attributes = result.body.data.attributes
  const coverage = attributes.address3dCoverage
  if (coverage.kind === 'none')
    return {
      status: 200 as const,
      body: { data: null, meta: { address3dCoverage: coverage } },
    }
  if (!attributes.snapshotId) throw new Error('Missing selected Address3D snapshot')
  const record = await getAddress3dCollection({
    ...args,
    snapshotId: attributes.snapshotId,
    collectionId: coverage.address3dId,
  })
  if (!record) throw new Error('Address3D coverage points to an absent collection')
  return {
    status: 200 as const,
    body: {
      data: createAddress3dResource({
        record,
        selectedLocales: Object.keys(attributes.i18n ?? {}),
      }),
      meta: { address3dCoverage: coverage },
    },
  }
}
export type RequestedAddressApiVersion = '0.1'
export type ResolvedAddressApiVersion = 'api-addresses-v0.1'
export type AddressProfile = ApiProfileName

type JsonObject = Record<string, unknown>
type AddressPointGeometry = {
  type: 'Point'
  coordinates: number[]
}

type Address3dResourcePayload = {
  type: 'address3d'
  id: string
  attributes: {
    snapshotId: string
    address2dId: string
    unitCount: number
    units: Address3dUnit[]
    i18n: Record<string, Record<string, Address3dUnitI18n>>
  }
}

type AddressResourcePayload = {
  type: 'addresses'
  id: string
  attributes: {
    datasetCode: string
    parentAddressId: string | null
    granularity: AddressRecord['address']['granularity']
    address3dCoverage: Address3dCoverage
    snapshotId?: string
    geometry?: AddressPointGeometry | null
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
    units: {
      data: { type: 'address3d'; id: string } | null
      meta: { address3dCoverage: Address3dCoverage }
    }
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
  historyDbsByBinding?: AppEnv['Variables']['historyDbsByBinding']
  metaDb: AppEnv['Variables']['metaDb']
  records: AddressRecord[]
  snapshotId: string
  routeState: AddressRouteState
  include?: string
  baseUrl: string
}) {
  if (!requestedAddressIncludes(args.include).has('hierarchy')) return []

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
    if (
      args.historyDbsByBinding &&
      !(await hasCurrentDivisionSnapshot(args.currentDb, snapshotId))
    ) {
      const plan = await resolveSnapshotReplayPlan(args.metaDb as never, snapshotId)
      const shards = new Map(
        Object.entries(args.historyDbsByBinding).map(([bindingName, db]) => [
          bindingName,
          { bindingName, db },
        ]),
      )
      const versions = await resolveSnapshotVersionState(
        plan,
        shards as never,
        ['division', 'divisionI18n'],
        [...divisionIds],
      )
      const records = await listReplayedDivisionRecords(
        versions.values() as never,
        snapshotId,
        args.routeState.localeSelection,
      )
      for (const record of records)
        if (divisionIds.has(record.division.id))
          recordsById.set(record.division.id, record)
    } else {
      const records = await listDivisionRecordsCurrentByIds(args.currentDb, {
        snapshotId,
        divisionIds: [...divisionIds],
        localeSelection: args.routeState.localeSelection,
      })
      for (const record of records) recordsById.set(record.division.id, record)
    }
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

function requestedAddressIncludes(value?: string) {
  return new Set(
    (value ?? '')
      .split(',')
      .map(item => item.trim())
      .filter(Boolean),
  )
}

function createAddress3dResource(args: {
  record: NonNullable<Awaited<ReturnType<typeof getAddress3dCollection>>>
  selectedLocales: string[]
}): Address3dResourcePayload {
  const selectedLocales = new Set(args.selectedLocales)
  return {
    type: 'address3d',
    id: args.record.collection.id,
    attributes: {
      snapshotId: args.record.collection.snapshotId,
      address2dId: args.record.collection.address2dId,
      unitCount: args.record.collection.unitCount,
      units: args.record.collection.units,
      i18n: Object.fromEntries(
        args.record.i18n
          .filter(row => selectedLocales.has(row.locale))
          .map(row => [row.locale, row.units]),
      ),
    },
  }
}

async function loadIncludedAddressUnits(args: {
  currentDb: AppEnv['Variables']['currentDb']
  historyDbsByBinding?: AppEnv['Variables']['historyDbsByBinding']
  metaDb: AppEnv['Variables']['metaDb']
  record: AddressRecord
  routeState: AddressRouteState
  include?: string
}) {
  if (!requestedAddressIncludes(args.include).has('units')) return []
  const coverage = args.record.address3dCoverage ?? { kind: 'none' as const }
  if (coverage.kind === 'none') return []
  const record = await getAddress3dCollection({
    currentDb: args.currentDb,
    historyDbsByBinding: args.historyDbsByBinding,
    metaDb: args.metaDb,
    snapshotId: args.record.address.snapshotId,
    collectionId: coverage.address3dId,
  })
  if (!record) throw new Error(`Missing Address3D collection ${coverage.address3dId}.`)
  return [
    createAddress3dResource({
      record,
      selectedLocales:
        args.routeState.localeSelection.mode === 'all'
          ? record.i18n.map(row => row.locale)
          : args.routeState.localeSelection.locales,
    }),
  ]
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
  region?: ApiRegion
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
  | 'include'
> & {
  include?: 'hierarchy' | 'units' | 'hierarchy,units' | 'units,hierarchy'
}

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

async function canReadCurrentAddresses(args: {
  activeSnapshot: ActiveAddressSnapshot
  currentDb: AppEnv['Variables']['currentDb']
  historyDbsByBinding?: AppEnv['Variables']['historyDbsByBinding']
}) {
  if (!args.historyDbsByBinding) return true
  return (
    await Promise.all(
      args.activeSnapshot.snapshotIds.map(id =>
        hasCurrentAddressSnapshot(args.currentDb, id),
      ),
    )
  ).every(Boolean)
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
    profile !== 'compact'
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

function addressPointGeometry(value: unknown): AddressPointGeometry | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const { type, coordinates } = value as JsonObject
  if (
    type !== 'Point' ||
    !Array.isArray(coordinates) ||
    coordinates.length < 2 ||
    coordinates.length > 3 ||
    !coordinates.every(
      coordinate => typeof coordinate === 'number' && Number.isFinite(coordinate),
    )
  )
    return null
  return { type, coordinates }
}

function createAddressResource(args: {
  baseUrl: string
  routeState: AddressRouteState
  record: AddressRecord
  activeSnapshot: ActiveAddressSnapshot
}): AddressResourcePayload {
  const { address } = args.record
  const datasetCode = args.activeSnapshot.datasetBySnapshot.get(address.snapshotId)
  if (!datasetCode)
    throw new Error(`Missing dataset for address snapshot ${address.snapshotId}.`)
  const attributes: AddressResourcePayload['attributes'] = {
    datasetCode,
    parentAddressId: address.parentAddressId,
    granularity: address.granularity,
    address3dCoverage: args.record.address3dCoverage ?? { kind: 'none' },
  }

  if (args.routeState.profile !== 'compact') {
    attributes.createdAt = address.createdAt
    attributes.updatedAt = address.updatedAt
  }

  if (isMapAddressProfile(args.routeState.profile)) {
    attributes.geometry = addressPointGeometry(address.geometry)
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
      units: {
        data:
          args.record.address3dCoverage?.kind === 'none' ||
          !args.record.address3dCoverage
            ? null
            : {
                type: 'address3d' as const,
                id: args.record.address3dCoverage.address3dId,
              },
        meta: {
          address3dCoverage: args.record.address3dCoverage ?? { kind: 'none' },
        },
      },
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
    | 'region'
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
      regionCode: resolveDataRegion(selectors.region),
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
  const useCurrent = await runWithD1ReadRetry(() =>
    canReadCurrentAddresses({ ...args, activeSnapshot }),
  )
  const lookup = {
    snapshotIds: activeSnapshot.snapshotIds,
    countryId: filters.country,
    areaId: filters.area,
    districtId: filters.district,
    localeSelection: routeState.localeSelection,
    limit,
    offset,
  }
  const { records, total, hasMore } = await runWithD1ReadRetry(
    async (): Promise<{
      records: AddressRecord[]
      total?: number
      hasMore?: boolean
    }> => {
      if (useCurrent) {
        const [records, total] = await Promise.all([
          listAddressRecordsCurrent(args.currentDb, lookup),
          countAddressRecordsCurrent(args.currentDb, lookup),
        ])
        return { records, total }
      }
      return listReplayedAddressPage({
        ...lookup,
        divisionSnapshotId: activeSnapshot.divisionSnapshotId,
        historyDbsByBinding: args.historyDbsByBinding!,
        metaDb: args.metaDb,
      })
    },
  )
  await attachAddress3dCoverage({
    ...args,
    historyDbsByBinding: useCurrent ? undefined : args.historyDbsByBinding,
    records,
  })

  const url = new URL(args.requestUrl)
  const included = await runWithD1ReadRetry(async () => [
    ...(await loadIncludedAddressHierarchy({
      currentDb: args.currentDb,
      historyDbsByBinding: args.historyDbsByBinding,
      metaDb: args.metaDb,
      records,
      snapshotId: activeSnapshot.divisionSnapshotId,
      routeState,
      include: args.query.include,
      baseUrl: url.origin,
    })),
  ])
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
    hasMore,
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
  historyDbsByBinding?: AppEnv['Variables']['historyDbsByBinding']
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

  let records: AddressRecord[]
  let total: number | undefined
  let hasMore: boolean | undefined
  const historyDbsByBinding = args.historyDbsByBinding
  const useCurrent = await runWithD1ReadRetry(() =>
    canReadCurrentAddresses({ ...args, activeSnapshot }),
  )
  if (historyDbsByBinding && !useCurrent) {
    const selected = await runWithD1ReadRetry(() =>
      listReplayedAddressPage({
        divisionSnapshotId: activeSnapshot.divisionSnapshotId,
        historyDbsByBinding,
        localeSelection: routeState.localeSelection,
        metaDb: args.metaDb,
        snapshotIds: activeSnapshot.snapshotIds,
        limit,
        offset,
        countryId: filters.country,
        areaId: filters.area,
        districtId: filters.district,
        search: {
          component: args.query.component,
          mode: args.query.match,
          query: args.query.q,
        },
      }),
    )
    records = selected.records
    hasMore = selected.hasMore
  } else {
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
    records = await runWithD1ReadRetry(() =>
      listAddressRecordsCurrentByIds(args.currentDb, {
        snapshotIds: activeSnapshot.snapshotIds,
        addressIds: search.addressIds,
        countryId: filters.country,
        areaId: filters.area,
        districtId: filters.district,
        localeSelection: routeState.localeSelection,
      }),
    )
    total = search.total
  }
  await attachAddress3dCoverage({
    ...args,
    historyDbsByBinding: useCurrent ? undefined : args.historyDbsByBinding,
    records,
  })
  const url = new URL(args.requestUrl)
  const included = await runWithD1ReadRetry(async () => [
    ...(await loadIncludedAddressHierarchy({
      currentDb: args.currentDb,
      historyDbsByBinding: args.historyDbsByBinding,
      metaDb: args.metaDb,
      records,
      snapshotId: activeSnapshot.divisionSnapshotId,
      routeState,
      include: args.query.include,
      baseUrl: url.origin,
    })),
  ])
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
    hasMore,
    meta: buildMetadata({
      routeState,
      activeSnapshot,
      filters,
      page: { limit, offset, total },
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

  const useCurrent = await runWithD1ReadRetry(() =>
    canReadCurrentAddresses({ ...args, activeSnapshot }),
  )
  const record = (
    await runWithD1ReadRetry(() =>
      useCurrent
        ? listAddressRecordsCurrentByIds(args.currentDb, {
            snapshotIds: activeSnapshot.snapshotIds,
            addressIds: [args.id],
            localeSelection: routeState.localeSelection,
          })
        : listReplayedAddressRecords({
            snapshotIds: activeSnapshot.snapshotIds,
            divisionSnapshotId: activeSnapshot.divisionSnapshotId,
            historyDbsByBinding: args.historyDbsByBinding!,
            localeSelection: routeState.localeSelection,
            metaDb: args.metaDb,
            recordIds: [args.id],
          }),
    )
  )[0]
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

  await attachAddress3dCoverage({
    ...args,
    historyDbsByBinding: useCurrent ? undefined : args.historyDbsByBinding,
    records: [record],
  })

  const url = new URL(args.requestUrl)
  const included = await runWithD1ReadRetry(async () => [
    ...(await loadIncludedAddressHierarchy({
      currentDb: args.currentDb,
      historyDbsByBinding: args.historyDbsByBinding,
      metaDb: args.metaDb,
      records: [record],
      snapshotId: activeSnapshot.divisionSnapshotId,
      routeState,
      include: args.query.include,
      baseUrl: url.origin,
    })),
    ...(await loadIncludedAddressUnits({
      currentDb: args.currentDb,
      historyDbsByBinding: useCurrent ? undefined : args.historyDbsByBinding,
      metaDb: args.metaDb,
      record,
      routeState,
      include: args.query.include,
    })),
  ])
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
