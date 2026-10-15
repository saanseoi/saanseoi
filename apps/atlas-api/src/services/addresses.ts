import {
  canonicalIdentifiers,
  type CanonicalIdentifiers,
} from '@repo/core/pipeline/services/sources/canonicalIdentifiers.ts'
import { matchesAddressGeographicMembership } from '../lib/geographicFilterContext'
import {
  getPublicationReadiness,
  guardPublicationRead,
  hasHistoricalSelectors,
  PublicationReadUnavailableError,
} from '../db/publicationState'
import { resolveDataRegion, type ApiRegion } from '../schema/region'
import {
  defaultApiLocalesByProfile,
  parseRequestedApiLocales,
  type ApiProfileName,
  type RequestedApiLocaleSelection,
} from '@repo/core/apiLocales'
import {
  listSnapshotResourceReleases,
  resolveApiReleaseSetSnapshotsForRequest,
  resolveSnapshotReplayPlan,
} from '@repo/core/db/metaRegistry'
import { resolveSnapshotVersionState } from '@repo/core/pipeline/db/snapshotReplay.ts'

import {
  listAddressRecordsCurrent,
  countAddressRecordsCurrent,
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
import { listDivisionRecordsCurrentByIds } from '../db/divisions'
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
    query: { ...args.query, include: 'units', profile: 'full' },
  })
  if (result.status !== 200) return result
  const coverage = result.body.data.attributes.address3dCoverage
  const data =
    result.body.included?.find((item): item is Address3dResourcePayload =>
      Boolean(
        item && typeof item === 'object' && 'type' in item && item.type === 'address3d',
      ),
    ) ?? null
  if (coverage.kind !== 'none' && !data)
    throw new Error('Address3D coverage points to an absent collection')
  return { status: 200 as const, body: { data, meta: { address3dCoverage: coverage } } }
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
    sources?: unknown
    units: Address3dUnit[]
    i18n: Record<
      string,
      { meta: import('@repo/db').I18nMeta; units: Record<string, Address3dUnitI18n> }
    >
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
    createdAt?: string

    identifiers?: CanonicalIdentifiers | null
    sources?: unknown
    i18n?: Record<string, AddressLocaleValue>
  }
  relationships: {
    divisions: {
      data: Array<{
        type: 'divisions'
        id: string
        meta: { role: string }
      }>
    }
    hierarchy: { data: Array<{ type: 'divisions'; id: string }> }
    units: {
      data: { type: 'address3d'; id: string } | null
      meta: { address3dCoverage: Address3dCoverage }
    }
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
  division?: string
  area?: string
  district?: string
  town?: string
  rural_area?: string
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

async function loadIncludedAddressDivisions(args: {
  currentDb: AppEnv['Variables']['currentDb']
  historyDbsByBinding?: AppEnv['Variables']['historyDbsByBinding']
  metaDb: AppEnv['Variables']['metaDb']
  records: AddressRecord[]
  snapshotId: string
  routeState: AddressRouteState
  include?: string
  baseUrl: string
}) {
  const includes = requestedAddressIncludes(args.include)
  const includeDivisions = includes.has('divisions')
  const includeHierarchy = includes.has('hierarchy')
  if (!includeDivisions && !includeHierarchy) return []

  const idsBySnapshot = new Map<string, Set<string>>()
  for (const record of args.records) {
    const snapshotId = record.address.divisionSnapshotId ?? args.snapshotId
    const ids = idsBySnapshot.get(snapshotId) ?? new Set<string>()
    if (includeDivisions) {
      for (const { divisionId } of record.address.divisionRelationships)
        ids.add(divisionId)
    }
    if (includeHierarchy) {
      for (const id of addressHierarchyIds(record.address)) ids.add(id)
    }
    idsBySnapshot.set(snapshotId, ids)
  }
  const recordsById = new Map<
    string,
    Awaited<ReturnType<typeof listDivisionRecordsCurrentByIds>>[number]
  >()
  for (const [snapshotId, divisionIds] of idsBySnapshot) {
    const token = await getPublicationReadiness(args.currentDb, 'division', [
      snapshotId,
    ])
    const currentRecords =
      token === null
        ? null
        : await guardPublicationRead(
            args.currentDb,
            'division',
            [snapshotId],
            token,
            () =>
              listDivisionRecordsCurrentByIds(args.currentDb, {
                snapshotId,
                divisionIds: [...divisionIds],
                localeSelection: args.routeState.localeSelection,
              }),
          )
    if (currentRecords === null && args.historyDbsByBinding) {
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
      if (currentRecords === null)
        throw new PublicationReadUnavailableError(
          'The selected Address hierarchy or Divisions are not ready',
        )
      for (const record of currentRecords) recordsById.set(record.division.id, record)
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
  profile: AddressProfile
}): Address3dResourcePayload {
  const selectedLocales = new Set(args.selectedLocales)
  return {
    type: 'address3d',
    id: args.record.collection.id,
    attributes: {
      snapshotId: args.record.collection.snapshotId,
      address2dId: args.record.collection.address2dId,
      unitCount: args.record.collection.unitCount,
      ...(args.profile === 'full'
        ? { sources: args.record.collection.sources ?? [] }
        : {}),
      units: args.record.collection.units,
      i18n: Object.fromEntries(
        args.record.i18n
          .filter(row => selectedLocales.has(row.locale))
          .map(row => [row.locale, { meta: row.meta, units: row.units }]),
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
      profile: args.routeState.profile,
      selectedLocales:
        args.routeState.localeSelection.mode === 'all'
          ? record.i18n.map(row => row.locale)
          : args.routeState.localeSelection.locales,
    }),
  ]
}

type ActiveAddressSnapshot = {
  snapshotIds: string[]
  sourceReleaseBySnapshot?: Map<string, string>
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
  'page[after]'?: string
  'filter[country]'?: string
  'filter[dataset]'?: string
  'filter[division]'?: string
  'filter[area]'?: string
  'filter[district]'?: string
  include?: AddressCollectionInclude
}

type AddressCollectionInclude =
  | 'hierarchy'
  | 'divisions'
  | 'hierarchy,divisions'
  | 'divisions,hierarchy'

type AddressDetailInclude =
  | AddressCollectionInclude
  | 'units'
  | 'hierarchy,units'
  | 'units,hierarchy'
  | 'divisions,units'
  | 'units,divisions'
  | 'hierarchy,divisions,units'
  | 'hierarchy,units,divisions'
  | 'divisions,hierarchy,units'
  | 'divisions,units,hierarchy'
  | 'units,hierarchy,divisions'
  | 'units,divisions,hierarchy'

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
  | 'filter[division]'
  | 'filter[area]'
  | 'filter[district]'
  | 'include'
> & {
  include?: AddressDetailInclude
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
  message: 'Address search is not ready for the latest published release.'
}

async function isHistoricalAddressSelection(args: {
  activeSnapshot: ActiveAddressSnapshot
  metaDb: AppEnv['Variables']['metaDb']
  query: AddressListQuery | AddressDetailQuery
}) {
  if (!hasHistoricalSelectors(args.query)) return false
  const latest = await getActiveAddressSnapshot(args.metaDb, {
    region: args.query.region,
    'filter[dataset]':
      'filter[dataset]' in args.query ? args.query['filter[dataset]'] : undefined,
  })
  return Boolean(latest && latest.apiReleaseSet !== args.activeSnapshot.apiReleaseSet)
}

export type AddressSearchResult =
  | { status: 200; body: AddressListDocument }
  | {
      status: 400
      body: { httpStatus: 400; error: 'historical_search_unavailable'; message: string }
    }
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
          meta: value.meta,
          formattedAddress: value.formattedAddress,
        },
  ])

  return entries.length > 0 ? Object.fromEntries(entries) : undefined
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

