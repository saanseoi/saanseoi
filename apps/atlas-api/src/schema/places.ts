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
  examples: [
    [113.8512802, 22.1984482, 113.8512955, 22.19845],
    [114.155, 22.285, 114.156, 22.286],
    null,
  ],
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
    examples: [
      { type: 'Point', coordinates: [113.8512806, 22.19845] },
      { type: 'Point', coordinates: [114.155, 22.285] },
    ],
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
    examples: [
      [
        {
          property: '',
          dataset: 'meta',
          license: 'CDLA-Permissive-2.0',
          record_id: '110864367186379',
          update_time: '2025-09-15T07:00:00.000Z',
          confidence: 0.6096840190952489,
        },
      ],
      null,
    ],
  }) as z.ZodType<unknown>

const PlaceTaxonomyHierarchySchema = z
  .array(z.string())
  .nullable()
  .openapi({
    description: openApiText('openapi_places_taxonomy_hierarchy_description'),
    examples: [
      ['food_and_drink', 'beverage_shop', 'bubble_tea_shop'],
      ['lodging', 'hotel'],
      null,
    ],
  }) as z.ZodType<unknown>

const PlaceTaxonomyAlternatesSchema = z
  .array(z.string())
  .nullable()
  .openapi({
    description: openApiText('openapi_places_taxonomy_alternates_description'),
    examples: [['beach', 'castle'], ['breakfast_and_brunch_restaurant'], null],
  }) as z.ZodType<unknown>

