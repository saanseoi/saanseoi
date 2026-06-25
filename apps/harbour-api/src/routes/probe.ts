import {
  DEFAULT_D1_PLACEMENT_PROBE_ITERATIONS,
  MAX_D1_PLACEMENT_PROBE_ITERATIONS,
  runD1PlacementProbe,
  saanseoiD1BindingNames,
} from '@repo/db'
import { createRoute, defineOpenAPIRoute, z } from '@hono/zod-openapi'

import {
  D1PlacementProbeResponseSchema,
  ValidationErrorOpenAPIResponse,
} from '../schema'
import type { AppEnv } from '../types'

const CONFIGURED_PLACEMENT_REGION = 'azure:eastasia'

const D1PlacementProbeQuerySchema = z
  .object({
    iterations: z.coerce
      .number()
      .int()
      .min(1)
      .max(MAX_D1_PLACEMENT_PROBE_ITERATIONS)
      .default(DEFAULT_D1_PLACEMENT_PROBE_ITERATIONS),
  })
  .openapi('HarbourD1PlacementProbeQuery')

const d1PlacementProbeRouteConfig = createRoute({
  method: 'get',
  path: '/api/v1/meta/d1-placement-probe',
  tags: ['Meta'],
  request: {
    query: D1PlacementProbeQuerySchema,
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: D1PlacementProbeResponseSchema,
        },
      },
      description: 'Per-binding D1 round-trip timings for the harbour worker.',
    },
    422: ValidationErrorOpenAPIResponse,
  },
})

export const d1PlacementProbeRoute = defineOpenAPIRoute<
  typeof d1PlacementProbeRouteConfig,
  AppEnv
>({
  route: d1PlacementProbeRouteConfig,
  handler: async c => {
    c.header('cache-control', 'no-store')

    const query = c.req.valid('query')
    const startedAt = new Date().toISOString()
    const bindings = Object.fromEntries(
      saanseoiD1BindingNames.map(bindingName => [bindingName, c.env[bindingName]]),
    ) as Parameters<typeof runD1PlacementProbe>[0]
    const result = await runD1PlacementProbe(bindings, {
      iterations: query.iterations,
    })
    const requestCf = c.req.raw.cf
    const completedAt = new Date().toISOString()

    return c.json(
      {
        ok: true as const,
        worker: 'harbour-api',
        configuredPlacementRegion: CONFIGURED_PLACEMENT_REGION,
        request: {
          city: requestCf?.city ?? null,
          colo: requestCf?.colo ?? null,
          country: requestCf?.country ?? null,
          host: new URL(c.req.url).host,
          path: new URL(c.req.url).pathname,
          region: requestCf?.region ?? null,
          timezone: requestCf?.timezone ?? null,
        },
        startedAt,
        completedAt,
        ...result,
      },
      200,
    )
  },
})

export const probeRoutes = [d1PlacementProbeRoute] as const
