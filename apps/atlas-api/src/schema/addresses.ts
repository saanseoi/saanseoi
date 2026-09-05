import { z } from '@hono/zod-openapi'
import { getRequestedApiLocalesValidationError } from '@repo/core'
import { addressBlockTypes } from '@repo/db'

import { openApiText } from '../lib/openapi-i18n'
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
    formattedAddress: z.string().openapi({
      description: openApiText('openapi_addresses_formatted_address_description'),
      examples: [
        "BLK A, PEARL COURT, 13 BELCHER'S STREET, CENTRAL & WESTERN DISTRICT, HK",
        'TOWER 1, ISLAND CREST, 8 FIRST STREET, CENTRAL & WESTERN DISTRICT, HK',
        'HOUSE 2, 35 BARKER ROAD, CENTRAL & WESTERN DISTRICT, HK',
        "ON NING BUILDING, 427 KING'S ROAD, EASTERN DISTRICT, HK",
      ],
    }),
    buildingName: z
      .string()
      .nullable()
      .optional()
      .openapi({
        description: openApiText('openapi_addresses_building_name_description'),
        examples: [
          'FU TOR LOY SHOPPING CENTRE',
          'ON NING BUILDING',
          'GOLDEN MANSION',
          'LUCKY BUILDING',
          'WING WAH BUILDING',
          null,
        ],
      }),
    buildingNumberExpression: z
      .string()
      .nullable()
      .optional()
      .openapi({
        description: openApiText(
          'openapi_addresses_building_number_expression_description',
        ),
        examples: ['1', '8', '1A', '19B', '1000A', null],
      }),
    buildingNumberFrom: z
      .string()
      .nullable()
      .optional()
      .openapi({
        description: openApiText('openapi_addresses_building_number_from_description'),
        examples: ['1', '6', '19', '51', null],
      }),
    buildingNumberTo: z
      .string()
      .nullable()
      .optional()
      .openapi({
        description: openApiText('openapi_addresses_building_number_to_description'),
        examples: ['3', '8', '18', '21', '75', null],
      }),
    buildingNumberConnector: z
      .string()
      .nullable()
      .optional()
      .openapi({
        description: openApiText(
          'openapi_addresses_building_number_connector_description',
        ),
        examples: [null],
      }),
    blockExpression: z
      .string()
      .nullable()
      .optional()
      .openapi({
        description: openApiText('openapi_addresses_block_expression_description'),
        examples: [
          'BLK A',
          'BLK B',
          'TWR 1',
          'HSE 2',
          'APT D1',
          'FLAT A',
          'MANSION A',
          'GARAGE A',
          'COMMERCIAL CENTRE',
          'TWR 1&2',
          null,
        ],
      }),
    blockType: z
      .enum(addressBlockTypes)
      .nullable()
      .optional()
      .openapi({
        description: openApiText('openapi_addresses_block_type_description'),
        examples: [...addressBlockTypes],
      }),
    blockRef: z
      .string()
      .nullable()
      .optional()
      .openapi({
        description: openApiText('openapi_addresses_block_ref_description'),
        examples: ['A', 'B', '1', 'D1', '1&2', null],
      }),
    blockTypeBeforeNumber: z
      .boolean()
      .nullable()
      .optional()
      .openapi({
        description: openApiText(
          'openapi_addresses_block_type_before_number_description',
        ),
        examples: [true, null],
      }),
    phaseExpression: z
      .string()
      .nullable()
      .optional()
      .openapi({
        description: openApiText('openapi_addresses_phase_expression_description'),
        examples: ['PHASE I', 'PHASE II', 'PHASE IIIB', 'PHASE 3', null],
      }),
    phaseName: z
      .string()
      .nullable()
      .optional()
      .openapi({
        description: openApiText('openapi_addresses_phase_name_description'),
        examples: ['PHASE', '期', null],
      }),
    phaseRef: z
      .string()
      .nullable()
      .optional()
      .openapi({
        description: openApiText('openapi_addresses_phase_ref_description'),
        examples: ['I', 'II', 'IIIB', '3', null],
      }),
    estateName: z
      .string()
      .nullable()
      .optional()
      .openapi({
        description: openApiText('openapi_addresses_estate_name_description'),
        examples: [
          'FAIRVIEW PARK',
          'HONG LOK YUEN',
          'PALM SPRINGS',
          'DISCOVERY BAY',
          'MARINA COVE',
          'WHAMPOA ESTATE',
          null,
        ],
      }),
    streetName: z
      .string()
      .nullable()
      .optional()
      .openapi({
        description: openApiText('openapi_addresses_street_name_description'),
        examples: [
          'CASTLE PEAK ROAD',
          "KING'S ROAD",
          'NATHAN ROAD',
          'CANTON ROAD',
          "QUEEN'S ROAD WEST",
          'LAI CHI KOK ROAD',
          null,
        ],
      }),
  })
  .openapi('AddressI18nAttributes', {
    description: openApiText('openapi_addresses_i18n_attributes_description'),
  })