const PlaceTaxonomySchema = z
  .object({
    primary: z
      .string()
      .nullable()
      .openapi({
        description: openApiText('openapi_places_taxonomy_primary_description'),
        examples: ['bubble_tea_shop', 'chinese_restaurant', 'hotel', null],
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
    examples: [
      ['http://www.lcsd.gov.hk/CE/Museum/Monument/en/monuments_11.php'],
      ['http://www.lantaublue.com/'],
      null,
    ],
  }) as z.ZodType<unknown>

const PlaceSocialsSchema = z
  .array(HttpUrlSchema)
  .min(1)
  .nullable()
  .openapi({
    description: openApiText('openapi_places_socials_description'),
    examples: [
      ['https://www.facebook.com/164703716878146'],
      ['https://www.twitter.com/kafe_nak', 'https://www.instagram.com/nakkafe'],
      null,
    ],
  }) as z.ZodType<unknown>

const PlaceEmailsSchema = z
  .array(EmailStrSchema)
  .min(1)
  .nullable()
  .openapi({
    description: openApiText('openapi_places_emails_description'),
    examples: [['info@starbucks.com'], ['info@np360.com.hk'], null],
  }) as z.ZodType<unknown>

const PlacePhonesSchema = z
  .array(PhoneNumberSchema)
  .min(1)
  .nullable()
  .openapi({
    description: openApiText('openapi_places_phones_description'),
    examples: [['+85268391024'], ['+85229802241'], null],
  }) as z.ZodType<unknown>

const PlaceI18nSchema = z
  .object({
    snapshotId: z
      .string()
      .optional()
      .openapi({
        description: openApiText('openapi_places_i18n_snapshot_id_description'),
        examples: ['c241e1ea-8d63-5bc4-88b9-e031d5be05d5'],
      }),
    placeId: IdSchema.openapi({
      description: openApiText('openapi_places_i18n_place_id_description'),
      examples: [
        '3a36e925-a641-4a2d-812a-9b22285e1ea9',
        '86ab29b3-5b05-4ec0-a2cb-286bf5e8effb',
      ],
    }),
    locale: z.string().openapi({
      description: openApiText('openapi_places_i18n_locale_description'),
      examples: ['en', 'zh-hant', 'ja', 'und'],
    }),
    name: z
      .string()
      .nullable()
      .openapi({
        description: openApiText('openapi_places_name_description'),
        examples: ["Ebeneezer's Kebabs & Pizzeria", '分流炮台', null],
      }),
    nameVariant: z
      .array(z.string())
      .nullable()
      .openapi({
        description: openApiText('openapi_places_name_variant_description'),
        examples: [['Pizza Hut', 'language'], ['麥當勞'], null],
      }) as z.ZodType<unknown>,
    nameAlts: z
      .string()
      .nullable()
      .openapi({
        description: openApiText('openapi_places_name_alts_description'),
        examples: ['Pizza Hut', '麥當勞', null],
      }),
    brandName: z
      .string()
      .nullable()
      .openapi({
        description: openApiText('openapi_places_brand_name_description'),
        examples: ["Ebeneezer's Kebabs & Pizzeria", 'PARKnSHOP Supermarket HK', null],
      }),
    brandNameVariant: z
      .array(z.string())
      .nullable()
      .openapi({
        description: openApiText('openapi_places_brand_name_variant_description'),
        examples: [['language'], ['大快活'], null],
      }) as z.ZodType<unknown>,
    brandNameAlts: z
      .string()
      .nullable()
      .openapi({
        description: openApiText('openapi_places_brand_name_alts_description'),
        examples: ['language', '大快活', null],
      }),
    freeformAddress: z
      .string()
      .nullable()
      .openapi({
        description: openApiText('openapi_places_address_freeform_description'),
        examples: ['Shop 10, Ngong Ping 360, Lantau Island', '74 San Hing St', null],
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
        examples: [
          {
            isMachineTranslated: [],
            isHumanVerified: [],
            isLocaleInferred: true,
          },
          null,
        ],
      }),
    createdAt: z
      .string()
      .optional()
      .openapi({
        description: openApiText('openapi_places_created_at_description'),
        examples: ['2026-09-05T10:35:34.430Z'],
      }),
    updatedAt: z
      .string()
      .optional()
      .openapi({
        description: openApiText('openapi_places_updated_at_description'),
        examples: ['2026-09-05T11:26:14.710Z'],
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
        examples: ["Ebeneezer's Kebabs & Pizzeria", '分流炮台', null],
      }),
    addressSnapshotId: z
      .string()
      .nullable()
      .openapi({
        description: openApiText('openapi_places_address_snapshot_id_description'),
        examples: ['c241e1ea-8d63-5bc4-88b9-e031d5be05d5', null],
      }),
    address2dId: z
      .string()
      .nullable()
      .openapi({
        description: openApiText('openapi_places_address_2d_id_description'),
        examples: ['ss-077c2fdb-5843-5710-aaaa-b162e913b4ef', null],
      }),
    address3dId: z
      .string()
      .nullable()
      .openapi({
        description: openApiText('openapi_places_address_3d_id_description'),
        examples: [null],
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
      examples: [
        'fb68fc73-3ac6-41c9-a692-22fcf20cb5be',
        '5aa908d4-65c5-4aac-b6eb-bb7481c14a31',
      ],
    }),
    level: z
      .number()
      .int()
      .nullable()
      .openapi({
        description: openApiText('openapi_places_division_level_description'),
        examples: [0, 1, 2, 4, 6, null],
      }),
    locale: z
      .string()
      .nullable()
      .openapi({
        description: openApiText('openapi_places_division_locale_description'),
        examples: ['en', 'zh-hant', 'zh-hans', null],
      }),
    name: z
      .string()
      .nullable()
      .openapi({
        description: openApiText('openapi_places_division_name_description'),
        examples: ['China', 'New Territories', 'Islands District', '離島區', null],
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
        examples: ['restaurant', 'hotel', 'train_station', null],
      }),
    hierarchy: PlaceTaxonomyHierarchySchema.optional().openapi({
      examples: [
        ['food_and_drink', 'restaurant', 'chinese_restaurant'],
        ['lodging', 'hotel'],
        null,
      ],
    }),
    alternates: PlaceTaxonomyAlternatesSchema.optional().openapi({
      examples: [['breakfast_and_brunch_restaurant'], ['beach', 'castle'], null],
    }),
  })
  .openapi('PlaceCollectionTaxonomy', {
    description: openApiText('openapi_places_taxonomy_description'),
    examples: [
      {
        primary: 'chinese_restaurant',
        hierarchy: [
          'food_and_drink',
          'restaurant',
          'asian_restaurant',
          'east_asian_restaurant',
          'chinese_restaurant',
        ],
        alternates: ['breakfast_and_brunch_restaurant'],
      },
    ],
  })

const PlaceCollectionI18nValueSchema = z
  .object({
    name: z
      .string()
      .nullable()
      .openapi({
        description: openApiText('openapi_places_name_description'),
        examples: ["Ebeneezer's Kebabs & Pizzeria", '百佳超級市場', null],
      }),
    brandName: z
      .string()
      .nullable()
      .openapi({
        description: openApiText('openapi_places_brand_name_description'),
        examples: ["Ebeneezer's Kebabs & Pizzeria", 'PARKnSHOP Supermarket HK', null],
      }),
    freeformAddress: z
      .string()
      .nullable()
      .optional()
      .openapi({
        description: openApiText('openapi_places_address_freeform_description'),
        examples: ['Shop 10, Ngong Ping 360, Lantau Island', '74 San Hing St', null],
      }),
    nameVariant: z
      .array(z.string())
      .nullable()
      .optional()
      .openapi({
        description: openApiText('openapi_places_name_variant_description'),
        examples: [['Pizza Hut', 'language'], ['麥當勞'], null],
      }),
    nameAlts: z
      .string()
      .nullable()
      .optional()
      .openapi({
        description: openApiText('openapi_places_name_alts_description'),
        examples: ['Pizza Hut', '麥當勞', null],
      }),
    brandNameVariant: z
      .array(z.string())
      .nullable()
      .optional()
      .openapi({
        description: openApiText('openapi_places_brand_name_variant_description'),
        examples: [['language'], ['大快活'], null],
      }),
    brandNameAlts: z
      .string()
      .nullable()
      .optional()
      .openapi({
        description: openApiText('openapi_places_brand_name_alts_description'),
        examples: ['language', '大快活', null],
      }),
    provenance: PlaceI18nSchema.shape.provenance.optional().openapi({
      description: openApiText('openapi_places_provenance_description'),
      examples: [
        { isMachineTranslated: [], isHumanVerified: [], isLocaleInferred: true },
        null,
      ],
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
        examples: ["Ebeneezer's Kebabs & Pizzeria", 'Starbucks', null],
      }),
    basicCategory: z
      .string()
      .nullable()
      .openapi({
        description: openApiText('openapi_places_basic_category_description'),
        examples: ['restaurant', 'coffee_shop', 'historic_site', null],
      }),
    taxonomy: PlaceCollectionTaxonomySchema.openapi({
      description: openApiText('openapi_places_taxonomy_description'),
    }),
    operatingStatus: z
      .string()
      .nullable()
      .openapi({
        description: openApiText('openapi_places_operating_status_description'),
        examples: ['open', null],
      }),
    i18n: PlaceCollectionI18nSchema.optional().openapi({
      description: openApiText('openapi_places_i18n_field_description'),
      examples: [
        {
          en: {
            name: "Ebeneezer's Kebabs & Pizzeria",
            brandName: "Ebeneezer's Kebabs & Pizzeria",
            freeformAddress: null,
          },
        },
      ],
    }),
    wikidataId: z
      .union([WikidataIdSchema, z.null()])
      .optional()
      .openapi({
        description: openApiText('openapi_places_brand_description'),
        examples: ['Q106298409', 'Q113365214', null],
      }),
    websites: PlaceWebsitesSchema.optional().openapi({
      examples: [['http://www.lantaublue.com/'], null],
    }),
    socials: PlaceSocialsSchema.optional().openapi({
      examples: [['https://www.facebook.com/164703716878146'], null],
    }),
    emails: PlaceEmailsSchema.optional().openapi({
      examples: [['info@starbucks.com'], null],
    }),
    phones: PlacePhonesSchema.optional().openapi({
      examples: [['+85268391024'], null],
    }),
    confidence: z
      .union([ConfidenceScoreSchema, z.null()])
      .optional()
      .openapi({
        description: openApiText('openapi_places_confidence_description'),
        examples: [0.325405122843701, 0.6096840190952489, 0.9563699245119883, null],
      }),
    firstSeenMonth: z
      .string()
      .optional()
      .openapi({
        description: openApiText('openapi_places_first_seen_month_description'),
        examples: ['2025-09', '2025-10', '2025-12'],
      }),
    lastSeenMonth: z
      .string()
      .optional()
      .openapi({
        description: openApiText('openapi_places_last_seen_month_description'),
        examples: ['2025-09', '2025-10', '2025-12', '2026-01'],
      }),
    createdAt: z
      .string()
      .optional()
      .openapi({
        description: openApiText('openapi_places_created_at_description'),
        examples: ['2026-09-05T10:35:34.430Z'],
      }),
    updatedAt: z
      .string()
      .optional()
      .openapi({
        description: openApiText('openapi_places_updated_at_description'),
        examples: ['2026-09-05T11:26:14.710Z'],
      }),
    geometry: PlaceGeometrySchema.optional().openapi({
      description: openApiText('openapi_places_geometry_field_description'),
      examples: [{ type: 'Point', coordinates: [113.8512806, 22.19845] }],
    }),
    bbox: PlaceBBoxSchema.optional().openapi({
      description: openApiText('openapi_places_bbox_description'),
      examples: [[113.8512802, 22.1984482, 113.8512955, 22.19845], null],
    }),
    snapshotId: z
      .string()
      .optional()
      .openapi({
        description: openApiText('openapi_places_snapshot_id_description'),
        examples: ['997d6f2b-70a6-5806-af5d-0b973c2129da'],
      }),
    releaseId: z
      .string()
      .optional()
      .openapi({
        description: openApiText('openapi_places_release_id_description'),
        examples: ['38c7de3b-8112-5f24-af44-fac788aeab36'],
      }),
    addressSnapshotId: z
      .string()
      .nullable()
      .optional()
      .openapi({
        description: openApiText('openapi_places_address_snapshot_id_description'),
        examples: ['c241e1ea-8d63-5bc4-88b9-e031d5be05d5', null],
      }),
    address2dId: IdSchema.nullable()
      .optional()
      .openapi({
        description: openApiText('openapi_places_address_2d_id_description'),
        examples: ['ss-077c2fdb-5843-5710-aaaa-b162e913b4ef', null],
      }),
    address3dId: IdSchema.nullable()
      .optional()
      .openapi({
        description: openApiText('openapi_places_address_3d_id_description'),
        examples: [null],
      }),
    sources: PlaceSourceArraySchema.optional().openapi({
      description: openApiText('openapi_places_sources_description'),
      examples: [
        [
          {
            property: '',
            dataset: 'meta',
            license: 'CDLA-Permissive-2.0',
            record_id: '110864367186379',
            update_time: '2025-09-15T07:00:00.000Z',
            confidence: 0.6096840190952489,
          },
        ],
        null,
      ],
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
