import { createRoute, defineOpenAPIRoute, z } from '@hono/zod-openapi'
import { eq, metaAssets } from '@repo/db'

import { ErrorResponseSchema } from '../../schema'
import type { AppEnv } from '../../types'

const AssetParamsSchema = z.object({ assetId: z.string().uuid() })

const managedAssetRouteConfig = createRoute({
  method: 'get',
  path: '/v0/assets/{assetId}',
  operationId: 'downloadManagedAsset',
  tags: ['Source assets'],
  request: { params: AssetParamsSchema },
  responses: {
    200: {
      content: {
        'application/octet-stream': {
          schema: z.string().openapi({
            description: 'An immutable public-source artifact held in private R2.',
          }),
        },
      },
      description: 'Stream a registered immutable source asset.',
    },
    404: {
      content: { 'application/json': { schema: ErrorResponseSchema } },
      description: 'Managed asset not found.',
    },
  },
})

export const managedAssetRoute = defineOpenAPIRoute<
  typeof managedAssetRouteConfig,
  AppEnv
>({
  route: managedAssetRouteConfig,
  handler: async c => {
    const { assetId } = c.req.valid('param')
    const asset = await c.var.metaDb
      .select({ assetKey: metaAssets.assetKey })
      .from(metaAssets)
      .where(eq(metaAssets.id, assetId))
      .get()
    if (!asset) {
      return c.json(
        {
          httpStatus: 404,
          error: 'asset_not_found',
          message: 'Managed asset not found.',
        },
        404,
      )
    }

    const object = await c.env.R2_ASSETS.get(asset.assetKey, {
      range: c.req.raw.headers,
    })
    if (!object) {
      return c.json(
        {
          httpStatus: 404,
          error: 'asset_not_found',
          message: 'Managed asset not found.',
        },
        404,
      )
    }

    const headers = new Headers({
      'access-control-allow-origin': '*',
      'accept-ranges': 'bytes',
      'cache-control': 'public, max-age=31536000, immutable',
      'x-content-type-options': 'nosniff',
    })
    object.writeHttpMetadata(headers)
    headers.set('etag', object.httpEtag)

    if (c.req.header('if-none-match') === object.httpEtag) {
      return new Response(null, { headers, status: 304 })
    }

    const range = object.range
    if (range) {
      const offset =
        'offset' in range && typeof range.offset === 'number'
          ? range.offset
          : 'suffix' in range
            ? object.size - Math.min(range.suffix, object.size)
            : 0
      const length =
        'length' in range && typeof range.length === 'number'
          ? Math.min(range.length, object.size - offset)
          : object.size - offset
      headers.set(
        'content-range',
        `bytes ${offset}-${offset + length - 1}/${object.size}`,
      )
    }
    return new Response(object.body, { headers, status: range ? 206 : 200 })
  },
})

export const managedAssetRoutes = [managedAssetRoute] as const
