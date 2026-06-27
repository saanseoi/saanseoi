import { createRoute, defineOpenAPIRoute } from '@hono/zod-openapi'
import { resolveActiveApiReleaseSet } from '@repo/db'

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

const LEGACY_DIVISION_CURRENT_RELEASE_SET_ID = 'legacy-current-divisions-v0.1'
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

    const place = await getPlaceCurrent(db, { regionCode, placeId })

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

    const divisionReleaseSet = await resolveActiveApiReleaseSet(
      c.var.metaDb,
      'ss-divisions-v0.1',
    )

    if (!divisionReleaseSet) {
      throw new Error('Active division release set not found.')
    }

    const [i18n, divisionRows] = await Promise.all([
      listPlaceI18n(db, { placeId, locale }),
      listPlaceDivisions(db, {
        placeId,
        locale,
        divisionApiReleaseSetId: divisionReleaseSet.apiReleaseSetId,
      }),
    ])
    const divisions =
      divisionRows.length > 0
        ? divisionRows
        : await listPlaceDivisions(db, {
            placeId,
            locale,
            divisionApiReleaseSetId: LEGACY_DIVISION_CURRENT_RELEASE_SET_ID,
          })

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
    const db = c.var.currentDb

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

    const places = await listPlacesByH3Cell(db, {
      regionCode: params.region,
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

    try {
      const results = await searchPlacesFts(db, {
        regionCode: region,
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
