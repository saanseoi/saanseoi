import { z } from '@hono/zod-openapi'
import { getRequestedApiLocalesValidationError } from '@repo/core'

import {
  ApiVersionMetadataSchema,
  BBoxSchema,
  GeometrySchema,
  IdSchema,
  JsonApiLinkMapSchema,
  JsonApiVersionSchema,
  ProfileName,
  RequestedLocalesMetadataSchema,
} from './common'

const AddressI18nAttributesSchema = z
  .object({
    formattedAddress: z.string(),
    buildingName: z.string().nullable().optional(),
    buildingNumberExpression: z.string().nullable().optional(),
    buildingNumberFrom: z.string().nullable().optional(),
    buildingNumberTo: z.string().nullable().optional(),
    buildingNumberConnector: z.string().nullable().optional(),
    blockExpression: z.string().nullable().optional(),
    blockType: z.string().nullable().optional(),
    blockRef: z.string().nullable().optional(),
    blockTypeBeforeNumber: z.boolean().nullable().optional(),
    phaseExpression: z.string().nullable().optional(),
    phaseName: z.string().nullable().optional(),
    phaseRef: z.string().nullable().optional(),
    estateName: z.string().nullable().optional(),
    streetName: z.string().nullable().optional(),
  })
  .openapi('AddressI18nAttributes')

const AddressI18nSchema = z
  .record(z.string(), AddressI18nAttributesSchema)
  .openapi('AddressI18n')

const AddressAttributesSchema = z
  .object({
    snapshotId: z.string().optional(),
    geometry: z.union([GeometrySchema, z.null()]).optional(),
    bbox: z.union([BBoxSchema, z.null()]).optional(),
    createdAt: z.string().optional(),
    updatedAt: z.string().optional(),
    identifiers: z.unknown().optional(),
    sources: z.unknown().optional(),
    i18n: AddressI18nSchema.optional(),
  })
  .openapi('AddressAttributes')

const AddressDivisionRelationshipSchema = z
  .object({
    data: z.union([z.object({ type: z.literal('divisions'), id: IdSchema }), z.null()]),
  })
  .openapi('AddressDivisionRelationship')

const AddressRelationshipsSchema = z
  .object({
    country: AddressDivisionRelationshipSchema,
    area: AddressDivisionRelationshipSchema,
    district: AddressDivisionRelationshipSchema,
    town: AddressDivisionRelationshipSchema,
    macrohood: AddressDivisionRelationshipSchema,
    neighbourhood: AddressDivisionRelationshipSchema,
    microhood: AddressDivisionRelationshipSchema,
    village: AddressDivisionRelationshipSchema,
    hamlet: AddressDivisionRelationshipSchema,
    hierarchy: z.object({
      data: z.array(z.object({ type: z.literal('divisions'), id: IdSchema })),
    }),
  })
  .openapi('AddressRelationships')

const AddressResourceSchema = z
  .object({
    type: z.literal('addresses'),
    id: IdSchema,
    attributes: AddressAttributesSchema,
    relationships: AddressRelationshipsSchema,
    links: JsonApiLinkMapSchema.optional(),
    meta: z.object({}).loose().optional(),
  })
  .openapi('Address')

const AddressDocumentMetaSchema = z
  .object({
    apiCatalogRevision: z.string(),
    catalogPublishedAt: z.string(),
    cohort: z.string(),
    domain: z.string(),
    profile: ProfileName,
    locales: RequestedLocalesMetadataSchema,
    filters: z
      .object({
        country: z.string().optional(),
        area: z.string().optional(),
        district: z.string().optional(),
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
  .openapi('AddressDocumentMeta')

const RequestedLocalesQuerySchema = z
  .string()
  .superRefine((value, ctx) => {
    const error = getRequestedApiLocalesValidationError(value)
    if (error) ctx.addIssue({ code: 'custom', message: error })
  })
  .openapi({ examples: ['en,zh-hant', '*', 'null'] })

const AddressSelectionQuerySchema = z.object({
  catalogRevision: z.string().min(1).optional(),
  cohort: z.string().min(1).optional(),
  domain: z.literal('default').optional(),
  effectiveAt: z.iso.datetime().optional(),
  knownAt: z.iso.datetime().optional(),
  releaseSet: z.string().min(1).optional(),
  profile: ProfileName.optional(),
  locales: RequestedLocalesQuerySchema.optional(),
})

export const AddressesListQuerySchema = AddressSelectionQuerySchema.extend({
  'page[limit]': z.coerce.number().int().min(1).max(1000).optional(),
  'page[offset]': z.coerce.number().int().min(0).optional(),
  'filter[country]': IdSchema.optional(),
  'filter[area]': IdSchema.optional(),
  'filter[district]': IdSchema.optional(),
  include: z.enum(['hierarchy']).optional(),
}).openapi('AddressesListQuery')

export const AddressDetailQuerySchema = AddressSelectionQuerySchema.extend({
  include: z.enum(['hierarchy']).optional(),
}).openapi('AddressDetailQuery')

export const AddressDetailParamsSchema = z
  .object({ id: IdSchema })
  .openapi('AddressDetailParams')

export const AddressesListResponseSchema = z
  .object({
    jsonapi: JsonApiVersionSchema,
    links: JsonApiLinkMapSchema,
    data: z.array(AddressResourceSchema),
    included: z.array(z.unknown()).optional(),
    meta: AddressDocumentMetaSchema,
  })
  .openapi('AddressesListResponse')

export const AddressDetailResponseSchema = z
  .object({
    jsonapi: JsonApiVersionSchema,
    links: JsonApiLinkMapSchema,
    data: AddressResourceSchema,
    included: z.array(z.unknown()).optional(),
    meta: AddressDocumentMetaSchema,
  })
  .openapi('AddressDetailResponse')

export const AddressSnapshotNotReadyErrorResponseSchema = z
  .object({
    httpStatus: z.literal(503),
    error: z.literal('snapshot_not_ready'),
    message: z.literal('No active address snapshot is published.'),
  })
  .openapi('AddressSnapshotNotReadyErrorResponse')
