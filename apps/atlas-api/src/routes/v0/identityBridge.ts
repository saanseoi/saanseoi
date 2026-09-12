import { createRoute, defineOpenAPIRoute, z } from '@hono/zod-openapi'
import type { AppEnv } from '../../types'
import { ErrorResponseSchema, ValidationErrorOpenAPIResponse } from '../../schema'
import { listIdentityBridge } from '../../services/identityBridge'
import { resolveApiReleaseSetAccessAttribution } from '../../services/accessAnalytics'

export const IdentityBridgeQuerySchema = z.object({
  resourceType: z.enum(['division', 'address2d']).default('division'),
  region: z.enum(['hk', 'mo', 'gba']).default('hk'),
  domain: z.string().min(1).max(100),
  releaseSet: z.string().min(1).max(200),
  catalogRevision: z.string().min(1).max(200).optional(),
  namespace: z.string().min(1).max(200).optional(),
  identifier: z.string().max(1000).optional(),
  canonicalId: z.string().min(1).max(200).optional(),
  cursor: z.string().max(4000).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
})

const response = z.object({
  data: z.array(
    z.object({
      namespace: z.string(),
      identifier: z.string(),
      canonicalId: z.string(),
    }),
  ),
  nextCursor: z.string().nullable(),
  meta: z.object({
    releaseSet: z.string(),
    catalogRevision: z.string(),
    resourceType: z.enum(['division', 'address2d']),
    domain: z.string(),
  }),
})
const route = createRoute({
  method: 'get',
  path: '/v0.1/identityBridge',
  operationId: 'listIdentityBridge',
  tags: ['API Releases'],
  summary: 'Look up canonical identifiers within an API release set',
  description:
    'Distinct identifier-to-resource mappings from the selected release records. Identifiers can map to multiple resources. Planning subunits use TPU-subunit composite values. Keep all selectors unchanged while following nextCursor.',
  request: { query: IdentityBridgeQuerySchema },
  responses: {
    200: {
      description: 'Release-scoped identity mappings.',
      content: { 'application/json': { schema: response } },
    },
    404: {
      description: 'Published release selection is unavailable.',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    422: ValidationErrorOpenAPIResponse,
  },
})

export const identityBridgeRoutes = [
  defineOpenAPIRoute<typeof route, AppEnv>({
    route,
    handler: async c => {
      const result = await listIdentityBridge({
        metaDb: c.var.metaDb,
        historyDbsByBinding: c.var.historyDbsByBinding,
        query: c.req.valid('query'),
      })
      if (!result)
        return c.json(
          {
            httpStatus: 404,
            error: 'not_found',
            message: 'The published release selection is unavailable.',
          },
          404,
        )
      const attribution = await resolveApiReleaseSetAccessAttribution(
        c.env.DB_META,
        result.meta.releaseSet,
      )
      if (attribution) c.set('accessAttribution', attribution)
      return c.json(result, 200)
    },
  }),
]
