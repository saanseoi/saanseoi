import { z } from '@hono/zod-openapi'
import { getRequestedApiLocalesValidationError } from '@repo/core'

import { MAX_PLACE_RESULTS, MAX_PLACE_SEARCH_LENGTH } from '../lib/api-limits'
import {
  ApiVersionMetadataSchema,
  BBoxSchema,
  ConfidenceScoreSchema,
  EmailStrSchema,
  HttpUrlSchema,
  IdSchema,
  JsonApiLinkMapSchema,
  JsonApiVersionSchema,
  PhoneNumberSchema,
  ProfileName,
  RegionCode,
  RequestedLocalesMetadataSchema,
  WikidataIdSchema,
} from './common'
import { openApiText } from '../lib/openapi-i18n'

export const SearchSnapshotNotReadyErrorResponseSchema = z
  .object({
    httpStatus: z.number().openapi({
      examples: [503],
    }),
    error: z.literal('snapshot_not_ready').openapi({
      examples: ['snapshot_not_ready'],
    }),
    message: z.literal('No active place snapshot is published.').openapi({
      examples: ['No active place snapshot is published.'],
    }),
  })
  .openapi('SearchSnapshotNotReadyErrorResponse')

export const SearchFtsNotReadyErrorResponseSchema = z
  .object({
    httpStatus: z.number().openapi({
      examples: [503],
    }),
    error: z.literal('fts_not_ready').openapi({
      examples: ['fts_not_ready'],
    }),
    message: z
      .literal('FTS index is not initialised. Rebuild placesFts before using search.')
      .openapi({
        examples: [
          'FTS index is not initialised. Rebuild placesFts before using search.',
        ],
      }),
  })
  .openapi('SearchFtsNotReadyErrorResponse')

export const SearchUnavailableErrorResponseSchema = z
  .union([
    SearchSnapshotNotReadyErrorResponseSchema,
    SearchFtsNotReadyErrorResponseSchema,
  ])
  .openapi('SearchUnavailableErrorResponse')

export const RegionPlaceParamsSchema = z
  .object({
    region: RegionCode,
    id: z.string(),
  })
  .openapi('RegionPlaceParams')

export const PlaceQuerySchema = z
  .object({
    locale: z.string().optional(),
  })
  .openapi('PlaceQuery')

const PlaceBBoxSchema = z.union([BBoxSchema, z.null()]).openapi({
  description: openApiText('openapi_places_bbox_description'),
}) as z.ZodType<unknown>

const PlaceGeometrySchema = z
  .object({
    type: z.literal('Point').openapi({
      description: openApiText('openapi_geojson_geometry_type_description'),
    }),
    coordinates: z.tuple([z.number(), z.number()]).openapi({
      description: openApiText('openapi_geojson_coordinates_description'),
    }),
  })
  .openapi('PlaceGeometry', {
    description: openApiText('openapi_geometry_description'),
  })

const PlaceSourceSchema = z
  .object({
    property: z
      .string()
      .optional()
      .openapi({
        description: openApiText('openapi_places_source_property_description'),
      }),
    dataset: z
      .string()
      .optional()
      .openapi({
        description: openApiText('openapi_places_source_dataset_description'),
      }),
    license: z
      .string()
      .nullable()
      .optional()
      .openapi({
        description: openApiText('openapi_places_source_license_description'),
      }),
    record_id: z
      .string()
      .nullable()
      .optional()
      .openapi({
        description: openApiText('openapi_places_source_record_id_description'),
      }),
    update_time: z
      .string()
      .nullable()
      .optional()
      .openapi({
        description: openApiText('openapi_places_source_update_time_description'),
      }),
    confidence: z
      .number()
      .min(0)
      .max(1)
      .nullable()
      .optional()
      .openapi({
        description: openApiText('openapi_places_source_confidence_description'),
      }),
    provider: z
      .string()
      .nullable()
      .optional()
      .openapi({
        description: openApiText('openapi_places_source_provider_description'),
      }),
    resource: z
      .string()
      .nullable()
      .optional()
      .openapi({
        description: openApiText('openapi_places_source_resource_description'),
      }),
    version: z
      .string()
      .nullable()
      .optional()
      .openapi({
        description: openApiText('openapi_places_source_version_description'),
      }),
    between: z
      .tuple([z.number(), z.number()])
      .nullable()
      .optional()
      .openapi({
        description: openApiText('openapi_places_source_between_description'),
      }),
  })
  .loose()
  .openapi('PlaceSource', {
    description: openApiText('openapi_places_sources_description'),
  })

