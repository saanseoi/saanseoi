import { EmptyRegionCollectionSchema } from '../../../schema/region'
import {
  emptyRegionCollection,
  regionNotFound,
  isUnpublishedMacao,
} from '../../../lib/region'
import { resolveDataRegion } from '../../../schema/region'
import { derivePlaceReferenceName } from '@repo/core'
import { resolveActiveSnapshotForType } from '@repo/core/db/metaRegistry'
import { createRoute, defineOpenAPIRoute } from '@hono/zod-openapi'
import type { Context } from 'hono'

import {
  getPlaceCurrent,
  listPlaceDivisions,
  listPlaceI18n,
  listPlacesByH3Cell,
  searchPlacesFts,
} from '../../../db/places'
import { sanitiseResponseUrl } from '../../../lib/api'
import { runWithD1ReadRetry } from '../../../lib/d1'
import { openApiText } from '../../../lib/openapi-i18n'
import {
  ErrorResponseSchema,
  PlaceQuerySchema,
  PlaceResponseSchema,
  PlacesByCellParamsSchema,
  PlacesByCellQuerySchema,
  PlacesByCellResponseSchema,
  PlacesListQuerySchema,
  PlacesListResponseSchema,
  PlaceParamsSchema,
  SearchQuerySchema,
  SearchResponseSchema,
  ValidationErrorOpenAPIResponse,
} from '../../../schema'
import {
  resolveApiReleaseSetAccessAttributionForSnapshot,
  resolveOptionalApiReleaseSetAccessAttribution,
} from '../../../services/accessAnalytics'
import {
  listPlaces,
  type RequestedPlaceApiVersion,
  type RequestedPlaceVersion,
  type ResolvedPlaceApiVersion,
} from '../../../services/places'
import type { AppEnv } from '../../../types'

type PlaceCoordinates = { lat: number; lng: number }
type PlaceTaxonomy = {
  taxonomyPrimary: string | null
  taxonomyHierarchy: unknown
  taxonomyAlternates: unknown
}

type PlaceRouteVariant = {
  requestedVersionPath: RequestedPlaceVersion
  requestedApiVersion: RequestedPlaceApiVersion
  resolvedApiVersion: ResolvedPlaceApiVersion
  listPath: string
  detailPath: string
  byCellPath: string
  searchPath: string
  listOperationId: string
  detailOperationId: string
  byCellOperationId: string
  searchOperationId: string
}

const ROUTE_VARIANTS = [
  {
    requestedVersionPath: 'places/v0' as const,
    requestedApiVersion: '0.1' as const,
    resolvedApiVersion: 'api-places-v0.1' as const,
    listPath: '/places/v0',
    detailPath: '/places/v0/{id}',
    byCellPath: '/places/v0/by-cell/{h3Level}/{h3Cell}',
    searchPath: '/places/v0/search',
    listOperationId: 'listPlacesV0',
    detailOperationId: 'getPlaceByIdV0',
    byCellOperationId: 'listPlacesByH3CellV0',
    searchOperationId: 'searchPlacesV0',
  },
  {
    requestedVersionPath: 'places/v0.1' as const,
    requestedApiVersion: '0.1' as const,
    resolvedApiVersion: 'api-places-v0.1' as const,
    listPath: '/places/v0.1',
    detailPath: '/places/v0.1/{id}',
    byCellPath: '/places/v0.1/by-cell/{h3Level}/{h3Cell}',
    searchPath: '/places/v0.1/search',
    listOperationId: 'listPlacesV01',
    detailOperationId: 'getPlaceByIdV01',
    byCellOperationId: 'listPlacesByH3CellV01',
    searchOperationId: 'searchPlacesV01',
  },
] as const satisfies PlaceRouteVariant[]

export function placeGeometry({ lat, lng }: PlaceCoordinates) {
  return {
    type: 'Point' as const,
    coordinates: [lng, lat] as [number, number],
  }
}

export function toPlaceI18nApiRecord<T extends { provenance?: unknown }>(record: T) {
  const { provenance, ...rest } = record
  if (!provenance || typeof provenance !== 'object') {
    return { ...rest, provenance: null }
  }
  const value = provenance as Record<string, unknown>
  return {
    ...rest,
    provenance: {
      isMachineTranslated: stringArray(value.isMachineTranslated),
      isHumanVerified: stringArray(value.isHumanVerified),
      isLocaleInferred: value.isLocaleInferred === true,
    },
  }
}

