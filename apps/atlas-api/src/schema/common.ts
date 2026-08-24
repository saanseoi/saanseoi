import { z } from '@hono/zod-openapi'
import { apiProfileNames } from '@repo/core/apiLocales'

import { openApiText } from '../lib/openapi-i18n'

export const RegionCode = z.enum(['hk', 'mo'])
export const ProfileName = z.enum(apiProfileNames)
export const ApiLocale = z.enum(['en', 'zh-hant', 'zh-hans'])
export const ApiFamilyName = z.enum([
  'addresses',
  'divisions',
  'places',
  'streets',
  'stats',
])

export const IdSchema = z
  .string()
  .min(1)
  .regex(/^\S+$/)
  .openapi('Id', {
    description: openApiText('openapi_unique_identifier_description'),
  })

export const BBoxSchema = z
  .tuple([z.number(), z.number(), z.number(), z.number()])
  .openapi('BBox', {
    description: openApiText('openapi_bbox_description'),
  })

const GeoJsonPositionSchema = z
  .array(z.number())
  .min(2)
  .max(3)
  .openapi({
    description: openApiText('openapi_geojson_position_description'),
  })

const GeoJsonGeometrySchema: z.ZodType = z.lazy(() =>
  z.union([
    z.object({
      type: z.literal('Point').openapi({
        description: openApiText('openapi_geojson_geometry_type_description'),
      }),
      coordinates: GeoJsonPositionSchema.openapi({
        description: openApiText('openapi_geojson_coordinates_description'),
      }),
    }),
    z.object({
      type: z.literal('MultiPoint').openapi({
        description: openApiText('openapi_geojson_geometry_type_description'),
      }),
      coordinates: z
        .array(GeoJsonPositionSchema)
        .min(1)
        .openapi({
          description: openApiText('openapi_geojson_coordinates_description'),
        }),
    }),
    z.object({
      type: z.literal('LineString').openapi({
        description: openApiText('openapi_geojson_geometry_type_description'),
      }),
      coordinates: z
        .array(GeoJsonPositionSchema)
        .min(2)
        .openapi({
          description: openApiText('openapi_geojson_coordinates_description'),
        }),
    }),
    z.object({
      type: z.literal('MultiLineString').openapi({
        description: openApiText('openapi_geojson_geometry_type_description'),
      }),
      coordinates: z
        .array(z.array(GeoJsonPositionSchema).min(2))
        .min(1)
        .openapi({
          description: openApiText('openapi_geojson_coordinates_description'),
        }),
    }),
    z.object({
      type: z.literal('Polygon').openapi({
        description: openApiText('openapi_geojson_geometry_type_description'),
      }),
      coordinates: z
        .array(z.array(GeoJsonPositionSchema).min(4))
        .min(1)
        .openapi({
          description: openApiText('openapi_geojson_coordinates_description'),
        }),
    }),
    z.object({
      type: z.literal('MultiPolygon').openapi({
        description: openApiText('openapi_geojson_geometry_type_description'),
      }),
      coordinates: z
        .array(z.array(z.array(GeoJsonPositionSchema).min(4)).min(1))
        .min(1)
        .openapi({
          description: openApiText('openapi_geojson_coordinates_description'),
        }),
    }),
    z.object({
      type: z.literal('GeometryCollection').openapi({
        description: openApiText('openapi_geojson_geometry_type_description'),
      }),
      geometries: z.array(GeoJsonGeometrySchema).openapi({
        description: openApiText('openapi_geojson_geometries_description'),
      }),
    }),
  ]),
)

export const GeometrySchema = GeoJsonGeometrySchema.openapi('Geometry', {
  description: openApiText('openapi_geometry_description'),
})

export const CartographicHintsSchema = z
  .object({
    prominence: z
      .number()
      .optional()
      .openapi({
        description: openApiText('openapi_cartographic_prominence_description'),
      }),
    min_zoom: z
      .number()
      .optional()
      .openapi({
        description: openApiText('openapi_cartographic_min_zoom_description'),
      }),
    max_zoom: z
      .number()
      .optional()
      .openapi({
        description: openApiText('openapi_cartographic_max_zoom_description'),
      }),
  })
  .loose()
  .openapi('CartographicHints', {
    description: openApiText('openapi_cartographic_hints_description'),
  })

export const WikidataIdSchema = z
  .string()
  .regex(/^Q\d+$/)
  .openapi('WikidataId', {
    description: openApiText('openapi_wikidata_identifier_description'),
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
    description: openApiText('openapi_overture_source_item_description'),
  })

export const OtherSourceTypeItemSchema = z
  .object({})
  .loose()
  .openapi('OtherSourceTypeItem', {
    description: openApiText('openapi_other_source_item_description'),
  })

const OvertureSourceItemsSchema = z
  .array(OvertureSourceItemSchema)
  .min(1)
  .refine(
    (items: Array<z.infer<typeof OvertureSourceItemSchema>>) =>
      new Set(items.map(item => JSON.stringify(item))).size === items.length,
    { message: 'Source items must be unique.' },
  )
  .openapi({ uniqueItems: true })

const OtherSourceTypeItemsSchema = z
  .array(OtherSourceTypeItemSchema)
  .min(1)
  .refine(
    (items: Array<z.infer<typeof OtherSourceTypeItemSchema>>) =>
      new Set(items.map(item => JSON.stringify(item))).size === items.length,
    { message: 'Source items must be unique.' },
  )
  .openapi({ uniqueItems: true })

export const SourcesSchema = z
  .object({
    overture: OvertureSourceItemsSchema.optional(),
  })
  .catchall(OtherSourceTypeItemsSchema)
  .openapi('Sources', {
    description: openApiText('openapi_sources_payload_description'),
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
  description: openApiText('openapi_request_validation_failed_description'),
} as const

export const JsonApiVersionSchema = z
  .object({
    version: z.literal('1.1'),
  })
  .openapi('JsonApiVersion')

export const JsonApiLinkMapSchema = z
  .object({
    self: z
      .string()
      .optional()
      .openapi({
        description: openApiText('openapi_jsonapi_link_self_description'),
      }),
    first: z
      .string()
      .optional()
      .openapi({
        description: openApiText('openapi_jsonapi_link_first_description'),
      }),
    prev: z
      .string()
      .optional()
      .openapi({
        description: openApiText('openapi_jsonapi_link_prev_description'),
      }),
    next: z
      .string()
      .optional()
      .openapi({
        description: openApiText('openapi_jsonapi_link_next_description'),
      }),
  })
  .catchall(
    z.unknown().openapi({
      description: openApiText('openapi_jsonapi_link_additional_description'),
    }),
  )
  .openapi('JsonApiLinkMap')

export const RequestedLocaleCodeSchema = z.string().openapi({
  examples: ['en', 'zh-hant', 'fr-ca'],
})

export const RequestedLocalesMetadataSchema = z
  .array(z.union([RequestedLocaleCodeSchema, z.literal('*')]))
  .refine(
    (locales: string[]) =>
      !locales.includes('*') || (locales.length === 1 && locales[0] === '*'),
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