function addressHierarchyIds(address: AddressRecord['address']) {
  return [
    address.countryId,
    address.landformId,
    address.areaId,
    address.districtId,
    address.townId,
    address.ruralAreaId,
    address.macrohoodId,
    address.neighbourhoodId,
    address.villageId,
    address.microhoodId,
    address.hamletId,
  ].filter((id): id is string => Boolean(id))
}

function publicAddressIdentifiers(value: unknown): CanonicalIdentifiers | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const { 'SS:supplementaryIdentityKey': _identityKey, ...identifiers } =
    value as Record<string, unknown>
  return canonicalIdentifiers(identifiers)
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
  }

  if (isMapAddressProfile(args.routeState.profile)) {
    attributes.geometry = addressPointGeometry(address.geometry)
  }

  if (args.routeState.profile === 'full') {
    attributes.snapshotId = address.snapshotId
    attributes.identifiers = publicAddressIdentifiers(address.identifiers)
    attributes.sources = address.sources ?? []
  }

  const i18n = projectAddressI18n(args.record.i18n, args.routeState.profile)
  if (i18n) attributes.i18n = i18n

  return {
    type: 'addresses',
    id: address.id,
    attributes,
    relationships: {
      divisions: {
        data: address.divisionRelationships.map(({ divisionId, role }) => ({
          type: 'divisions' as const,
          id: divisionId,
          meta: { role },
        })),
      },
      hierarchy: {
        data: addressHierarchyIds(address).map(id => ({
          type: 'divisions' as const,
          id,
        })),
      },
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
    listSnapshotResourceReleases(metaDb as never, addressSnapshotIds),
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
    sourceReleaseBySnapshot: new Map(
      sources.map(source => [source.snapshotId, source.sourceReleaseId]),
    ),
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
    ...(args.query['filter[division]']
      ? { division: args.query['filter[division]'] }
      : {}),
    ...(args.query['filter[area]'] ? { area: args.query['filter[area]'] } : {}),
    ...(args.query['filter[district]']
      ? { district: args.query['filter[district]'] }
      : {}),
  }
  const publicationToken = await runWithD1ReadRetry(() =>
    getPublicationReadiness(args.currentDb, 'address', activeSnapshot.snapshotIds),
  )
  const useCurrent = publicationToken !== null
  if (
    !useCurrent &&
    (!args.historyDbsByBinding ||
      !(await isHistoricalAddressSelection({ ...args, activeSnapshot })))
  )
    return { status: 503, body: buildSnapshotNotReadyResponse('address') }
  return (
    (await guardPublicationRead(
      args.currentDb,
      'address',
      activeSnapshot.snapshotIds,
      publicationToken,
      async (): Promise<AddressListResult> => {
        const lookup = {
          snapshotIds: activeSnapshot.snapshotIds,
          after: args.query['page[after]'],
          countryId: filters.country,
          divisionId: filters.division,
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
              if (lookup.after !== undefined) {
                const rows = await listAddressRecordsCurrent(args.currentDb, {
                  ...lookup,
                  limit: limit + 1,
                })
                return { records: rows.slice(0, limit), hasMore: rows.length > limit }
              }
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
          ...(await loadIncludedAddressDivisions({
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
      },
    )) ?? { status: 503, body: buildSnapshotNotReadyResponse('address') }
  )
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
  const latest = await getActiveAddressSnapshot(args.metaDb, {
    region: args.query.region,
    'filter[dataset]': args.query['filter[dataset]'],
  })
  if (!latest || latest.apiReleaseSet !== activeSnapshot.apiReleaseSet) {
    return {
      status: 400,
      body: {
        httpStatus: 400,
        error: 'historical_search_unavailable',
        message:
          'Address search supports only the latest published release. Historical addresses remain available through list and detail endpoints.',
      },
    }
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
    ...(args.query['filter[division]']
      ? { division: args.query['filter[division]'] }
      : {}),
    ...(args.query['filter[area]'] ? { area: args.query['filter[area]'] } : {}),
    ...(args.query['filter[district]']
      ? { district: args.query['filter[district]'] }
      : {}),
  }

  let records: AddressRecord[]
  let total: number | undefined
  let hasMore: boolean | undefined
  const publicationToken = await runWithD1ReadRetry(() =>
    getPublicationReadiness(args.currentDb, 'address', activeSnapshot.snapshotIds),
  )
  const useCurrent = publicationToken !== null
  if (!useCurrent)
    return { status: 503, body: buildSnapshotNotReadyResponse('address') }
  return (
    (await guardPublicationRead(
      args.currentDb,
      'address',
      activeSnapshot.snapshotIds,
      publicationToken,
      async (): Promise<AddressSearchResult> => {
        {
          let search: { addressIds: string[]; total: number }
          try {
            search = await runWithD1ReadRetry(() =>
              searchAddressIdsCurrent(args.currentDb, {
                snapshotIds: activeSnapshot.snapshotIds,
                countryId: filters.country,
                divisionId: filters.division,
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
                    'Address search is not ready for the latest published release.',
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
              divisionId: filters.division,
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
          ...(await loadIncludedAddressDivisions({
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
      },
    )) ?? { status: 503, body: buildSnapshotNotReadyResponse('address') }
  )
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

  const publicationToken = await runWithD1ReadRetry(() =>
    getPublicationReadiness(args.currentDb, 'address', activeSnapshot.snapshotIds),
  )
  const useCurrent = publicationToken !== null
  if (
    !useCurrent &&
    (!args.historyDbsByBinding ||
      !(await isHistoricalAddressSelection({ ...args, activeSnapshot })))
  )
    return { status: 503, body: buildSnapshotNotReadyResponse('address') }
  return (
    (await guardPublicationRead(
      args.currentDb,
      'address',
      activeSnapshot.snapshotIds,
      publicationToken,
      async (): Promise<AddressDetailResult> => {
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
        if (
          !record ||
          !matchesAddressGeographicMembership(record.address.divisionRelationships)
        ) {
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
          ...(await loadIncludedAddressDivisions({
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
      },
    )) ?? { status: 503, body: buildSnapshotNotReadyResponse('address') }
  )
}