const AddressI18nSchema = z
  .record(z.string(), AddressI18nAttributesSchema)
  .openapi('AddressI18n', {
    description: openApiText('openapi_addresses_i18n_description'),
    'x-recordKeyName': openApiText('openapi_addresses_i18n_locale_label'),
  })

const AddressAttributesSchema = z
  .object({
    snapshotId: z
      .string()
      .optional()
      .openapi({
        description: openApiText('openapi_addresses_snapshot_id_description'),
        examples: ['ss-hk-address-2026-08-19.0'],
      }),
    geometry: z
      .union([GeometrySchema, z.null()])
      .optional()
      .openapi({
        description: openApiText('openapi_addresses_geometry_description'),
      }),
    bbox: z
      .union([BBoxSchema, z.null()])
      .optional()
      .openapi({
        description: openApiText('openapi_addresses_bbox_description'),
        examples: [[114.132, 22.28566, 114.132, 22.28566]],
      }),
    createdAt: z
      .string()
      .optional()
      .openapi({
        description: openApiText('openapi_addresses_created_at_description'),
      }),
    updatedAt: z
      .string()
      .optional()
      .openapi({
        description: openApiText('openapi_addresses_updated_at_description'),
      }),
    identifiers: z
      .unknown()
      .optional()
      .openapi({
        description: openApiText('openapi_addresses_identifiers_description'),
      }),
    sources: z
      .unknown()
      .optional()
      .openapi({
        description: openApiText('openapi_addresses_sources_description'),
      }),
    i18n: AddressI18nSchema.optional().openapi({
      description: openApiText('openapi_addresses_i18n_field_description'),
    }),
  })
  .openapi('AddressAttributes', {
    description: openApiText('openapi_addresses_attributes_description'),
  })

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
  .openapi('AddressRelationships', {
    description: openApiText('openapi_addresses_relationships_description'),
  })

const AddressResourceSchema = z
  .object({
    type: z.literal('addresses'),
    id: IdSchema,
    attributes: AddressAttributesSchema,
    relationships: AddressRelationshipsSchema,
    links: JsonApiLinkMapSchema.optional().openapi({
      description: openApiText('openapi_addresses_links_description'),
    }),
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
    search: z
      .object({
        query: z.string(),
        mode: z.enum(['exact', 'range', 'prefix', 'component', 'full-text']),
        component: z
          .enum([
            'formatted',
            'building',
            'number',
            'block',
            'phase',
            'estate',
            'street',
          ])
          .optional(),
      })
      .optional(),
  })
  .extend(ApiVersionMetadataSchema.shape)
  .openapi('AddressDocumentMeta')

const RequestedLocalesQuerySchema = z
  .string()
  .superRefine((value: string, ctx: z.RefinementCtx<string>) => {
    const error = getRequestedApiLocalesValidationError(value)
    if (error) ctx.addIssue({ code: 'custom', message: error })
  })
  .openapi({ examples: ['en,zh-hant', '*', 'null'] })

const AddressSelectionQuerySchema = z.object({
  catalogRevision: z.string().min(1).optional(),
  cohort: z.string().min(1).optional(),
  domain: z.literal('official').optional(),
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

export const AddressSearchQuerySchema = AddressSelectionQuerySchema.extend({
  q: z
    .string()
    .min(1)
    .max(200)
    .openapi({
      description: openApiText('openapi_addresses_search_query_description'),
    }),
  match: z.enum(['exact', 'range', 'prefix', 'component', 'full-text']).openapi({
    description: openApiText('openapi_addresses_search_match_description'),
  }),
  component: z
    .enum(['formatted', 'building', 'number', 'block', 'phase', 'estate', 'street'])
    .optional()
    .openapi({
      description: openApiText('openapi_addresses_search_component_description'),
    }),
  'page[limit]': z.coerce.number().int().min(1).max(50).optional(),
  'page[offset]': z.coerce.number().int().min(0).max(1000).optional(),
  'filter[country]': IdSchema.optional(),
  'filter[area]': IdSchema.optional(),
  'filter[district]': IdSchema.optional(),
  include: z.enum(['hierarchy']).optional(),
})
  .superRefine((value, ctx) => {
    if (value.match === 'component' && !value.component) {
      ctx.addIssue({
        code: 'custom',
        message: 'component is required when match=component.',
        path: ['component'],
      })
    }
    if (value.match !== 'component' && value.component) {
      ctx.addIssue({
        code: 'custom',
        message: 'component is only available when match=component.',
        path: ['component'],
      })
    }
  })
  .openapi('AddressSearchQuery')

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
