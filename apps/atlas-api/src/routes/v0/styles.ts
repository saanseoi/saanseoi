import { createRoute, defineOpenAPIRoute, z } from '@hono/zod-openapi'

import { ErrorResponseSchema } from '../../schema'
import type { AppEnv } from '../../types'

const StyleParamsSchema = z.object({
  style: z.string().regex(/^[a-z0-9-]+$/),
  version: z.string().regex(/^\d+\.\d+\.\d+\.json$/),
})

const styleRouteConfig = createRoute({
  method: 'get',
  path: '/v0/styles/{style}/{version}',
  operationId: 'downloadMapStyle',
  tags: ['Map styles'],
  request: { params: StyleParamsSchema },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: z.record(z.string(), z.unknown()).openapi({
            description:
              'An immutable source-neutral MapLibre style fragment. Add a vector source named basemap before use.',
          }),
        },
      },
      description: 'Stream an immutable public map style from R2.',
    },
    404: {
      content: { 'application/json': { schema: ErrorResponseSchema } },
      description: 'Map style not found.',
    },
    304: { description: 'Map style unchanged.' },
  },
})

export const styleRoute = defineOpenAPIRoute<typeof styleRouteConfig, AppEnv>({
  route: styleRouteConfig,
  handler: async c => {
    const { style, version } = c.req.valid('param')
    const styleVersion = version.slice(0, -'.json'.length)
    const object = await c.env.R2_ASSETS.get(`styles/${style}/${styleVersion}.json`)
    if (!object) {
      return c.json(
        {
          httpStatus: 404,
          error: 'style_not_found',
          message: 'Map style not found.',
        },
        404,
      )
    }

    const headers = new Headers({
      'access-control-allow-origin': '*',
      'cache-control': 'public, max-age=31536000, immutable',
      'content-type': 'application/json; charset=utf-8',
      'x-content-type-options': 'nosniff',
    })
    object.writeHttpMetadata(headers)
    headers.set('etag', object.httpEtag)
    if (c.req.header('if-none-match') === object.httpEtag)
      return new Response(null, { headers, status: 304 })
    return new Response(object.body, { headers, status: 200 })
  },
})

export const styleRoutes = [styleRoute] as const
