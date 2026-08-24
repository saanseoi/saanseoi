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
} from '../../../schema'
import {
  getAddressDetail,
  listAddresses,
  type RequestedAddressApiVersion,
  type RequestedAddressVersion,
  type ResolvedAddressApiVersion,
} from '../../../services/addresses'
import type { AppEnv } from '../../../types'
import { sanitiseResponseUrl } from '../../../lib/api'
import { openApiText } from '../../../lib/openapi-i18n'

const ROUTE_VARIANTS = [
  {
    requestedVersionPath: 'addresses/v0' as const,
    requestedApiVersion: '0.1' as const,
    resolvedApiVersion: 'api-addresses-v0.1' as const,
    listPath: '/addresses/v0',
    detailPath: '/addresses/v0/{id}',
    listOperationId: 'listAddressesV0',
    detailOperationId: 'getAddressByIdV0',
  },
  {
    requestedVersionPath: 'addresses/v0.1' as const,
    requestedApiVersion: '0.1' as const,
    resolvedApiVersion: 'api-addresses-v0.1' as const,
    listPath: '/addresses/v0.1',
    detailPath: '/addresses/v0.1/{id}',
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
        description: openApiText('openapi_addresses_list_response_description'),
      },
      503: {
        content: {
          'application/json': { schema: AddressSnapshotNotReadyErrorResponseSchema },
        },
        description: openApiText('openapi_addresses_snapshot_not_ready_description'),
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
        description: openApiText('openapi_addresses_get_response_description'),
      },
      404: {
        content: { 'application/json': { schema: ErrorResponseSchema } },
        description: openApiText('openapi_addresses_not_found_description'),
      },
      503: {
        content: {
          'application/json': { schema: AddressSnapshotNotReadyErrorResponseSchema },
        },
        description: openApiText('openapi_addresses_snapshot_not_ready_description'),
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
