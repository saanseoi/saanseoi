import { publicDivisionHierarchies } from '@repo/core/publicDivisionHierarchies'
export { publicDivisionHierarchies } from '@repo/core/publicDivisionHierarchies'
import {
  divisionIdentifiers,
  type DivisionIdentifiers,
} from '@repo/core/pipeline/services/sources/divisionIdentifiers.ts'
import type { DivisionHierarchies } from '@repo/db'
import type { PublicDivisionHierarchies, PublicDivisionI18n } from '../schema/divisions'
import { divisionHierarchyEntries } from '@repo/core/pipeline/services/divisions/divisionHierarchies.ts'
import type { ApiRegion } from '../schema/region'
import {
  defaultApiLocalesByProfile,
  parseRequestedApiLocales,
  type RequestedApiLocaleSelection,
} from '@repo/core/apiLocales'
import type { BBox } from '@repo/core/pipeline/geojson.ts'

import type {
  DivisionAreaRecord,
  DivisionBoundaryRecord,
  DivisionLocaleSelection,
  DivisionRecord,
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
import type { SourcesPayload } from '../schema'
import type {
  DivisionProfile,
  RequestedDivisionApiVersion,
  RequestedDivisionVersion,
  ResolvedDivisionApiVersion,
} from './divisions'

type JsonObject = Record<string, unknown>

type DivisionPosition =
  | [longitude: number, latitude: number]
  | [longitude: number, latitude: number, elevation: number]

type DivisionGeometry = { type: 'Point'; coordinates: DivisionPosition }

type DivisionAreaGeometry =
  | { type: 'Polygon'; coordinates: DivisionPosition[][] }
  | { type: 'MultiPolygon'; coordinates: DivisionPosition[][][] }

type DivisionBoundaryGeometry =
  | { type: 'LineString'; coordinates: DivisionPosition[] }
  | { type: 'MultiLineString'; coordinates: DivisionPosition[][] }

function isDivisionPosition(value: unknown): value is DivisionPosition {
  return (
    Array.isArray(value) &&
    (value.length === 2 || value.length === 3) &&
    value.every(
      coordinate => typeof coordinate === 'number' && Number.isFinite(coordinate),
    )
  )
}

function asDivisionGeometry(value: unknown): DivisionGeometry | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null

  const { coordinates, type } = value as Record<string, unknown>
  if (type === 'Point' && isDivisionPosition(coordinates)) {
    return { type, coordinates }
  }

  return null
}

function asDivisionAreaGeometry(value: unknown): DivisionAreaGeometry | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const { type } = value as Record<string, unknown>
  return type === 'Polygon' || type === 'MultiPolygon'
    ? (value as DivisionAreaGeometry)
    : null
}

function asDivisionBoundaryGeometry(value: unknown): DivisionBoundaryGeometry | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const { type } = value as Record<string, unknown>
  return type === 'LineString' || type === 'MultiLineString'
    ? (value as DivisionBoundaryGeometry)
    : null
}

type DivisionResourcePayload = {
  type: 'divisions'
  id: string
  attributes: {
    level: number | null
    class: string
    category: import('@repo/db').DivisionCategory | null
    hierarchies: PublicDivisionHierarchies
    divisionCode?: string
    snapshotId?: string
    geometry?: DivisionGeometry | null
    bbox?: BBox | null
    cartography?: JsonObject | null
    createdAt?: string
    updatedAt?: string
    sources?: SourcesPayload | null
    identifiers?: DivisionIdentifiers | null
    variant?: string
    i18n?: PublicDivisionI18n
  }
  relationships: {
    areas?: { data: Array<{ type: 'division-areas'; id: string }> }
    boundaries?: { data: Array<{ type: 'division-boundaries'; id: string }> }
  }
  links: {
    self: string
  }
}

