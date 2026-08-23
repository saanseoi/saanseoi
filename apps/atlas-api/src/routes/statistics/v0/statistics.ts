import { createRoute, defineOpenAPIRoute } from '@hono/zod-openapi'

import {
  ErrorResponseSchema,
  StatisticDetailParamsSchema,
  StatisticDetailQuerySchema,
  StatisticDetailResponseSchema,
  StatisticsListQuerySchema,
  StatisticsListResponseSchema,
  StatisticSnapshotNotReadyErrorResponseSchema,
  StatisticsGeographiesQuerySchema,
  StatisticsGeographiesResponseSchema,
  StatisticAggregateConflictErrorResponseSchema,
  ValidationErrorOpenAPIResponse,
  StatisticsSeriesQuerySchema,
  StatisticsSeriesResponseSchema,
} from '../../../schema'
import {
  getStatisticDetail,
  getStatisticsGeographies,
  getStatisticsSeries,
  listStatistics,
  type RequestedStatisticApiVersion,
  type RequestedStatisticVersion,
  type ResolvedStatisticApiVersion,
} from '../../../handlers/statistics/v0'
import type { AppEnv } from '../../../types'

const ROUTE_VARIANTS = [
  {
    requestedVersionPath: 'stats/v0' as const,
    requestedApiVersion: '0.1' as const,
    resolvedApiVersion: 'api-stats-v0.1' as const,
    listPath: '/stats/v0',
    detailPath: '/stats/v0/{id}',
    geographiesPath: '/stats/v0/geographies',
    seriesPath: '/stats/v0/series',
    listOperationId: 'listDivisionStatisticsV0',
    detailOperationId: 'getDivisionStatisticByIdV0',
  },
  {
    requestedVersionPath: 'stats/v0.1' as const,
    requestedApiVersion: '0.1' as const,
    resolvedApiVersion: 'api-stats-v0.1' as const,
    listPath: '/stats/v0.1',
    detailPath: '/stats/v0.1/{id}',
    geographiesPath: '/stats/v0.1/geographies',
    seriesPath: '/stats/v0.1/series',
    listOperationId: 'listDivisionStatisticsV01',
    detailOperationId: 'getDivisionStatisticByIdV01',
  },
] as const satisfies Array<{
  requestedVersionPath: RequestedStatisticVersion
  requestedApiVersion: RequestedStatisticApiVersion
  resolvedApiVersion: ResolvedStatisticApiVersion
  listPath: string
  detailPath: string
  geographiesPath: string
  seriesPath: string
  listOperationId: string
  detailOperationId: string
}>

const listRoutes = ROUTE_VARIANTS.map(variant =>
  createRoute({
    method: 'get',
    path: variant.listPath,
    operationId: variant.listOperationId,
    tags: ['Statistics'],
    request: { query: StatisticsListQuerySchema },
    responses: {
      200: {
        content: { 'application/json': { schema: StatisticsListResponseSchema } },
        description: 'List statistics.',
      },
      409: {
        content: { 'application/json': { schema: ErrorResponseSchema } },
        description: 'Requested related geometry variant is unavailable.',
      },
      503: {
        content: {
          'application/json': {
            schema: StatisticSnapshotNotReadyErrorResponseSchema,
          },
        },
        description: 'Statistic snapshot is not ready.',
      },
      422: ValidationErrorOpenAPIResponse,
    },
  }),
)

const detailRoutes = ROUTE_VARIANTS.map(variant =>
  createRoute({
    method: 'get',
    path: variant.detailPath,
    operationId: variant.detailOperationId,
    tags: ['Statistics'],
    request: {
      params: StatisticDetailParamsSchema,
      query: StatisticDetailQuerySchema,
    },
    responses: {
      200: {
        content: { 'application/json': { schema: StatisticDetailResponseSchema } },
        description: 'Get a statistic.',
      },
      404: {
        content: { 'application/json': { schema: ErrorResponseSchema } },
        description: 'Statistic not found.',
      },
      409: {
        content: { 'application/json': { schema: ErrorResponseSchema } },
        description: 'Requested related geometry variant is unavailable.',
      },
      503: {
        content: {
          'application/json': {
            schema: StatisticSnapshotNotReadyErrorResponseSchema,
          },
        },
        description: 'Statistic snapshot is not ready.',
      },
      422: ValidationErrorOpenAPIResponse,
    },
  }),
)