type PlaceApiRecord<T extends PlaceTaxonomy> = Omit<
  T,
  | 'lat'
  | 'lng'
  | 'taxonomyPrimary'
  | 'taxonomyHierarchy'
  | 'taxonomyAlternates'
  | 'addresses'
> & {
  taxonomy: {
    primary: T['taxonomyPrimary']
    hierarchy: T['taxonomyHierarchy']
    alternates: T['taxonomyAlternates']
  }
  geometry: ReturnType<typeof placeGeometry>
}

export function toPlaceApiRecord<
  T extends PlaceCoordinates & PlaceTaxonomy & { addresses?: unknown },
>(
  record: T,
  referenceName: string | null,
): PlaceApiRecord<T> & {
  referenceName: string | null
}
export function toPlaceApiRecord<
  T extends PlaceCoordinates & PlaceTaxonomy & { addresses?: unknown },
>(record: T): PlaceApiRecord<T>
export function toPlaceApiRecord<
  T extends PlaceCoordinates & PlaceTaxonomy & { addresses?: unknown },
>(
  record: T,
  referenceName?: string | null,
): PlaceApiRecord<T> & {
  referenceName?: string | null
} {
  const {
    lat,
    lng,
    taxonomyPrimary,
    taxonomyHierarchy,
    taxonomyAlternates,
    addresses: _addresses,
    ...rest
  } = record
  const projected = {
    ...rest,
    taxonomy: {
      primary: taxonomyPrimary,
      hierarchy: taxonomyHierarchy,
      alternates: taxonomyAlternates,
    },
    geometry: placeGeometry({ lat, lng }),
  }
  return referenceName === undefined
    ? projected
    : { ...projected, referenceName: referenceName ?? null }
}

const placeListRouteConfigs = ROUTE_VARIANTS.map(routeVariant =>
  createRoute({
    method: 'get',
    path: routeVariant.listPath,
    operationId: routeVariant.listOperationId,
    tags: ['Places'],
    request: {
      query: PlacesListQuerySchema,
    },
    responses: {
      200: {
        content: {
          'application/json': {
            schema: PlacesListResponseSchema.or(EmptyRegionCollectionSchema),
          },
        },
        description: openApiText('openapi_places_list_response_description'),
      },
      503: {
        content: { 'application/json': { schema: ErrorResponseSchema } },
        description: openApiText('openapi_places_snapshot_not_ready_description'),
      },
      422: ValidationErrorOpenAPIResponse,
    },
  }),
)

const placeDetailRouteConfigs = ROUTE_VARIANTS.map(routeVariant =>
  createRoute({
    method: 'get',
    path: routeVariant.detailPath,
    operationId: routeVariant.detailOperationId,
    tags: ['Places'],
    request: {
      params: PlaceParamsSchema,
      query: PlaceQuerySchema,
    },
    responses: {
      200: {
        content: { 'application/json': { schema: PlaceResponseSchema } },
        description: openApiText('openapi_places_get_response_description'),
      },
      404: {
        content: { 'application/json': { schema: ErrorResponseSchema } },
        description: openApiText('openapi_places_not_found_description'),
      },
      503: {
        content: { 'application/json': { schema: ErrorResponseSchema } },
        description: openApiText('openapi_places_snapshot_not_ready_description'),
      },
      422: ValidationErrorOpenAPIResponse,
    },
  }),
)

const placesByCellRouteConfigs = ROUTE_VARIANTS.map(routeVariant =>
  createRoute({
    method: 'get',
    path: routeVariant.byCellPath,
    operationId: routeVariant.byCellOperationId,
    tags: ['Places'],
    request: {
      params: PlacesByCellParamsSchema,
      query: PlacesByCellQuerySchema,
    },
    responses: {
      200: {
        content: { 'application/json': { schema: PlacesByCellResponseSchema } },
        description: openApiText('openapi_places_list_by_h3_response_description'),
      },
      400: {
        content: { 'application/json': { schema: ErrorResponseSchema } },
        description: openApiText('openapi_places_invalid_h3_level_description'),
      },
      503: {
        content: { 'application/json': { schema: ErrorResponseSchema } },
        description: openApiText('openapi_places_snapshot_not_ready_description'),
      },
      422: ValidationErrorOpenAPIResponse,
    },
  }),
)