type DivisionGeometryResourceAttributes = {
  snapshotId?: string
  bbox: BBox | null
  type: 'land' | 'maritime' | 'mixed'
  isLand: boolean | null
  isTerritorial: boolean | null
  sources?: SourcesPayload | null
  identifiers?: DivisionIdentifiers | null
  variant?:
    | 'hkgov-censtatd'
    | 'hkgov-censtatd-landclipped'
    | 'hkgov-had'
    | 'hkgov-pland-new-town'
    | 'hkgov-pland-pu'
    | 'saanseoi'
    | 'overture'
}

type DivisionGeometryResourcePayload =
  | {
      type: 'division-areas'
      id: string
      attributes: DivisionGeometryResourceAttributes & {
        divisionId: string
        geometry: DivisionAreaGeometry | null
      }
    }
  | {
      type: 'division-boundaries'
      id: string
      attributes: DivisionGeometryResourceAttributes & {
        leftDivisionId: string
        rightDivisionId: string
        geometry: DivisionBoundaryGeometry | null
      }
    }

export type IncludedResourcePayload =
  | DivisionResourcePayload
  | DivisionGeometryResourcePayload

export type DivisionRouteState = {
  requestedVersionPath: RequestedDivisionVersion
  requestedApiVersion: RequestedDivisionApiVersion
  requestedApiFamily: 'divisions'
  selection?: { inventory: string; releaseSet: string; domain: string }
  resolvedApiVersion: ResolvedDivisionApiVersion
  profile: DivisionProfile
  localeSelection: DivisionLocaleSelection
}

export type DivisionFilters = {
  level?: number
  divisionClass?: string
  category?: import('@repo/db').DivisionCategory
  parent?: string
}

type DivisionListDocument = {
  jsonapi: {
    version: '1.1'
  }
  links: Record<string, string>
  data: DivisionResourcePayload[]
  included?: IncludedResourcePayload[]
  meta: ApiVersionMetadata & {
    apiCatalogRevision: string
    catalogPublishedAt: string
    cohort: string
    domain: string
    inventory?: string
    profile: DivisionProfile
    locales: ApiDocumentLocales
    filters: DivisionFilters
    page: {
      limit: number
      offset: number
      total: number
    }
  }
}

type DivisionDetailDocument = {
  jsonapi: {
    version: '1.1'
  }
  links: {
    permalink?: string
    self: string
  }
  data: DivisionResourcePayload
  included?: IncludedResourcePayload[]
  meta: ApiVersionMetadata & {
    apiCatalogRevision: string
    catalogPublishedAt: string
    cohort: string
    domain: string
    inventory?: string
    profile: DivisionProfile
    locales: ApiDocumentLocales
  }
}

type DivisionSnapshotNotReadyResponse = SnapshotNotReadyResponse<'division'>

type NotFoundResponse = {
  httpStatus: 404
  error: 'not_found'
  message: string
}

type VariantUnavailableResponse = {
  httpStatus: 409
  error: 'variant_unavailable'
  message: string
}

export type ActiveDivisionSnapshot = {
  snapshotId: string
  divisionSnapshotIds: string[]
  apiReleaseSet: string
  apiCatalogRevision: string
  catalogPublishedAt: string
  cohortKey: string
  domainCode: string
  inventory?: string
  effectiveFrom: string | null
  schemaVersion: string
  rulesetVersion: string
  areaSnapshotId: string | null
  boundarySnapshotId: string | null
}

export type DivisionListQuery = {
  region?: ApiRegion
  catalogRevision?: string
  cohort?: string
  domain?: string
  inventory?: string
  apiVersion?: string
  effectiveAt?: string
  knownAt?: string
  releaseSet?: string
  profile?: string
  locales?: string
  include?: string
  transform?: string
  'page[limit]'?: number
  'page[offset]'?: number
  'filter[level]'?: number
  'filter[class]'?: string
  'filter[category]'?: import('@repo/db').DivisionCategory
  'filter[parent]'?: string
}