const geographyRoutes = ROUTE_VARIANTS.map(variant =>
  createRoute({
    method: 'get',
    path: variant.geographiesPath,
    operationId: `${variant.listOperationId}Geographies`,
    tags: ['Statistics'],
    request: { query: StatisticsGeographiesQuerySchema },
    responses: {
      200: {
        content: {
          'application/json': { schema: StatisticsGeographiesResponseSchema },
        },
        description: 'Get one selected reference-period geography map.',
      },
      404: {
        content: { 'application/json': { schema: ErrorResponseSchema } },
        description: 'No matching statistic.',
      },
      409: {
        content: {
          'application/json': { schema: StatisticAggregateConflictErrorResponseSchema },
        },
        description:
          'The field remains ambiguous after the supplied filters, or does not form one complete geography dimension.',
      },
      503: {
        content: {
          'application/json': { schema: StatisticSnapshotNotReadyErrorResponseSchema },
        },
        description: 'Statistic snapshot is not ready.',
      },
      422: ValidationErrorOpenAPIResponse,
    },
  }),
)

const seriesRoutes = ROUTE_VARIANTS.map(variant =>
  createRoute({
    method: 'get',
    path: variant.seriesPath,
    operationId: `${variant.listOperationId}Series`,
    tags: ['Statistics'],
    request: { query: StatisticsSeriesQuerySchema },
    responses: {
      200: {
        content: { 'application/json': { schema: StatisticsSeriesResponseSchema } },
        description: 'Get a multi-period geography series.',
      },
      404: {
        content: { 'application/json': { schema: ErrorResponseSchema } },
        description: 'No matching statistic.',
      },
      409: {
        content: {
          'application/json': { schema: StatisticAggregateConflictErrorResponseSchema },
        },
        description:
          'The field remains ambiguous after the supplied filters, or the selected series mixes geography or analytical dimensions.',
      },
      503: {
        content: {
          'application/json': { schema: StatisticSnapshotNotReadyErrorResponseSchema },
        },
        description: 'Statistic snapshot is not ready.',
      },
      422: ValidationErrorOpenAPIResponse,
    },
  }),
)

export const statisticRoutes = [
  ...geographyRoutes.map(route =>
    defineOpenAPIRoute<typeof route, AppEnv>({
      route,
      handler: async c => {
        const result = await getStatisticsGeographies({
          currentDb: c.var.currentDb,
          historyDbs: c.var.historyDbs,
          metaDb: c.var.metaDb,
          query: c.req.valid('query'),
        })
        if (result.status === 503) return c.json(result.body as never, 503)
        if (result.status === 404) return c.json(result.body as never, 404)
        if (result.status === 409) return c.json(result.body as never, 409)
        return c.json(result.body as never, 200)
      },
    }),
  ),
  ...seriesRoutes.map(route =>
    defineOpenAPIRoute<typeof route, AppEnv>({
      route,
      handler: async c => {
        const result = await getStatisticsSeries({
          currentDb: c.var.currentDb,
          historyDbs: c.var.historyDbs,
          metaDb: c.var.metaDb,
          query: c.req.valid('query'),
        })
        if (result.status === 503) return c.json(result.body as never, 503)
        if (result.status === 404) return c.json(result.body as never, 404)
        if (result.status === 409) return c.json(result.body as never, 409)
        return c.json(result.body as never, 200)
      },
    }),
  ),
  ...listRoutes.map((route, index) =>
    defineOpenAPIRoute<typeof route, AppEnv>({
      route,
      handler: async c => {
        const variant = ROUTE_VARIANTS[index] ?? ROUTE_VARIANTS[0]
        const result = await listStatistics({
          currentDb: c.var.currentDb,
          historyDbs: c.var.historyDbs,
          metaDb: c.var.metaDb,
          requestUrl: c.req.url,
          requestedVersionPath: variant.requestedVersionPath,
          requestedApiVersion: variant.requestedApiVersion,
          resolvedApiVersion: variant.resolvedApiVersion,
          query: c.req.valid('query'),
        })
        if (result.status === 409) return c.json(result.body, 409)
        if (result.status === 503) return c.json(result.body, 503)
        return c.json(result.body, 200)
      },
    }),
  ),
  ...detailRoutes.map((route, index) =>
    defineOpenAPIRoute<typeof route, AppEnv>({
      route,
      handler: async c => {
        const variant = ROUTE_VARIANTS[index] ?? ROUTE_VARIANTS[0]
        const { id } = c.req.valid('param')
        const result = await getStatisticDetail({
          currentDb: c.var.currentDb,
          historyDbs: c.var.historyDbs,
          metaDb: c.var.metaDb,
          requestUrl: c.req.url,
          requestedVersionPath: variant.requestedVersionPath,
          requestedApiVersion: variant.requestedApiVersion,
          resolvedApiVersion: variant.resolvedApiVersion,
          id,
          query: c.req.valid('query'),
        })
        if (result.status === 404) return c.json(result.body, 404)
        if (result.status === 409) return c.json(result.body, 409)
        if (result.status === 503) return c.json(result.body, 503)
        return c.json(result.body, 200)
      },
    }),
  ),
] as const
