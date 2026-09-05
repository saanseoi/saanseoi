import { z } from '@hono/zod-openapi'
import { getRequestedApiLocalesValidationError } from '@repo/core'

import { openApiText } from '../lib/openapi-i18n'

import {
  ApiVersionMetadataSchema,
  ApiLocale,
  BBoxSchema,
  CartographicHintsSchema,
  GeometrySchema,
  IdSchema,
  JsonApiLinkMapSchema,
  JsonApiVersionSchema,
  ProfileName,
  RequestedLocalesMetadataSchema,
  SourcesSchema,
  WikidataIdSchema,
} from './common'

const divisionGeometryResourceTypes = ['division-areas', 'division-boundaries'] as const
const divisionGeometryTypes = ['land', 'maritime', 'mixed'] as const
const divisionGeometryVariants = [
  'hkgov-censtatd',
  'hkgov-censtatd-landclipped',
  'hkgov-had',
  'hkgov-pland-new-town',
  'hkgov-pland-pu',
  'overture',
] as const

const DivisionResourceIdentifierSchema = z
  .object({
    type: z.literal('divisions'),
    id: IdSchema,
  })
  .openapi('DivisionIdentifier')

const DivisionNameRuleSchema = z
  .object({
    value: z.string().openapi({
      description: openApiText('openapi_divisions_name_rule_value_description'),
    }),
    variant: z
      .string()
      .nullable()
      .openapi({
        description: openApiText('openapi_divisions_name_rule_variant_description'),
      }),
  })
  .openapi('DivisionNameRule')

const DivisionI18nAttributesSchema = z
  .object({
    name: z
      .string()
      .nullable()
      .optional()
      .openapi({
        description: openApiText('openapi_divisions_i18n_name_description'),
      }),
    nameVariant: z
      .array(z.string())
      .nullable()
      .optional()
      .openapi({
        description: openApiText('openapi_divisions_i18n_name_variant_description'),
      }),
    nameAlts: z
      .array(z.string())
      .nullable()
      .optional()
      .openapi({
        description: openApiText('openapi_divisions_i18n_name_alts_description'),
      }),
    nameRules: z
      .array(DivisionNameRuleSchema)
      .nullable()
      .optional()
      .openapi({
        description: openApiText('openapi_divisions_i18n_name_rules_description'),
      }),
  })
  .openapi('DivisionI18nAttributes')

const DivisionI18nSchema = z
  .record(z.string(), DivisionI18nAttributesSchema)
  .openapi('DivisionI18n', {
    'x-recordKeyName': openApiText('openapi_divisions_i18n_locale_label'),
  })

const DivisionHierarchyResourceIdentifierSchema =
  DivisionResourceIdentifierSchema.extend({
    meta: z
      .object({
        name: z
          .string()
          .optional()
          .openapi({
            description: openApiText('openapi_divisions_hierarchy_name_description'),
          }),
        subType: z
          .string()
          .optional()
          .openapi({
            description: openApiText(
              'openapi_divisions_hierarchy_sub_type_description',
            ),
          }),
      })
      .openapi({
        description: openApiText('openapi_divisions_hierarchy_meta_description'),
      })
      .optional(),
  }).openapi('DivisionHierarchyIdentifier')

const DivisionHierarchyRelationshipSchema = z
  .object({
    data: z.array(DivisionHierarchyResourceIdentifierSchema).openapi({
      description: openApiText('openapi_divisions_hierarchy_description'),
    }),
  })
  .openapi('DivisionHierarchy')

const DivisionPositionSchema = z
  .array(z.number())
  .min(2)
  .max(3)
  .openapi({
    description: openApiText('openapi_geojson_position_description'),
  })