export type DivisionDetailQuery = {
  region?: ApiRegion
  catalogRevision?: string
  cohort?: string
  domain?: string
  inventory?: string
  apiVersion?: string
  effectiveAt?: string
  knownAt?: string
  releaseSet?: string
  profile?: string
  locales?: string
  include?: string
  transform?: string
}

export type DivisionListResult =
  | {
      status: 200
      body: DivisionListDocument
    }
  | {
      status: 503
      publicationPending?: boolean
      body: DivisionSnapshotNotReadyResponse
    }
  | {
      status: 409
      body: VariantUnavailableResponse
    }

export type DivisionDetailResult =
  | {
      status: 200
      body: DivisionDetailDocument
    }
  | {
      status: 404
      body: NotFoundResponse
    }
  | {
      status: 503
      publicationPending?: boolean
      body: DivisionSnapshotNotReadyResponse
    }
  | {
      status: 409
      body: VariantUnavailableResponse
    }

function parseDivisionProfile(value?: string): DivisionProfile {
  if (value === 'compact' || value === 'full' || value === 'map') {
    return value
  }

  return 'default'
}

export function buildDivisionRouteState(args: {
  requestedVersionPath: RequestedDivisionVersion
  requestedApiVersion: RequestedDivisionApiVersion
  resolvedApiVersion: ResolvedDivisionApiVersion
  profile?: string
  locales?: string
}) {
  const profile = parseDivisionProfile(args.profile)
  const localeSelectionDefaults: RequestedApiLocaleSelection =
    profile === 'full'
      ? {
          mode: 'all',
          locales: ['*'],
        }
      : {
          mode: 'requested',
          locales: defaultApiLocalesByProfile[profile],
        }
  const localeSelection = parseRequestedApiLocales(
    args.locales,
    localeSelectionDefaults,
  )

  return {
    selection: undefined as DivisionRouteState['selection'],
    requestedVersionPath: args.requestedVersionPath,
    requestedApiVersion: args.requestedApiVersion,
    requestedApiFamily: 'divisions',
    resolvedApiVersion: args.resolvedApiVersion,
    profile,
    localeSelection,
  } satisfies DivisionRouteState
}

function isDefaultDivisionProfile(profile: DivisionProfile) {
  return profile === 'default' || profile === 'map' || profile === 'full'
}

function isMapDivisionProfile(profile: DivisionProfile) {
  return profile === 'map' || profile === 'full'
}

function projectDivisionI18n(
  i18n: DivisionRecord['i18n'],
  profile: DivisionProfile,
): PublicDivisionI18n | undefined {
  const projectedEntries = Object.entries(i18n)
    .map(([locale, value]) => {
      const projectedValue =
        profile === 'full'
          ? {
              name: value.name,
              nameAlts: value.nameAlts ?? null,
              nameRules: value.nameRules ?? null,
            }
          : {
              name: value.name,
            }

      return [locale, projectedValue] as const
    })
    .filter(([, value]) => Object.values(value).some(field => field !== undefined))

  if (projectedEntries.length === 0) {
    return undefined
  }

  return Object.fromEntries(projectedEntries)
}

export function storedDivisionHierarchyIdentifiers(
  divisionId: string,
  hierarchies: DivisionHierarchies | null,
) {
  return divisionHierarchyEntries(hierarchies)
    .filter(entry => entry.id !== divisionId)
    .map(entry => ({ type: 'divisions' as const, id: entry.id }))
}

export function matchesDivisionFilters(
  record: DivisionRecord,
  filters: DivisionFilters,
) {
  if (filters.level !== undefined && record.division.level !== filters.level)
    return false
  if (filters.divisionClass && record.division.class !== filters.divisionClass)
    return false
  if (filters.category && record.division.category !== filters.category) return false
  if (!filters.parent) return true
  return record.division.hierarchies.full.some(
    path => path.at(-1)?.id === filters.parent,
  )
}

