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

type DivisionGeometry =
  | { type: 'Point'; coordinates: DivisionPosition }
  | { type: 'Polygon'; coordinates: DivisionPosition[][] }
  | { type: 'MultiPolygon'; coordinates: DivisionPosition[][][] }

function isDivisionPosition(value: unknown): value is DivisionPosition {
  return (
    Array.isArray(value) &&
    (value.length === 2 || value.length === 3) &&
    value.every(
      coordinate => typeof coordinate === 'number' && Number.isFinite(coordinate),
    )
  )
}

function isDivisionPolygon(value: unknown): value is DivisionPosition[][] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(
      ring => Array.isArray(ring) && ring.length >= 4 && ring.every(isDivisionPosition),
    )
  )
}

function asDivisionGeometry(value: unknown): DivisionGeometry | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null

  const { coordinates, type } = value as Record<string, unknown>
  if (type === 'Point' && isDivisionPosition(coordinates)) {
    return { type, coordinates }
  }
  if (type === 'Polygon' && isDivisionPolygon(coordinates)) {
    return { type, coordinates }
  }
  if (
    type === 'MultiPolygon' &&
    Array.isArray(coordinates) &&
    coordinates.length > 0 &&
    coordinates.every(isDivisionPolygon)
  ) {
    return { type, coordinates }
  }

  return null
}

type DivisionHierarchyResourceIdentifier = {
  type: 'divisions'
  id: string
  meta?: {
    name?: string
    subType?: string
  }
}

type DivisionResourcePayload = {
  type: 'divisions'
  id: string
  attributes: {
    level: number | null
    type: string
    divisionCode?: string
    snapshotId?: string
    geometry?: DivisionGeometry | null
    bbox?: BBox | null
    cartography?: JsonObject | null
    wikidataId?: string | null
    createdAt?: string
    updatedAt?: string
    sources?: SourcesPayload | null
    identifiers?: unknown
    variant?: string
    i18n?: DivisionRecord['i18n']
  }
  relationships: {
    hierarchy: {
      data: DivisionHierarchyResourceIdentifier[]
    }
    areas?: { data: Array<{ type: 'division-areas'; id: string }> }
    boundaries?: { data: Array<{ type: 'division-boundaries'; id: string }> }
  }
  links: {
    self: string
  }
}

type DivisionGeometryResourcePayload = {
  type: 'division-areas' | 'division-boundaries'
  id: string
  attributes: {
    divisionId?: string
    leftDivisionId?: string
    rightDivisionId?: string
    geometry: JsonObject | null
    bbox: BBox | null
    type: 'land' | 'maritime' | 'mixed'
    isLand: boolean | null
    isTerritorial: boolean | null
    sources?: SourcesPayload | null
    identifiers?: unknown
    variant?:
      | 'hkgov-censtatd'
      | 'hkgov-censtatd-landclipped'
      | 'hkgov-had'
      | 'hkgov-pland-new-town'
      | 'hkgov-pland-pu'
      | 'overture'
  }
}

export type IncludedResourcePayload =
  | DivisionResourcePayload
  | DivisionGeometryResourcePayload

export type DivisionRouteState = {
  requestedVersionPath: RequestedDivisionVersion
  requestedApiVersion: RequestedDivisionApiVersion
  requestedApiFamily: 'divisions'
  resolvedApiVersion: ResolvedDivisionApiVersion
  profile: DivisionProfile
  localeSelection: DivisionLocaleSelection
}

export type DivisionFilters = {
  level?: number
  divisionType?: string
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
  effectiveFrom: string | null
  schemaVersion: string
  rulesetVersion: string
  areaSnapshotId: string | null
  boundarySnapshotId: string | null
}

export type DivisionListQuery = {
  catalogRevision?: string
  cohort?: string
  domain?: string
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
  'filter[divisionType]'?: string
  'filter[parent]'?: string
}