const DivisionGeometrySchema = z
  .lazy(() =>
    z.union([
      z
        .object({
          type: z.literal('Point').openapi({
            description: openApiText('openapi_geojson_geometry_type_description'),
          }),
          coordinates: DivisionPositionSchema.openapi({
            description: openApiText('openapi_geojson_coordinates_description'),
          }),
        })
        .openapi({
          description: openApiText('openapi_divisions_geometry_point_description'),
        }),
      z
        .object({
          type: z.literal('Polygon').openapi({
            description: openApiText('openapi_geojson_geometry_type_description'),
          }),
          coordinates: z
            .array(z.array(DivisionPositionSchema).min(4))
            .min(1)
            .openapi({
              description: openApiText('openapi_geojson_coordinates_description'),
            }),
        })
        .openapi({
          description: openApiText('openapi_divisions_geometry_polygon_description'),
        }),
      z
        .object({
          type: z.literal('MultiPolygon').openapi({
            description: openApiText('openapi_geojson_geometry_type_description'),
          }),
          coordinates: z
            .array(z.array(z.array(DivisionPositionSchema).min(4)).min(1))
            .min(1)
            .openapi({
              description: openApiText('openapi_geojson_coordinates_description'),
            }),
        })
        .openapi({
          description: openApiText(
            'openapi_divisions_geometry_multi_polygon_description',
          ),
        }),
    ]),
  )
  .openapi('DivisionGeometry', {
    description: openApiText('openapi_divisions_geometry_field_description'),
  })

const DivisionAttributesSchema = z
  .object({
    level: z
      .number()
      .int()
      .nullable()
      .openapi({
        description: openApiText('openapi_divisions_level_field_description'),
      }),
    type: z.string().openapi({
      description: openApiText('openapi_divisions_type_field_description'),
    }),
    divisionCode: z
      .string()
      .optional()
      .openapi({
        description: openApiText('openapi_divisions_division_code_field_description'),
      }),
    snapshotId: z
      .string()
      .optional()
      .openapi({
        description: openApiText('openapi_divisions_snapshot_id_field_description'),
      }),
    geometry: z
      .union([DivisionGeometrySchema, z.null()])
      .optional()
      .openapi({
        description: openApiText('openapi_divisions_geometry_field_description'),
      }),
    bbox: z
      .union([BBoxSchema, z.null()])
      .optional()
      .openapi({
        description: openApiText('openapi_divisions_bbox_field_description'),
      }),
    cartography: z
      .union([CartographicHintsSchema, z.null()])
      .optional()
      .openapi({
        description: openApiText('openapi_divisions_cartography_field_description'),
      }),
    wikidataId: z
      .union([WikidataIdSchema, z.null()])
      .optional()
      .openapi({
        description: openApiText('openapi_divisions_wikidata_id_field_description'),
        examples: ['Q55621441', 'Q7820922', 'Q16923583', null],
      }),
    createdAt: z
      .string()
      .optional()
      .openapi({
        description: openApiText('openapi_divisions_created_at_field_description'),
      }),
    updatedAt: z
      .string()
      .optional()
      .openapi({
        description: openApiText('openapi_divisions_updated_at_field_description'),
      }),
    sources: z
      .union([SourcesSchema, z.null()])
      .optional()
      .openapi({
        description: openApiText('openapi_divisions_sources_field_description'),
      }),
    identifiers: z
      .unknown()
      .optional()
      .openapi({
        description: openApiText('openapi_divisions_identifiers_field_description'),
      }),
    i18n: DivisionI18nSchema.optional().openapi({
      description: openApiText('openapi_divisions_i18n_field_description'),
    }),
  })
  .openapi('DivisionAttributes')

const DivisionRelationshipsSchema = z
  .object({
    hierarchy: DivisionHierarchyRelationshipSchema,
    areas: z
      .object({
        data: z.array(z.object({ type: z.literal('division-areas'), id: IdSchema })),
      })
      .optional(),
    boundaries: z
      .object({
        data: z.array(
          z.object({ type: z.literal('division-boundaries'), id: IdSchema }),
        ),
      })
      .optional(),
  })
  .openapi('DivisionRelationships')

