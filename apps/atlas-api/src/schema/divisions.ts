import { z } from '@hono/zod-openapi'
import { getRequestedApiLocalesValidationError } from '@repo/core'

import {
  ApiLocale,
  JsonApiLinkMapSchema,
  JsonApiVersionSchema,
  ProfileName,
} from './common'

const DivisionResourceIdentifierSchema = z
  .object({
    type: z.literal('divisions'),
    id: z.string(),
  })
  .openapi('DivisionResourceIdentifier')

const DivisionI18nAttributesSchema = z
  .object({
    name: z.string().nullable().optional(),
    localType: z.string().nullable().optional(),
  })
  .openapi('DivisionI18nAttributes')

const DivisionAttributesSchema = z
  .object({
    level: z.number().int(),
    divisionType: z.string(),
    subtype: z.string().nullable().optional(),
    divisionClass: z.string().nullable().optional(),
    geometry: z.object({}).loose().nullable().optional(),
    bbox: z.object({}).loose().nullable().optional(),
    population: z.number().int().nullable().optional(),
    wikidata: z.string().nullable().optional(),
    i18n: z
      .object({
        en: DivisionI18nAttributesSchema.optional(),
        'zh-hant': DivisionI18nAttributesSchema.optional(),
        'zh-hans': DivisionI18nAttributesSchema.optional(),
      })
      .catchall(DivisionI18nAttributesSchema)
      .partial()
      .optional(),
  })
  .openapi('DivisionAttributes')

const DivisionRelationshipsSchema = z
  .object({
    parent: z
      .object({
        data: DivisionResourceIdentifierSchema.nullable(),
      })
      .optional(),
  })
  .openapi('DivisionRelationships')

const RequestedLocaleCodeSchema = z.string().openapi({
  examples: ['en', 'zh-hant', 'fr-ca'],
})

const RequestedLocalesQuerySchema = z
  .string()
  .superRefine((value, ctx) => {
    const error = getRequestedApiLocalesValidationError(value)

    if (error) {
      ctx.addIssue({
        code: 'custom',
        message: error,
      })
    }
  })
  .openapi({
    examples: ['en,zh-hant', '*', 'null'],
  })

const DivisionResourceSchema = z
  .object({
    type: z.literal('divisions'),
    id: z.string(),
    attributes: DivisionAttributesSchema,
    relationships: DivisionRelationshipsSchema,
    links: JsonApiLinkMapSchema.optional(),
    meta: z.object({}).loose().optional(),
  })
  .openapi('DivisionResource')

const DivisionDocumentMetaSchema = z
  .object({
    requestedVersion: z.enum(['v0', 'v0.1']),
    resolvedVersion: z.literal('0.1'),
    profile: ProfileName,
    locales: z
      .array(z.union([RequestedLocaleCodeSchema, z.literal('*')]))
      .refine(
        locales =>
          !locales.includes('*') || (locales.length === 1 && locales[0] === '*'),
        {
          message:
            'locales must be locale codes, or a single "*" when all locales are returned',
        },
      )
      .openapi({
        examples: [['en', 'zh-hant'], ['fr-ca'], ['*']],
      }),
    filters: z
      .object({
        level: z.number().int().optional(),
        divisionType: z.string().optional(),
        parent: z.string().optional(),
      })
      .optional(),
    page: z
      .object({
        limit: z.number().int(),
        offset: z.number().int(),
        total: z.number().int().optional(),
      })
      .optional(),
  })
  .openapi('DivisionDocumentMeta')

export const DivisionsListQuerySchema = z
  .object({
    profile: ProfileName.optional(),
    locales: RequestedLocalesQuerySchema.optional(),
    include: z.literal('parent').optional(),
    'page[limit]': z.coerce.number().int().min(1).max(100).optional(),
    'page[offset]': z.coerce.number().int().min(0).optional(),
    'filter[level]': z.coerce.number().int().min(0).optional(),
    'filter[divisionType]': z.string().optional(),
    'filter[parent]': z.string().optional(),
  })
  .openapi('DivisionsListQuery')

export const DivisionDetailParamsSchema = z
  .object({
    id: z.string(),
  })
  .openapi('DivisionDetailParams')

export const DivisionDetailQuerySchema = z
  .object({
    profile: ProfileName.optional(),
    locales: RequestedLocalesQuerySchema.optional(),
    include: z.literal('parent').optional(),
  })
  .openapi('DivisionDetailQuery')

export const DivisionsListResponseSchema = z
  .object({
    jsonapi: JsonApiVersionSchema,
    links: JsonApiLinkMapSchema,
    data: z.array(DivisionResourceSchema),
    included: z.array(DivisionResourceSchema).optional(),
    meta: DivisionDocumentMetaSchema,
  })
  .openapi('DivisionsListResponse')

export const DivisionDetailResponseSchema = z
  .object({
    jsonapi: JsonApiVersionSchema,
    links: JsonApiLinkMapSchema,
    data: DivisionResourceSchema,
    included: z.array(DivisionResourceSchema).optional(),
    meta: DivisionDocumentMetaSchema,
  })
  .openapi('DivisionDetailResponse')

export const DivisionSnapshotNotReadyErrorResponseSchema = z
  .object({
    httpStatus: z.literal(503),
    error: z.literal('snapshot_not_ready'),
    message: z.literal('No active division snapshot is published.'),
  })
  .openapi('DivisionSnapshotNotReadyErrorResponse')

export { ApiLocale }
