import { createRoute, defineOpenAPIRoute, z } from '@hono/zod-openapi'
import { GeocodingQuerySchema, GeocodingResponseSchema } from '../../schema/geocoding'
import { ValidationErrorOpenAPIResponse } from '../../schema'
import { geocode } from '../../services/geocoding'
import type { AppEnv } from '../../types'

export const geocodingRoutes = (['divisions', 'addresses'] as const).map(family => {
  const route = createRoute({
    method: 'get',
    path: `/${family}/v1/geocode`,
    operationId: `${family}GeocodeV1`,
    summary: family === 'divisions' ? 'Geocode Division' : 'Geocode Address',
    tags: ['Geocoding'],
    description:
      'Ranked forward or reverse geocoding in WGS84. Supply exactly one of lat/lng, address, or placename. Division containment uses geographic stub polygons, including polygon boundaries. Unresolved branches remain ambiguous. Reverse addresses are exact locations or nearest points within maxDistance metres.',
    request: { query: GeocodingQuerySchema },
    responses: {
      200: {
        description:
          'Geocoding candidates or division membership, with explicit release identities and resolution evidence.',
        content: { 'application/json': { schema: GeocodingResponseSchema } },
      },
      503: {
        description: 'A selected publication or compatible companion is unavailable.',
        content: {
          'application/json': {
            schema: z.object({ error: z.string(), message: z.string() }),
          },
        },
      },
      422: ValidationErrorOpenAPIResponse,
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
        onResolved: attribution => c.set('accessAttribution', attribution),
      })
      if (result.status === 503) return c.json(result.body, 503)
      return c.json(result.body, 200)
    },
  })
})
