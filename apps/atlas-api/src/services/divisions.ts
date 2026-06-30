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
import type { AppEnv } from '../types'

export type RequestedDivisionVersion = 'v0' | 'v0.1'
export type RequestedDivisionApiVersion = '0.1'
export type ResolvedDivisionApiVersion = 'api-divisions-v0.1'
export type DivisionProfile = ApiProfileName

type DivisionResourcePayload = {
  type: 'divisions'
  id: string
  attributes: {
    level: number
    divisionType: string
    subtype?: string | null
    divisionClass?: string | null
    geometry?: Record<string, unknown> | null
    bbox?: Record<string, unknown> | null
    population?: number | null
    wikidata?: string | null
    i18n?: DivisionRecord['i18n']
  }
  relationships: {
    parent: {
      data: {
        type: 'divisions'
        id: string
      } | null
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
  logMissingI18n: boolean
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
  include?: 'parent'
  'page[limit]'?: number
  'page[offset]'?: number
  'filter[level]'?: number
  'filter[divisionType]'?: string
  'filter[parent]'?: string
}

export type DivisionDetailQuery = {
  profile?: string
  locales?: string
  include?: 'parent'
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
          locales: defaultApiLocalesByProfile.default,
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
    logMissingI18n: args.locales === undefined,
  } satisfies DivisionRouteState
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
    divisionType: division.type,
  }

  if (routeState.profile === 'full') {
    attributes.subtype = division.subtype
    attributes.divisionClass = division.class
    attributes.population = division.population
    attributes.wikidata = division.wikidata
  }

  if (routeState.profile === 'full' || routeState.profile === 'map') {
    attributes.geometry = (division.geometry as Record<string, unknown> | null) ?? null
    attributes.bbox = (division.bbox as Record<string, unknown> | null) ?? null
  }

  if (Object.keys(i18n).length > 0) {
    attributes.i18n = i18n
  }

  return {
    type: 'divisions',
    id: division.id,
    attributes,
    relationships: {
      parent: {
        data: division.parentDivisionId
          ? {
              type: 'divisions',
              id: division.parentDivisionId,
            }
          : null,
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
  const activeSnapshot = await resolveActiveSnapshotForType(
    metaDb as never,
    'division',
    'division',
  )

  if (!activeSnapshot) {
    return null
  }

  return activeSnapshot
}

async function loadIncludedParentRecords(args: {
  includeParent: boolean
  snapshotId: string
  records: DivisionRecord[]
  db: AppEnv['Variables']['currentDb']
  routeState: DivisionRouteState
}) {
  if (!args.includeParent) {
    return []
  }

  const primaryIds = new Set(args.records.map(record => record.division.id))
  const parentIds = [
    ...new Set(
      args.records
        .map(record => record.division.parentDivisionId)
        .filter((parentId): parentId is string => typeof parentId === 'string'),
    ),
  ].filter(id => !primaryIds.has(id))

  return listDivisionRecordsCurrentByIds(args.db, {
    snapshotId: args.snapshotId,
    divisionIds: parentIds,
    localeSelection: args.routeState.localeSelection,
  })
}

function logMissingDivisionI18n(args: {
  records: DivisionRecord[]
  requestUrl: string
  requestedVersion: RequestedDivisionVersion
}) {
  const divisionIds = [
    ...new Set(
      args.records
        .filter(record => record.missingI18n)
        .map(record => record.division.id),
    ),
  ]

  if (divisionIds.length === 0) {
    return
  }

  console.error('Division records missing i18n rows.', {
    requestUrl: args.requestUrl,
    requestedVersion: args.requestedVersion,
    divisionIds,
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
  const [records, total] = await Promise.all([
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
  ])

  const includedRecords = await loadIncludedParentRecords({
    includeParent: args.query.include === 'parent',
    snapshotId: activeDivisionSnapshot.snapshotId,
    records,
    db: args.currentDb,
    routeState,
  })

  logMissingDivisionI18n({
    records: routeState.logMissingI18n ? [...records, ...includedRecords] : [],
    requestUrl: args.requestUrl,
    requestedVersion: routeState.requestedVersionPath,
  })

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

  const record = await getDivisionRecordCurrent(args.currentDb, {
    snapshotId: activeDivisionSnapshot.snapshotId,
    divisionId: args.id,
    localeSelection: routeState.localeSelection,
  })

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

  const includedRecords = await loadIncludedParentRecords({
    includeParent: args.query.include === 'parent',
    snapshotId: activeDivisionSnapshot.snapshotId,
    records: [record],
    db: args.currentDb,
    routeState,
  })

  logMissingDivisionI18n({
    records: routeState.logMissingI18n ? [record, ...includedRecords] : [],
    requestUrl: args.requestUrl,
    requestedVersion: routeState.requestedVersionPath,
  })

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