const PlaceSourceArraySchema = z
  .array(PlaceSourceSchema)
  .nullable()
  .openapi({
    description: openApiText('openapi_places_sources_description'),
  }) as z.ZodType<unknown>

const PlaceTaxonomyHierarchySchema = z
  .array(z.string())
  .nullable()
  .openapi({
    description: openApiText('openapi_places_taxonomy_hierarchy_description'),
  }) as z.ZodType<unknown>

const PlaceTaxonomyAlternatesSchema = z
  .array(z.string())
  .nullable()
  .openapi({
    description: openApiText('openapi_places_taxonomy_alternates_description'),
  }) as z.ZodType<unknown>

const PlaceTaxonomySchema = z
  .object({
    primary: z
      .string()
      .nullable()
      .openapi({
        description: openApiText('openapi_places_taxonomy_primary_description'),
      }),
    hierarchy: PlaceTaxonomyHierarchySchema,
    alternates: PlaceTaxonomyAlternatesSchema,
  })
  .openapi('PlaceTaxonomy', {
    description: openApiText('openapi_places_taxonomy_description'),
  })

const PlaceWebsitesSchema = z
  .array(HttpUrlSchema)
  .min(1)
  .nullable()
  .openapi({
    description: openApiText('openapi_places_websites_description'),
  }) as z.ZodType<unknown>

const PlaceSocialsSchema = z
  .array(HttpUrlSchema)
  .min(1)
  .nullable()
  .openapi({
    description: openApiText('openapi_places_socials_description'),
  }) as z.ZodType<unknown>

const PlaceEmailsSchema = z
  .array(EmailStrSchema)
  .min(1)
  .nullable()
  .openapi({
    description: openApiText('openapi_places_emails_description'),
  }) as z.ZodType<unknown>

const PlacePhonesSchema = z
  .array(PhoneNumberSchema)
  .min(1)
  .nullable()
  .openapi({
    description: openApiText('openapi_places_phones_description'),
  }) as z.ZodType<unknown>

const PlaceI18nSchema = z
  .object({
    snapshotId: z
      .string()
      .optional()
      .openapi({
        description: openApiText('openapi_places_i18n_snapshot_id_description'),
      }),
    placeId: IdSchema.openapi({
      description: openApiText('openapi_places_i18n_place_id_description'),
    }),
    locale: z.string().openapi({
      description: openApiText('openapi_places_i18n_locale_description'),
    }),
    name: z
      .string()
      .nullable()
      .openapi({
        description: openApiText('openapi_places_name_description'),
      }),
    nameVariant: z
      .array(z.string())
      .nullable()
      .openapi({
        description: openApiText('openapi_places_name_variant_description'),
      }) as z.ZodType<unknown>,
    nameAlts: z
      .string()
      .nullable()
      .openapi({
        description: openApiText('openapi_places_name_alts_description'),
      }),
    brandName: z
      .string()
      .nullable()
      .openapi({
        description: openApiText('openapi_places_brand_name_description'),
      }),
    brandNameVariant: z
      .array(z.string())
      .nullable()
      .openapi({
        description: openApiText('openapi_places_brand_name_variant_description'),
      }) as z.ZodType<unknown>,
    brandNameAlts: z
      .string()
      .nullable()
      .openapi({
        description: openApiText('openapi_places_brand_name_alts_description'),
      }),
    freeformAddress: z
      .string()
      .nullable()
      .openapi({
        description: openApiText('openapi_places_address_freeform_description'),
      }),
    provenance: z
      .object({
        isMachineTranslated: z.array(z.string()),
        isHumanVerified: z.array(z.string()),
        isLocaleInferred: z.boolean(),
      })
      .nullable()
      .openapi({
        description: openApiText('openapi_places_provenance_description'),
      }),
    createdAt: z
      .string()
      .optional()
      .openapi({
        description: openApiText('openapi_places_created_at_description'),
      }),
    updatedAt: z
      .string()
      .optional()
      .openapi({
        description: openApiText('openapi_places_updated_at_description'),
      }),
  })
  .openapi('PlaceI18n', {
    description: openApiText('openapi_places_i18n_description'),
  })

