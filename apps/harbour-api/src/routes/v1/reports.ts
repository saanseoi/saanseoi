import { createMetaDb } from '@repo/db'
import { createRoute, defineOpenAPIRoute } from '@hono/zod-openapi'
import type { HarbourReadableDb } from '@repo/core/db/types'

import {
  ErrorResponseSchema,
  IngestRunReportResponseSchema,
  ReleaseReportResponseSchema,
  ReportQuerySchema,
  StatsReportQuerySchema,
  StatsReportResponseSchema,
  ValidationErrorOpenAPIResponse,
} from '../../schema'
import { listIngestRuns, listReleases, listStats } from '../../lib/services/reporting'
import { resolveDataShardEnvironment } from '../../lib/services/shared'
import type { AppEnv } from '../../types'

const ingestionRouteConfig = createRoute({
  method: 'get',
  path: '/v1/reports/ingestion',
  tags: ['Reports'],
  request: {
    query: ReportQuerySchema,
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: IngestRunReportResponseSchema,
        },
      },
      description: 'Recent ingestion runs ordered by newest start time.',
    },
    400: {
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
      description: 'Report query failed.',
    },
    422: ValidationErrorOpenAPIResponse,
  },
})

const statsRouteConfig = createRoute({
  method: 'get',
  path: '/v1/reports/stats',
  tags: ['Reports'],
  request: {
    query: StatsReportQuerySchema,
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: StatsReportResponseSchema,
        },
      },
      description: 'Recent release stats ordered by newest creation time.',
    },
    400: {
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
      description: 'Report query failed.',
    },
    422: ValidationErrorOpenAPIResponse,
  },
})

const releasesRouteConfig = createRoute({
  method: 'get',
  path: '/v1/reports/releases',
  tags: ['Reports'],
  request: {
    query: ReportQuerySchema,
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: ReleaseReportResponseSchema,
        },
      },
      description: 'Recent releases with related source/history row counts.',
    },
    400: {
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
      description: 'Report query failed.',
    },
    422: ValidationErrorOpenAPIResponse,
  },
})

function createReportError(error: unknown) {
  return {
    error: 'report_failed',
    httpStatus: 400,
    message: error instanceof Error ? error.message : String(error),
  } as const
}

export const ingestionReportRoute = defineOpenAPIRoute<
  typeof ingestionRouteConfig,
  AppEnv
>({
  route: ingestionRouteConfig,
  handler: async c => {
    c.header('cache-control', 'no-store')

    try {
      const db = createMetaDb(c.env.DB_META) as HarbourReadableDb
      const query = c.req.valid('query')

      return c.json(
        {
          rows: await listIngestRuns(db, {
            limit: query.limit,
            releaseCode: query.releaseCode,
            releaseId: query.releaseId,
            source: query.source,
            type: query.type,
          }),
        },
        200,
      )
    } catch (error) {
      return c.json(createReportError(error), 400)
    }
  },
})

export const statsReportRoute = defineOpenAPIRoute<typeof statsRouteConfig, AppEnv>({
  route: statsRouteConfig,
  handler: async c => {
    c.header('cache-control', 'no-store')

    try {
      const db = createMetaDb(c.env.DB_META) as HarbourReadableDb
      const query = c.req.valid('query')

      return c.json(
        {
          rows: await listStats(db, {
            limit: query.limit,
            releaseId: query.releaseId,
            source: query.source,
            type: query.type,
          }),
        },
        200,
      )
    } catch (error) {
      return c.json(createReportError(error), 400)
    }
  },
})

export const releasesReportRoute = defineOpenAPIRoute<
  typeof releasesRouteConfig,
  AppEnv
>({
  route: releasesRouteConfig,
  handler: async c => {
    c.header('cache-control', 'no-store')

    try {
      const db = createMetaDb(c.env.DB_META) as HarbourReadableDb
      const query = c.req.valid('query')
      const environment = resolveDataShardEnvironment(c.env.DATA_SHARD_ENV)

      return c.json(
        {
          rows: await listReleases(db, c.env, environment, {
            limit: query.limit,
            releaseCode: query.releaseCode,
            releaseId: query.releaseId,
            source: query.source,
            type: query.type,
          }),
        },
        200,
      )
    } catch (error) {
      return c.json(createReportError(error), 400)
    }
  },
})

export const reportRoutes = [
  ingestionReportRoute,
  statsReportRoute,
  releasesReportRoute,
] as const
