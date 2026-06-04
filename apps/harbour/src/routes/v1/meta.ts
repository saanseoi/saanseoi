import { createRoute, defineOpenAPIRoute } from '@hono/zod-openapi'

import { HealthResponseSchema } from '../../schema'
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

export const metaRoutes = [healthRoute] as const
