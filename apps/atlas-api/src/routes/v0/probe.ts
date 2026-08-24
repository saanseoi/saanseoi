import { timingSafeEqual as nodeTimingSafeEqual } from 'node:crypto'

import {
  DEFAULT_D1_PLACEMENT_PROBE_ITERATIONS,
  MAX_D1_PLACEMENT_PROBE_ITERATIONS,
  parseD1PlacementProbeIterations,
  runD1PlacementProbe,
  saanseoiD1BindingNames,
} from '@repo/db'
import { createRoute, defineOpenAPIRoute, z } from '@hono/zod-openapi'

import { D1PlacementProbeResponseSchema } from '../../schema'
import type { AppEnv } from '../../types'
import { openApiText } from '../../lib/openapi-i18n'

const CONFIGURED_PLACEMENT_REGION = 'azure:eastasia'
const API_KEY_HEADER = 'x-api-key'

const D1PlacementProbeQuerySchema = z
  .object({
    iterations: z.string().optional(),
  })
  .openapi('D1PlacementProbeQuery', {
    description: openApiText('openapi_d1_probe_iterations_description', {
      default: DEFAULT_D1_PLACEMENT_PROBE_ITERATIONS,
      maximum: MAX_D1_PLACEMENT_PROBE_ITERATIONS,
    }),
  })

const D1PlacementProbeErrorSchema = z
  .object({
    error: z.string(),
    message: z.string(),
  })
  .openapi('D1PlacementProbeError')

const d1PlacementProbeRouteConfig = createRoute({
  method: 'get',
  path: '/v0.1/meta/d1-placement-probe',
  operationId: 'd1PlacementProbe',
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
      description: openApiText('openapi_d1_probe_response_description'),
    },
    400: {
      content: {
        'application/json': {
          schema: D1PlacementProbeErrorSchema,
        },
      },
      description: openApiText('openapi_d1_probe_invalid_iterations_description'),
    },
    401: {
      content: {
        'application/json': {
          schema: D1PlacementProbeErrorSchema,
        },
      },
      description: openApiText('openapi_d1_probe_unauthorised_description'),
    },
    500: {
      content: {
        'application/json': {
          schema: D1PlacementProbeErrorSchema,
        },
      },
      description: openApiText('openapi_d1_probe_misconfigured_description'),
    },
  },
})

export const d1PlacementProbeRoute = defineOpenAPIRoute<
  typeof d1PlacementProbeRouteConfig,
  AppEnv
>({
  route: d1PlacementProbeRouteConfig,
  handler: async c => {
    c.header('cache-control', 'no-store')

    const configuredApiKey = c.env.D1_PLACEMENT_PROBE_API_KEY?.trim()

    if (!configuredApiKey) {
      return c.json(
        {
          error: 'auth_misconfigured',
          message: 'D1 placement probe authentication is not configured.',
        },
        500,
      )
    }

    const providedApiKey = c.req.header(API_KEY_HEADER)?.trim()

    if (!providedApiKey || !(await timingSafeEqual(providedApiKey, configuredApiKey))) {
      return c.json(
        {
          error: 'unauthorized',
          message: 'Missing or invalid API key.',
        },
        401,
      )
    }

    let iterations: number

    try {
      iterations = parseD1PlacementProbeIterations(c.req.valid('query').iterations)
    } catch (error) {
      return c.json(
        {
          error: 'invalid_iterations',
          message: error instanceof Error ? error.message : String(error),
        },
        400,
      )
    }

    const bindings = Object.fromEntries(
      saanseoiD1BindingNames.map(bindingName => [bindingName, c.env[bindingName]]),
    ) as Parameters<typeof runD1PlacementProbe>[0]
    const startedAt = new Date().toISOString()
    const result = await runD1PlacementProbe(bindings, { iterations })
    const requestCf = c.req.raw.cf
    const completedAt = new Date().toISOString()

    return c.json(
      {
        ok: true as const,
        worker: 'atlas-api',
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

async function timingSafeEqual(left: string, right: string) {
  const encoder = new TextEncoder()
  const [leftHash, rightHash] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(left)),
    crypto.subtle.digest('SHA-256', encoder.encode(right)),
  ])
  if (typeof crypto.subtle.timingSafeEqual === 'function') {
    return crypto.subtle.timingSafeEqual(leftHash, rightHash)
  }
  return nodeTimingSafeEqual(new Uint8Array(leftHash), new Uint8Array(rightHash))
}
