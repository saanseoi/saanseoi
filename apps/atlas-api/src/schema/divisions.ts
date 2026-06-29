import { z } from '@hono/zod-openapi'
import { isValidRequestedApiLocales } from '@repo/core'

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
        zhHant: DivisionI18nAttributesSchema.optional(),
        zhHans: DivisionI18nAttributesSchema.optional(),
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
      .array(z.union([ApiLocale, z.literal('*')]))
      .refine(
        locales =>
          !locales.includes('*') || (locales.length === 1 && locales[0] === '*'),
        {
          message:
            'locales must be contract locales, or a single "*" when all locales are returned',
        },
      )
      .openapi({
        examples: [['en', 'zhHant'], ['*']],
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
    locales: z
      .string()
      .refine(isValidRequestedApiLocales, {
        message:
          'locales must be a comma-separated list of en, zhHant, zhHans, or none',
      })
      .optional()
      .openapi({
        examples: ['en,zhHant', 'none'],
      }),
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
    locales: z
      .string()
      .refine(isValidRequestedApiLocales, {
        message:
          'locales must be a comma-separated list of en, zhHant, zhHans, or none',
      })
      .optional()
      .openapi({
        examples: ['en,zhHant', 'none'],
      }),
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
