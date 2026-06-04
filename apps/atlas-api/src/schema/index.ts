import { z } from '@hono/zod-openapi'

export const ErrorResponseSchema = z
  .object({
    httpStatus: z.number().openapi({
      examples: [404, 500],
    }),
    error: z.string().openapi({
      examples: ['not_found', 'internal_error'],
    }),
    message: z.string().openapi({
      examples: ['Route not found.', 'The atlas API request failed.'],
    }),
  })
  .openapi('AtlasErrorResponse')

const ValidationErrorDetailSchema = z
  .object({
    code: z.string().openapi({
      examples: ['invalid_type', 'too_small'],
    }),
    message: z.string().openapi({
      examples: ['Required', 'Expected string, received number'],
    }),
    path: z.string().openapi({
      examples: ['q', 'limit'],
    }),
  })
  .openapi('AtlasValidationErrorDetail')

export const ValidationErrorResponseSchema = z
  .object({
    error: z.literal('validation_error').openapi({
      examples: ['validation_error'],
    }),
    message: z.literal('Request validation failed.').openapi({
      examples: ['Request validation failed.'],
    }),
    details: z.array(ValidationErrorDetailSchema),
    target: z.enum(['json', 'form', 'query', 'param', 'header', 'cookie']).openapi({
      examples: ['query', 'param'],
    }),
  })
  .openapi('AtlasValidationErrorResponse')

export const ValidationErrorOpenAPIResponse = {
  content: {
    'application/json': {
      schema: ValidationErrorResponseSchema,
    },
  },
  description: 'Request validation failed.',
} as const

export const HealthResponseSchema = z
  .object({
    ok: z.boolean(),
    datasetCount: z.number(),
  })
  .openapi('AtlasHealthResponse')

export const DatasetsQuerySchema = z
  .object({
    activeOnly: z.enum(['true', 'false']).optional(),
    regionCode: z.string().optional(),
    snapshotMonth: z.string().optional(),
    theme: z.string().optional(),
    status: z.string().optional(),
    limit: z.coerce.number().int().optional(),
  })
  .openapi('AtlasDatasetsQuery')

export const DatasetsResponseSchema = z
  .object({
    datasets: z.array(z.object({}).loose()),
  })
  .openapi('AtlasDatasetsResponse')

export const RegionPlaceParamsSchema = z
  .object({
    region: z.string(),
    id: z.string(),
  })
  .openapi('AtlasRegionPlaceParams')

export const PlaceQuerySchema = z
  .object({
    locale: z.string().optional(),
  })
  .openapi('AtlasPlaceQuery')

export const PlaceResponseSchema = z
  .object({
    place: z.object({}).loose(),
    i18n: z.array(z.object({}).loose()),
    divisions: z.array(z.object({}).loose()),
  })
  .openapi('AtlasPlaceResponse')

export const PlacesByCellParamsSchema = z
  .object({
    region: z.string(),
    h3Level: z.string(),
    h3Cell: z.string(),
  })
  .openapi('AtlasPlacesByCellParams')

export const PlacesByCellQuerySchema = z
  .object({
    limit: z.coerce.number().int().optional(),
  })
  .openapi('AtlasPlacesByCellQuery')

export const PlacesByCellResponseSchema = z
  .object({
    places: z.array(z.object({}).loose()),
  })
  .openapi('AtlasPlacesByCellResponse')

export const SearchParamsSchema = z
  .object({
    region: z.string(),
  })
  .openapi('AtlasSearchParams')

export const SearchQuerySchema = z
  .object({
    q: z.string(),
    locale: z.string().optional(),
    limit: z.coerce.number().int().optional(),
  })
  .openapi('AtlasSearchQuery')

export const SearchResponseSchema = z
  .object({
    results: z.array(z.object({}).loose()),
  })
  .openapi('AtlasSearchResponse')
