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
  getStatisticsRegistryMeasure,
  listStatisticsRegistryDatasets,
  listStatisticsRegistryDimensions,
  listStatisticsRegistryFields,
  listStatisticsRegistryMeasures,
  searchStatisticsRegistry,
} from '../../../services/statisticsRegistry'
import type { AppEnv } from '../../../types'
import { openApiText } from '../../../lib/openapi-i18n'

const RegistryQuerySchema = z
  .object({
    catalogRevision: z
      .string()
      .min(1)
      .optional()
      .openapi({
        description: openApiText('openapi_statistics_catalog_revision_description'),
      }),
    cohort: z
      .string()
      .min(1)
      .optional()
      .openapi({
        description: openApiText('openapi_statistics_cohort_description'),
      }),
    domain: z
      .literal('government')
      .optional()
      .openapi({
        description: openApiText('openapi_statistics_domain_description'),
      }),
    effectiveAt: z.iso
      .datetime()
      .optional()
      .openapi({
        description: openApiText('openapi_statistics_effective_at_description'),
      }),
    knownAt: z.iso
      .datetime()
      .optional()
      .openapi({
        description: openApiText('openapi_statistics_known_at_description'),
      }),
    releaseSet: z
      .string()
      .min(1)
      .optional()
      .openapi({
        description: openApiText('openapi_statistics_release_set_description'),
      }),
    locales: z
      .string()
      .optional()
      .openapi({
        description: openApiText('openapi_statistics_locales_description'),
      }),
    'page[limit]': z.coerce
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .openapi({
        description: openApiText('openapi_statistics_page_limit_description'),
      }),
    'page[offset]': z.coerce
      .number()
      .int()
      .min(0)
      .optional()
      .openapi({
        description: openApiText('openapi_statistics_page_offset_description'),
      }),
    'filter[dataset]': z
      .string()
      .min(1)
      .optional()
      .openapi({
        description: openApiText('openapi_statistics_dataset_filter_description'),
      }),
    'filter[measure]': z
      .string()
      .min(1)
      .optional()
      .openapi({
        description: openApiText('openapi_statistics_measure_filter_description'),
      }),
    'filter[field]': z
      .string()
      .min(1)
      .optional()
      .openapi({
        description: openApiText('openapi_statistics_field_filter_description'),
      }),
    'filter[dimension]': z
      .union([z.string(), z.array(z.string())])
      .transform(value => (Array.isArray(value) ? value : [value]))
      .pipe(z.array(z.string().regex(/^[a-z][a-z0-9-]*:[^:]+$/)))
      .optional()
      .openapi({
        description: openApiText('openapi_statistics_dimension_filter_description'),
      }),
  })
  .openapi('StatisticsRegistryQuery')

const SearchQuerySchema = RegistryQuerySchema.extend({
  q: z
    .string()
    .min(1)
    .max(200)
    .openapi({
      description: openApiText('openapi_statistics_search_query_description'),
    }),
}).openapi('StatisticsRegistrySearchQuery')

const RegistryResponseSchema = z
  .object({})
  .loose()
  .openapi('StatisticsRegistryResponse')
const RegistryFieldParamsSchema = z
  .object({
    datasetCode: z
      .string()
      .min(1)
      .openapi({
        description: openApiText('openapi_statistics_dataset_code_description'),
      }),
    fieldName: z
      .string()
      .min(1)
      .openapi({
        description: openApiText('openapi_statistics_field_name_description'),
      }),
  })
  .openapi('StatisticsRegistryFieldParams')
const RegistryMeasureParamsSchema = z
  .object({
    datasetCode: z
      .string()
      .min(1)
      .openapi({
        description: openApiText('openapi_statistics_dataset_code_description'),
      }),
    measureCode: z
      .string()
      .min(1)
      .openapi({
        description: openApiText('openapi_statistics_measure_code_description'),
      }),
  })
  .openapi('StatisticsRegistryMeasureParams')

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

function measureDetailRoute(path: string, operationId: string, description: string) {
  return createRoute({
    method: 'get',
    path,
    operationId,
    tags: ['Registry'],
    request: { params: RegistryMeasureParamsSchema, query: RegistryQuerySchema },
    responses: {
      200: {
        content: { 'application/json': { schema: RegistryResponseSchema } },
        description,
      },
      404: {
        content: { 'application/json': { schema: ErrorResponseSchema } },
        description: 'Statistic measure not found in the selected registry.',
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
const measureDetailRoutes = variants.map(variant =>
  measureDetailRoute(
    `${variant.path}/measures/{datasetCode}/{measureCode}`,
    `getStatisticsRegistryMeasure${variant.suffix}`,
    'Get one published statistic measure.',
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
  ...measureDetailRoutes.map(route =>
    defineOpenAPIRoute<typeof route, AppEnv>({
      route,
      handler: async c => {
        const result = await getStatisticsRegistryMeasure({
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
