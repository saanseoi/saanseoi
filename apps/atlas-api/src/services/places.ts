import {
  getPublicationReadiness,
  guardPublicationRead,
  hasHistoricalSelectors,
  PublicationReadUnavailableError,
} from '../db/publicationState'
import {
  defaultApiLocalesByProfile,
  derivePlaceReferenceName,
  parseRequestedApiLocales,
  type ApiProfileName,
  type RequestedApiLocaleSelection,
} from '@repo/core'
import {
  resolveApiReleaseSetSnapshotsForRequest,
  resolveSnapshotReplayPlan,
} from '@repo/core/db/metaRegistry'

import {
  countPlaceRecordsCurrent,
  listPlaceRecordsCurrent,
  type PlaceLocaleValue,
  type PlaceRecord,
} from '../db/places'
import {
  listDivisionRecordsCurrentByIds,
  listReplayedDivisionRecords,
} from '../db/divisions'
import { listReplayedPlacePage } from '../db/placesHistory'
import { resolveSnapshotVersionState } from '@repo/core/pipeline/db/snapshotReplay.ts'
import {
  buildApiVersionMetadata,
  buildJsonApiListDocument,
  buildSnapshotNotReadyResponse,
  resolveApiMetaLocales,
  type ApiDocumentLocales,
  type ApiVersionMetadata,
  type SnapshotNotReadyResponse,
} from '../lib/api'
import { runWithD1ReadRetry } from '../lib/d1'
import type { AppEnv } from '../types'
import {
  resolveApiReleaseSetAccessAttribution,
  resolveOptionalApiReleaseSetAccessAttribution,
  type AccessAttribution,
} from './accessAnalytics'
import { createIncludedDivisionResource, type DivisionProfile } from './divisions'

export type RequestedPlaceVersion = 'places/v0' | 'places/v0.1'
export type RequestedPlaceApiVersion = '0.1'
export type ResolvedPlaceApiVersion = 'api-places-v0.1'
export type PlaceProfile = ApiProfileName

type PlaceFilters = {
  basicCategory?: string
  taxonomyPrimary?: string
  operatingStatus?: string
  division?: string
}

type PlaceResourcePayload = {
  type: 'places'
  id: string
  attributes: Record<string, unknown>
  relationships: {
    address: { data: { type: 'addresses'; id: string } | null }
    divisions: { data: Array<{ type: 'divisions'; id: string }> }
  }
  links: { self: string }
}

type PlaceDocumentMeta = ApiVersionMetadata & {
  apiCatalogRevision: string
  catalogPublishedAt: string
  cohort: string
  domain: 'overture'
  region: 'hk' | 'mo'
  profile: PlaceProfile
  locales: ApiDocumentLocales
  filters: PlaceFilters
  page: { limit: number; offset: number; total?: number; hasMore?: boolean }
}

type PlaceListDocument = {
  jsonapi: { version: '1.1' }
  links: Record<string, string>
  data: PlaceResourcePayload[]
  included?: unknown[]
  meta: PlaceDocumentMeta
}

type ActivePlaceSnapshot = {
  snapshotId: string
  divisionSnapshotId: string
  apiReleaseSet: string
  apiCatalogRevision: string
  catalogPublishedAt: string
  cohortKey: string
  schemaVersion: string
  rulesetVersion: string
}

export type PlaceListQuery = {
  catalogRevision?: string
  cohort?: string
  domain?: 'overture'
  effectiveAt?: string
  knownAt?: string
  releaseSet?: string
  profile?: string
  locales?: string
  include?: 'divisions'
  'page[limit]'?: number
  'page[offset]'?: number
  'filter[basicCategory]'?: string
  'filter[taxonomyPrimary]'?: string
  'filter[operatingStatus]'?: string
  'filter[division]'?: string
}

export type PlaceListResult =
  | { status: 200; body: PlaceListDocument }
  | {
      status: 503
      publicationPending?: boolean
      body: SnapshotNotReadyResponse<'place'>
    }

