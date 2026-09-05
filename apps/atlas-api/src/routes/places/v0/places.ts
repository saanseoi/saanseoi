import { createRoute, defineOpenAPIRoute } from '@hono/zod-openapi'
import { resolveActiveSnapshotForType } from '@repo/core/db/metaRegistry'

import {
  getPlaceCurrent,
  listPlaceDivisions,
  listPlaceI18n,
  listPlacesByH3Cell,
  searchPlacesFts,
} from '../../../db/places'
import {
  ErrorResponseSchema,
  PlaceQuerySchema,
  PlaceResponseSchema,
  PlacesByCellParamsSchema,
  PlacesByCellQuerySchema,
  PlacesByCellResponseSchema,
  RegionPlaceParamsSchema,
  SearchParamsSchema,
  SearchQuerySchema,
  SearchResponseSchema,
  ValidationErrorOpenAPIResponse,
} from '../../../schema'
import { runWithD1ReadRetry } from '../../../lib/d1'
import {
  resolveApiReleaseSetAccessAttributionForSnapshot,
  resolveOptionalApiReleaseSetAccessAttribution,
} from '../../../services/accessAnalytics'
import type { AppEnv } from '../../../types'
import { openApiText } from '../../../lib/openapi-i18n'
import { derivePlaceReferenceName } from '@repo/core'

type PlaceCoordinates = { lat: number; lng: number }
type PlaceTaxonomy = {
  taxonomyPrimary: string | null
  taxonomyHierarchy: unknown
  taxonomyAlternates: unknown
}

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

const placeRouteConfig = createRoute({
  method: 'get',
  path: '/places/v0.1/{region}/{id}',
  tags: ['Places'],
  request: {
    params: RegionPlaceParamsSchema,
    query: PlaceQuerySchema,
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: PlaceResponseSchema,
        },
      },
      description: openApiText('openapi_places_get_response_description'),
    },
    404: {
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
      description: openApiText('openapi_places_not_found_description'),
    },
    503: {
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
      description: openApiText('openapi_places_snapshot_not_ready_description'),
    },
    422: ValidationErrorOpenAPIResponse,
  },
})

const placesByCellRouteConfig = createRoute({
  method: 'get',
  path: '/places/v0.1/{region}/by-cell/{h3Level}/{h3Cell}',
  tags: ['Places'],
  request: {
    params: PlacesByCellParamsSchema,
    query: PlacesByCellQuerySchema,
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: PlacesByCellResponseSchema,
        },
      },
      description: openApiText('openapi_places_list_by_h3_response_description'),
    },
    400: {
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
      description: openApiText('openapi_places_invalid_h3_level_description'),
    },
    503: {
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
      description: openApiText('openapi_places_snapshot_not_ready_description'),
    },
    422: ValidationErrorOpenAPIResponse,
  },
})

const searchRouteConfig = createRoute({
  method: 'get',
  path: '/places/v0.1/{region}/search',
  tags: ['Places'],
  request: {
    params: SearchParamsSchema,
    query: SearchQuerySchema,
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: SearchResponseSchema,
        },
      },
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
})

