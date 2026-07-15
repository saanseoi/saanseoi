import { z } from '@hono/zod-openapi'

export const RegionCode = z.enum(['hk', 'mo'])
export const ProfileName = z.enum(['compact', 'default', 'full', 'map'])
export const ApiLocale = z.enum(['en', 'zh-hant', 'zh-hans'])
export const ApiFamilyName = z.enum(['addresses', 'divisions', 'places', 'streets'])

export const IdSchema = z.string().min(1).regex(/^\S+$/).openapi('Id', {
  description: 'A unique identifier with no whitespace characters.',
})

export const BBoxSchema = z
  .tuple([z.number(), z.number(), z.number(), z.number()])
  .openapi('BBox', {
    description: 'A four-coordinate bounding box: west, south, east, north.',
  })

export const GeometrySchema = z.object({}).loose().openapi('Geometry', {
  description: 'A GeoJSON geometry value.',
})

export const CartographicHintsSchema = z
  .object({
    prominence: z.number().optional(),
    min_zoom: z.number().optional(),
    max_zoom: z.number().optional(),
  })
  .loose()
  .openapi('CartographicHints', {
    description: 'Cartographic hints for map display and feature prominence.',
  })

export const WikidataIdSchema = z
  .string()
  .regex(/^Q\d+$/)
  .openapi('WikidataId', {
    description: 'A Wikidata identifier in Q-number form.',
  })

export const OverturePlaceTypeSchema = z.string().openapi('OverturePlaceType', {
  description: 'An Overture place-type compatibility value.',
})

export const OvertureDivisionClassSchema = z.string().openapi('OvertureDivisionClass', {
  description: 'An Overture division-class compatibility value.',
})

export const FeatureVersionSchema = z
  .number()
  .int()
  .min(0)
  .max(2_147_483_647)
  .openapi('FeatureVersion', {
    description:
      'The source feature version supplied by Overture. This is independent of Atlas canonical version hashes.',
  })

export const OvertureSourceItemSchema = z
  .object({
    property: z.string(),
    dataset: z.string().min(1),
    license: z.string().nullable().optional(),
    record_id: z.string().nullable().optional(),
    update_time: z.string().nullable().optional(),
    confidence: z.number().min(0).max(1).nullable().optional(),
    between: z.tuple([z.number(), z.number()]).nullable().optional(),
  })
  .loose()
  .openapi('OvertureSourceItem', {
    description: 'An Overture source attribution item for a feature property.',
  })

export const OtherSourceTypeItemSchema = z
  .object({})
  .loose()
  .openapi('OtherSourceTypeItem', {
    description: 'A provider-specific source attribution item.',
  })

const OvertureSourceItemsSchema = z
  .array(OvertureSourceItemSchema)
  .min(1)
  .refine(
    items => new Set(items.map(item => JSON.stringify(item))).size === items.length,
    { message: 'Source items must be unique.' },
  )
  .openapi({ uniqueItems: true })

const OtherSourceTypeItemsSchema = z
  .array(OtherSourceTypeItemSchema)
  .min(1)
  .refine(
    items => new Set(items.map(item => JSON.stringify(item))).size === items.length,
    { message: 'Source items must be unique.' },
  )
  .openapi({ uniqueItems: true })

export const SourcesSchema = z
  .object({
    overture: OvertureSourceItemsSchema.optional(),
  })
  .catchall(OtherSourceTypeItemsSchema)
  .openapi('Sources', {
    description:
      'Source attribution grouped by provider. Each provider key maps to one or more source items.',
  })

export type SourcesPayload = z.infer<typeof SourcesSchema>

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
      examples: ['data-hk-divisions-2026-04-15.0'],
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
