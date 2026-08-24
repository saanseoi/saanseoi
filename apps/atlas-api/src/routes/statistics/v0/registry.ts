import { createRoute, defineOpenAPIRoute, z } from '@hono/zod-openapi'

import {
  ErrorResponseSchema,
  StatisticSnapshotNotReadyErrorResponseSchema,
  ValidationErrorOpenAPIResponse,
} from '../../../schema'
import {
  getStatisticsRegistryField,
  getStatisticsRegistryFieldAvailability,
  getStatisticsRegistryManifest,
  listStatisticsRegistryDatasets,
  listStatisticsRegistryDimensions,
  listStatisticsRegistryFields,
  listStatisticsRegistryMeasures,
  searchStatisticsRegistry,
} from '../../../services/statistics'
import type { AppEnv } from '../../../types'
import { openApiText } from '../../../lib/openapi-i18n'

const RegistryQuerySchema = z
  .object({
    catalogRevision: z.string().min(1).optional(),
    cohort: z.string().min(1).optional(),
    domain: z.literal('official').optional(),
    effectiveAt: z.iso.datetime().optional(),
    knownAt: z.iso.datetime().optional(),
    releaseSet: z.string().min(1).optional(),
    locales: z.string().optional(),
    'page[limit]': z.coerce.number().int().min(1).max(100).optional(),
    'page[offset]': z.coerce.number().int().min(0).optional(),
    'filter[dataset]': z.string().min(1).optional(),
    'filter[measure]': z.string().min(1).optional(),
    'filter[field]': z.string().min(1).optional(),
    'filter[dimension]': z
      .union([z.string(), z.array(z.string())])
      .transform(value => (Array.isArray(value) ? value : [value]))
      .pipe(z.array(z.string().regex(/^[a-z][a-z0-9-]*:[^:]+$/)))
      .optional(),
  })
  .openapi('StatisticsRegistryQuery')

const SearchQuerySchema = RegistryQuerySchema.extend({
  q: z.string().min(1).max(200),
}).openapi('StatisticsRegistrySearchQuery')

const RegistryResponseSchema = z
  .object({})
  .loose()
  .openapi('StatisticsRegistryResponse')
const RegistryFieldParamsSchema = z
  .object({ datasetCode: z.string().min(1), fieldName: z.string().min(1) })
  .openapi('StatisticsRegistryFieldParams')

const variants = [
  { path: '/stats/v0/registry', suffix: 'V0' },
  { path: '/stats/v0.1/registry', suffix: 'V01' },
] as const

function registryRoute(path: string, operationId: string) {
  return createRoute({
    method: 'get',
    path,
    operationId,
    tags: ['Registry'],
    request: { query: RegistryQuerySchema },
    responses: {
      200: {
        content: { 'application/json': { schema: RegistryResponseSchema } },
        description: openApiText('openapi_statistics_registry_response_description'),
      },
      503: {
        content: {
          'application/json': { schema: StatisticSnapshotNotReadyErrorResponseSchema },
        },
        description: openApiText('openapi_statistics_snapshot_not_ready_description'),
      },
      422: ValidationErrorOpenAPIResponse,
    },
  })
}

function collectionRoute(path: string, operationId: string, description: string) {
  return createRoute({
    method: 'get',
    path,
    operationId,
    tags: ['Registry'],
    request: { query: RegistryQuerySchema },
    responses: {
      200: {
        content: { 'application/json': { schema: RegistryResponseSchema } },
        description,
      },
      503: {
        content: {
          'application/json': { schema: StatisticSnapshotNotReadyErrorResponseSchema },
        },
        description: openApiText('openapi_statistics_snapshot_not_ready_description'),
      },
      422: ValidationErrorOpenAPIResponse,
    },
  })
}

function searchRoute(path: string, operationId: string) {
  return createRoute({
    method: 'get',
    path,
    operationId,
    tags: ['Registry'],
    request: { query: SearchQuerySchema },
    responses: {
      200: {
        content: { 'application/json': { schema: RegistryResponseSchema } },
        description: openApiText('openapi_statistics_registry_search_description'),
      },
      503: {
        content: {
          'application/json': { schema: StatisticSnapshotNotReadyErrorResponseSchema },
        },
        description: openApiText('openapi_statistics_snapshot_not_ready_description'),
      },
      422: ValidationErrorOpenAPIResponse,
    },
  })
}

function fieldDetailRoute(path: string, operationId: string, description: string) {
  return createRoute({
    method: 'get',
    path,
    operationId,
    tags: ['Registry'],
    request: { params: RegistryFieldParamsSchema, query: RegistryQuerySchema },
    responses: {
      200: {
        content: { 'application/json': { schema: RegistryResponseSchema } },
        description,
      },
      404: {
        content: { 'application/json': { schema: ErrorResponseSchema } },
        description: 'Statistic field not found in the selected registry.',
      },
      503: {
        content: {
          'application/json': { schema: StatisticSnapshotNotReadyErrorResponseSchema },
        },
        description: openApiText('openapi_statistics_snapshot_not_ready_description'),
      },
      422: ValidationErrorOpenAPIResponse,
    },
  })
}

