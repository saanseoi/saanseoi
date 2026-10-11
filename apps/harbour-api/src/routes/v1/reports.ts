import { desc, eq, and } from 'drizzle-orm'
import { metaSchema } from '@repo/db'
import { z, createRoute, defineOpenAPIRoute } from '@hono/zod-openapi'

import {
  ErrorResponseSchema,
  ProcessingRunReportResponseSchema,
  ReleaseReportResponseSchema,
  ReportQuerySchema,
  StatsReportQuerySchema,
  StatsReportResponseSchema,
  ValidationErrorOpenAPIResponse,
} from '../../schema'
import {
  listProcessingRuns,
  listReleases,
  listStats,
} from '../../lib/services/reporting'
import { createPrimaryMetaRepoDb } from '../../lib/d1'
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
          schema: ProcessingRunReportResponseSchema,
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
      const db = createPrimaryMetaRepoDb(c.env.DB_META)
      const query = c.req.valid('query')

      return c.json(
        {
          rows: await listProcessingRuns(db, {
            datasetCode: query.datasetCode,
            limit: query.limit,
            releaseCode: query.releaseCode,
            resourceReleaseId: query.resourceReleaseId,
            source: query.source,
            resourceType: query.resourceType,
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
      const db = createPrimaryMetaRepoDb(c.env.DB_META)
      const query = c.req.valid('query')

      return c.json(
        {
          rows: await listStats(db, {
            limit: query.limit,
            resourceReleaseId: query.resourceReleaseId,
            source: query.source,
            resourceType: query.resourceType,
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
      const db = createPrimaryMetaRepoDb(c.env.DB_META)
      const query = c.req.valid('query')
      const environment = resolveDataShardEnvironment(c.env.DATA_SHARD_ENV)

      return c.json(
        {
          rows: await listReleases(db, c.env, environment, {
            datasetCode: query.datasetCode,
            limit: query.limit,
            releaseCode: query.releaseCode,
            resourceReleaseId: query.resourceReleaseId,
            source: query.source,
            resourceType: query.resourceType,
          }),
        },
        200,
      )
    } catch (error) {
      return c.json(createReportError(error), 400)
    }
  },
})

const processingRouteConfig = createRoute({
  method: 'get',
  path: '/v1/reports/processing',
  tags: ['Reports'],
  request: {
    query: z.object({
      stage: z.enum(['ingestion', 'assembly', 'composition']).optional(),
      status: z.enum(['queued', 'running', 'completed', 'error']).optional(),
      limit: z.coerce.number().int().min(1).max(1000).default(100),
    }),
  },
  responses: {
    200: {
      description: 'Current processing tasks across all owners and stages.',
      content: {
        'application/json': {
          schema: z.object({ rows: z.array(z.record(z.string(), z.unknown())) }),
        },
      },
    },
    400: {
      description: 'Report query failed.',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
})

export const processingReportRoute = defineOpenAPIRoute<
  typeof processingRouteConfig,
  AppEnv
>({
  route: processingRouteConfig,
  handler: async c => {
    c.header('cache-control', 'no-store')
    const query = c.req.valid('query')
    const table = metaSchema.processingRuns
    try {
      const db = createPrimaryMetaRepoDb(c.env.DB_META)
      const rows = await db
        .select()
        .from(table)
        .where(
          and(
            query.stage ? eq(table.stage, query.stage) : undefined,
            query.status ? eq(table.status, query.status) : undefined,
          ),
        )
        .orderBy(desc(table.updatedAt), table.runId)
        .limit(query.limit)
        .all()
      return c.json({ rows }, 200)
    } catch (error) {
      return c.json(createReportError(error), 400)
    }
  },
})

export const reportRoutes = [
  processingReportRoute,
  ingestionReportRoute,
  statsReportRoute,
  releasesReportRoute,
] as const
