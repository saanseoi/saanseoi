import { createRoute, defineOpenAPIRoute, z } from '@hono/zod-openapi'
import { GeocodingQuerySchema, GeocodingResponseSchema } from '../../schema/geocoding'

import { geocode } from '../../services/geocoding'
import type { AppEnv } from '../../types'

export const geocodingRoutes = (
  [
    { family: 'divisions', version: 'v1' },
    { family: 'addresses', version: 'v1' },
    { family: 'divisions', version: 'v0.2' },
  ] as const
).map(({ family, version }) => {
  const route = createRoute({
    method: 'get',
    path: `/${family}/${version}/geocode`,
    operationId: `${family}Geocode${version === 'v0.2' ? 'V02' : 'V1'}`,
    summary: family === 'divisions' ? 'Geocode Division' : 'Geocode Address',
    tags: ['Geocoding'],
    description:
      'Ranked forward or reverse geocoding in WGS84, returned as JSON:API 1.1. Profiles compact, default, map and full control response detail. Division match.type is reverse-geocoding for coordinate containment or forward-geocoding for name searches. Supply exactly one of lat/lng, address, or placename. Division containment uses published SaanSeoi area polygons (Overture fallback), including polygon boundaries. Unresolved branches remain ambiguous. Reverse addresses are exact locations or nearest points within maxDistance metres. For addresses, footprint constrains candidates to caller-supplied building geometry instead of the radius, returning within_footprint matches; it never falls back outside the footprint.',
    request: {
      query:
        family === 'addresses'
          ? GeocodingQuerySchema
          : GeocodingQuerySchema.refine(query => !query.footprint, {
              message: 'footprint is only supported for address lookups.',
              path: ['footprint'],
            }),
    },
    responses: {
      200: {
        description:
          'Geocoding candidates or division membership, with explicit release identities and resolution evidence.',
        content: { 'application/vnd.api+json': { schema: GeocodingResponseSchema } },
      },
      503: {
        description: 'A selected publication or compatible companion is unavailable.',
        content: {
          'application/vnd.api+json': {
            schema: z.object({
              jsonapi: z.object({ version: z.literal('1.1') }),
              errors: z.array(
                z.object({ status: z.string(), code: z.string(), title: z.string() }),
              ),
            }),
          },
        },
      },
      422: {
        description: 'Invalid geocoding query.',
        content: {
          'application/vnd.api+json': {
            schema: z.object({
              jsonapi: z.object({ version: z.literal('1.1') }),
              errors: z.array(
                z.object({
                  status: z.string(),
                  code: z.string(),
                  title: z.string(),
                  source: z.object({ parameter: z.string() }),
                }),
              ),
            }),
          },
        },
      },
    },
  })
  return defineOpenAPIRoute<typeof route, AppEnv>({
    route,
    handler: async c => {
      const result = await geocode({
        currentDb: c.var.currentDb,
        metaDb: c.var.metaDb,
        historyDbsByBinding: c.var.historyDbsByBinding,
        family: family === 'divisions' ? 'division' : 'address',
        query: c.req.valid('query'),
        apiVersion: version === 'v0.2' ? 'api-divisions-v0.2' : undefined,
        onResolved: attribution => c.set('accessAttribution', attribution),
      })
      if (result.status === 503)
        return c.json(result.body, 503, { 'Content-Type': 'application/vnd.api+json' })
      return c.json(result.body, 200, { 'Content-Type': 'application/vnd.api+json' })
    },
  })
})