const PlaceSchema = z
  .object({
    snapshotId: z.string().openapi({
      description: openApiText('openapi_places_snapshot_id_description'),
    }),
    id: IdSchema.openapi({
      description: openApiText('openapi_places_id_description'),
    }),
    releaseId: z.string().openapi({
      description: openApiText('openapi_places_release_id_description'),
    }),
    referenceName: z
      .string()
      .nullable()
      .openapi({
        description: openApiText('openapi_places_reference_name_description'),
      }),
    addressSnapshotId: z
      .string()
      .nullable()
      .openapi({
        description: openApiText('openapi_places_address_snapshot_id_description'),
      }),
    address2dId: z
      .string()
      .nullable()
      .openapi({
        description: openApiText('openapi_places_address_2d_id_description'),
      }),
    address3dId: z
      .string()
      .nullable()
      .openapi({
        description: openApiText('openapi_places_address_3d_id_description'),
      }),
    geometry: PlaceGeometrySchema,
    bbox: PlaceBBoxSchema,
    operatingStatus: z
      .string()
      .nullable()
      .openapi({
        description: openApiText('openapi_places_operating_status_description'),
      }),
    basicCategory: z
      .string()
      .nullable()
      .openapi({
        description: openApiText('openapi_places_basic_category_description'),
      }),
    taxonomy: PlaceTaxonomySchema,
    wikidataId: z.union([WikidataIdSchema, z.null()]).openapi({
      description: openApiText('openapi_places_brand_description'),
    }),
    websites: PlaceWebsitesSchema,
    socials: PlaceSocialsSchema,
    emails: PlaceEmailsSchema,
    phones: PlacePhonesSchema,
    confidence: z.union([ConfidenceScoreSchema, z.null()]).openapi({
      description: openApiText('openapi_places_confidence_description'),
    }),
    sources: PlaceSourceArraySchema,
    firstSeenMonth: z.string().openapi({
      description: openApiText('openapi_places_first_seen_month_description'),
    }),
    lastSeenMonth: z.string().openapi({
      description: openApiText('openapi_places_last_seen_month_description'),
    }),
    createdAt: z
      .string()
      .optional()
      .openapi({
        description: openApiText('openapi_places_created_at_description'),
      }),
    updatedAt: z
      .string()
      .optional()
      .openapi({
        description: openApiText('openapi_places_updated_at_description'),
      }),
  })
  .openapi('Place', {
    description: openApiText('openapi_places_record_description'),
  })

const PlaceDivisionSchema = z
  .object({
    divisionId: IdSchema.openapi({
      description: openApiText('openapi_places_division_id_description'),
    }),
    level: z
      .number()
      .int()
      .nullable()
      .openapi({
        description: openApiText('openapi_places_division_level_description'),
      }),
    locale: z
      .string()
      .nullable()
      .openapi({
        description: openApiText('openapi_places_division_locale_description'),
      }),
    name: z
      .string()
      .nullable()
      .openapi({
        description: openApiText('openapi_places_division_name_description'),
      }),
  })
  .openapi('PlaceDivision', {
    description: openApiText('openapi_places_division_description'),
  })

