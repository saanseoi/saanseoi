import { createRoute, defineOpenAPIRoute, z } from '@hono/zod-openapi'

import { ErrorResponseSchema } from '../../schema'
import type { AppEnv } from '../../types'
import { openApiText } from '../../lib/openapi-i18n'

const StyleParamsSchema = z.object({
  style: z.string().regex(/^[a-z0-9-]+$/),
  version: z.string().regex(/^\d+\.\d+\.\d+\.json$/),
})

const styleRouteConfig = createRoute({
  method: 'get',
  path: '/v0.1/styles/{style}/{version}',
  operationId: 'downloadMapStyle',
  tags: ['Map styles'],
  request: { params: StyleParamsSchema },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: z.record(z.string(), z.unknown()).openapi({
            description: openApiText('openapi_map_style_schema_description'),
          }),
        },
      },
      description: openApiText('openapi_map_style_response_description'),
    },
    404: {
      content: { 'application/json': { schema: ErrorResponseSchema } },
      description: openApiText('openapi_map_style_not_found_description'),
    },
    304: { description: openApiText('openapi_map_style_not_modified_description') },
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
