import { z } from '@hono/zod-openapi'

export const RegionCode = z.enum(['hk', 'mo'])
export const ProfileName = z.enum(['compact', 'default', 'full', 'map'])
export const ApiLocale = z.enum(['en', 'zh-hant', 'zh-hans'])
export const ApiFamilyName = z.enum(['addresses', 'divisions', 'places', 'streets'])

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
  .openapi('ErrorResponse')

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
  .openapi('ValidationErrorDetail')

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
  .openapi('ValidationErrorResponse')

export const ValidationErrorOpenAPIResponse = {
  content: {
    'application/json': {
      schema: ValidationErrorResponseSchema,
    },
  },
  description: 'Request validation failed.',
} as const

export const JsonApiVersionSchema = z
  .object({
    version: z.literal('1.1'),
  })
  .openapi('JsonApiVersion')

export const JsonApiLinkMapSchema = z
  .object({
    self: z.string().optional(),
    first: z.string().optional(),
    prev: z.string().optional(),
    next: z.string().optional(),
  })
  .loose()
  .openapi('JsonApiLinkMap')

export const RequestedLocaleCodeSchema = z.string().openapi({
  examples: ['en', 'zh-hant', 'fr-ca'],
})

export const RequestedLocalesMetadataSchema = z
  .array(z.union([RequestedLocaleCodeSchema, z.literal('*')]))
  .refine(
    locales => !locales.includes('*') || (locales.length === 1 && locales[0] === '*'),
    {
      message:
        'locales must be locale codes, or a single "*" when all locales are returned',
    },
  )
  .openapi({
    examples: [['en', 'zh-hant'], ['fr-ca'], ['*']],
  })

export const ApiVersionMetadataSchema = z
  .object({
    requestedApiVersion: z.string().openapi({
      examples: ['0.1', '2'],
    }),
    requestedApiFamily: ApiFamilyName.openapi({
      examples: ['divisions'],
    }),
    resolvedApiVersion: z.string().openapi({
      examples: ['api-divisions-v0.1'],
    }),
    apiReleaseSet: z.string().openapi({
      examples: ['data-hk-divisions-2026-04-15.0-0'],
    }),
    schemaVersion: z
      .string()
      .optional()
      .openapi({
        examples: ['sv-division-v1'],
      }),
    rulesetVersion: z
      .string()
      .optional()
      .openapi({
        examples: ['rs-division-merge-v1'],
      }),
  })
  .openapi('ApiVersionMetadata')