export const PlaceResponseSchema = z
  .object({
    place: PlaceSchema.openapi({
      description: openApiText('openapi_places_response_place_description'),
    }),
    i18n: z.array(PlaceI18nSchema).openapi({
      description: openApiText('openapi_places_response_i18n_description'),
    }),
    divisions: z.array(PlaceDivisionSchema).openapi({
      description: openApiText('openapi_places_response_divisions_description'),
    }),
  })
  .openapi('PlaceResponse', {
    description: openApiText('openapi_places_response_description'),
  })

export const PlacesByCellParamsSchema = z
  .object({
    region: RegionCode,
    h3Level: z.string(),
    h3Cell: z.string(),
  })
  .openapi('PlacesByCellParams')

export const PlacesByCellQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(MAX_PLACE_RESULTS).optional(),
  })
  .openapi('PlacesByCellQuery')

export const PlacesByCellResponseSchema = z
  .object({
    places: z.array(
      z
        .object({
          placeId: IdSchema.openapi({
            description: openApiText('openapi_places_id_description'),
          }),
          releaseId: z.string().openapi({
            description: openApiText('openapi_places_release_id_description'),
          }),
          basicCategory: z
            .string()
            .nullable()
            .openapi({
              description: openApiText('openapi_places_basic_category_description'),
            }),
          taxonomy: PlaceTaxonomySchema,
          operatingStatus: z
            .string()
            .nullable()
            .openapi({
              description: openApiText('openapi_places_operating_status_description'),
            }),
          geometry: PlaceGeometrySchema,
          h3Level: z
            .number()
            .int()
            .openapi({
              description: openApiText('openapi_places_h3_level_description'),
            }),
          h3Cell: z.string().openapi({
            description: openApiText('openapi_places_h3_cell_description'),
          }),
        })
        .openapi('PlaceCellResult'),
    ),
  })
  .openapi('PlacesByCellResponse')

export const SearchParamsSchema = z
  .object({
    region: RegionCode,
  })
  .openapi('SearchParams')

export const SearchQuerySchema = z
  .object({
    q: z.string().min(1).max(MAX_PLACE_SEARCH_LENGTH),
    locale: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(MAX_PLACE_RESULTS).optional(),
  })
  .openapi('SearchQuery')

export const SearchResponseSchema = z
  .object({
    results: z.array(
      z
        .object({
          placeId: IdSchema,
          releaseId: z.string(),
          locale: z.string(),
          nameText: z
            .string()
            .nullable()
            .openapi({
              description: openApiText('openapi_places_search_name_description'),
            }),
          brandText: z
            .string()
            .nullable()
            .openapi({
              description: openApiText('openapi_places_search_brand_description'),
            }),
        })
        .openapi('PlaceSearchResult'),
    ),
  })
  .openapi('SearchResponse')

const RequestedLocalesQuerySchema = z
  .string()
  .superRefine((value: string, ctx: z.RefinementCtx<string>) => {
    const error = getRequestedApiLocalesValidationError(value)
    if (error) ctx.addIssue({ code: 'custom', message: error })
  })
  .openapi({ examples: ['en,zh-hant', '*', 'null'] })

const PlaceCollectionTaxonomySchema = z
  .object({
    primary: z
      .string()
      .nullable()
      .openapi({
        description: openApiText('openapi_places_taxonomy_primary_description'),
      }),
    hierarchy: PlaceTaxonomyHierarchySchema.optional(),
    alternates: PlaceTaxonomyAlternatesSchema.optional(),
  })
  .openapi('PlaceCollectionTaxonomy', {
    description: openApiText('openapi_places_taxonomy_description'),
  })