export function createDivisionResource(args: {
  baseUrl: string
  routeState: DivisionRouteState
  record: DivisionRecord
  areas?: DivisionAreaRecord[]
  boundaries?: DivisionBoundaryRecord[]
}): DivisionResourcePayload {
  const { baseUrl, routeState, record } = args
  const { division, i18n } = record
  const projectedI18n = projectDivisionI18n(i18n, routeState.profile)
  const attributes: DivisionResourcePayload['attributes'] = {
    ...(division.divisionCode ? { divisionCode: division.divisionCode } : {}),
    category: division.category,
    class: division.class,
    level: division.level,
    ...(projectedI18n ? { i18n: projectedI18n } : {}),
    hierarchies: publicDivisionHierarchies(division.hierarchies),
    ...(isMapDivisionProfile(routeState.profile)
      ? {
          geometry: asDivisionGeometry(division.geometry),
          bbox: (division.bbox as BBox | null) ?? null,
          cartography: (division.cartography as JsonObject | null) ?? null,
        }
      : {}),
    ...(isDefaultDivisionProfile(routeState.profile)
      ? { identifiers: divisionIdentifiers(division.identifiers) }
      : {}),
    ...(routeState.profile === 'full'
      ? {
          sources: (division.sources as SourcesPayload | null) ?? null,
          snapshotId: division.snapshotId,
        }
      : {}),
    ...(isDefaultDivisionProfile(routeState.profile)
      ? { createdAt: division.createdAt, updatedAt: division.updatedAt }
      : {}),
  }

  return {
    type: 'divisions',
    id: division.id,
    attributes,
    relationships: {
      ...(args.areas
        ? {
            areas: {
              data: args.areas.map(area => ({
                type: 'division-areas' as const,
                id: area.id,
              })),
            },
          }
        : {}),
      ...(args.boundaries
        ? {
            boundaries: {
              data: args.boundaries.map(boundary => ({
                type: 'division-boundaries' as const,
                id: boundary.id,
              })),
            },
          }
        : {}),
    },
    links: {
      self: `${baseUrl}/${routeState.requestedVersionPath}/${division.id}${routeState.selection ? `?${new URLSearchParams(routeState.selection)}` : ''}`,
    },
  }
}

/** Projects a Division resource for inclusion from another resource family. */
export function createIncludedDivisionResource(args: {
  baseUrl: string
  requestedVersionPath: RequestedDivisionVersion
  profile: DivisionProfile
  localeSelection: RequestedApiLocaleSelection
  record: DivisionRecord
}) {
  return createDivisionResource({
    baseUrl: args.baseUrl,
    routeState: {
      requestedVersionPath: args.requestedVersionPath,
      requestedApiVersion: '0.1',
      requestedApiFamily: 'divisions',
      resolvedApiVersion: 'api-divisions-v0.1',
      profile: args.profile,
      localeSelection: args.localeSelection,
    },
    record: args.record,
  })
}

export function buildListDocument(args: {
  url: URL
  routeState: DivisionRouteState
  activeSnapshot: ActiveDivisionSnapshot
  records: DivisionRecord[]
  includedRecords: IncludedResourcePayload[]
  areasByDivision: Map<string, DivisionAreaRecord[]>
  boundariesByDivision: Map<string, DivisionBoundaryRecord[]>
  limit: number
  offset: number
  total: number
  filters: DivisionFilters
}): DivisionListDocument {
  const data = args.records.map(record =>
    createDivisionResource({
      baseUrl: args.url.origin,
      routeState: args.routeState,
      record,
      areas: args.areasByDivision.get(record.division.id),
      boundaries: args.boundariesByDivision.get(record.division.id),
    }),
  )

  const included = args.includedRecords.length > 0 ? args.includedRecords : undefined

  return buildJsonApiListDocument<
    DivisionResourcePayload,
    DivisionListDocument['meta'],
    IncludedResourcePayload
  >({
    url: args.url,
    limit: args.limit,
    offset: args.offset,
    total: args.total,
    meta: {
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
      ...(args.routeState.requestedApiVersion === '0.2'
        ? { inventory: args.activeSnapshot.inventory }
        : {}),
      locales: resolveApiMetaLocales(args.routeState.localeSelection),
      filters: args.filters,
      page: {
        limit: args.limit,
        offset: args.offset,
        total: args.total,
      },
    },
    data,
    included,
    permalink: buildDivisionPermalink({
      url: args.url,
      routeState: args.routeState,
      activeSnapshot: args.activeSnapshot,
      limit: args.limit,
      offset: args.offset,
    }),
  })
}

