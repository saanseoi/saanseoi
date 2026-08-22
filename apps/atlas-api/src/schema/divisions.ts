import { z } from '@hono/zod-openapi'
import { getRequestedApiLocalesValidationError } from '@repo/core'

import {
  ApiVersionMetadataSchema,
  ApiLocale,
  BBoxSchema,
  CartographicHintsSchema,
  FeatureVersionSchema,
  GeometrySchema,
  IdSchema,
  JsonApiLinkMapSchema,
  JsonApiVersionSchema,
  OvertureDivisionClassSchema,
  OverturePlaceTypeSchema,
  ProfileName,
  RequestedLocalesMetadataSchema,
  SourcesSchema,
  WikidataIdSchema,
} from './common'

const DivisionResourceIdentifierSchema = z
  .object({
    type: z.literal('divisions'),
    id: IdSchema,
  })
  .openapi('DivisionIdentifier')

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

const DivisionI18nSchema = z
  .record(z.string(), DivisionI18nAttributesSchema)
  .openapi('DivisionI18n')

const DivisionHierarchyResourceIdentifierSchema =
  DivisionResourceIdentifierSchema.extend({
    meta: z
      .object({
        name: z.string().optional(),
        subType: z.string().optional(),
      })
      .optional(),
  }).openapi('DivisionHierarchyIdentifier')

const DivisionHierarchyRelationshipSchema = z
  .object({
    data: z.array(DivisionHierarchyResourceIdentifierSchema).openapi({
      description:
        'Canonical ancestor divisions for this resource. The relationship is returned even when included resources are not requested.',
    }),
  })
  .openapi('DivisionHierarchy')

const DivisionAttributesSchema = z
  .object({
    level: z.number().int().nullable(),
    type: z.string(),
    divisionCode: z.string().optional(),
    snapshotId: z.string().optional(),
    geometry: z.union([GeometrySchema, z.null()]).optional(),
    bbox: z.union([BBoxSchema, z.null()]).optional(),
    cartography: z.union([CartographicHintsSchema, z.null()]).optional(),
    wikidata: z.union([WikidataIdSchema, z.null()]).optional(),
    createdAt: z.string().optional(),
    updatedAt: z.string().optional(),
    sources: z.union([SourcesSchema, z.null()]).optional(),
    identifiers: z.unknown().optional(),
    overture: z
      .object({
        subtype: z.union([OverturePlaceTypeSchema, z.null()]).optional(),
        class: z.union([OvertureDivisionClassSchema, z.null()]).optional(),
        version: z.union([FeatureVersionSchema, z.null()]).optional(),
        hierarchies: z.unknown().optional(),
        admin_level: z.number().int().nullable().optional(),
      })
      .optional(),
    i18n: DivisionI18nSchema.optional(),
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
    type: z.union([z.literal('division-areas'), z.literal('division-boundaries')]),
    id: IdSchema,
    attributes: z.object({
      divisionId: IdSchema.optional(),
      leftDivisionId: IdSchema.optional(),
      rightDivisionId: IdSchema.optional(),
      geometry: z.union([GeometrySchema, z.null()]),
      bbox: z.union([BBoxSchema, z.null()]),
      type: z.string(),
      isLand: z.boolean().nullable(),
      isTerritorial: z.boolean().nullable(),
      variant: z.string().optional(),
      sources: z.union([SourcesSchema, z.null()]).optional(),
      sourceKeys: z.unknown().optional(),
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
    attributes: DivisionAttributesSchema,
    relationships: DivisionRelationshipsSchema,
    links: JsonApiLinkMapSchema.optional(),
    meta: z.object({}).loose().optional(),
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
    catalogRevision: z.string().min(1).optional().openapi({
      description: 'Immutable family-and-region API catalogue checkpoint.',
    }),
    cohort: z.string().min(1).optional().openapi({
      description: 'Exact effective cohort to select within the chosen catalogue.',
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
        description: 'Division domain to query. Defaults to the Geographic domain.',
      }),
    effectiveAt: z.iso.datetime().optional().openapi({
      description: 'Select the domain release effective at this instant.',
    }),
    knownAt: z.iso.datetime().optional().openapi({
      description: 'Resolve the newest catalogue checkpoint known at this instant.',
    }),
    releaseSet: z.string().min(1).optional().openapi({
      description: 'Exact immutable domain release within the chosen catalogue.',
    }),
    profile: ProfileName.optional(),
    locales: RequestedLocalesQuerySchema.optional(),
    include: z
      .string()
      .regex(
        /^(none|(hierarchy|areas(?::(overture|hkgov-had|hkgov-censtatd:(2016|2021)(:simplified)?|hkgov-censtatd-area|hkgov-censtatd-hma|hkgov-pland-pu|hkgov-pland-new-town))?|boundaries(?::overture)?)(,(hierarchy|areas(?::(overture|hkgov-had|hkgov-censtatd:(2016|2021)(:simplified)?|hkgov-censtatd-area|hkgov-censtatd-hma|hkgov-pland-pu|hkgov-pland-new-town))?|boundaries(?::overture)?))*)$/,
      )
      .optional()
      .openapi({
        description:
          'Include canonical ancestor division resources in the top-level included array. The relationships.hierarchy identifiers are always returned.',
      }),
    transform: z
      .string()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .optional()
      .openapi({
        description:
          'Select a named geometry transformation. `simplified` applies to `areas:hkgov-censtatd:2016` and `areas:hkgov-censtatd:2021`, returning the corresponding land-clipped C&SD display geometry.',
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
    catalogRevision: z.string().min(1).optional().openapi({
      description: 'Immutable family-and-region API catalogue checkpoint.',
    }),
    cohort: z.string().min(1).optional().openapi({
      description: 'Exact effective cohort to select within the chosen catalogue.',
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
        description: 'Division domain to query. Defaults to the Geographic domain.',
      }),
    effectiveAt: z.iso.datetime().optional().openapi({
      description: 'Select the domain release effective at this instant.',
    }),
    knownAt: z.iso.datetime().optional().openapi({
      description: 'Resolve the newest catalogue checkpoint known at this instant.',
    }),
    releaseSet: z.string().min(1).optional().openapi({
      description: 'Exact immutable domain release within the chosen catalogue.',
    }),
    profile: ProfileName.optional(),
    locales: RequestedLocalesQuerySchema.optional(),
    include: z
      .string()
      .regex(
        /^(none|(hierarchy|areas(?::(overture|hkgov-had|hkgov-censtatd:(2016|2021)(:simplified)?|hkgov-censtatd-area|hkgov-censtatd-hma|hkgov-pland-pu|hkgov-pland-new-town))?|boundaries(?::overture)?)(,(hierarchy|areas(?::(overture|hkgov-had|hkgov-censtatd:(2016|2021)(:simplified)?|hkgov-censtatd-area|hkgov-censtatd-hma|hkgov-pland-pu|hkgov-pland-new-town))?|boundaries(?::overture)?))*)$/,
      )
      .optional()
      .openapi({
        description:
          'Include canonical ancestor division resources in the top-level included array. The relationships.hierarchy identifiers are always returned.',
      }),
    transform: z
      .string()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .optional()
      .openapi({
        description:
          'Select a named geometry transformation. `simplified` applies to `areas:hkgov-censtatd:2016` and `areas:hkgov-censtatd:2021`, returning the corresponding land-clipped C&SD display geometry.',
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
        description:
          'Related division and geometry resources, returned when requested through include.',
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
        description:
          'Related division and geometry resources, returned when requested through include.',
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
