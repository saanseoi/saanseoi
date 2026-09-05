import { z } from '@hono/zod-openapi'

import { MAX_PLACE_RESULTS, MAX_PLACE_SEARCH_LENGTH } from '../lib/api-limits'
import {
  BBoxSchema,
  ConfidenceScoreSchema,
  EmailStrSchema,
  HttpUrlSchema,
  IdSchema,
  PhoneNumberSchema,
  RegionCode,
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
    property: z.string().optional(),
    dataset: z.string().optional(),
    license: z.string().nullable().optional(),
    record_id: z.string().nullable().optional(),
    update_time: z.string().nullable().optional(),
    confidence: z.number().min(0).max(1).nullable().optional(),
    provider: z.string().nullable().optional(),
    resource: z.string().nullable().optional(),
    version: z.string().nullable().optional(),
    between: z.tuple([z.number(), z.number()]).nullable().optional(),
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

const PlaceAddressArraySchema = z
  .array(z.string())
  .min(1)
  .nullable()
  .openapi({
    description: openApiText('openapi_places_addresses_description'),
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
    snapshotId: z.string().optional(),
    placeId: IdSchema,
    locale: z.string(),
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
    isLocaleInferred: z.boolean(),
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
    createdAt: z.string().optional(),
    updatedAt: z.string().optional(),
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
    addressSnapshotId: z.string().nullable(),
    address2dId: z.string().nullable(),
    address3dId: z.string().nullable(),
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
    addresses: PlaceAddressArraySchema,
    confidence: z.union([ConfidenceScoreSchema, z.null()]).openapi({
      description: openApiText('openapi_places_confidence_description'),
    }),
    sources: PlaceSourceArraySchema,
    firstSeenMonth: z.string(),
    lastSeenMonth: z.string(),
    createdAt: z.string().optional(),
    updatedAt: z.string().optional(),
  })
  .openapi('Place', {
    description: openApiText('openapi_places_record_description'),
  })

const PlaceDivisionSchema = z
  .object({
    divisionId: IdSchema,
    level: z.number().int().nullable(),
    locale: z.string().nullable(),
    name: z.string().nullable(),
  })
  .openapi('PlaceDivision', {
    description: openApiText('openapi_places_division_description'),
  })

export const PlaceResponseSchema = z
  .object({
    place: PlaceSchema,
    i18n: z.array(PlaceI18nSchema),
    divisions: z.array(PlaceDivisionSchema),
  })
  .openapi('PlaceResponse')

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