export const placeRoute = defineOpenAPIRoute<typeof placeRouteConfig, AppEnv>({
  route: placeRouteConfig,
  handler: async c => {
    const { region: regionCode, id: placeId } = c.req.valid('param')
    const { locale } = c.req.valid('query')
    const db = c.var.currentDb
    const activePlaceSnapshot = await runWithD1ReadRetry(() =>
      resolveActiveSnapshotForType(c.var.metaDb as never, 'place', 'place', {
        regionCode,
      }),
    )

    if (!activePlaceSnapshot) {
      return c.json(
        {
          httpStatus: 503 as const,
          error: 'snapshot_not_ready',
          message: 'No active place snapshot is published.',
        },
        503,
      )
    }
    const accessAttribution = await resolveOptionalApiReleaseSetAccessAttribution(() =>
      resolveApiReleaseSetAccessAttributionForSnapshot(
        c.var.metaDb.$client,
        activePlaceSnapshot.snapshotId,
      ),
    )
    if (accessAttribution) c.set('accessAttribution', accessAttribution)

    const place = await runWithD1ReadRetry(() =>
      getPlaceCurrent(db, {
        placeId,
        snapshotId: activePlaceSnapshot.snapshotId,
      }),
    )

    if (!place) {
      return c.json(
        {
          httpStatus: 404,
          error: 'not_found',
          message: `No place found for ${regionCode}/${placeId}.`,
        },
        404,
      )
    }

    const [i18n, divisions] = await runWithD1ReadRetry(() =>
      Promise.all([
        listPlaceI18n(db, {
          placeId,
          snapshotId: activePlaceSnapshot.snapshotId,
          locale,
        }),
        listPlaceDivisions(db, {
          placeId,
          snapshotId: activePlaceSnapshot.snapshotId,
          locale,
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
  },
})

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : []
}

export const placesByCellRoute = defineOpenAPIRoute<
  typeof placesByCellRouteConfig,
  AppEnv
>({
  route: placesByCellRouteConfig,
  handler: async c => {
    const params = c.req.valid('param')
    const query = c.req.valid('query')
    const h3Level = Number(params.h3Level)

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

    const db = c.var.currentDb
    const activePlaceSnapshot = await runWithD1ReadRetry(() =>
      resolveActiveSnapshotForType(c.var.metaDb as never, 'place', 'place', {
        regionCode: params.region,
      }),
    )

    if (!activePlaceSnapshot) {
      const response = {
        httpStatus: 503,
        error: 'snapshot_not_ready',
        message: 'No active place snapshot is published.',
      } as const

      return c.json(response, 503)
    }
    const accessAttribution = await resolveOptionalApiReleaseSetAccessAttribution(() =>
      resolveApiReleaseSetAccessAttributionForSnapshot(
        c.var.metaDb.$client,
        activePlaceSnapshot.snapshotId,
      ),
    )
    if (accessAttribution) c.set('accessAttribution', accessAttribution)

    const places = await runWithD1ReadRetry(() =>
      listPlacesByH3Cell(db, {
        snapshotId: activePlaceSnapshot.snapshotId,
        h3Level,
        h3Cell: params.h3Cell,
        limit: query.limit,
      }),
    )

    return c.json(
      {
        places: places.map(place => toPlaceApiRecord(place)),
      },
      200,
    )
  },
})

export const searchRoute = defineOpenAPIRoute<typeof searchRouteConfig, AppEnv>({
  route: searchRouteConfig,
  handler: async c => {
    const params = c.req.valid('param')
    const query = c.req.valid('query')
    const db = c.var.currentDb
    const activePlaceSnapshot = await runWithD1ReadRetry(() =>
      resolveActiveSnapshotForType(c.var.metaDb as never, 'place', 'place', {
        regionCode: params.region,
      }),
    )

    if (!activePlaceSnapshot) {
      const response = {
        httpStatus: 503,
        error: 'snapshot_not_ready',
        message: 'No active place snapshot is published.',
      } as const

      return c.json(response, 503)
    }
    const accessAttribution = await resolveOptionalApiReleaseSetAccessAttribution(() =>
      resolveApiReleaseSetAccessAttributionForSnapshot(
        c.var.metaDb.$client,
        activePlaceSnapshot.snapshotId,
      ),
    )
    if (accessAttribution) c.set('accessAttribution', accessAttribution)

    try {
      const results = await runWithD1ReadRetry(() =>
        searchPlacesFts(db, {
          snapshotId: activePlaceSnapshot.snapshotId,
          locale: query.locale,
          query: query.q,
          limit: query.limit,
        }),
      )

      return c.json(
        {
          results,
        },
        200,
      )
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes('FTS index is not initialised')
      ) {
        const response = {
          httpStatus: 503,
          error: 'fts_not_ready',
          message:
            'FTS index is not initialised. Rebuild placesFts before using search.',
        } as const

        return c.json(response, 503)
      }

      throw error
    }
  },
})

export const placeRoutes = [placesByCellRoute, searchRoute, placeRoute] as const