function parsePlaceProfile(value?: string): PlaceProfile {
  if (value === 'compact' || value === 'map' || value === 'full') return value
  return 'default'
}

function buildPlaceRouteState(args: {
  requestedVersionPath: RequestedPlaceVersion
  requestedApiVersion: RequestedPlaceApiVersion
  resolvedApiVersion: ResolvedPlaceApiVersion
  profile?: string
  locales?: string
}) {
  const profile = parsePlaceProfile(args.profile)
  const localeSelection: RequestedApiLocaleSelection =
    profile === 'full'
      ? { mode: 'all', locales: ['*'] }
      : {
          mode: 'requested',
          locales: defaultApiLocalesByProfile[profile],
        }

  return {
    requestedVersionPath: args.requestedVersionPath,
    requestedApiVersion: args.requestedApiVersion,
    requestedApiFamily: 'places' as const,
    resolvedApiVersion: args.resolvedApiVersion,
    profile,
    localeSelection: parseRequestedApiLocales(args.locales, localeSelection),
  }
}

function isDefaultPlaceProfile(profile: PlaceProfile) {
  return profile === 'default' || profile === 'map' || profile === 'full'
}

function isMapPlaceProfile(profile: PlaceProfile) {
  return profile === 'map' || profile === 'full'
}

function projectPlaceI18n(
  i18n: Record<string, PlaceLocaleValue>,
  profile: PlaceProfile,
) {
  const entries = Object.entries(i18n).map(([locale, value]) => [
    locale,
    {
      name: value.name,
      brandName: value.brandName,
      ...(isDefaultPlaceProfile(profile)
        ? {
            freeformAddress: value.freeformAddress,
            accessHint: value.accessHint ?? null,
          }
        : {}),
      ...(profile === 'full'
        ? {
            nameVariant: value.nameVariant,
            nameAlts: value.nameAlts,
            brandNameVariant: value.brandNameVariant,
            brandNameAlts: value.brandNameAlts,
            provenance: value.provenance,
          }
        : {}),
    },
  ])

  return entries.length > 0 ? Object.fromEntries(entries) : undefined
}

function placeTaxonomy(record: PlaceRecord['place'], profile: PlaceProfile) {
  return {
    primary: record.taxonomyPrimary,
    ...(isDefaultPlaceProfile(profile)
      ? {
          hierarchy: record.taxonomyHierarchy,
          alternates: record.taxonomyAlternates,
        }
      : {}),
  }
}

/** A completed Place publication asserts membership for its whole source cohort. */
export function withPlacePublication<T extends { lastSeenMonth: string }>(
  place: T,
  cohortKey: string,
): T {
  return { ...place, lastSeenMonth: cohortKey.slice(0, 7) }
}

function createPlaceResource(args: {
  baseUrl: string
  record: PlaceRecord
  routeState: ReturnType<typeof buildPlaceRouteState>
}) {
  const { place } = args.record
  const referenceName = derivePlaceReferenceName(
    Object.entries(args.record.i18n).map(([locale, localised]) => ({
      locale,
      name: localised.name,
    })),
  )
  const attributes: Record<string, unknown> = {
    referenceName,
    basicCategory: place.basicCategory,
    taxonomy: placeTaxonomy(place, args.routeState.profile),
    operatingStatus: place.operatingStatus,
  }
  const i18n = projectPlaceI18n(args.record.i18n, args.routeState.profile)
  if (i18n) attributes.i18n = i18n

  if (isDefaultPlaceProfile(args.routeState.profile)) {
    Object.assign(attributes, {
      wikidataId: place.wikidataId,
      websites: place.websites,
      socials: place.socials,
      emails: place.emails,
      phones: place.phones,
      confidence: place.confidence,
      firstSeenMonth: place.firstSeenMonth,
      lastSeenMonth: place.lastSeenMonth,
      createdAt: place.createdAt,
      updatedAt: place.updatedAt,
    })
  }

  if (isMapPlaceProfile(args.routeState.profile)) {
    Object.assign(attributes, {
      geometry: { type: 'Point', coordinates: [place.lng, place.lat] },
      bbox: place.bbox,
    })
  }

  if (args.routeState.profile === 'full') {
    Object.assign(attributes, {
      snapshotId: place.snapshotId,
      releaseId: place.releaseId,
      addressSnapshotId: place.addressSnapshotId,
      address2dId: place.address2dId,
      address3dId: place.address3dId,
      address3dUnitId: place.address3dUnitId ?? null,
      address3dMembership: place.address3dMembership ?? null,
      sources: place.sources,
    })
  }

  return {
    type: 'places' as const,
    id: place.id,
    attributes,
    relationships: {
      address: {
        data: place.address2dId
          ? { type: 'addresses' as const, id: place.address2dId }
          : null,
      },
      divisions: {
        data: args.record.divisionIds.map(id => ({ type: 'divisions' as const, id })),
      },
    },
    links: {
      self: `${args.baseUrl}/${args.routeState.requestedVersionPath}/${place.id}`,
    },
  } satisfies PlaceResourcePayload
}