export const DivisionGeometryResourceSchema = z
  .object({
    type: z.enum(divisionGeometryResourceTypes).openapi({
      examples: ['division-areas', 'division-boundaries'],
    }),
    id: IdSchema.openapi({
      description: openApiText('openapi_divisions_geometry_resource_id_description'),
    }),
    attributes: z.object({
      divisionId: IdSchema.optional().openapi({
        description: openApiText('openapi_divisions_geometry_division_id_description'),
      }),
      leftDivisionId: IdSchema.optional().openapi({
        description: openApiText(
          'openapi_divisions_geometry_left_division_id_description',
        ),
      }),
      rightDivisionId: IdSchema.optional().openapi({
        description: openApiText(
          'openapi_divisions_geometry_right_division_id_description',
        ),
      }),
      geometry: z.union([GeometrySchema, z.null()]).openapi({
        description: openApiText(
          'openapi_divisions_geometry_resource_geometry_description',
        ),
      }),
      bbox: z.union([BBoxSchema, z.null()]).openapi({
        description: openApiText(
          'openapi_divisions_geometry_resource_bbox_description',
        ),
      }),
      type: z.enum(divisionGeometryTypes).openapi({
        description: openApiText(
          'openapi_divisions_geometry_resource_type_description',
        ),
        examples: ['mixed', 'land', 'maritime'],
      }),
      isLand: z
        .boolean()
        .nullable()
        .openapi({
          description: openApiText('openapi_divisions_geometry_is_land_description'),
        }),
      isTerritorial: z
        .boolean()
        .nullable()
        .openapi({
          description: openApiText(
            'openapi_divisions_geometry_is_territorial_description',
          ),
        }),
      variant: z
        .enum(divisionGeometryVariants)
        .optional()
        .openapi({
          description: openApiText('openapi_divisions_geometry_variant_description'),
          examples: [
            'overture',
            'hkgov-had',
            'hkgov-censtatd',
            'hkgov-censtatd-landclipped',
            'hkgov-pland-pu',
            'hkgov-pland-new-town',
          ],
        }),
      sources: z
        .union([SourcesSchema, z.null()])
        .optional()
        .openapi({
          description: openApiText('openapi_divisions_geometry_sources_description'),
        }),
      identifiers: z
        .unknown()
        .optional()
        .openapi({
          description: openApiText('openapi_divisions_identifiers_field_description'),
        }),
    }),
  })
  .openapi('DivisionGeometry')

