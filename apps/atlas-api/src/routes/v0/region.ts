import { createRoute, defineOpenAPIRoute } from '@hono/zod-openapi'
import { resolveActiveSnapshotForType } from '@repo/core/db/meta-repository'

import {
  getPlaceCurrent,
  listPlaceDivisions,
  listPlaceI18n,
  listPlacesByH3Cell,
  searchPlacesFts,
} from '../../db/repositories'
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
} from '../../schema'
import type { AppEnv } from '../../types'
const placeRouteConfig = createRoute({
  method: 'get',
  path: '/v0/{region}/places/{id}',
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
      description: 'Get a place.',
    },
    404: {
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
      description: 'Place not found.',
    },
    503: {
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
      description: 'Place snapshot is not ready.',
    },
    422: ValidationErrorOpenAPIResponse,
  },
})

const placesByCellRouteConfig = createRoute({
  method: 'get',
  path: '/v0/{region}/places/by-cell/{h3Level}/{h3Cell}',
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
      description: 'List places by H3 cell.',
    },
    400: {
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
      description: 'Invalid H3 level.',
    },
    503: {
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
      description: 'Place snapshot is not ready.',
    },
    422: ValidationErrorOpenAPIResponse,
  },
})

const searchRouteConfig = createRoute({
  method: 'get',
  path: '/v0/{region}/search',
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
      description: 'Search places.',
    },
    503: {
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
      description: 'FTS index is not ready.',
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
    const activePlaceSnapshot = await resolveActiveSnapshotForType(
      c.var.metaDb,
      'place',
      'place',
    )

    if (!activePlaceSnapshot) {
      return c.json(
        {
          httpStatus: 503,
          error: 'snapshot_not_ready',
          message: 'No active place snapshot is published.',
        },
        503,
      )
    }

    const place = await getPlaceCurrent(db, {
      regionCode,
      placeId,
      snapshotId: activePlaceSnapshot.snapshotId,
    })

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

    const [i18n, divisions] = await Promise.all([
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
    ])

    return c.json(
      {
        place,
        i18n,
        divisions,
      },
      200,
    )
  },
})

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
    const activePlaceSnapshot = await resolveActiveSnapshotForType(
      c.var.metaDb,
      'place',
      'place',
    )

    if (!activePlaceSnapshot) {
      return c.json(
        {
          httpStatus: 503,
          error: 'snapshot_not_ready',
          message: 'No active place snapshot is published.',
        },
        503,
      )
    }

    const places = await listPlacesByH3Cell(db, {
      regionCode: params.region,
      snapshotId: activePlaceSnapshot.snapshotId,
      h3Level,
      h3Cell: params.h3Cell,
      limit: query.limit,
    })

    return c.json(
      {
        places,
      },
      200,
    )
  },
})

export const searchRoute = defineOpenAPIRoute<typeof searchRouteConfig, AppEnv>({
  route: searchRouteConfig,
  handler: async c => {
    const { region } = c.req.valid('param')
    const query = c.req.valid('query')
    const db = c.var.currentDb
    const activePlaceSnapshot = await resolveActiveSnapshotForType(
      c.var.metaDb,
      'place',
      'place',
    )

    if (!activePlaceSnapshot) {
      return c.json(
        {
          httpStatus: 503,
          error: 'snapshot_not_ready',
          message: 'No active place snapshot is published.',
        },
        503,
      )
    }

    try {
      const results = await searchPlacesFts(db, {
        regionCode: region,
        snapshotId: activePlaceSnapshot.snapshotId,
        locale: query.locale,
        query: query.q,
        limit: query.limit,
      })

      return c.json(
        {
          results,
        },
        200,
      )
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes('FTS index is not initialized')
      ) {
        return c.json(
          {
            httpStatus: 503,
            error: 'fts_not_ready',
            message: error.message,
          },
          503,
        )
      }

      throw error
    }
  },
})

export const regionRoutes = [placeRoute, placesByCellRoute, searchRoute] as const
