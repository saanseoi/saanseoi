import {
  defaultApiLocalesByProfile,
  parseRequestedApiLocales,
  type ApiProfileName,
  type RequestedApiLocaleSelection,
} from '@repo/core/apiLocales'
import { resolveApiReleaseSetSnapshotsForRequest } from '@repo/core/db/metaRegistry'

import {
  countDivisionsCurrent,
  getDivisionRecordCurrent,
  listDivisionRecordsCurrent,
  listDivisionRecordsCurrentByIds,
  listDivisionAreasCurrentByDivisionIds,
  listDivisionBoundariesCurrentByDivisionIds,
  type DivisionAreaRecord,
  type DivisionBoundaryRecord,
  type DivisionLocaleSelection,
  type DivisionRecord,
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
import type { AppEnv } from '../types'
import type { SourcesPayload } from '../schema'

export type RequestedDivisionVersion = 'v0' | 'v0.1'
export type RequestedDivisionApiVersion = '0.1'
export type ResolvedDivisionApiVersion = 'api-divisions-v0.1'
export type DivisionProfile = ApiProfileName

type JsonObject = Record<string, unknown>

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
    level: number
    type: string
    snapshotId?: string
    geometry?: JsonObject | null
    bbox?: [number, number, number, number] | null
    cartography?: JsonObject | null
    wikidata?: string | null
    createdAt?: string
    updatedAt?: string
    sources?: SourcesPayload | null
    identifiers?: unknown
    variant?: string
    overture?: {
      subtype?: string | null
      class?: string | null
      version?: number | null
      hierarchies?: unknown
      admin_level?: number | null
    }
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
    bbox: [number, number, number, number] | null
    type: string
    isLand: boolean | null
    isTerritorial: boolean | null
    sources?: SourcesPayload | null
    overture?: unknown
    variant?: string
  }
}

type IncludedResourcePayload = DivisionResourcePayload | DivisionGeometryResourcePayload

type DivisionRouteState = {
  requestedVersionPath: RequestedDivisionVersion
  requestedApiVersion: RequestedDivisionApiVersion
  requestedApiFamily: 'divisions'
  resolvedApiVersion: ResolvedDivisionApiVersion
  profile: DivisionProfile
  localeSelection: DivisionLocaleSelection
}