export function buildDetailDocument(args: {
  url: URL
  routeState: DivisionRouteState
  activeSnapshot: ActiveDivisionSnapshot
  record: DivisionRecord
  includedRecords: IncludedResourcePayload[]
  areasByDivision: Map<string, DivisionAreaRecord[]>
  boundariesByDivision: Map<string, DivisionBoundaryRecord[]>
}): DivisionDetailDocument {
  const data = createDivisionResource({
    baseUrl: args.url.origin,
    routeState: args.routeState,
    record: args.record,
    areas: args.areasByDivision.get(args.record.division.id),
    boundaries: args.boundariesByDivision.get(args.record.division.id),
  })

  const included = args.includedRecords.length > 0 ? args.includedRecords : undefined

  return buildJsonApiDetailDocument<
    DivisionResourcePayload,
    DivisionDetailDocument['meta'],
    IncludedResourcePayload
  >({
    url: args.url,
    data,
    included,
    meta: {
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
      ...(args.routeState.requestedApiVersion === '0.2'
        ? { inventory: args.activeSnapshot.inventory }
        : {}),
      locales: resolveApiMetaLocales(args.routeState.localeSelection),
    },
    permalink: buildDivisionPermalink({
      url: args.url,
      routeState: args.routeState,
      activeSnapshot: args.activeSnapshot,
    }),
  })
}