const PlaceCollectionI18nValueSchema = z
  .object({
    name: z
      .string()
      .nullable()
      .openapi({
        description: openApiText('openapi_places_name_description'),
      }),
    brandName: z
      .string()
      .nullable()
      .openapi({
        description: openApiText('openapi_places_brand_name_description'),
      }),
    freeformAddress: z
      .string()
      .nullable()
      .optional()
      .openapi({
        description: openApiText('openapi_places_address_freeform_description'),
      }),
    nameVariant: z
      .array(z.string())
      .nullable()
      .optional()
      .openapi({
        description: openApiText('openapi_places_name_variant_description'),
      }),
    nameAlts: z
      .string()
      .nullable()
      .optional()
      .openapi({
        description: openApiText('openapi_places_name_alts_description'),
      }),
    brandNameVariant: z
      .array(z.string())
      .nullable()
      .optional()
      .openapi({
        description: openApiText('openapi_places_brand_name_variant_description'),
      }),
    brandNameAlts: z
      .string()
      .nullable()
      .optional()
      .openapi({
        description: openApiText('openapi_places_brand_name_alts_description'),
      }),
    provenance: PlaceI18nSchema.shape.provenance.optional().openapi({
      description: openApiText('openapi_places_provenance_description'),
    }),
  })
  .openapi('PlaceCollectionI18nValue', {
    description: openApiText('openapi_places_i18n_field_description'),
  })

const PlaceCollectionI18nSchema = z
  .record(z.string(), PlaceCollectionI18nValueSchema)
  .openapi('PlaceCollectionI18n', {
    description: openApiText('openapi_places_i18n_description'),
  })

const PlaceCollectionAttributesSchema = z
  .object({
    referenceName: z
      .string()
      .nullable()
      .openapi({
        description: openApiText('openapi_places_reference_name_description'),
      }),
    basicCategory: z
      .string()
      .nullable()
      .openapi({
        description: openApiText('openapi_places_basic_category_description'),
      }),
    taxonomy: PlaceCollectionTaxonomySchema.openapi({
      description: openApiText('openapi_places_taxonomy_description'),
    }),
    operatingStatus: z
      .string()
      .nullable()
      .openapi({
        description: openApiText('openapi_places_operating_status_description'),
      }),
    i18n: PlaceCollectionI18nSchema.optional().openapi({
      description: openApiText('openapi_places_i18n_field_description'),
    }),
    wikidataId: z
      .union([WikidataIdSchema, z.null()])
      .optional()
      .openapi({
        description: openApiText('openapi_places_brand_description'),
      }),
    websites: PlaceWebsitesSchema.optional(),
    socials: PlaceSocialsSchema.optional(),
    emails: PlaceEmailsSchema.optional(),
    phones: PlacePhonesSchema.optional(),
    confidence: z
      .union([ConfidenceScoreSchema, z.null()])
      .optional()
      .openapi({
        description: openApiText('openapi_places_confidence_description'),
      }),
    firstSeenMonth: z
      .string()
      .optional()
      .openapi({
        description: openApiText('openapi_places_first_seen_month_description'),
      }),
    lastSeenMonth: z
      .string()
      .optional()
      .openapi({
        description: openApiText('openapi_places_last_seen_month_description'),
      }),
    createdAt: z
      .string()
      .optional()
      .openapi({
        description: openApiText('openapi_places_created_at_description'),
      }),
    updatedAt: z
      .string()
      .optional()
      .openapi({
        description: openApiText('openapi_places_updated_at_description'),
      }),
    geometry: PlaceGeometrySchema.optional().openapi({
      description: openApiText('openapi_places_geometry_field_description'),
    }),
    bbox: PlaceBBoxSchema.optional().openapi({
      description: openApiText('openapi_places_bbox_description'),
    }),
    snapshotId: z
      .string()
      .optional()
      .openapi({
        description: openApiText('openapi_places_snapshot_id_description'),
      }),
    releaseId: z
      .string()
      .optional()
      .openapi({
        description: openApiText('openapi_places_release_id_description'),
      }),
    addressSnapshotId: z
      .string()
      .nullable()
      .optional()
      .openapi({
        description: openApiText('openapi_places_address_snapshot_id_description'),
      }),
    address2dId: IdSchema.nullable()
      .optional()
      .openapi({
        description: openApiText('openapi_places_address_2d_id_description'),
      }),
    address3dId: IdSchema.nullable()
      .optional()
      .openapi({
        description: openApiText('openapi_places_address_3d_id_description'),
      }),
    sources: PlaceSourceArraySchema.optional().openapi({
      description: openApiText('openapi_places_sources_description'),
    }),
  })
  .openapi('PlaceCollectionAttributes')

