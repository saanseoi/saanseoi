import { createRoute, defineOpenAPIRoute } from '@hono/zod-openapi'

import {
  AddressDetailParamsSchema,
  AddressDetailQuerySchema,
  AddressDetailResponseSchema,
  AddressSnapshotNotReadyErrorResponseSchema,
  AddressesListQuerySchema,
  AddressesListResponseSchema,
  ErrorResponseSchema,
  ValidationErrorOpenAPIResponse,
} from '../../schema'
import {
  getAddressDetail,
  listAddresses,
  type RequestedAddressApiVersion,
  type RequestedAddressVersion,
  type ResolvedAddressApiVersion,
} from '../../services/addresses'
import type { AppEnv } from '../../types'
import { sanitiseResponseUrl } from '../../lib/api'

const ROUTE_VARIANTS = [
  {
    requestedVersionPath: 'v0' as const,
    requestedApiVersion: '0.1' as const,
    resolvedApiVersion: 'api-addresses-v0.1' as const,
    listPath: '/v0/addresses',
    detailPath: '/v0/addresses/{id}',
    listOperationId: 'listAddressesV0',
    detailOperationId: 'getAddressByIdV0',
  },
  {
    requestedVersionPath: 'v0.1' as const,
    requestedApiVersion: '0.1' as const,
    resolvedApiVersion: 'api-addresses-v0.1' as const,
    listPath: '/v0.1/addresses',
    detailPath: '/v0.1/addresses/{id}',
    listOperationId: 'listAddressesV01',
    detailOperationId: 'getAddressByIdV01',
  },
] as const satisfies Array<{
  requestedVersionPath: RequestedAddressVersion
  requestedApiVersion: RequestedAddressApiVersion
  resolvedApiVersion: ResolvedAddressApiVersion
  listPath: string
  detailPath: string
  listOperationId: string
  detailOperationId: string
}>

const listRouteConfigs = ROUTE_VARIANTS.map(routeVariant =>
  createRoute({
    method: 'get',
    path: routeVariant.listPath,
    operationId: routeVariant.listOperationId,
    tags: ['Addresses'],
    request: { query: AddressesListQuerySchema },
    responses: {
      200: {
        content: { 'application/json': { schema: AddressesListResponseSchema } },
        description: 'List addresses.',
      },
      503: {
        content: {
          'application/json': { schema: AddressSnapshotNotReadyErrorResponseSchema },
        },
        description: 'Address snapshot is not ready.',
      },
      422: ValidationErrorOpenAPIResponse,
    },
  }),
)

const detailRouteConfigs = ROUTE_VARIANTS.map(routeVariant =>
  createRoute({
    method: 'get',
    path: routeVariant.detailPath,
    operationId: routeVariant.detailOperationId,
    tags: ['Addresses'],
    request: {
      params: AddressDetailParamsSchema,
      query: AddressDetailQuerySchema,
    },
    responses: {
      200: {
        content: { 'application/json': { schema: AddressDetailResponseSchema } },
        description: 'Get an address.',
      },
      404: {
        content: { 'application/json': { schema: ErrorResponseSchema } },
        description: 'Address not found.',
      },
      503: {
        content: {
          'application/json': { schema: AddressSnapshotNotReadyErrorResponseSchema },
        },
        description: 'Address snapshot is not ready.',
      },
      422: ValidationErrorOpenAPIResponse,
    },
  }),
)

export const addressRoutes = [
  ...listRouteConfigs.map((routeConfig, index) =>
    defineOpenAPIRoute<typeof routeConfig, AppEnv>({
      route: routeConfig,
      handler: async c => {
        const routeVariant = ROUTE_VARIANTS[index] ?? ROUTE_VARIANTS[0]
        const result = await listAddresses({
          currentDb: c.var.currentDb,
          metaDb: c.var.metaDb,
          requestUrl: sanitiseResponseUrl(c.req.url).toString(),
          requestedVersionPath: routeVariant.requestedVersionPath,
          requestedApiVersion: routeVariant.requestedApiVersion,
          resolvedApiVersion: routeVariant.resolvedApiVersion,
          query: c.req.valid('query'),
          onResolved: attribution => c.set('accessAttribution', attribution),
        })

        if (result.status === 503) return c.json(result.body, 503)
        return c.json(result.body, 200)
      },
    }),
  ),
  ...detailRouteConfigs.map((routeConfig, index) =>
    defineOpenAPIRoute<typeof routeConfig, AppEnv>({
      route: routeConfig,
      handler: async c => {
        const routeVariant = ROUTE_VARIANTS[index] ?? ROUTE_VARIANTS[0]
        const { id } = c.req.valid('param')
        const result = await getAddressDetail({
          currentDb: c.var.currentDb,
          metaDb: c.var.metaDb,
          requestUrl: sanitiseResponseUrl(c.req.url).toString(),
          requestedVersionPath: routeVariant.requestedVersionPath,
          requestedApiVersion: routeVariant.requestedApiVersion,
          resolvedApiVersion: routeVariant.resolvedApiVersion,
          id,
          query: c.req.valid('query'),
          onResolved: attribution => c.set('accessAttribution', attribution),
        })

        if (result.status === 503) return c.json(result.body, 503)
        if (result.status === 404) return c.json(result.body, 404)
        return c.json(result.body, 200)
      },
    }),
  ),
] as const