const manifestRoutes = variants.map(variant =>
  registryRoute(variant.path, `getStatisticsRegistry${variant.suffix}`),
)
const fieldRoutes = variants.map(variant =>
  collectionRoute(
    `${variant.path}/fields`,
    `listStatisticsRegistryFields${variant.suffix}`,
    openApiText('openapi_statistics_registry_fields_list_description'),
  ),
)
const measureRoutes = variants.map(variant =>
  collectionRoute(
    `${variant.path}/measures`,
    `listStatisticsRegistryMeasures${variant.suffix}`,
    openApiText('openapi_statistics_registry_measures_list_description'),
  ),
)
const datasetRoutes = variants.map(variant =>
  collectionRoute(
    `${variant.path}/datasets`,
    `listStatisticsRegistryDatasets${variant.suffix}`,
    'List published Statistics datasets and their discovery counts.',
  ),
)
const dimensionRoutes = variants.map(variant =>
  collectionRoute(
    `${variant.path}/dimensions`,
    `listStatisticsRegistryDimensions${variant.suffix}`,
    'List dimensions and values available in the selected Statistics registry.',
  ),
)
const searchRoutes = variants.map(variant =>
  searchRoute(`${variant.path}/search`, `searchStatisticsRegistry${variant.suffix}`),
)
const fieldDetailRoutes = variants.map(variant =>
  fieldDetailRoute(
    `${variant.path}/fields/{datasetCode}/{fieldName}`,
    `getStatisticsRegistryField${variant.suffix}`,
    'Get one published, dimension-qualified statistic field.',
  ),
)
const availabilityRoutes = variants.map(variant =>
  fieldDetailRoute(
    `${variant.path}/fields/{datasetCode}/{fieldName}/availability`,
    `getStatisticsRegistryFieldAvailability${variant.suffix}`,
    'Get reference-period and geography coverage for one published statistic field.',
  ),
)

export const statisticRegistryRoutes = [
  ...manifestRoutes.map(route =>
    defineOpenAPIRoute<typeof route, AppEnv>({
      route,
      handler: async c => {
        const result = await getStatisticsRegistryManifest({
          historyDbs: c.var.historyDbs,
          metaDb: c.var.metaDb,
          query: c.req.valid('query'),
          requestUrl: c.req.url,
        })
        if (result.status === 503) return c.json(result.body, 503)
        return c.json(result.body as never, 200)
      },
    }),
  ),
  ...fieldRoutes.map(route =>
    defineOpenAPIRoute<typeof route, AppEnv>({
      route,
      handler: async c => {
        const result = await listStatisticsRegistryFields({
          historyDbs: c.var.historyDbs,
          metaDb: c.var.metaDb,
          query: c.req.valid('query'),
          requestUrl: c.req.url,
        })
        if (result.status === 503) return c.json(result.body, 503)
        return c.json(result.body as never, 200)
      },
    }),
  ),
  ...measureRoutes.map(route =>
    defineOpenAPIRoute<typeof route, AppEnv>({
      route,
      handler: async c => {
        const result = await listStatisticsRegistryMeasures({
          historyDbs: c.var.historyDbs,
          metaDb: c.var.metaDb,
          query: c.req.valid('query'),
          requestUrl: c.req.url,
        })
        if (result.status === 503) return c.json(result.body, 503)
        return c.json(result.body as never, 200)
      },
    }),
  ),
  ...datasetRoutes.map(route =>
    defineOpenAPIRoute<typeof route, AppEnv>({
      route,
      handler: async c => {
        const result = await listStatisticsRegistryDatasets({
          historyDbs: c.var.historyDbs,
          metaDb: c.var.metaDb,
          query: c.req.valid('query'),
          requestUrl: c.req.url,
        })
        if (result.status === 503) return c.json(result.body, 503)
        return c.json(result.body as never, 200)
      },
    }),
  ),
  ...dimensionRoutes.map(route =>
    defineOpenAPIRoute<typeof route, AppEnv>({
      route,
      handler: async c => {
        const result = await listStatisticsRegistryDimensions({
          historyDbs: c.var.historyDbs,
          metaDb: c.var.metaDb,
          query: c.req.valid('query'),
          requestUrl: c.req.url,
        })
        if (result.status === 503) return c.json(result.body, 503)
        return c.json(result.body as never, 200)
      },
    }),
  ),
  ...availabilityRoutes.map(route =>
    defineOpenAPIRoute<typeof route, AppEnv>({
      route,
      handler: async c => {
        const result = await getStatisticsRegistryFieldAvailability({
          ...c.req.valid('param'),
          historyDbs: c.var.historyDbs,
          metaDb: c.var.metaDb,
          query: c.req.valid('query'),
          requestUrl: c.req.url,
        })
        if (result.status === 503) return c.json(result.body, 503)
        if (result.status === 404) return c.json(result.body, 404)
        return c.json(result.body as never, 200)
      },
    }),
  ),
  ...fieldDetailRoutes.map(route =>
    defineOpenAPIRoute<typeof route, AppEnv>({
      route,
      handler: async c => {
        const result = await getStatisticsRegistryField({
          ...c.req.valid('param'),
          historyDbs: c.var.historyDbs,
          metaDb: c.var.metaDb,
          query: c.req.valid('query'),
          requestUrl: c.req.url,
        })
        if (result.status === 503) return c.json(result.body, 503)
        if (result.status === 404) return c.json(result.body, 404)
        return c.json(result.body as never, 200)
      },
    }),
  ),
  ...searchRoutes.map(route =>
    defineOpenAPIRoute<typeof route, AppEnv>({
      route,
      handler: async c => {
        const result = await searchStatisticsRegistry({
          historyDbs: c.var.historyDbs,
          metaDb: c.var.metaDb,
          query: c.req.valid('query'),
          requestUrl: c.req.url,
        })
        if (result.status === 503) return c.json(result.body, 503)
        return c.json(result.body as never, 200)
      },
    }),
  ),
] as const