type DivisionFilters = {
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

type ActiveDivisionSnapshot = {
  snapshotId: string
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

function buildDivisionRouteState(args: {
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

function buildDivisionHierarchyRelationshipData(
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

    const normalizedId = id?.trim()

    if (!normalizedId) {
      return []
    }

    const normalizedI18n =
      record.i18n && typeof record.i18n === 'object' && !Array.isArray(record.i18n)
        ? (record.i18n as Record<string, unknown>)
        : null
    const englishI18n =
      normalizedI18n?.en &&
      typeof normalizedI18n.en === 'object' &&
      !Array.isArray(normalizedI18n.en)
        ? (normalizedI18n.en as Record<string, unknown>)
        : null
    const zhHantI18n =
      normalizedI18n?.['zh-hant'] &&
      typeof normalizedI18n['zh-hant'] === 'object' &&
      !Array.isArray(normalizedI18n['zh-hant'])
        ? (normalizedI18n['zh-hant'] as Record<string, unknown>)
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
      id: normalizedId,
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

function createDivisionResource(args: {
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
  }

  if (isDefaultDivisionProfile(routeState.profile)) {
    attributes.wikidata = division.wikidata
    attributes.createdAt = division.createdAt
    attributes.updatedAt = division.updatedAt
  }

  if (isMapDivisionProfile(routeState.profile)) {
    attributes.geometry = (division.geometry as JsonObject | null) ?? null
    attributes.bbox = (division.bbox as [number, number, number, number] | null) ?? null
    attributes.cartography = (division.cartography as JsonObject | null) ?? null
  }

  if (routeState.profile === 'full') {
    attributes.snapshotId = division.snapshotId
    attributes.sources = (division.sources as SourcesPayload | null) ?? null
    attributes.identifiers = division.identifiers
    attributes.overture = {
      subtype: division.subtype,
      class: division.class,
      hierarchies: division.overtureHierarchies ?? null,
      ...(division.overtureFeatureVersion !== null
        ? { version: division.overtureFeatureVersion }
        : {}),
      ...(division.overtureAdminLevel !== null
        ? { admin_level: division.overtureAdminLevel }
        : {}),
    }
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
      self: `${baseUrl}/${routeState.requestedVersionPath}/divisions/${division.id}`,
    },
  }
}

function buildListDocument(args: {
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

function buildDetailDocument(args: {
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
  const exactVersionPath = args.routeState.resolvedApiVersion.replace(
    /^api-divisions-/,
    '',
  )
  permalink.pathname = permalink.pathname.replace(
    /^\/v0(?:\.1)?\//,
    `/${exactVersionPath}/`,
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
  const normalizedIncludes = [...includes].map(include => {
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
    normalizedIncludes.length > 0 ? normalizedIncludes.join(',') : 'none',
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

function buildSnapshotNotReadyDivisionResponse(): DivisionSnapshotNotReadyResponse {
  return buildSnapshotNotReadyResponse('division')
}

async function getActiveDivisionSnapshot(
  metaDb: AppEnv['Variables']['metaDb'],
  domainCode: string,
  variants: { area?: string; boundary?: string },
  selectors: Pick<
    DivisionListQuery,
    'catalogRevision' | 'cohort' | 'effectiveAt' | 'knownAt' | 'releaseSet'
  >,
): Promise<ActiveDivisionSnapshot | null> {
  const selection = await runWithD1ReadRetry(() =>
    resolveApiReleaseSetSnapshotsForRequest(metaDb as never, 'division', {
      catalogRevision: selectors.catalogRevision,
      cohortKey: selectors.cohort,
      domainCode,
      effectiveAt: selectors.effectiveAt,
      knownAt: selectors.knownAt,
      regionCode: 'hk',
      releaseSet: selectors.releaseSet,
    }),
  )

  if (!selection) {
    return null
  }

  const primarySnapshot = selection.snapshots.find(
    snapshot =>
      snapshot.snapshotResourceType === 'division' && snapshot.role === 'primary',
  )
  if (!primarySnapshot) return null
  const areaSnapshot = selection.snapshots.find(
    snapshot =>
      snapshot.snapshotResourceType === 'divisionArea' &&
      (!variants.area || snapshot.variant === variants.area),
  )
  const boundarySnapshot = selection.snapshots.find(
    snapshot =>
      snapshot.snapshotResourceType === 'divisionBoundary' &&
      (!variants.boundary || snapshot.variant === variants.boundary),
  )

  return {
    snapshotId: primarySnapshot.snapshotId,
    apiReleaseSet: selection.releaseSet.code,
    apiCatalogRevision: selection.releaseSet.apiCatalogRevision,
    catalogPublishedAt: selection.releaseSet.catalogPublishedAt,
    cohortKey: selection.releaseSet.cohortKey,
    domainCode: selection.releaseSet.domainCode,
    effectiveFrom: selection.releaseSet.effectiveFrom,
    schemaVersion: selection.releaseSet.schemaVersion,
    rulesetVersion: selection.releaseSet.rulesetVersion,
    areaSnapshotId: areaSnapshot?.snapshotId ?? null,
    boundarySnapshotId: boundarySnapshot?.snapshotId ?? null,
  }
}

function requestedIncludes(value: string | undefined) {
  return new Set(
    (value ?? '')
      .split(',')
      .map(item => item.trim())
      .filter(item => Boolean(item) && item !== 'none'),
  )
}

function requestedGeometryVariants(
  value: string | undefined,
  domainCode: string,
  transform?: string,
) {
  const includes = requestedIncludes(value)
  const area = [...includes].find(item => item.startsWith('areas:'))
  const boundary = [...includes].find(item => item.startsWith('boundaries:'))
  const areaVariant =
    area?.slice('areas:'.length) || (domainCode === 'overture' ? 'overture' : undefined)
  return {
    area:
      transform && /^hkgov-censtatd:(?:2016|2021)$/.test(areaVariant ?? '')
        ? `${areaVariant}:${transform}`
        : areaVariant,
    boundary:
      boundary?.slice('boundaries:'.length) ||
      (domainCode === 'overture' ? 'overture' : undefined),
  }
}

function requestedGeometryKinds(value: string | undefined) {
  const includes = requestedIncludes(value)
  return {
    area:
      includes.has('areas') || [...includes].some(item => item.startsWith('areas:')),
    boundary:
      includes.has('boundaries') ||
      [...includes].some(item => item.startsWith('boundaries:')),
  }
}

function buildVariantUnavailableResponse(args: {
  kind: 'areas' | 'boundaries'
  variant: string
}): VariantUnavailableResponse {
  return {
    httpStatus: 409,
    error: 'variant_unavailable',
    message: `The requested ${args.kind}:${args.variant} variant is not available in the active division release set.`,
  }
}

async function loadDivisionGeometry(args: {
  currentDb: AppEnv['Variables']['currentDb']
  snapshot: ActiveDivisionSnapshot
  divisionIds: string[]
  variants?: { area?: string; boundary?: string }
}) {
  const [areas, boundaries] = await Promise.all([
    args.snapshot.areaSnapshotId
      ? listDivisionAreasCurrentByDivisionIds(args.currentDb, {
          snapshotId: args.snapshot.areaSnapshotId,
          divisionIds: args.divisionIds,
          variant: args.variants?.area,
        })
      : [],
    args.snapshot.boundarySnapshotId
      ? listDivisionBoundariesCurrentByDivisionIds(args.currentDb, {
          snapshotId: args.snapshot.boundarySnapshotId,
          divisionIds: args.divisionIds,
          variant: args.variants?.boundary,
        })
      : [],
  ])
  const areasByDivision = new Map<string, DivisionAreaRecord[]>()
  const boundariesByDivision = new Map<string, DivisionBoundaryRecord[]>()
  for (const area of areas)
    areasByDivision.set(area.divisionId, [
      ...(areasByDivision.get(area.divisionId) ?? []),
      area,
    ])
  for (const boundary of boundaries) {
    for (const id of [boundary.leftDivisionId, boundary.rightDivisionId]) {
      boundariesByDivision.set(id, [...(boundariesByDivision.get(id) ?? []), boundary])
    }
  }
  return { areas, boundaries, areasByDivision, boundariesByDivision }
}

function createDivisionGeometryResource(args: {
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
      bbox: (record.bbox as [number, number, number, number] | null) ?? null,
      type: record.type,
      isLand: record.isLand,
      isTerritorial: record.isTerritorial,
      sources: (record.sources as SourcesPayload | null) ?? null,
      overture: record.sourceKeys,
      variant: record.variant,
    },
  }
}

async function loadIncludedHierarchyRecords(args: {
  includeHierarchy: boolean
  snapshotId: string
  records: DivisionRecord[]
  db: AppEnv['Variables']['currentDb']
  routeState: DivisionRouteState
}) {
  if (!args.includeHierarchy) {
    return []
  }

  const primaryIds = new Set(args.records.map(record => record.division.id))
  const hierarchyIds = [
    ...new Set(
      args.records.flatMap(record =>
        buildDivisionHierarchyRelationshipData(
          record.division.id,
          record.division.hierarchy,
        ).map(hierarchy => hierarchy.id),
      ),
    ),
  ].filter(id => !primaryIds.has(id))

  return listDivisionRecordsCurrentByIds(args.db, {
    snapshotId: args.snapshotId,
    divisionIds: hierarchyIds,
    localeSelection: args.routeState.localeSelection,
  })
}

export async function listDivisions(args: {
  currentDb: AppEnv['Variables']['currentDb']
  metaDb: AppEnv['Variables']['metaDb']
  requestUrl: string
  requestedVersionPath: RequestedDivisionVersion
  requestedApiVersion: RequestedDivisionApiVersion
  resolvedApiVersion: ResolvedDivisionApiVersion
  query: DivisionListQuery
}): Promise<DivisionListResult> {
  const routeState = buildDivisionRouteState({
    requestedVersionPath: args.requestedVersionPath,
    requestedApiVersion: args.requestedApiVersion,
    resolvedApiVersion: args.resolvedApiVersion,
    profile: args.query.profile,
    locales: args.query.locales,
  })
  const limit = args.query['page[limit]'] ?? 25
  const offset = args.query['page[offset]'] ?? 0
  const domainCode = args.query.domain ?? 'overture'
  const geometryVariants = requestedGeometryVariants(
    args.query.include,
    domainCode,
    args.query.transform,
  )
  const requestedGeometry = requestedGeometryKinds(args.query.include)
  const activeDivisionSnapshot = await getActiveDivisionSnapshot(
    args.metaDb,
    domainCode,
    geometryVariants,
    args.query,
  )

  if (!activeDivisionSnapshot) {
    return {
      status: 503,
      body: buildSnapshotNotReadyDivisionResponse(),
    }
  }
  if (requestedGeometry.area && !activeDivisionSnapshot.areaSnapshotId) {
    return {
      status: 409,
      body: buildVariantUnavailableResponse({
        kind: 'areas',
        variant: geometryVariants.area ?? domainCode,
      }),
    }
  }
  if (requestedGeometry.boundary && !activeDivisionSnapshot.boundarySnapshotId) {
    return {
      status: 409,
      body: buildVariantUnavailableResponse({
        kind: 'boundaries',
        variant: geometryVariants.boundary ?? domainCode,
      }),
    }
  }

  const filters = {
    level: args.query['filter[level]'],
    divisionType: args.query['filter[divisionType]'],
    parent: args.query['filter[parent]'],
  } satisfies DivisionFilters
  const [records, total] = await runWithD1ReadRetry(() =>
    Promise.all([
      listDivisionRecordsCurrent(args.currentDb, {
        snapshotId: activeDivisionSnapshot.snapshotId,
        level: filters.level,
        type: filters.divisionType,
        parentId: filters.parent,
        limit,
        offset,
        localeSelection: routeState.localeSelection,
      }),
      countDivisionsCurrent(args.currentDb, {
        snapshotId: activeDivisionSnapshot.snapshotId,
        level: filters.level,
        type: filters.divisionType,
        parentId: filters.parent,
      }),
    ]),
  )

  const includedRecords = await runWithD1ReadRetry(() =>
    loadIncludedHierarchyRecords({
      includeHierarchy: args.query.include === 'hierarchy',
      snapshotId: activeDivisionSnapshot.snapshotId,
      records,
      db: args.currentDb,
      routeState,
    }),
  )
  const geometry = await runWithD1ReadRetry(() =>
    loadDivisionGeometry({
      currentDb: args.currentDb,
      snapshot: activeDivisionSnapshot,
      divisionIds: records.map(record => record.division.id),
      variants: geometryVariants,
    }),
  )
  const includes = requestedIncludes(args.query.include)
  const includeAreas =
    includes.has('areas') || [...includes].some(item => item.startsWith('areas:'))
  const includeBoundaries =
    includes.has('boundaries') ||
    [...includes].some(item => item.startsWith('boundaries:'))
  const includedGeometry: IncludedResourcePayload[] = [
    ...(includeAreas
      ? geometry.areas.map(record =>
          createDivisionGeometryResource({ record, kind: 'area' }),
        )
      : []),
    ...(includeBoundaries
      ? geometry.boundaries.map(record =>
          createDivisionGeometryResource({ record, kind: 'boundary' }),
        )
      : []),
  ]

  return {
    status: 200,
    body: buildListDocument({
      url: new URL(args.requestUrl),
      routeState,
      activeSnapshot: activeDivisionSnapshot,
      records,
      includedRecords: [
        ...includedRecords.map(record =>
          createDivisionResource({
            baseUrl: new URL(args.requestUrl).origin,
            routeState,
            record,
          }),
        ),
        ...includedGeometry,
      ],
      areasByDivision: geometry.areasByDivision,
      boundariesByDivision: geometry.boundariesByDivision,
      limit,
      offset,
      total,
      filters,
    }),
  }
}

export async function getDivisionDetail(args: {
  currentDb: AppEnv['Variables']['currentDb']
  metaDb: AppEnv['Variables']['metaDb']
  requestUrl: string
  requestedVersionPath: RequestedDivisionVersion
  requestedApiVersion: RequestedDivisionApiVersion
  resolvedApiVersion: ResolvedDivisionApiVersion
  id: string
  query: DivisionDetailQuery
}): Promise<DivisionDetailResult> {
  const routeState = buildDivisionRouteState({
    requestedVersionPath: args.requestedVersionPath,
    requestedApiVersion: args.requestedApiVersion,
    resolvedApiVersion: args.resolvedApiVersion,
    profile: args.query.profile,
    locales: args.query.locales,
  })
  const domainCode = args.query.domain ?? 'overture'
  const geometryVariants = requestedGeometryVariants(
    args.query.include,
    domainCode,
    args.query.transform,
  )
  const requestedGeometry = requestedGeometryKinds(args.query.include)
  const activeDivisionSnapshot = await getActiveDivisionSnapshot(
    args.metaDb,
    domainCode,
    geometryVariants,
    args.query,
  )

  if (!activeDivisionSnapshot) {
    return {
      status: 503,
      body: buildSnapshotNotReadyDivisionResponse(),
    }
  }
  if (requestedGeometry.area && !activeDivisionSnapshot.areaSnapshotId) {
    return {
      status: 409,
      body: buildVariantUnavailableResponse({
        kind: 'areas',
        variant: geometryVariants.area ?? domainCode,
      }),
    }
  }
  if (requestedGeometry.boundary && !activeDivisionSnapshot.boundarySnapshotId) {
    return {
      status: 409,
      body: buildVariantUnavailableResponse({
        kind: 'boundaries',
        variant: geometryVariants.boundary ?? domainCode,
      }),
    }
  }

  const record = await runWithD1ReadRetry(() =>
    getDivisionRecordCurrent(args.currentDb, {
      snapshotId: activeDivisionSnapshot.snapshotId,
      divisionId: args.id,
      localeSelection: routeState.localeSelection,
    }),
  )

  if (!record) {
    return {
      status: 404,
      body: {
        httpStatus: 404,
        error: 'not_found',
        message: `No division found for ${args.id}.`,
      },
    }
  }

  const includedRecords = await runWithD1ReadRetry(() =>
    loadIncludedHierarchyRecords({
      includeHierarchy: args.query.include === 'hierarchy',
      snapshotId: activeDivisionSnapshot.snapshotId,
      records: [record],
      db: args.currentDb,
      routeState,
    }),
  )
  const geometry = await runWithD1ReadRetry(() =>
    loadDivisionGeometry({
      currentDb: args.currentDb,
      snapshot: activeDivisionSnapshot,
      divisionIds: [record.division.id],
      variants: geometryVariants,
    }),
  )
  const includes = requestedIncludes(args.query.include)
  const includeAreas =
    includes.has('areas') || [...includes].some(item => item.startsWith('areas:'))
  const includeBoundaries =
    includes.has('boundaries') ||
    [...includes].some(item => item.startsWith('boundaries:'))
  const includedGeometry: IncludedResourcePayload[] = [
    ...(includeAreas
      ? geometry.areas.map(item =>
          createDivisionGeometryResource({ record: item, kind: 'area' }),
        )
      : []),
    ...(includeBoundaries
      ? geometry.boundaries.map(item =>
          createDivisionGeometryResource({ record: item, kind: 'boundary' }),
        )
      : []),
  ]

  return {
    status: 200,
    body: buildDetailDocument({
      url: new URL(args.requestUrl),
      routeState,
      activeSnapshot: activeDivisionSnapshot,
      record,
      includedRecords: [
        ...includedRecords.map(item =>
          createDivisionResource({
            baseUrl: new URL(args.requestUrl).origin,
            routeState,
            record: item,
          }),
        ),
        ...includedGeometry,
      ],
      areasByDivision: geometry.areasByDivision,
      boundariesByDivision: geometry.boundariesByDivision,
    }),
  }
}
