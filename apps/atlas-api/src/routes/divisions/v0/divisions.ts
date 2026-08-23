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
} from '../../../schema'
import {
  getDivisionDetail,
  listDivisions,
  type RequestedDivisionApiVersion,
  type RequestedDivisionVersion,
  type ResolvedDivisionApiVersion,
} from '../../../handlers/divisions/v0'
import { openApiText } from '../../../lib/openapi-i18n'
import type { AppEnv } from '../../../types'
import { sanitiseResponseUrl } from '../../../lib/api'

const ROUTE_VARIANTS = [
  {
    requestedVersionPath: 'divisions/v0' as const,
    requestedApiVersion: '0.1' as const,
    resolvedApiVersion: 'api-divisions-v0.1' as const,
    listPath: '/divisions/v0',
    detailPath: '/divisions/v0/{id}',
    listOperationId: 'listDivisionsV0',
    detailOperationId: 'getDivisionByIdV0',
  },
  {
    requestedVersionPath: 'divisions/v0.1' as const,
    requestedApiVersion: '0.1' as const,
    resolvedApiVersion: 'api-divisions-v0.1' as const,
    listPath: '/divisions/v0.1',
    detailPath: '/divisions/v0.1/{id}',
    listOperationId: 'listDivisionsV01',
    detailOperationId: 'getDivisionByIdV01',
  },
] as const satisfies Array<{
  requestedVersionPath: RequestedDivisionVersion
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
        description: openApiText('openapi_divisions_list_response_description'),
      },
      503: {
        content: {
          'application/json': {
            schema: DivisionSnapshotNotReadyErrorResponseSchema,
          },
        },
        description: openApiText('openapi_divisions_snapshot_not_ready_description'),
      },
      409: {
        content: {
          'application/json': {
            schema: ErrorResponseSchema,
          },
        },
        description: openApiText('openapi_divisions_geometry_unavailable_description'),
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
        description: openApiText('openapi_divisions_get_response_description'),
      },
      404: {
        content: {
          'application/json': {
            schema: ErrorResponseSchema,
          },
        },
        description: openApiText('openapi_divisions_not_found_description'),
      },
      409: {
        content: {
          'application/json': {
            schema: ErrorResponseSchema,
          },
        },
        description: openApiText('openapi_divisions_geometry_unavailable_description'),
      },
      503: {
        content: {
          'application/json': {
            schema: DivisionSnapshotNotReadyErrorResponseSchema,
          },
        },
        description: openApiText('openapi_divisions_snapshot_not_ready_description'),
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
          historyDbsByBinding: c.var.historyDbsByBinding,
          metaDb: c.var.metaDb,
          requestUrl: sanitiseResponseUrl(c.req.url).toString(),
          requestedVersionPath: routeVariant.requestedVersionPath,
          requestedApiVersion: routeVariant.requestedApiVersion,
          resolvedApiVersion: routeVariant.resolvedApiVersion,
          query: c.req.valid('query'),
          onResolved: attribution => c.set('accessAttribution', attribution),
        })

        if (result.status === 503) {
          return c.json(result.body, 503)
        }

        if (result.status === 409) {
          return c.json(result.body, 409)
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
          historyDbsByBinding: c.var.historyDbsByBinding,
          metaDb: c.var.metaDb,
          requestUrl: sanitiseResponseUrl(c.req.url).toString(),
          requestedVersionPath: routeVariant.requestedVersionPath,
          requestedApiVersion: routeVariant.requestedApiVersion,
          resolvedApiVersion: routeVariant.resolvedApiVersion,
          id,
          query: c.req.valid('query'),
          onResolved: attribution => c.set('accessAttribution', attribution),
        })

        if (result.status === 503) {
          return c.json(result.body, 503)
        }

        if (result.status === 409) {
          return c.json(result.body, 409)
        }

        if (result.status === 404) {
          return c.json(result.body, 404)
        }

        return c.json(result.body, 200)
      },
    }),
  ),
] as const
