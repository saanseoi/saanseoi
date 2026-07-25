import { createRoute, defineOpenAPIRoute, z } from '@hono/zod-openapi'

import { ErrorResponseSchema } from '../../schema'
import type { AppEnv } from '../../types'

const SourceArchiveParamsSchema = z.object({
  datasetId: z.string().regex(/^[a-z0-9_-]+$/i),
  fileName: z.enum(['manifest.json', 'source.zip']),
  publisher: z.literal('hkgov-csdi'),
  regionCode: z.literal('hk'),
  releaseSlot: z.string().regex(/^\d{4}-Q[1-4]$/),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
})

const sourceArchiveRouteConfig = createRoute({
  method: 'get',
  path: '/v0/source-archives/{regionCode}/{publisher}/{datasetId}/{releaseSlot}/{sha256}/{fileName}',
  operationId: 'downloadSourceArchive',
  tags: ['Source archives'],
  request: { params: SourceArchiveParamsSchema },
  responses: {
    200: {
      content: {
        'application/octet-stream': {
          schema: z.string().openapi({
            description:
              'An immutable publisher source archive or its provenance manifest.',
          }),
        },
      },
      description: 'Download an immutable publisher source archive or manifest.',
    },
    404: {
      content: { 'application/json': { schema: ErrorResponseSchema } },
      description: 'Source archive not found.',
    },
  },
})

export const sourceArchiveRoute = defineOpenAPIRoute<
  typeof sourceArchiveRouteConfig,
  AppEnv
>({
  route: sourceArchiveRouteConfig,
  handler: async c => {
    const { datasetId, fileName, publisher, regionCode, releaseSlot, sha256 } =
      c.req.valid('param')
    const key = [
      'source-archives',
      regionCode,
      publisher,
      datasetId,
      releaseSlot,
      sha256,
      fileName,
    ].join('/')
    const object = await c.env.R2_RAW.get(key, {
      range: c.req.raw.headers,
    })

    if (!object) {
      return c.json(
        {
          httpStatus: 404,
          error: 'source_archive_not_found',
          message: 'Source archive not found.',
        },
        404,
      )
    }

    const headers = new Headers({
      'access-control-allow-origin': '*',
      'accept-ranges': 'bytes',
      'cache-control': 'public, max-age=31536000, immutable',
      'content-disposition': `attachment; filename="${fileName}"`,
      'content-type':
        fileName === 'manifest.json'
          ? 'application/json; charset=utf-8'
          : 'application/zip',
      'x-content-type-options': 'nosniff',
    })
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

export const sourceArchiveRoutes = [sourceArchiveRoute] as const
