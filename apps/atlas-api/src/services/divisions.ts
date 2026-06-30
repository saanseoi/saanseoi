import {
  defaultApiLocalesByProfile,
  parseRequestedApiLocales,
  type ApiProfileName,
  type RequestedApiLocaleSelection,
} from '@repo/core'
import { resolveActiveSnapshotForType } from '@repo/core/db/metaRepository'

import {
  countDivisionsCurrent,
  getDivisionRecordCurrent,
  listDivisionRecordsCurrent,
  listDivisionRecordsCurrentByIds,
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

export type RequestedDivisionVersion = 'v0' | 'v0.1'
export type RequestedDivisionApiVersion = '0.1'
export type ResolvedDivisionApiVersion = 'api-divisions-v0.1'
export type DivisionProfile = ApiProfileName

type JsonObject = Record<string, unknown>

type DivisionAncestorResourceIdentifier = {
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
    population?: number | null
    wikidata?: string | null
    createdAt?: string
    updatedAt?: string
    sources?: JsonObject | null
    overture?: {
      subtype?: string | null
      class?: string | null
      hierarchy?: unknown
    }
    i18n?: DivisionRecord['i18n']
  }
  relationships: {
    ancestors: {
      data: DivisionAncestorResourceIdentifier[]
    }
  }
  links: {
    self: string
  }
}

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
  included?: DivisionResourcePayload[]
  meta: ApiVersionMetadata & {
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
    self: string
  }
  data: DivisionResourcePayload
  included?: DivisionResourcePayload[]
  meta: ApiVersionMetadata & {
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

type ActiveDivisionSnapshot = {
  snapshotId: string
  apiReleaseSet: string
  schemaVersion: string
  rulesetVersion: string
}

export type DivisionListQuery = {
  profile?: string
  locales?: string
  include?: 'ancestors'
  'page[limit]'?: number
  'page[offset]'?: number
  'filter[level]'?: number
  'filter[divisionType]'?: string
  'filter[parent]'?: string
}

export type DivisionDetailQuery = {
  profile?: string
  locales?: string
  include?: 'ancestors'
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

function buildDivisionAncestorRelationshipData(
  divisionId: string,
  hierarchy: unknown,
): DivisionAncestorResourceIdentifier[] {
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

    if (!id) {
      return []
    }

    const name = typeof record.name === 'string' ? record.name : undefined
    const rawSubType =
      typeof record.subType === 'string'
        ? record.subType
        : typeof record.subtype === 'string'
          ? record.subtype
          : null

    return {
      type: 'divisions' as const,
      id,
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
        ? ids.filter((value): value is string => typeof value === 'string')
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
    attributes.population = division.population
    attributes.sources = (division.sources as JsonObject | null) ?? null
    attributes.overture = {
      subtype: division.subtype,
      class: division.class,
      hierarchy: division.hierarchy ?? null,
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
      ancestors: {
        data: buildDivisionAncestorRelationshipData(division.id, division.hierarchy),
      },
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
  includedRecords: DivisionRecord[]
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
    }),
  )

  const included =
    args.includedRecords.length > 0
      ? args.includedRecords.map(record =>
          createDivisionResource({
            baseUrl: args.url.origin,
            routeState: args.routeState,
            record,
          }),
        )
      : undefined

  return buildJsonApiListDocument<
    DivisionResourcePayload,
    DivisionListDocument['meta']
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
  })
}

function buildDetailDocument(args: {
  url: URL
  routeState: DivisionRouteState
  activeSnapshot: ActiveDivisionSnapshot
  record: DivisionRecord
  includedRecords: DivisionRecord[]
}): DivisionDetailDocument {
  const data = createDivisionResource({
    baseUrl: args.url.origin,
    routeState: args.routeState,
    record: args.record,
  })

  const included =
    args.includedRecords.length > 0
      ? args.includedRecords.map(record =>
          createDivisionResource({
            baseUrl: args.url.origin,
            routeState: args.routeState,
            record,
          }),
        )
      : undefined

  return buildJsonApiDetailDocument<
    DivisionResourcePayload,
    DivisionDetailDocument['meta']
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
      locales: resolveApiMetaLocales(args.routeState.localeSelection),
    },
  })
}

function buildSnapshotNotReadyDivisionResponse(): DivisionSnapshotNotReadyResponse {
  return buildSnapshotNotReadyResponse('division')
}

async function getActiveDivisionSnapshot(
  metaDb: AppEnv['Variables']['metaDb'],
): Promise<ActiveDivisionSnapshot | null> {
  const activeSnapshot = await runWithD1ReadRetry(() =>
    resolveActiveSnapshotForType(metaDb as never, 'division', 'division'),
  )

  if (!activeSnapshot) {
    return null
  }

  return activeSnapshot
}

async function loadIncludedAncestorRecords(args: {
  includeAncestors: boolean
  snapshotId: string
  records: DivisionRecord[]
  db: AppEnv['Variables']['currentDb']
  routeState: DivisionRouteState
}) {
  if (!args.includeAncestors) {
    return []
  }

  const primaryIds = new Set(args.records.map(record => record.division.id))
  const ancestorIds = [
    ...new Set(
      args.records.flatMap(record =>
        buildDivisionAncestorRelationshipData(
          record.division.id,
          record.division.hierarchy,
        ).map(ancestor => ancestor.id),
      ),
    ),
  ].filter(id => !primaryIds.has(id))

  return listDivisionRecordsCurrentByIds(args.db, {
    snapshotId: args.snapshotId,
    divisionIds: ancestorIds,
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
  const activeDivisionSnapshot = await getActiveDivisionSnapshot(args.metaDb)

  if (!activeDivisionSnapshot) {
    return {
      status: 503,
      body: buildSnapshotNotReadyDivisionResponse(),
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
        parentDivisionId: filters.parent,
        limit,
        offset,
        localeSelection: routeState.localeSelection,
      }),
      countDivisionsCurrent(args.currentDb, {
        snapshotId: activeDivisionSnapshot.snapshotId,
        level: filters.level,
        type: filters.divisionType,
        parentDivisionId: filters.parent,
      }),
    ]),
  )

  const includedRecords = await runWithD1ReadRetry(() =>
    loadIncludedAncestorRecords({
      includeAncestors: args.query.include === 'ancestors',
      snapshotId: activeDivisionSnapshot.snapshotId,
      records,
      db: args.currentDb,
      routeState,
    }),
  )

  return {
    status: 200,
    body: buildListDocument({
      url: new URL(args.requestUrl),
      routeState,
      activeSnapshot: activeDivisionSnapshot,
      records,
      includedRecords,
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
  const activeDivisionSnapshot = await getActiveDivisionSnapshot(args.metaDb)

  if (!activeDivisionSnapshot) {
    return {
      status: 503,
      body: buildSnapshotNotReadyDivisionResponse(),
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
    loadIncludedAncestorRecords({
      includeAncestors: args.query.include === 'ancestors',
      snapshotId: activeDivisionSnapshot.snapshotId,
      records: [record],
      db: args.currentDb,
      routeState,
    }),
  )

  return {
    status: 200,
    body: buildDetailDocument({
      url: new URL(args.requestUrl),
      routeState,
      activeSnapshot: activeDivisionSnapshot,
      record,
      includedRecords,
    }),
  }
}
