import { createRoute, defineOpenAPIRoute } from '@hono/zod-openapi'

import { listDatasets } from '../../db/repositories'
import {
  DatasetsQuerySchema,
  DatasetsResponseSchema,
  HealthResponseSchema,
  ValidationErrorOpenAPIResponse,
} from '../../schema'
import type { AppEnv } from '../../types'
const healthRouteConfig = createRoute({
  method: 'get',
  path: '/v1/meta/health',
  tags: ['Meta'],
  responses: {
    200: {
      content: {
        'application/json': {
          schema: HealthResponseSchema,
        },
      },
      description: 'Health check status.',
    },
  },
})

const datasetsRouteConfig = createRoute({
  method: 'get',
  path: '/v1/meta/datasets',
  tags: ['Meta'],
  request: {
    query: DatasetsQuerySchema,
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: DatasetsResponseSchema,
        },
      },
      description: 'List datasets.',
    },
    422: ValidationErrorOpenAPIResponse,
  },
})

export const healthRoute = defineOpenAPIRoute<typeof healthRouteConfig, AppEnv>({
  route: healthRouteConfig,
  handler: async c => {
    const ping = await c.env.DB.prepare('SELECT 1 AS ok').first<{ ok: number }>()
    const datasetCount = await c.env.DB.prepare(
      'SELECT COUNT(*) AS "count" FROM "datasets"',
    ).first<{ count: number }>()

    return c.json(
      {
        ok: ping?.ok === 1,
        datasetCount: Number(datasetCount?.count ?? 0),
      },
      200,
    )
  },
})

export const datasetsRoute = defineOpenAPIRoute<typeof datasetsRouteConfig, AppEnv>({
  route: datasetsRouteConfig,
  handler: async c => {
    const query = c.req.valid('query')
    const rows = await listDatasets(c.env.DB, {
      regionCode: query.regionCode,
      snapshotMonth: query.snapshotMonth,
      theme: query.theme,
      status:
        query.activeOnly === 'true'
          ? 'current'
          : query.activeOnly === 'false'
            ? undefined
            : query.status,
      limit: query.limit,
    })

    return c.json(
      {
        datasets: rows,
      },
      200,
    )
  },
})

export const metaRoutes = [healthRoute, datasetsRoute] as const
