import { z } from '@hono/zod-openapi'
import { streetEvidenceAssetRoles } from '@repo/db'

import { IdSchema, JsonApiLinkMapSchema, JsonApiVersionSchema } from './common'

const StreetAssetSchema = z
  .object({
    assetId: z.string(),
    assetUrl: z.string().url(),
    contentHash: z.string(),
    label: z.string().nullable(),
    mediaType: z.string(),
    originalUrl: z.string().url(),
    retrievedAt: z.string(),
    role: z.enum(streetEvidenceAssetRoles),
    sourcePageLocale: z.enum(['en', 'zh-Hant']).optional(),
    sourcePageUrl: z.string().url().optional(),
  })
  .openapi('StreetAssetLink')

export type StreetAsset = z.infer<typeof StreetAssetSchema>

const StreetLocaleSchema = z
  .object({
    assetLinks: z.array(StreetAssetSchema),
    description: z.string().nullable(),
    name: z.string(),
    translationProvenance: z.unknown().nullable(),
  })
  .openapi('StreetLocale')

export type StreetLocale = z.infer<typeof StreetLocaleSchema>

const StreetProvenanceSchema = z
  .object({
    effectiveDate: z.string().nullable(),
    publicationDate: z.string().nullable(),
    sourceEventIds: z.array(z.string()),
  })
  .nullable()
  .openapi('StreetProvenance')

export const StreetResourceSchema = z
  .object({
    type: z.literal('streets'),
    id: IdSchema,
    attributes: z.object({
      deletedAt: z.string().nullable(),
      districtIds: z.array(z.string()),
      i18n: z.object({
        en: StreetLocaleSchema,
        'zh-Hant': StreetLocaleSchema,
        'zh-Hans': StreetLocaleSchema,
      }),
      landsdPublicationDate: z.string().nullable(),
      provenance: StreetProvenanceSchema,
      status: z.enum(['active', 'deleted']),
      version: z.number().int().positive(),
    }),
    links: JsonApiLinkMapSchema,
  })
  .openapi('Street')

export type StreetResource = z.infer<typeof StreetResourceSchema>

export const StreetDetailParamsSchema = z
  .object({ id: IdSchema })
  .openapi('StreetDetailParams')

export const StreetVersionParamsSchema = z
  .object({ id: IdSchema, version: z.coerce.number().int().positive() })
  .openapi('StreetVersionParams')

export const StreetDetailResponseSchema = z
  .object({
    jsonapi: JsonApiVersionSchema,
    links: JsonApiLinkMapSchema,
    data: StreetResourceSchema,
  })
  .openapi('StreetDetailResponse')

export const StreetVersionsResponseSchema = z
  .object({
    jsonapi: JsonApiVersionSchema,
    links: JsonApiLinkMapSchema,
    data: z.array(StreetResourceSchema),
  })
  .openapi('StreetVersionsResponse')

export const StreetSnapshotNotReadyErrorResponseSchema = z
  .object({
    httpStatus: z.literal(503),
    error: z.literal('snapshot_not_ready'),
    message: z.string(),
  })
  .openapi('StreetSnapshotNotReadyError')