async function getActivePlaceSnapshot(
  metaDb: AppEnv['Variables']['metaDb'],
  region: 'hk' | 'mo',
  selectors: Pick<
    PlaceListQuery,
    'catalogRevision' | 'cohort' | 'effectiveAt' | 'knownAt' | 'releaseSet'
  >,
): Promise<ActivePlaceSnapshot | null> {
  const selection = await runWithD1ReadRetry(() =>
    resolveApiReleaseSetSnapshotsForRequest(metaDb as never, 'place', {
      catalogRevision: selectors.catalogRevision,
      cohortKey: selectors.cohort,
      domainCode: 'overture',
      effectiveAt: selectors.effectiveAt,
      knownAt: selectors.knownAt,
      regionCode: region,
      releaseSet: selectors.releaseSet,
    }),
  )
  if (!selection) return null

  const primarySnapshot = selection.snapshots.find(
    snapshot =>
      snapshot.snapshotResourceType === 'place' && snapshot.role === 'primary',
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
    schemaVersion: selection.releaseSet.schemaVersion,
    rulesetVersion: selection.releaseSet.rulesetVersion,
  }
}

function buildPlacePermalink(args: {
  url: URL
  region: 'hk' | 'mo'
  routeState: ReturnType<typeof buildPlaceRouteState>
  activeSnapshot: ActivePlaceSnapshot
  limit: number
  offset: number
}) {
  const permalink = new URL(args.url)
  permalink.pathname = `/places/${args.routeState.resolvedApiVersion.replace(
    /^api-places-/,
    '',
  )}`
  permalink.searchParams.delete('effectiveAt')
  permalink.searchParams.set('catalogRevision', args.activeSnapshot.apiCatalogRevision)
  permalink.searchParams.set('knownAt', args.activeSnapshot.catalogPublishedAt)
  permalink.searchParams.set('releaseSet', args.activeSnapshot.apiReleaseSet)
  permalink.searchParams.set('cohort', args.activeSnapshot.cohortKey)
  permalink.searchParams.set('domain', 'overture')
  permalink.searchParams.set('profile', args.routeState.profile)
  permalink.searchParams.set(
    'locales',
    args.routeState.localeSelection.mode === 'all'
      ? '*'
      : args.routeState.localeSelection.locales.join(','),
  )
  permalink.searchParams.set('page[limit]', String(args.limit))
  permalink.searchParams.set('page[offset]', String(args.offset))
  permalink.searchParams.sort()
  return permalink.toString()
}