export type DivisionDetailQuery = {
  catalogRevision?: string
  cohort?: string
  domain?: string
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
): DivisionRecord['i18n'] | undefined {
  const projectedEntries = Object.entries(i18n)
    .map(([locale, value]) => {
      const projectedValue =
        profile === 'full'
          ? {
              name: value.name,
              nameVariant: value.nameVariant ?? null,
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

export function buildDivisionHierarchyRelationshipData(
  divisionId: string,
  hierarchy: unknown,
): DivisionHierarchyResourceIdentifier[] {
  if (!Array.isArray(hierarchy)) {
    return []
  }

  const objectChain = hierarchy.flatMap(entry => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      return []
    }

    const record = entry as Record<string, unknown>
    const id =
      typeof record.division_id === 'string'
        ? record.division_id
        : typeof record.divisionId === 'string'
          ? record.divisionId
          : typeof record.id === 'string'
            ? record.id
            : null

    const normalisedId = id?.trim()

    if (!normalisedId) {
      return []
    }

    const normalisedI18n =
      record.i18n && typeof record.i18n === 'object' && !Array.isArray(record.i18n)
        ? (record.i18n as Record<string, unknown>)
        : null
    const englishI18n =
      normalisedI18n?.en &&
      typeof normalisedI18n.en === 'object' &&
      !Array.isArray(normalisedI18n.en)
        ? (normalisedI18n.en as Record<string, unknown>)
        : null
    const zhHantI18n =
      normalisedI18n?.['zh-hant'] &&
      typeof normalisedI18n['zh-hant'] === 'object' &&
      !Array.isArray(normalisedI18n['zh-hant'])
        ? (normalisedI18n['zh-hant'] as Record<string, unknown>)
        : null
    const name =
      typeof record.name === 'string'
        ? record.name
        : typeof englishI18n?.name === 'string'
          ? englishI18n.name
          : typeof zhHantI18n?.name === 'string'
            ? zhHantI18n.name
            : undefined
    const rawSubType =
      typeof record.subType === 'string'
        ? record.subType
        : typeof record.subtype === 'string'
          ? record.subtype
          : typeof record.type === 'string'
            ? record.type
            : null

    return {
      type: 'divisions' as const,
      id: normalisedId,
      meta:
        name || rawSubType
          ? {
              ...(name ? { name } : {}),
              ...(rawSubType ? { subType: rawSubType } : {}),
            }
          : undefined,
    }
  })

  if (objectChain.length > 0) {
    return objectChain.filter(entry => entry.id !== divisionId)
  }

  const candidateIdChains = hierarchy
    .map(entry => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        return []
      }

      const ids = (entry as Record<string, unknown>).ids

      return Array.isArray(ids)
        ? ids.flatMap(value => {
            if (typeof value !== 'string') {
              return []
            }

            const id = value.trim()
            return id ? [id] : []
          })
        : []
    })
    .filter(ids => ids.length > 0)

  if (candidateIdChains.length === 0) {
    return []
  }

  const ids = candidateIdChains.reduce((selected, current) =>
    current.length > selected.length ? current : selected,
  )

  return ids
    .filter(id => id !== divisionId)
    .map(id => ({
      type: 'divisions' as const,
      id,
    }))
}

export function matchesDivisionFilters(
  record: DivisionRecord,
  filters: DivisionFilters,
) {
  if (filters.level !== undefined && record.division.level !== filters.level)
    return false
  if (filters.divisionType && record.division.type !== filters.divisionType)
    return false
  if (!filters.parent) return true
  const hierarchy = record.division.hierarchy
  const parent = Array.isArray(hierarchy) ? hierarchy.at(-1) : null
  return (
    parent !== null &&
    typeof parent === 'object' &&
    (parent as Record<string, unknown>).division_id === filters.parent
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
  const attributes: DivisionResourcePayload['attributes'] = {
    level: division.level,
    type: division.type,
    ...(division.divisionCode ? { divisionCode: division.divisionCode } : {}),
  }

  if (isDefaultDivisionProfile(routeState.profile)) {
    attributes.wikidataId = division.wikidataId
    attributes.createdAt = division.createdAt
    attributes.updatedAt = division.updatedAt
  }

  if (isMapDivisionProfile(routeState.profile)) {
    attributes.geometry = asDivisionGeometry(division.geometry)
    attributes.bbox = (division.bbox as BBox | null) ?? null
    attributes.cartography = (division.cartography as JsonObject | null) ?? null
  }

  if (routeState.profile === 'full') {
    attributes.snapshotId = division.snapshotId
    attributes.sources = (division.sources as SourcesPayload | null) ?? null
    attributes.identifiers = division.identifiers
  }

  const projectedI18n = projectDivisionI18n(i18n, routeState.profile)

  if (projectedI18n) {
    attributes.i18n = projectedI18n
  }

  return {
    type: 'divisions',
    id: division.id,
    attributes,
    relationships: {
      hierarchy: {
        data: buildDivisionHierarchyRelationshipData(division.id, division.hierarchy),
      },
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
      self: `${baseUrl}/${routeState.requestedVersionPath}/${division.id}`,
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
        requestedGeometryVariants('areas', args.activeSnapshot.domainCode).area ??
        args.activeSnapshot.domainCode
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
) {
  const includes = requestedIncludes(value)
  const area = [...includes].find(item => item.startsWith('areas:'))
  const boundary = [...includes].find(item => item.startsWith('boundaries:'))
  const requestedArea = area?.slice('areas:'.length)
  const areaVariant =
    requestedArea?.split('@', 1)[0] ||
    (domainCode === 'geographic' ? 'overture' : undefined)
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
}): DivisionGeometryResourcePayload {
  const { record } = args
  const isArea = args.kind === 'area'
  return {
    type: isArea ? 'division-areas' : 'division-boundaries',
    id: record.id,
    attributes: {
      ...(isArea
        ? { divisionId: (record as DivisionAreaRecord).divisionId }
        : {
            leftDivisionId: (record as DivisionBoundaryRecord).leftDivisionId,
            rightDivisionId: (record as DivisionBoundaryRecord).rightDivisionId,
          }),
      geometry: (record.geometry as JsonObject | null) ?? null,
      bbox: (record.bbox as BBox | null) ?? null,
      type: record.type,
      isLand: record.isLand,
      isTerritorial: record.isTerritorial,
      sources: (record.sources as SourcesPayload | null) ?? null,
      identifiers: record.identifiers,
      variant: record.variant,
    },
  }
}
