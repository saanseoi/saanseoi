import { createRoute, defineOpenAPIRoute, z } from '@hono/zod-openapi'
import { bodyLimit } from 'hono/body-limit'
import {
  hasSourceAssetPart,
  putSourceAssetPart,
  SOURCE_ASSET_PART_SIZE,
} from '@repo/core/sourceAssetTransfer'
import type { AppEnv } from '../../types'
import { ErrorResponseSchema } from '../../schema'

const params = z.object({
  scope: z.string().regex(/^[a-f0-9]{64}$/),
  hash: z.string().regex(/^[a-f0-9]{64}$/),
})
const errorResponse = {
  description: 'Source chunk verification failed.',
  content: { 'application/json': { schema: ErrorResponseSchema } },
}
const preflight = createRoute({
  method: 'get',
  path: '/v1/assets/parts/{scope}/{hash}',
  tags: ['Source assets'],
  request: {
    params,
    query: z.object({
      byteLength: z.coerce.number().int().min(0).max(SOURCE_ASSET_PART_SIZE),
    }),
  },
  responses: {
    200: {
      description: 'Check a retained verified chunk.',
      content: { 'application/json': { schema: z.object({ exists: z.boolean() }) } },
    },
    400: errorResponse,
  },
})
const upload = createRoute({
  method: 'put',
  path: '/v1/assets/parts/{scope}/{hash}',
  tags: ['Source assets'],
  middleware: [bodyLimit({ maxSize: SOURCE_ASSET_PART_SIZE })],
  request: { params },
  responses: {
    200: {
      description: 'Retain a bounded chunk after SHA-256 verification.',
      content: {
        'application/json': {
          schema: z.object({ sha256: z.string(), byteLength: z.number() }),
        },
      },
    },
    400: errorResponse,
  },
})
export const sourceAssetPartPreflightRoute = defineOpenAPIRoute<
  typeof preflight,
  AppEnv
>({
  route: preflight,
  handler: async c => {
    try {
      const { scope, hash } = c.req.valid('param')
      return c.json(
        {
          exists: await hasSourceAssetPart(c.env.R2_ASSETS, scope, {
            sha256: hash,
            byteLength: c.req.valid('query').byteLength,
          }),
        },
        200,
      )
    } catch (error) {
      return c.json(
        {
          httpStatus: 400,
          error: 'source_chunk_failed',
          message: error instanceof Error ? error.message : String(error),
        },
        400,
      )
    }
  },
})
export const sourceAssetPartUploadRoute = defineOpenAPIRoute<typeof upload, AppEnv>({
  route: upload,
  handler: async c => {
    try {
      const { scope, hash } = c.req.valid('param')
      return c.json(
        await putSourceAssetPart(c.env.R2_ASSETS, scope, hash, c.req.raw.body),
        200,
      )
    } catch (error) {
      return c.json(
        {
          httpStatus: 400,
          error: 'source_chunk_failed',
          message: error instanceof Error ? error.message : String(error),
        },
        400,
      )
    }
  },
})
