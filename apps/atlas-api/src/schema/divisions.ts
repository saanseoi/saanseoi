import { z } from '@hono/zod-openapi'
import { getRequestedApiLocalesValidationError } from '@repo/core'

import {
  ApiVersionMetadataSchema,
  ApiLocale,
  JsonApiLinkMapSchema,
  JsonApiVersionSchema,
  ProfileName,
  RequestedLocalesMetadataSchema,
} from './common'

const DivisionResourceIdentifierSchema = z
  .object({
    type: z.literal('divisions'),
    id: z.string(),
  })
  .openapi('DivisionResourceIdentifier')

const DivisionNameRuleSchema = z
  .object({
    value: z.string(),
    variant: z.string().nullable(),
  })
  .openapi('DivisionNameRule')

const DivisionI18nAttributesSchema = z
  .object({
    name: z.string().nullable().optional(),
    nameVariant: z.array(z.string()).nullable().optional(),
    nameAlts: z.array(z.string()).nullable().optional(),
    nameRules: z.array(DivisionNameRuleSchema).nullable().optional(),
  })
  .openapi('DivisionI18nAttributes')

const DivisionAncestorResourceIdentifierSchema =
  DivisionResourceIdentifierSchema.extend({
    meta: z
      .object({
        name: z.string().optional(),
        subType: z.string().optional(),
      })
      .optional(),
  }).openapi('DivisionAncestorResourceIdentifier')

const DivisionAttributesSchema = z
  .object({
    level: z.number().int(),
    type: z.string(),
    snapshotId: z.string().optional(),
    geometry: z.object({}).loose().nullable().optional(),
    bbox: z
      .tuple([z.number(), z.number(), z.number(), z.number()])
      .nullable()
      .optional(),
    cartography: z.object({}).loose().nullable().optional(),
    population: z.number().int().nullable().optional(),
    wikidata: z.string().nullable().optional(),
    createdAt: z.string().optional(),
    updatedAt: z.string().optional(),
    sources: z.object({}).loose().nullable().optional(),
    overture: z
      .object({
        subtype: z.string().nullable().optional(),
        class: z.string().nullable().optional(),
        hierarchy: z.unknown().optional(),
      })
      .optional(),
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
    ancestors: z
      .object({
        data: z.array(DivisionAncestorResourceIdentifierSchema),
      })
      .optional(),
  })
  .openapi('DivisionRelationships')

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
    profile: ProfileName,
    locales: RequestedLocalesMetadataSchema,
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
  .extend(ApiVersionMetadataSchema.shape)
  .openapi('DivisionDocumentMeta')

export const DivisionsListQuerySchema = z
  .object({
    profile: ProfileName.optional(),
    locales: RequestedLocalesQuerySchema.optional(),
    include: z.literal('ancestors').optional(),
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
    include: z.literal('ancestors').optional(),
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