const PlaceCollectionResourceSchema = z
  .object({
    type: z.literal('places').openapi({
      description: openApiText('openapi_places_resource_type_description'),
    }),
    id: IdSchema.openapi({
      description: openApiText('openapi_places_id_description'),
    }),
    attributes: PlaceCollectionAttributesSchema.openapi({
      description: openApiText('openapi_places_attributes_description'),
    }),
    relationships: z
      .object({
        address: z.object({
          data: z
            .union([z.object({ type: z.literal('addresses'), id: IdSchema }), z.null()])
            .openapi({
              description: openApiText(
                'openapi_places_address_relationship_description',
              ),
            }),
        }),
        divisions: z.object({
          data: z
            .array(z.object({ type: z.literal('divisions'), id: IdSchema }))
            .openapi({
              description: openApiText(
                'openapi_places_divisions_relationship_description',
              ),
            }),
        }),
      })
      .openapi({
        description: openApiText('openapi_places_relationships_description'),
      }),
    links: JsonApiLinkMapSchema.optional().openapi({
      description: openApiText('openapi_places_links_description'),
    }),
  })
  .openapi('PlaceCollectionResource', {
    description: openApiText('openapi_places_record_description'),
  })

const PlacesListDocumentMetaSchema = z
  .object({
    apiCatalogRevision: z.string(),
    catalogPublishedAt: z.string(),
    cohort: z.string(),
    domain: z.literal('overture'),
    region: RegionCode,
    profile: ProfileName,
    locales: RequestedLocalesMetadataSchema,
    filters: z.object({
      basicCategory: z.string().optional(),
      taxonomyPrimary: z.string().optional(),
      operatingStatus: z.string().optional(),
      division: z.string().optional(),
    }),
    page: z.object({
      limit: z.number().int(),
      offset: z.number().int(),
      total: z.number().int(),
    }),
  })
  .extend(ApiVersionMetadataSchema.shape)
  .openapi('PlacesListDocumentMeta')

export const PlacesListParamsSchema = z
  .object({ region: RegionCode })
  .openapi('PlacesListParams')

export const PlacesListQuerySchema = z
  .object({
    catalogRevision: z.string().min(1).optional(),
    cohort: z.string().min(1).optional(),
    domain: z.literal('overture').optional(),
    effectiveAt: z.iso.datetime().optional(),
    knownAt: z.iso.datetime().optional(),
    releaseSet: z.string().min(1).optional(),
    profile: ProfileName.optional(),
    locales: RequestedLocalesQuerySchema.optional(),
    include: z.enum(['divisions']).optional(),
    'page[limit]': z.coerce.number().int().min(1).max(MAX_PLACE_RESULTS).optional(),
    'page[offset]': z.coerce.number().int().min(0).optional(),
    'filter[basicCategory]': z.string().min(1).optional(),
    'filter[taxonomyPrimary]': z.string().min(1).optional(),
    'filter[operatingStatus]': z.string().min(1).optional(),
    'filter[division]': IdSchema.optional(),
  })
  .openapi('PlacesListQuery')

export const PlacesListResponseSchema = z
  .object({
    jsonapi: JsonApiVersionSchema,
    links: JsonApiLinkMapSchema,
    data: z.array(PlaceCollectionResourceSchema),
    included: z.array(z.unknown()).optional(),
    meta: PlacesListDocumentMetaSchema,
  })
  .openapi('PlacesListResponse', {
    description: openApiText('openapi_places_list_response_description'),
  })
