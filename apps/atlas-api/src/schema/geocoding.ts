import { geographicCodeQueryShape } from './geographicCodeFilters'
import { z } from '@hono/zod-openapi'
import {
  getRequestedApiLocalesValidationError,
  parseRequestedApiLocales,
} from '@repo/core/apiLocales'

const coordinate = (min: number, max: number) =>
  z
    .string()
    .trim()
    .regex(/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i)
    .transform(Number)
    .pipe(z.number().finite().min(min).max(max))

export const GeocodingQuerySchema = z
  .object({
    ...geographicCodeQueryShape,
    inventory: z.string().min(1).optional(),
    profile: z.enum(['compact', 'default', 'map', 'full']).default('default'),
    lat: coordinate(-90, 90).optional(),
    lng: coordinate(-180, 180).optional(),
    address: z.string().trim().min(1).max(500).optional(),
    placename: z.string().trim().min(1).max(500).optional(),
    apiReleaseSet: z.string().trim().min(1).optional(),
    locales: z
      .string()
      .superRefine((value, ctx) => {
        const error = getRequestedApiLocalesValidationError(value)
        if (error) ctx.addIssue({ code: 'custom', message: error })
      })
      .transform(value => {
        const selected = parseRequestedApiLocales(value, {
          mode: 'requested',
          locales: ['en', 'zh-hant'],
        })
        return selected.mode === 'none' ? 'null' : selected.locales.join(',')
      })
      .default('en,zh-hant'),
    include: z.enum(['divisions']).optional(),
    geometry: z.enum(['area', 'saanseoi']).optional(),
    limit: z.coerce.number().int().min(1).max(50).default(10),
    maxDistance: z.coerce.number().finite().min(0).max(50000).default(1000),
  })
  .strict()
  .superRefine((query, ctx) => {
    const coordinateInput = query.lat !== undefined || query.lng !== undefined
    if (coordinateInput && (query.lat === undefined || query.lng === undefined))
      ctx.addIssue({
        code: 'custom',
        message: 'Both lat and lng are required.',
        path: ['lat'],
      })
    if (
      Number(coordinateInput) +
        Number(query.address !== undefined) +
        Number(query.placename !== undefined) !==
      1
    )
      ctx.addIssue({
        code: 'custom',
        message: 'Supply exactly one of lat/lng, address, or placename.',
        path: ['address'],
      })
  })

export type GeocodingQuery = z.infer<typeof GeocodingQuerySchema>

const point = z.tuple([z.number(), z.number()]).describe('WGS84 [lng, lat].')
const identifier = z.object({ type: z.string(), id: z.string() })
const relationship = z.object({
  data: z.array(identifier),
  meta: z.object({ paths: z.array(z.array(identifier)) }).optional(),
})
const position = z.array(z.number()).min(2)
const ring = z.array(position)
const geometry = z
  .discriminatedUnion('type', [
    z.object({ type: z.literal('Point'), coordinates: position }),
    z.object({ type: z.literal('Polygon'), coordinates: z.array(ring) }),
    z.object({ type: z.literal('MultiPolygon'), coordinates: z.array(z.array(ring)) }),
  ])
  .nullable()
const names = z.object({
  name: z.string().nullable(),
  nameVariant: z.array(z.string()).nullable().optional(),
  nameAlts: z.array(z.string()).nullable().optional(),
  nameRules: z.array(z.unknown()).nullable().optional(),
})
const divisionResource = z.object({
  type: z.literal('divisions'),
  id: z.string(),
  attributes: z.object({
    level: z.number().nullable(),
    class: z.string().nullable().optional(),
    category: z.string().nullable().optional(),
    i18n: z.record(z.string(), names),
    geometry: geometry.optional(),
  }),
})
const addressResource = z.object({
  type: z.literal('addresses'),
  id: z.string(),
  attributes: z.record(z.string(), z.unknown()),
})
const resultResource = z.object({
  type: z.literal('geocoding-results'),
  id: z.string(),
  attributes: z.object({
    status: z.enum(['resolved', 'ambiguous', 'incomplete', 'not_found']),
    rank: z.number().int().positive().optional(),
    coordinates: point.optional(),
    coordinateRole: z.string().optional(),
    match: z
      .object({
        type: z
          .enum([
            'reverse-geocoding',
            'forward-geocoding',
            'exact_location',
            'nearest',
            'exact_text',
            'partial_text',
          ])
          .describe(
            'Division matches use reverse-geocoding for coordinate containment and forward-geocoding for name searches. Address matches use exact_location, nearest, exact_text or partial_text.',
          ),
        score: z.number().optional(),
        distanceMetres: z.number().nullable().optional(),
      })
      .optional(),
  }),
  relationships: z
    .record(z.string(), relationship)
    .describe(
      'Ordered root-to-leaf administrative, locality, hood and landform branches. Multiple alternative paths are retained in relationship meta.paths.',
    ),
  meta: z
    .record(z.string(), z.unknown())
    .optional()
    .describe('Full-profile lookup evidence and separate dataset-wide coverage.'),
})
export const GeocodingResponseSchema = z.object({
  jsonapi: z.object({ version: z.literal('1.1') }),
  data: z.array(resultResource),
  included: z.array(z.discriminatedUnion('type', [divisionResource, addressResource])),
  meta: z.record(z.string(), z.unknown()),
})