const RequestedLocalesQuerySchema = z
  .string()
  .superRefine((value: string, ctx: z.RefinementCtx<string>) => {
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

export const DivisionResourceSchema = z
  .object({
    type: z.literal('divisions'),
    id: IdSchema,
    attributes: DivisionAttributesSchema.openapi({
      description: openApiText('openapi_divisions_attributes_description'),
    }),
    relationships: DivisionRelationshipsSchema.openapi({
      description: openApiText('openapi_divisions_relationships_description'),
    }),
    links: JsonApiLinkMapSchema.optional().openapi({
      description: openApiText('openapi_divisions_links_description'),
    }),
  })
  .openapi('Division')

const DivisionDocumentMetaSchema = z
  .object({
    apiCatalogRevision: z.string(),
    catalogPublishedAt: z.string(),
    cohort: z.string(),
    domain: z.string(),
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
    catalogRevision: z
      .string()
      .min(1)
      .optional()
      .openapi({
        description: openApiText('openapi_divisions_catalog_revision_description'),
      }),
    cohort: z
      .string()
      .min(1)
      .optional()
      .openapi({
        description: openApiText('openapi_divisions_cohort_description'),
      }),
    domain: z
      .enum([
        'geographic',
        'hkgov-censtatd-hma',
        'hkgov-pland-pu',
        'hkgov-pland-new-town',
        'hkgov-landsd',
      ])
      .optional()
      .openapi({
        description: openApiText('openapi_divisions_domain_description'),
      }),
    effectiveAt: z.iso
      .datetime()
      .optional()
      .openapi({
        description: openApiText('openapi_divisions_effective_at_description'),
      }),
    knownAt: z.iso
      .datetime()
      .optional()
      .openapi({
        description: openApiText('openapi_divisions_known_at_description'),
      }),
    releaseSet: z
      .string()
      .min(1)
      .optional()
      .openapi({
        description: openApiText('openapi_divisions_release_set_description'),
      }),
    profile: ProfileName.optional(),
    locales: RequestedLocalesQuerySchema.optional(),
    include: z
      .string()
      .regex(
        /^(none|(hierarchy|areas(?::(overture|hkgov-had(:simplified)?|hkgov-censtatd(-landclipped)?(:simplified)?|hkgov-censtatd-hma(:simplified)?|hkgov-pland-pu(:simplified)?|hkgov-pland-new-town(:simplified)?)(?:@[A-Za-z0-9][A-Za-z0-9._-]*)?)?|boundaries(?::overture)?)(,(hierarchy|areas(?::(overture|hkgov-had(:simplified)?|hkgov-censtatd(-landclipped)?(:simplified)?|hkgov-censtatd-hma(:simplified)?|hkgov-pland-pu(:simplified)?|hkgov-pland-new-town(:simplified)?)(?:@[A-Za-z0-9][A-Za-z0-9._-]*)?)?|boundaries(?::overture)?))*)$/,
      )
      .optional()
      .openapi({
        description: openApiText('openapi_divisions_include_description'),
      }),
    transform: z
      .string()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .optional()
      .openapi({
        description: openApiText('openapi_divisions_transform_description'),
      }),
    'page[limit]': z.coerce.number().int().min(1).max(100).optional(),
    'page[offset]': z.coerce.number().int().min(0).optional(),
    'filter[level]': z.coerce.number().int().min(0).optional(),
    'filter[divisionType]': z.string().optional(),
    'filter[parent]': z.string().optional(),
  })
  .openapi('DivisionsListQuery')

export const DivisionDetailParamsSchema = z
  .object({
    id: IdSchema,
  })
  .openapi('DivisionDetailParams')

export const DivisionDetailQuerySchema = z
  .object({
    catalogRevision: z
      .string()
      .min(1)
      .optional()
      .openapi({
        description: openApiText('openapi_divisions_catalog_revision_description'),
      }),
    cohort: z
      .string()
      .min(1)
      .optional()
      .openapi({
        description: openApiText('openapi_divisions_cohort_description'),
      }),
    domain: z
      .enum([
        'geographic',
        'hkgov-censtatd-hma',
        'hkgov-pland-pu',
        'hkgov-pland-new-town',
        'hkgov-landsd',
      ])
      .optional()
      .openapi({
        description: openApiText('openapi_divisions_domain_description'),
      }),
    effectiveAt: z.iso
      .datetime()
      .optional()
      .openapi({
        description: openApiText('openapi_divisions_effective_at_description'),
      }),
    knownAt: z.iso
      .datetime()
      .optional()
      .openapi({
        description: openApiText('openapi_divisions_known_at_description'),
      }),
    releaseSet: z
      .string()
      .min(1)
      .optional()
      .openapi({
        description: openApiText('openapi_divisions_release_set_description'),
      }),
    profile: ProfileName.optional(),
    locales: RequestedLocalesQuerySchema.optional(),
    include: z
      .string()
      .regex(
        /^(none|(hierarchy|areas(?::(overture|hkgov-had(:simplified)?|hkgov-censtatd(-landclipped)?(:simplified)?|hkgov-censtatd-hma(:simplified)?|hkgov-pland-pu(:simplified)?|hkgov-pland-new-town(:simplified)?)(?:@[A-Za-z0-9][A-Za-z0-9._-]*)?)?|boundaries(?::overture)?)(,(hierarchy|areas(?::(overture|hkgov-had(:simplified)?|hkgov-censtatd(-landclipped)?(:simplified)?|hkgov-censtatd-hma(:simplified)?|hkgov-pland-pu(:simplified)?|hkgov-pland-new-town(:simplified)?)(?:@[A-Za-z0-9][A-Za-z0-9._-]*)?)?|boundaries(?::overture)?))*)$/,
      )
      .optional()
      .openapi({
        description: openApiText('openapi_divisions_include_description'),
      }),
    transform: z
      .string()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .optional()
      .openapi({
        description: openApiText('openapi_divisions_transform_description'),
      }),
  })
  .openapi('DivisionDetailQuery')

export const DivisionsListResponseSchema = z
  .object({
    jsonapi: JsonApiVersionSchema,
    links: JsonApiLinkMapSchema,
    data: z.array(DivisionResourceSchema),
    included: z
      .array(z.union([DivisionResourceSchema, DivisionGeometryResourceSchema]))
      .optional()
      .openapi({
        description: openApiText('openapi_divisions_included_description'),
      }),
    meta: DivisionDocumentMetaSchema,
  })
  .openapi('DivisionsListResponse')

export const DivisionDetailResponseSchema = z
  .object({
    jsonapi: JsonApiVersionSchema,
    links: JsonApiLinkMapSchema,
    data: DivisionResourceSchema,
    included: z
      .array(z.union([DivisionResourceSchema, DivisionGeometryResourceSchema]))
      .optional()
      .openapi({
        description: openApiText('openapi_divisions_included_description'),
      }),
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