async function loadIncludedDivisions(args: {
  currentDb: AppEnv['Variables']['currentDb']
  historyDbsByBinding?: AppEnv['Variables']['historyDbsByBinding']
  metaDb: AppEnv['Variables']['metaDb']
  activeSnapshot: ActivePlaceSnapshot
  records: PlaceRecord[]
  routeState: ReturnType<typeof buildPlaceRouteState>
  include?: 'divisions'
  baseUrl: string
}) {
  if (args.include !== 'divisions') return []

  const divisionIds = [...new Set(args.records.flatMap(record => record.divisionIds))]
  if (divisionIds.length === 0) return []

  const divisionToken = await getPublicationReadiness(args.currentDb, 'division', [
    args.activeSnapshot.divisionSnapshotId,
  ])
  const currentRecords =
    divisionToken !== null
      ? await guardPublicationRead(
          args.currentDb,
          'division',
          [args.activeSnapshot.divisionSnapshotId],
          divisionToken,
          () =>
            listDivisionRecordsCurrentByIds(args.currentDb, {
              snapshotId: args.activeSnapshot.divisionSnapshotId,
              divisionIds,
              localeSelection: args.routeState.localeSelection,
            }),
        )
      : null
  if (!currentRecords && args.historyDbsByBinding) {
    const plan = await resolveSnapshotReplayPlan(
      args.metaDb as never,
      args.activeSnapshot.divisionSnapshotId,
    )
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
      divisionIds,
    )
    const records = await listReplayedDivisionRecords(
      versions.values() as never,
      args.activeSnapshot.divisionSnapshotId,
      args.routeState.localeSelection,
    )
    return records
      .filter(record => divisionIds.includes(record.division.id))
      .map(record =>
        createIncludedDivisionResource({
          baseUrl: args.baseUrl,
          requestedVersionPath: 'divisions/v0.1',
          profile: args.routeState.profile as DivisionProfile,
          localeSelection: args.routeState.localeSelection,
          record,
        }),
      )
  }

  if (!currentRecords)
    throw new PublicationReadUnavailableError(
      'The selected Place divisions are not ready',
    )
  return currentRecords.map(record =>
    createIncludedDivisionResource({
      baseUrl: args.baseUrl,
      requestedVersionPath: 'divisions/v0.1',
      profile: args.routeState.profile as DivisionProfile,
      localeSelection: args.routeState.localeSelection,
      record,
    }),
  )
}

