import { z } from '@hono/zod-openapi'

import { RegionCode } from './common'

export const HealthResponseSchema = z
  .object({
    ok: z.boolean(),
    datasetCount: z.number(),
  })
  .openapi('HealthResponse')

const D1BindingNameSchema = z
  .enum([
    'DB_META',
    'DB_CURRENT',
    'DB_HISTORY_HK_BEFORE',
    'DB_HISTORY_HK_2025',
    'DB_HISTORY_HK_2026',
    'DB_SOURCE_HK_BEFORE',
    'DB_SOURCE_HK_2025',
    'DB_SOURCE_HK_2026',
  ])
  .openapi('D1BindingName')

const D1PlacementProbeStatsSchema = z
  .object({
    avgMs: z.number(),
    maxMs: z.number(),
    minMs: z.number(),
    p50Ms: z.number(),
    p95Ms: z.number(),
  })
  .openapi('D1PlacementProbeStats')

const D1PlacementProbeBindingSchema = z
  .object({
    binding: D1BindingNameSchema,
    stats: D1PlacementProbeStatsSchema,
    timingsMs: z.array(z.number()),
  })
  .openapi('D1PlacementProbeBinding')

export const D1PlacementProbeResponseSchema = z
  .object({
    ok: z.literal(true),
    worker: z.string().openapi({
      examples: ['atlas-api'],
    }),
    configuredPlacementRegion: z.string().openapi({
      examples: ['azure:eastasia'],
    }),
    request: z.object({
      city: z.string().nullable(),
      colo: z.string().nullable(),
      country: z.string().nullable(),
      host: z.string(),
      path: z.string(),
      region: z.string().nullable(),
      timezone: z.string().nullable(),
    }),
    startedAt: z.string(),
    completedAt: z.string(),
    iterations: z.number(),
    totalQueries: z.number(),
    query: z.string(),
    overall: D1PlacementProbeStatsSchema,
    bindings: z.array(D1PlacementProbeBindingSchema),
  })
  .openapi('D1PlacementProbeResponse')

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
    email: z.email().max(254),
  })
  .openapi('SubstackSubscribeRequest')

export const SubstackSubscribeResponseSchema = z
  .object({
    ok: z.literal(true),
    message: z.string(),
    subscriptionState: z.enum(['subscribed', 'pending']),
  })
  .openapi('SubstackSubscribeResponse')
