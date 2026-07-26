import { z } from '@hono/zod-openapi'
import { streetChangelogKinds, streetEvidenceAssetRoles } from '@repo/db'

import { IdSchema, JsonApiLinkMapSchema, JsonApiVersionSchema } from './common'

const StreetAssetSchema = z
  .object({
    assetId: z.string(),
    assetUrl: z.string().url(),
    contentHash: z.string(),
    label: z.string().nullable(),
    mediaType: z.string(),
    originalUrl: z.string().url(),
    publisherIdentifier: z.string().nullable(),
    retrievedAt: z.string(),
    role: z.enum(streetEvidenceAssetRoles),
    sourcePageLocale: z.enum(['en', 'zh-Hant']).optional(),
    sourcePageUrl: z.string().url().optional(),
  })
  .openapi('StreetAssetLink')

export type StreetAsset = z.infer<typeof StreetAssetSchema>

const StreetLocaleSchema = z
  .object({
    description: z.string().nullable(),
    name: z.string(),
  })
  .openapi('StreetLocale')

export type StreetLocale = z.infer<typeof StreetLocaleSchema>

const StreetChangelogEntrySchema = z
  .object({
    evidenceAssets: z.array(StreetAssetSchema),
    effectiveDate: z.string().nullable(),
    gazetteDate: z.string().nullable(),
    isPartialNameChange: z.boolean(),
    kind: z.enum(streetChangelogKinds),
    noticeRef: z.string().nullable(),
    source: z.object({
      recordKey: z.string(),
      releaseId: z.string().nullable(),
      shardId: z.string().nullable(),
    }),
  })
  .openapi('StreetChangelogEntry')

export type StreetChangelogEntry = z.infer<typeof StreetChangelogEntrySchema>

export const StreetResourceSchema = z
  .object({
    type: z.literal('streets'),
    id: IdSchema,
    attributes: z.object({
      deletedAt: z.string().nullable(),
      changelog: z.array(StreetChangelogEntrySchema),
      districtIds: z.array(z.string()),
      i18n: z.object({
        en: StreetLocaleSchema,
        'zh-Hant': StreetLocaleSchema,
      }),
      gazetteDate: z.string().nullable(),
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

export const StreetChangelogReplayResponseSchema = z
  .object({
    jsonapi: JsonApiVersionSchema,
    links: JsonApiLinkMapSchema,
    data: z.array(
      z.object({
        type: z.literal('street-changelog'),
        id: z.string(),
        attributes: StreetChangelogEntrySchema,
      }),
    ),
  })
  .openapi('StreetChangelogReplayResponse')

export const StreetSnapshotNotReadyErrorResponseSchema = z
  .object({
    httpStatus: z.literal(503),
    error: z.literal('snapshot_not_ready'),
    message: z.string(),
  })
  .openapi('StreetSnapshotNotReadyError')
