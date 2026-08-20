import { createRoute, defineOpenAPIRoute, z } from '@hono/zod-openapi'
import {
  eq,
  metaAssets,
  metaDatasets,
  metaPublishers,
  metaReleases,
  metaSourceReleases,
} from '@repo/db'

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
            description: 'An immutable public-source artefact held in private R2.',
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
      .select({
        assetKey: metaAssets.assetKey,
        datasetId: metaDatasets.id,
        publisherCode: metaPublishers.code,
        sourceReleaseCode: metaSourceReleases.code,
        sourceReleaseId: metaSourceReleases.id,
      })
      .from(metaAssets)
      .leftJoin(metaReleases, eq(metaAssets.releaseId, metaReleases.id))
      .leftJoin(
        metaSourceReleases,
        eq(metaReleases.sourceReleaseId, metaSourceReleases.id),
      )
      .leftJoin(metaDatasets, eq(metaSourceReleases.datasetId, metaDatasets.id))
      .leftJoin(metaPublishers, eq(metaDatasets.publisherId, metaPublishers.id))
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
    if (
      asset.datasetId &&
      asset.publisherCode &&
      asset.sourceReleaseId &&
      asset.sourceReleaseCode
    ) {
      c.set('accessAttribution', {
        datasetId: asset.datasetId,
        publisherCodes: [asset.publisherCode],
        sourceReleaseCode: asset.sourceReleaseCode,
        sourceReleaseId: asset.sourceReleaseId,
        surface: 'source',
      })
    }

    // Workers Cache slices Range requests from this full immutable response.
    // Returning a 206 from the Worker would make the response uncacheable.
    const object = await c.env.R2_ASSETS.get(asset.assetKey)
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
    headers.set(
      'content-disposition',
      `attachment; filename="${assetFilename(asset.assetKey)}"`,
    )

    if (c.req.header('if-none-match') === object.httpEtag) {
      return new Response(null, { headers, status: 304 })
    }

    return new Response(object.body, { headers, status: 200 })
  },
})

function assetFilename(assetKey: string) {
  const filename = assetKey.split('/').filter(Boolean).at(-1) ?? 'source-asset'
  return filename.replaceAll(/[\\/"\r\n]/g, '_')
}

export const managedAssetRoutes = [managedAssetRoute] as const
