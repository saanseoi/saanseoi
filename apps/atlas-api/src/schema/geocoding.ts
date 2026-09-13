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
    geometry: z.literal('stub').optional(),
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
const membership = z.object({
  id: z.string(),
  category: z.string().nullable(),
  class: z.string().nullable(),
  level: z.number().nullable(),
  names: z.record(z.string(), z.unknown()),
  evidence: z.string().describe('containment, hierarchy, or a forward name match'),
  geometry: z
    .unknown()
    .optional()
    .describe('Only the geographic stub Polygon or MultiPolygon, or null.'),
})
export const DivisionGeocodingResolutionSchema = z.object({
  status: z.string().describe('resolved, ambiguous, incomplete, or not_found'),
  matchedDivisionIds: z.array(z.string()),
  memberships: z.array(membership),
  path: z
    .array(z.string())
    .nullable()
    .describe(
      'Ordered selected administrative/locality/hood path, including its leaf.',
    ),
  selectedAncestryIds: z
    .array(z.string())
    .nullable()
    .describe(
      'Complete deduplicated membership for counting, including landforms; null when ambiguous.',
    ),
  alternatives: z.array(z.array(z.string())),
  landform: z.object({
    memberships: z.array(membership),
    paths: z.array(z.array(z.string())),
  }),
  coverage: z.object({
    geometry: z.string(),
    covered: z.number(),
    total: z.number(),
    missingAncestorIds: z.array(z.string()),
  }),
  ambiguity: z.object({
    unresolvedDivisionIds: z.array(z.string()),
    overlappingPaths: z.boolean(),
  }),
})
const release = z.object({
  apiReleaseSet: z.string(),
  domain: z.string(),
  cohort: z.string().nullable(),
  schemaVersion: z.string(),
  rulesetVersion: z.string(),
  snapshots: z.array(
    z.object({
      snapshotId: z.string(),
      snapshotResourceType: z.string(),
      role: z.string(),
      variant: z.string(),
    }),
  ),
})
export const GeocodingResponseSchema = z.object({
  data: z.union([
    DivisionGeocodingResolutionSchema,
    z.array(
      z.union([
        z.object({
          type: z.string(),
          id: z.string(),
          rank: z.number(),
          attributes: z.record(z.string(), z.unknown()),
          match: z.object({
            type: z.string(),
            distanceMetres: z.number().nullable().optional(),
            score: z.number().optional(),
          }),
          divisions: DivisionGeocodingResolutionSchema.nullable().optional(),
        }),
        z.object({
          type: z.string(),
          id: z.string(),
          rank: z.number(),
          score: z.number(),
          category: z.string().nullable(),
          class: z.string(),
          level: z.number().nullable(),
          names: z.record(z.string(), z.unknown()),
          coordinates: point.nullable(),
          coordinateRole: z.string(),
          divisions: DivisionGeocodingResolutionSchema.nullable(),
        }),
        z.object({
          type: z.string(),
          rank: z.number(),
          score: z.number(),
          coordinates: point.nullable(),
          addressId: z.string(),
          divisions: DivisionGeocodingResolutionSchema.nullable(),
        }),
      ]),
    ),
  ]),
  meta: z.object({
    apiVersion: z.string(),
    direction: z.string(),
    release,
    addressRelease: release.optional(),
    divisionRelease: release.optional(),
    coordinates: point.nullable().optional(),
    maxDistance: z.number().optional(),
    resolution: z.string().optional(),
    total: z.number().optional(),
    truncated: z.boolean().optional(),
  }),
})