export async function listPlaces(args: {
  currentDb: AppEnv['Variables']['currentDb']
  historyDbsByBinding?: AppEnv['Variables']['historyDbsByBinding']
  metaDb: AppEnv['Variables']['metaDb']
  requestUrl: string
  region: 'hk' | 'mo'
  requestedVersionPath: RequestedPlaceVersion
  requestedApiVersion: RequestedPlaceApiVersion
  resolvedApiVersion: ResolvedPlaceApiVersion
  query: PlaceListQuery
  onResolved?: (attribution: AccessAttribution) => void
}): Promise<PlaceListResult> {
  const routeState = buildPlaceRouteState({
    requestedVersionPath: args.requestedVersionPath,
    requestedApiVersion: args.requestedApiVersion,
    resolvedApiVersion: args.resolvedApiVersion,
    profile: args.query.profile,
    locales: args.query.locales,
  })
  const activeSnapshot = await getActivePlaceSnapshot(
    args.metaDb,
    args.region,
    args.query,
  )
  if (!activeSnapshot) {
    return { status: 503, body: buildSnapshotNotReadyResponse('place') }
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
    ...(args.query['filter[basicCategory]']
      ? { basicCategory: args.query['filter[basicCategory]'] }
      : {}),
    ...(args.query['filter[taxonomyPrimary]']
      ? { taxonomyPrimary: args.query['filter[taxonomyPrimary]'] }
      : {}),
    ...(args.query['filter[operatingStatus]']
      ? { operatingStatus: args.query['filter[operatingStatus]'] }
      : {}),
    ...(args.query['filter[division]']
      ? { division: args.query['filter[division]'] }
      : {}),
  } satisfies PlaceFilters
  const lookup = {
    snapshotId: activeSnapshot.snapshotId,
    limit,
    offset,
    basicCategory: filters.basicCategory,
    taxonomyPrimary: filters.taxonomyPrimary,
    operatingStatus: filters.operatingStatus,
    divisionId: filters.division,
    localeSelection: routeState.localeSelection,
  }
  let records: PlaceRecord[]
  let total: number | undefined
  let hasMore: boolean | undefined
  const publicationToken = await getPublicationReadiness(args.currentDb, 'place', [
    activeSnapshot.snapshotId,
  ])
  const useHistory = publicationToken === null
  if (useHistory) {
    const latest = hasHistoricalSelectors(args.query)
      ? await getActivePlaceSnapshot(args.metaDb, args.region, {})
      : null
    if (
      !args.historyDbsByBinding ||
      !latest ||
      latest.apiReleaseSet === activeSnapshot.apiReleaseSet
    )
      return {
        status: 503,
        publicationPending: true,
        body: buildSnapshotNotReadyResponse('place'),
      }
  }
  return (
    (await guardPublicationRead(
      args.currentDb,
      'place',
      [activeSnapshot.snapshotId],
      publicationToken,
      async (): Promise<PlaceListResult> => {
        if (useHistory && args.historyDbsByBinding) {
          const historyDbsByBinding = args.historyDbsByBinding
          const selected = await runWithD1ReadRetry(() =>
            listReplayedPlacePage({
              ...lookup,
              divisionSnapshotId: activeSnapshot.divisionSnapshotId,
              historyDbsByBinding,
              localeSelection: routeState.localeSelection,
              metaDb: args.metaDb,
              snapshotId: activeSnapshot.snapshotId,
            }),
          )
          hasMore = selected.hasMore
          records = selected.records
        } else {
          ;[records, total] = await runWithD1ReadRetry(() =>
            Promise.all([
              listPlaceRecordsCurrent(args.currentDb, lookup),
              countPlaceRecordsCurrent(args.currentDb, {
                snapshotId: activeSnapshot.snapshotId,
                basicCategory: filters.basicCategory,
                taxonomyPrimary: filters.taxonomyPrimary,
                operatingStatus: filters.operatingStatus,
                divisionId: filters.division,
              }),
            ]),
          )
        }

        const url = new URL(args.requestUrl)
        const included = await runWithD1ReadRetry(() =>
          loadIncludedDivisions({
            currentDb: args.currentDb,
            historyDbsByBinding: args.historyDbsByBinding,
            metaDb: args.metaDb,
            activeSnapshot,
            records,
            routeState,
            include: args.query.include,
            baseUrl: url.origin,
          }),
        )
        return {
          status: 200,
          body: buildJsonApiListDocument({
            url,
            data: records.map(record =>
              createPlaceResource({
                baseUrl: url.origin,
                record: useHistory
                  ? record
                  : {
                      ...record,
                      place: withPlacePublication(
                        record.place,
                        activeSnapshot.cohortKey,
                      ),
                    },
                routeState,
              }),
            ),
            included,
            limit,
            offset,
            total,
            hasMore,
            meta: {
              ...buildApiVersionMetadata({
                requestedApiVersion: routeState.requestedApiVersion,
                requestedApiFamily: routeState.requestedApiFamily,
                resolvedApiVersion: routeState.resolvedApiVersion,
                apiReleaseSet: activeSnapshot.apiReleaseSet,
                schemaVersion: activeSnapshot.schemaVersion,
                rulesetVersion: activeSnapshot.rulesetVersion,
                profile: routeState.profile,
              }),
              apiCatalogRevision: activeSnapshot.apiCatalogRevision,
              catalogPublishedAt: activeSnapshot.catalogPublishedAt,
              cohort: activeSnapshot.cohortKey,
              domain: 'overture',
              region: args.region,
              profile: routeState.profile,
              locales: resolveApiMetaLocales(routeState.localeSelection),
              filters,
              page: {
                limit,
                offset,
                ...(total === undefined ? { hasMore } : { total }),
              },
            },
            permalink: buildPlacePermalink({
              url,
              region: args.region,
              routeState,
              activeSnapshot,
              limit,
              offset,
            }),
          }),
        }
      },
    )) ?? {
      status: 503,
      publicationPending: true,
      body: buildSnapshotNotReadyResponse('place'),
    }
  )
}
