import { RegionFilterSchema } from './region'
import { z } from '@hono/zod-openapi'
import { getRequestedApiLocalesValidationError } from '@repo/core'
import { addressBlockTypes, addressGranularities } from '@repo/db'
import { address3dFloorTypes, address3dUnitTypes } from '@repo/db/address3d'

export const Address3dCoverageSchema = z.union([
  z.object({ kind: z.literal('none') }),
  z.object({
    kind: z.enum(['direct', 'ancestor']),
    ownerAddress2dId: z.string(),
    address3dId: z.string(),
    membership: z.enum(['established', 'unresolved']),
  }),
])
const Address3dResourceSchema = z
  .object({
    type: z.literal('address3d'),
    id: z.string(),
    attributes: z.object({
      snapshotId: z.string(),
      address2dId: z.string(),
      unitCount: z.number().int(),
      units: z.array(
        z.object({
          id: z.string(),
          unitRef: z.string(),
          unitType: z.enum(address3dUnitTypes),
          floorRef: z.string(),
          floorType: z.enum(address3dFloorTypes),
          unitPortion: z.string().nullable(),
        }),
      ),
      i18n: z.record(
        z.string(),
        z.record(
          z.string(),
          z.object({
            unitExpression: z.string(),
            floorExpression: z.string(),
            formattedAddressPart: z.string().optional(),
          }),
        ),
      ),
    }),
  })
  .openapi('Address3d')

export const AddressUnitsResponseSchema = z.object({
  data: Address3dResourceSchema.nullable(),
  meta: z.object({ address3dCoverage: Address3dCoverageSchema }),
})

import { openApiText } from '../lib/openapi-i18n'
import {
  ApiVersionMetadataSchema,
  BBoxSchema,
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
        examples: ['1', '8', '1A', '19B', '1000A'],
      }),
    buildingNumberFrom: z
      .string()
      .nullable()
      .optional()
      .openapi({
        description: openApiText('openapi_addresses_building_number_from_description'),
        examples: ['1', '6'],
      }),
    buildingNumberTo: z
      .string()
      .nullable()
      .optional()
      .openapi({
        description: openApiText('openapi_addresses_building_number_to_description'),
        examples: ['3', '6A'],
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
        examples: ['A', 'B', '1', 'D1', '1&2'],
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
        examples: [
          'PHASE I',
          'PHASE 2',
          'PHASE IIIB',
          'THE HIGHLAND',
          'CHONG CHIEN COURT',
          null,
        ],
      }),
    phaseName: z
      .string()
      .nullable()
      .optional()
      .openapi({
        description: openApiText('openapi_addresses_phase_name_description'),
        examples: ['PHASE', 'THE HIGHLAND', 'STAGE', null],
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

const AddressPointGeometrySchema = z
  .object({
    type: z.literal('Point'),
    coordinates: z.array(z.number()).min(2).max(3),
  })
  .openapi('AddressPointGeometry', {
    description: openApiText('openapi_addresses_geometry_description'),
  })

const AddressAttributesSchema = z
  .object({
    address3dCoverage: Address3dCoverageSchema,
    granularity: z.enum(addressGranularities).openapi({
      description: openApiText('openapi_addresses_granularity_description'),
    }),
    parentAddressId: IdSchema.nullable().openapi({
      description: openApiText('openapi_addresses_parent_address_id_description'),
    }),
    datasetCode: z.string().openapi({
      description: openApiText('openapi_addresses_dataset_code_description'),
      examples: ['ds-hk-hkgov-dpo-address', 'ds-hk-overture-place'],
    }),
    snapshotId: z
      .string()
      .optional()
      .openapi({
        description: openApiText('openapi_addresses_snapshot_id_description'),
        examples: ['ss-hk-address-2026-08-19.0'],
      }),
    geometry: z
      .union([AddressPointGeometrySchema, z.null()])
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

const AddressUnitsRelationshipSchema = z
  .object({
    data: z.union([z.object({ type: z.literal('address3d'), id: IdSchema }), z.null()]),
    meta: z.object({ address3dCoverage: Address3dCoverageSchema }),
  })
  .openapi('AddressUnitsRelationship')

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
    units: AddressUnitsRelationshipSchema,
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
        dataset: z.string().optional(),
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
  region: RegionFilterSchema,
  catalogRevision: z.string().min(1).optional(),
  cohort: z.string().min(1).optional(),
  domain: z.literal('saanseoi').optional(),
  effectiveAt: z.iso.datetime().optional(),
  knownAt: z.iso.datetime().optional(),
  releaseSet: z.string().min(1).optional(),
  profile: ProfileName.optional(),
  locales: RequestedLocalesQuerySchema.optional(),
})

const AddressDetailIncludeSchema = z
  .enum(['hierarchy', 'units', 'hierarchy,units', 'units,hierarchy'])
  .optional()

export const AddressesListQuerySchema = AddressSelectionQuerySchema.extend({
  'filter[dataset]': z
    .string()
    .min(1)
    .optional()
    .openapi({
      description: openApiText('openapi_addresses_dataset_filter_description'),
      examples: ['ds-hk-hkgov-dpo-address', 'ds-hk-overture-place'],
    }),
  'page[limit]': z.coerce.number().int().min(1).max(1000).optional(),
  'page[offset]': z.coerce.number().int().min(0).optional(),
  'filter[country]': IdSchema.optional(),
  'filter[area]': IdSchema.optional(),
  'filter[district]': IdSchema.optional(),
  include: z.literal('hierarchy').optional(),
}).openapi('AddressesListQuery')

export const AddressDetailQuerySchema = AddressSelectionQuerySchema.extend({
  include: AddressDetailIncludeSchema,
}).openapi('AddressDetailQuery')

export const AddressSearchQuerySchema = AddressSelectionQuerySchema.extend({
  'filter[dataset]': AddressesListQuerySchema.shape['filter[dataset]'],
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