const searchRouteConfigs = ROUTE_VARIANTS.map(routeVariant =>
  createRoute({
    method: 'get',
    path: routeVariant.searchPath,
    operationId: routeVariant.searchOperationId,
    tags: ['Places'],
    request: {
      query: SearchQuerySchema,
    },
    responses: {
      200: {
        content: { 'application/json': { schema: SearchResponseSchema } },
        description: openApiText('openapi_places_search_response_description'),
      },
      503: {
        content: {
          'application/json': {
            schema: ErrorResponseSchema,
            examples: {
              snapshotNotReady: {
                value: {
                  httpStatus: 503,
                  error: 'snapshot_not_ready',
                  message: 'No active place snapshot is published.',
                },
              },
              ftsNotReady: {
                value: {
                  httpStatus: 503,
                  error: 'fts_not_ready',
                  message:
                    'FTS index is not initialised. Rebuild placesFts before using search.',
                },
              },
            },
          },
        },
        description: openApiText('openapi_places_search_unavailable_description'),
      },
      422: ValidationErrorOpenAPIResponse,
    },
  }),
)

async function activePlaceSnapshot(c: Context<AppEnv>, regionCode: 'hk' | 'mo') {
  return runWithD1ReadRetry(() =>
    resolveActiveSnapshotForType(c.var.metaDb as never, 'place', {
      domainCode: 'place',
      regionCode,
    }),
  )
}

async function setActiveSnapshotAttribution(c: Context<AppEnv>, snapshotId: string) {
  const accessAttribution = await resolveOptionalApiReleaseSetAccessAttribution(() =>
    resolveApiReleaseSetAccessAttributionForSnapshot(c.var.metaDb.$client, snapshotId),
  )
  if (accessAttribution) c.set('accessAttribution', accessAttribution)
}

async function handlePlaceDetail(
  c: Context<AppEnv>,
  args: { regionCode: 'hk' | 'mo'; placeId: string; locale?: string },
) {
  const activeSnapshot = await activePlaceSnapshot(c, args.regionCode)
  if (!activeSnapshot && args.regionCode === 'mo') return c.json(regionNotFound(), 404)
  if (!activeSnapshot) {
    return c.json(
      {
        httpStatus: 503 as const,
        error: 'snapshot_not_ready',
        message: 'No active place snapshot is published.',
      },
      503,
    )
  }
  await setActiveSnapshotAttribution(c, activeSnapshot.snapshotId)

  const place = await runWithD1ReadRetry(() =>
    getPlaceCurrent(c.var.currentDb, {
      placeId: args.placeId,
      snapshotId: activeSnapshot.snapshotId,
    }),
  )
  if (!place) {
    return c.json(
      {
        httpStatus: 404,
        error: 'not_found',
        message: `No place found for ${args.regionCode}/${args.placeId}.`,
      },
      404,
    )
  }

  const [i18n, divisions] = await runWithD1ReadRetry(() =>
    Promise.all([
      listPlaceI18n(c.var.currentDb, {
        placeId: args.placeId,
        snapshotId: activeSnapshot.snapshotId,
        locale: args.locale,
      }),
      listPlaceDivisions(c.var.currentDb, {
        placeId: args.placeId,
        snapshotId: activeSnapshot.snapshotId,
        locale: args.locale,
      }),
    ]),
  )
  return c.json(
    {
      place: toPlaceApiRecord(place, derivePlaceReferenceName(i18n)),
      i18n: i18n.map(toPlaceI18nApiRecord),
      divisions,
    },
    200,
  )
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : []
}

