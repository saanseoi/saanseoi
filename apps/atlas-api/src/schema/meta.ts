import { z } from '@hono/zod-openapi'

import { RegionCode } from './common'

export const HealthResponseSchema = z
  .object({
    ok: z.boolean(),
    datasetCount: z.number(),
  })
  .openapi('HealthResponse')

export const DatasetsQuerySchema = z
  .object({
    activeOnly: z.enum(['true', 'false']).optional(),
    regionCode: RegionCode.optional(),
    cohortKey: z.string().optional(),
    theme: z.string().optional(),
    status: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  })
  .openapi('DatasetsQuery')

export const DatasetsResponseSchema = z
  .object({
    datasets: z.array(z.object({}).loose()),
  })
  .openapi('DatasetsResponse')

export const SubstackSubscribeRequestSchema = z
  .object({
    email: z.email(),
  })
  .openapi('SubstackSubscribeRequest')

export const SubstackSubscribeResponseSchema = z
  .object({
    ok: z.literal(true),
    message: z.string(),
    subscriptionState: z.enum(['subscribed', 'pending']),
  })
  .openapi('SubstackSubscribeResponse')
