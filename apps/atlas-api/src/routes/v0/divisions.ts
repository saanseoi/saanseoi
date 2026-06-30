import { createRoute, defineOpenAPIRoute } from '@hono/zod-openapi'

import {
  DivisionDetailParamsSchema,
  DivisionDetailQuerySchema,
  DivisionDetailResponseSchema,
  DivisionsListQuerySchema,
  DivisionsListResponseSchema,
  DivisionSnapshotNotReadyErrorResponseSchema,
  ErrorResponseSchema,
  ValidationErrorOpenAPIResponse,
} from '../../schema'
import {
  getDivisionDetail,
  listDivisions,
  type RequestedDivisionApiVersion,
  type RequestedDivisionVersion,
  type ResolvedDivisionApiVersion,
} from '../../services/divisions'
import type { AppEnv } from '../../types'

const ROUTE_VARIANTS = [
  {
    requestVersionPath: 'v0' as const,
    requestedApiVersion: '0.1' as const,
    resolvedApiVersion: 'api-divisions-v0.1' as const,
    listPath: '/v0/divisions',
    detailPath: '/v0/divisions/{id}',
    listOperationId: 'listDivisionsV0',
    detailOperationId: 'getDivisionByIdV0',
  },
  {
    requestVersionPath: 'v0.1' as const,
    requestedApiVersion: '0.1' as const,
    resolvedApiVersion: 'api-divisions-v0.1' as const,
    listPath: '/v0.1/divisions',
    detailPath: '/v0.1/divisions/{id}',
    listOperationId: 'listDivisionsV01',
    detailOperationId: 'getDivisionByIdV01',
  },
] as const satisfies Array<{
  requestVersionPath: RequestedDivisionVersion
  requestedApiVersion: RequestedDivisionApiVersion
  resolvedApiVersion: ResolvedDivisionApiVersion
  listPath: string
  detailPath: string
  listOperationId: string
  detailOperationId: string
}>

const divisionListRouteConfigs = ROUTE_VARIANTS.map(routeVariant =>
  createRoute({
    method: 'get',
    path: routeVariant.listPath,
    operationId: routeVariant.listOperationId,
    tags: ['Divisions'],
    request: {
      query: DivisionsListQuerySchema,
    },
    responses: {
      200: {
        content: {
          'application/json': {
            schema: DivisionsListResponseSchema,
          },
        },
        description: 'List divisions.',
      },
      503: {
        content: {
          'application/json': {
            schema: DivisionSnapshotNotReadyErrorResponseSchema,
          },
        },
        description: 'Division snapshot is not ready.',
      },
      422: ValidationErrorOpenAPIResponse,
    },
  }),
)

const divisionDetailRouteConfigs = ROUTE_VARIANTS.map(routeVariant =>
  createRoute({
    method: 'get',
    path: routeVariant.detailPath,
    operationId: routeVariant.detailOperationId,
    tags: ['Divisions'],
    request: {
      params: DivisionDetailParamsSchema,
      query: DivisionDetailQuerySchema,
    },
    responses: {
      200: {
        content: {
          'application/json': {
            schema: DivisionDetailResponseSchema,
          },
        },
        description: 'Get a division.',
      },
      404: {
        content: {
          'application/json': {
            schema: ErrorResponseSchema,
          },
        },
        description: 'Division not found.',
      },
      503: {
        content: {
          'application/json': {
            schema: DivisionSnapshotNotReadyErrorResponseSchema,
          },
        },
        description: 'Division snapshot is not ready.',
      },
      422: ValidationErrorOpenAPIResponse,
    },
  }),
)

export const divisionRoutes = [
  ...divisionListRouteConfigs.map((routeConfig, index) =>
    defineOpenAPIRoute<typeof routeConfig, AppEnv>({
      route: routeConfig,
      handler: async c => {
        const routeVariant = ROUTE_VARIANTS[index] ?? ROUTE_VARIANTS[0]
        const result = await listDivisions({
          currentDb: c.var.currentDb,
          metaDb: c.var.metaDb,
          requestUrl: c.req.url,
          requestVersionPath: routeVariant.requestVersionPath,
          requestedApiVersion: routeVariant.requestedApiVersion,
          resolvedApiVersion: routeVariant.resolvedApiVersion,
          query: c.req.valid('query'),
        })

        if (result.status === 503) {
          return c.json(result.body, 503)
        }

        return c.json(result.body, 200)
      },
    }),
  ),
  ...divisionDetailRouteConfigs.map((routeConfig, index) =>
    defineOpenAPIRoute<typeof routeConfig, AppEnv>({
      route: routeConfig,
      handler: async c => {
        const routeVariant = ROUTE_VARIANTS[index] ?? ROUTE_VARIANTS[0]
        const { id } = c.req.valid('param')
        const result = await getDivisionDetail({
          currentDb: c.var.currentDb,
          metaDb: c.var.metaDb,
          requestUrl: c.req.url,
          requestVersionPath: routeVariant.requestVersionPath,
          requestedApiVersion: routeVariant.requestedApiVersion,
          resolvedApiVersion: routeVariant.resolvedApiVersion,
          id,
          query: c.req.valid('query'),
        })

        if (result.status === 503) {
          return c.json(result.body, 503)
        }

        if (result.status === 404) {
          return c.json(result.body, 404)
        }

        return c.json(result.body, 200)
      },
    }),
  ),
] as const