function buildDivisionPermalink(args: {
  activeSnapshot: ActiveDivisionSnapshot
  limit?: number
  offset?: number
  routeState: DivisionRouteState
  url: URL
}) {
  const permalink = new URL(args.url)
  const exactVersionPath = `divisions/${args.routeState.resolvedApiVersion.replace(
    /^api-divisions-/,
    '',
  )}`
  permalink.pathname = permalink.pathname.replace(
    /^\/divisions\/v0(?:\.\d+)?/,
    `/${exactVersionPath}`,
  )
  permalink.searchParams.delete('effectiveAt')
  permalink.searchParams.set('catalogRevision', args.activeSnapshot.apiCatalogRevision)
  permalink.searchParams.set('knownAt', args.activeSnapshot.catalogPublishedAt)
  permalink.searchParams.set('releaseSet', args.activeSnapshot.apiReleaseSet)
  permalink.searchParams.set('cohort', args.activeSnapshot.cohortKey)
  permalink.searchParams.set('domain', args.activeSnapshot.domainCode)
  if (args.routeState.requestedApiVersion === '0.2' && args.activeSnapshot.inventory)
    permalink.searchParams.set('inventory', args.activeSnapshot.inventory)
  permalink.searchParams.set('profile', args.routeState.profile)
  permalink.searchParams.set(
    'locales',
    args.routeState.localeSelection.mode === 'all'
      ? '*'
      : args.routeState.localeSelection.locales.join(','),
  )

  const includes = requestedIncludes(permalink.searchParams.get('include') ?? undefined)
  const normalisedIncludes = [...includes].map(include => {
    if (include === 'areas') {
      return `areas:${
        requestedGeometryVariants(
          'areas',
          args.activeSnapshot.domainCode,
          undefined,
          args.activeSnapshot.inventory,
        ).area ?? args.activeSnapshot.domainCode
      }`
    }
    if (include === 'boundaries') {
      return `boundaries:${
        requestedGeometryVariants('boundaries', args.activeSnapshot.domainCode)
          .boundary ?? args.activeSnapshot.domainCode
      }`
    }
    return include
  })
  permalink.searchParams.set(
    'include',
    normalisedIncludes.length > 0 ? normalisedIncludes.join(',') : 'none',
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

export function buildSnapshotNotReadyDivisionResponse(): DivisionSnapshotNotReadyResponse {
  return buildSnapshotNotReadyResponse('division')
}

export function requestedIncludes(value: string | undefined) {
  return new Set(
    (value ?? '')
      .split(',')
      .map(item => item.trim())
      .filter(item => Boolean(item) && item !== 'none'),
  )
}

export function requestedGeometryVariants(
  value: string | undefined,
  domainCode: string,
  transform?: string,
  inventory = 'saanseoi',
) {
  const includes = requestedIncludes(value)
  const area = [...includes].find(item => item.startsWith('areas:'))
  const boundary = [...includes].find(item => item.startsWith('boundaries:'))
  const requestedArea = area?.slice('areas:'.length)
  const areaVariant =
    requestedArea?.split('@', 1)[0] ||
    (domainCode === 'geographic' ? inventory : undefined)
  return {
    area:
      transform &&
      /^(?:hkgov-had|hkgov-censtatd(?:-landclipped)?|hkgov-censtatd-hma|hkgov-pland-pu|hkgov-pland-new-town)$/.test(
        areaVariant ?? '',
      )
        ? `${areaVariant}:${transform}`
        : areaVariant,
    boundary:
      boundary?.slice('boundaries:'.length) ||
      (domainCode === 'geographic' ? 'overture' : undefined),
  }
}

export function requestedAreaCohort(value: string | undefined) {
  const area = [...requestedIncludes(value)].find(item => item.startsWith('areas:'))
  const separator = area?.indexOf('@') ?? -1
  return separator >= 0 ? area?.slice(separator + 1) : undefined
}

export function requestedGeometryKinds(value: string | undefined) {
  const includes = requestedIncludes(value)
  return {
    area:
      includes.has('areas') || [...includes].some(item => item.startsWith('areas:')),
    boundary:
      includes.has('boundaries') ||
      [...includes].some(item => item.startsWith('boundaries:')),
  }
}

export function buildVariantUnavailableResponse(args: {
  kind: 'areas' | 'boundaries'
  variant: string
  cohortKey?: string
}): VariantUnavailableResponse {
  const requested = `${args.kind}:${args.variant}${
    args.cohortKey ? `@${args.cohortKey}` : ''
  }`
  return {
    httpStatus: 409,
    error: 'variant_unavailable',
    message: args.cohortKey
      ? `The requested ${requested} geometry cohort is not published.`
      : `The requested ${requested} variant is not available in the active division release set.`,
  }
}

export function createIncludedDivisionGeometryResource(args: {
  record: DivisionAreaRecord | DivisionBoundaryRecord
  kind: 'area' | 'boundary'
  profile: DivisionProfile
}): DivisionGeometryResourcePayload {
  const attributes = (record: DivisionAreaRecord | DivisionBoundaryRecord) => ({
    bbox: (record.bbox as BBox | null) ?? null,
    type: record.type,
    isLand: record.isLand,
    isTerritorial: record.isTerritorial,
    ...(args.profile === 'full'
      ? {
          sources: (record.sources as SourcesPayload | null) ?? null,
          snapshotId: record.snapshotId,
        }
      : {}),
    identifiers: divisionIdentifiers(record.identifiers),
    variant: record.variant,
  })
  if (args.kind === 'area') {
    const record = args.record as DivisionAreaRecord
    return {
      type: 'division-areas',
      id: record.id,
      attributes: {
        ...attributes(record),
        divisionId: record.divisionId,
        geometry: asDivisionAreaGeometry(record.geometry),
      },
    }
  }

  const record = args.record as DivisionBoundaryRecord
  return {
    type: 'division-boundaries',
    id: record.id,
    attributes: {
      ...attributes(record),
      leftDivisionId: record.leftDivisionId,
      rightDivisionId: record.rightDivisionId,
      geometry: asDivisionBoundaryGeometry(record.geometry),
    },
  }
}
