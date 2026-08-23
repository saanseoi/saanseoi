import { createRoute, defineOpenAPIRoute, z } from '@hono/zod-openapi'

import {
  getRegistryApi,
  getRegistryApiField,
  getRegistryEndpoint,
  getRegistryRelease,
  getRegistrySource,
  getRegistrySourcePublisher,
  getRegistrySourceVersion,
  listRegistryApiFields,
  listRegistryApis,
  listRegistryEndpoints,
  listRegistryReleases,
  listRegistrySourcePublishers,
  listRegistrySources,
  listRegistrySourceVersions,
} from '@repo/core/db/metaRegistry'
import { ErrorResponseSchema, ValidationErrorOpenAPIResponse } from '../../schema'
import { openApiText } from '../../lib/openapi-i18n'
import type { AppEnv } from '../../types'

const RegistryListQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(200).optional(),
  })
  .openapi('RegistryListQuery')

const RegistryDetailParamsSchema = z
  .object({
    id: z.string().min(1),
  })
  .openapi('RegistryDetailParams')

const RegistryListResponseSchema = z
  .object({
    data: z.array(z.object({}).loose()),
  })
  .openapi('RegistryListResponse')

const RegistryDetailResponseSchema = z
  .object({
    data: z.object({}).loose(),
  })
  .openapi('RegistryDetailResponse')

type RegistryResource = {
  publicName: string
  responseLabelKey: Parameters<typeof openApiText>[0]
  tag: string
  listOperationId: string
  detailOperationId: string
  list: (db: AppEnv['Variables']['metaDb'], limit?: number) => Promise<unknown[]>
  detail: (db: AppEnv['Variables']['metaDb'], id: string) => Promise<unknown | null>
}

const REGISTRY_RESOURCES = [
  {
    publicName: 'families',
    responseLabelKey: 'openapi_registry_resource_families',
    tag: 'API Families',
    listOperationId: 'listRegistryApis',
    detailOperationId: 'getRegistryApi',
    list: listRegistryApis,
    detail: getRegistryApi,
  },
  {
    publicName: 'releases',
    responseLabelKey: 'openapi_registry_resource_releases',
    tag: 'API Releases',
    listOperationId: 'listRegistryReleases',
    detailOperationId: 'getRegistryRelease',
    list: listRegistryReleases,
    detail: getRegistryRelease,
  },
  {
    publicName: 'fields',
    responseLabelKey: 'openapi_registry_resource_fields',
    tag: 'API Fields',
    listOperationId: 'listRegistryApiFields',
    detailOperationId: 'getRegistryApiField',
    list: listRegistryApiFields,
    detail: getRegistryApiField,
  },
  {
    publicName: 'endpoints',
    responseLabelKey: 'openapi_registry_resource_endpoints',
    tag: 'API Endpoints',
    listOperationId: 'listRegistryEndpoints',
    detailOperationId: 'getRegistryEndpoint',
    list: listRegistryEndpoints,
    detail: getRegistryEndpoint,
  },
  {
    publicName: 'sources',
    responseLabelKey: 'openapi_registry_resource_sources',
    tag: 'Sources',
    listOperationId: 'listRegistrySources',
    detailOperationId: 'getRegistrySource',
    list: listRegistrySources,
    detail: getRegistrySource,
  },
  {
    publicName: 'sourceVersions',
    responseLabelKey: 'openapi_registry_resource_source_versions',
    tag: 'Source Versions',
    listOperationId: 'listRegistrySourceVersions',
    detailOperationId: 'getRegistrySourceVersion',
    list: listRegistrySourceVersions,
    detail: getRegistrySourceVersion,
  },
  {
    publicName: 'sourcePublishers',
    responseLabelKey: 'openapi_registry_resource_source_publishers',
    tag: 'Source Publishers',
    listOperationId: 'listRegistrySourcePublishers',
    detailOperationId: 'getRegistrySourcePublisher',
    list: listRegistrySourcePublishers,
    detail: getRegistrySourcePublisher,
  },
] as const satisfies readonly RegistryResource[]

function createRegistryListRoute(resource: RegistryResource) {
  return createRoute({
    method: 'get',
    path: `/v0.1/api/${resource.publicName}`,
    operationId: resource.listOperationId,
    tags: [resource.tag],
    request: {
      query: RegistryListQuerySchema,
    },
    responses: {
      200: {
        content: {
          'application/json': {
            schema: RegistryListResponseSchema,
          },
        },
        description: openApiText('openapi_list_response_description', {
          resource: openApiText(resource.responseLabelKey),
        }),
      },
      422: ValidationErrorOpenAPIResponse,
    },
  })
}

function createRegistryDetailRoute(resource: RegistryResource) {
  return createRoute({
    method: 'get',
    path: `/v0.1/api/${resource.publicName}/{id}`,
    operationId: resource.detailOperationId,
    tags: [resource.tag],
    request: {
      params: RegistryDetailParamsSchema,
    },
    responses: {
      200: {
        content: {
          'application/json': {
            schema: RegistryDetailResponseSchema,
          },
        },
        description: openApiText('openapi_get_response_description', {
          resource: openApiText(resource.responseLabelKey),
        }),
      },
      404: {
        content: {
          'application/json': {
            schema: ErrorResponseSchema,
          },
        },
        description: openApiText('openapi_registry_record_not_found_description'),
      },
      422: ValidationErrorOpenAPIResponse,
    },
  })
}

const listRouteConfigs = REGISTRY_RESOURCES.map(createRegistryListRoute)
const detailRouteConfigs = REGISTRY_RESOURCES.map(createRegistryDetailRoute)

export const registryRoutes = [
  ...listRouteConfigs.map((routeConfig, index) =>
    defineOpenAPIRoute<typeof routeConfig, AppEnv>({
      route: routeConfig,
      handler: async c => {
        const resource = REGISTRY_RESOURCES[index] ?? REGISTRY_RESOURCES[0]
        const { limit } = c.req.valid('query')
        const data = await resource.list(c.var.metaDb, limit)

        return c.json({ data }, 200)
      },
    }),
  ),
  ...detailRouteConfigs.map((routeConfig, index) =>
    defineOpenAPIRoute<typeof routeConfig, AppEnv>({
      route: routeConfig,
      handler: async c => {
        const resource = REGISTRY_RESOURCES[index] ?? REGISTRY_RESOURCES[0]
        const { id } = c.req.valid('param')
        const data = await resource.detail(c.var.metaDb, id)

        if (!data) {
          return c.json(
            {
              httpStatus: 404,
              error: 'not_found',
              message: 'Registry record not found.',
            },
            404,
          )
        }

        return c.json({ data }, 200)
      },
    }),
  ),
] as const