async function handlePlacesByCell(
  c: Context<AppEnv>,
  args: { region: 'hk' | 'mo'; h3Level: string; h3Cell: string; limit?: number },
) {
  const h3Level = Number(args.h3Level)
  if (!Number.isInteger(h3Level)) {
    return c.json(
      {
        httpStatus: 400,
        error: 'invalid_h3_level',
        message: 'h3Level must be an integer.',
      },
      400,
    )
  }

  const activeSnapshot = await activePlaceSnapshot(c, args.region)
  if (!activeSnapshot && args.region === 'mo') return c.json({ places: [] }, 200)
  if (!activeSnapshot) {
    return c.json(
      {
        httpStatus: 503,
        error: 'snapshot_not_ready',
        message: 'No active place snapshot is published.',
      },
      503,
    )
  }
  await setActiveSnapshotAttribution(c, activeSnapshot.snapshotId)
  const places = await runWithD1ReadRetry(() =>
    listPlacesByH3Cell(c.var.currentDb, {
      snapshotId: activeSnapshot.snapshotId,
      h3Level,
      h3Cell: args.h3Cell,
      limit: args.limit,
    }),
  )
  return c.json({ places: places.map(place => toPlaceApiRecord(place)) }, 200)
}

async function handlePlaceSearch(
  c: Context<AppEnv>,
  args: { region: 'hk' | 'mo'; q: string; locale?: string; limit?: number },
) {
  const activeSnapshot = await activePlaceSnapshot(c, args.region)
  if (!activeSnapshot && args.region === 'mo') return c.json({ results: [] }, 200)
  if (!activeSnapshot) {
    return c.json(
      {
        httpStatus: 503,
        error: 'snapshot_not_ready',
        message: 'No active place snapshot is published.',
      },
      503,
    )
  }
  await setActiveSnapshotAttribution(c, activeSnapshot.snapshotId)

  try {
    const results = await runWithD1ReadRetry(() =>
      searchPlacesFts(c.var.currentDb, {
        snapshotId: activeSnapshot.snapshotId,
        locale: args.locale,
        query: args.q,
        limit: args.limit,
      }),
    )
    return c.json({ results }, 200)
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes('FTS index is not initialised')
    ) {
      return c.json(
        {
          httpStatus: 503,
          error: 'fts_not_ready',
          message:
            'FTS index is not initialised. Rebuild placesFts before using search.',
        },
        503,
      )
    }
    throw error
  }
}

export const placeRoutes = [
  ...placeListRouteConfigs.map((routeConfig, index) =>
    defineOpenAPIRoute<typeof routeConfig, AppEnv>({
      route: routeConfig,
      handler: async c => {
        const routeVariant = ROUTE_VARIANTS[index] ?? ROUTE_VARIANTS[0]
        const region = resolveDataRegion(c.req.valid('query').region)
        const result = await listPlaces({
          currentDb: c.var.currentDb,
          historyDbsByBinding: c.var.historyDbsByBinding,
          metaDb: c.var.metaDb,
          requestUrl: sanitiseResponseUrl(c.req.url).toString(),
          region,
          requestedVersionPath: routeVariant.requestedVersionPath,
          requestedApiVersion: routeVariant.requestedApiVersion,
          resolvedApiVersion: routeVariant.resolvedApiVersion,
          query: c.req.valid('query'),
          onResolved: attribution => c.set('accessAttribution', attribution),
        })
        if (isUnpublishedMacao(c.req.valid('query').region, result))
          return c.json(emptyRegionCollection(c.req.url), 200)
        if (result.status === 503) return c.json(result.body, 503)
        return c.json(result.body as never, 200)
      },
    }),
  ),
  ...placesByCellRouteConfigs.map(routeConfig =>
    defineOpenAPIRoute<typeof routeConfig, AppEnv>({
      route: routeConfig,
      handler: c => {
        const params = c.req.valid('param')
        const query = c.req.valid('query')
        return handlePlacesByCell(c, {
          ...params,
          region: resolveDataRegion(query.region),
          limit: query.limit,
        })
      },
    }),
  ),
  ...searchRouteConfigs.map(routeConfig =>
    defineOpenAPIRoute<typeof routeConfig, AppEnv>({
      route: routeConfig,
      handler: c => {
        const query = c.req.valid('query')
        return handlePlaceSearch(c, {
          ...query,
          region: resolveDataRegion(query.region),
        })
      },
    }),
  ),
  ...placeDetailRouteConfigs.map(routeConfig =>
    defineOpenAPIRoute<typeof routeConfig, AppEnv>({
      route: routeConfig,
      handler: c => {
        const { id: placeId } = c.req.valid('param')
        const { locale, region } = c.req.valid('query')
        const regionCode = resolveDataRegion(region)
        return handlePlaceDetail(c, { regionCode, placeId, locale })
      },
    }),
  ),
] as const
