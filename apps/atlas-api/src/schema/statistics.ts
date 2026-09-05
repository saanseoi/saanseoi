import { z } from '@hono/zod-openapi'
import { getRequestedApiLocalesValidationError } from '@repo/core'
import {
  statsFieldComparabilityReasons,
  statsFieldComparabilityStatuses,
  statsPeriodicities,
} from '@repo/db'

import { openApiText } from '../lib/openapi-i18n'

import {
  ApiVersionMetadataSchema,
  ErrorResponseSchema,
  IdSchema,
  JsonApiLinkMapSchema,
  JsonApiVersionSchema,
  ProfileName,
  RequestedLocalesMetadataSchema,
} from './common'
import { DivisionGeometryResourceSchema, DivisionResourceSchema } from './divisions'

const StatisticResourceSchema = z
  .object({
    type: z.literal('statistics').openapi({
      description: openApiText('openapi_statistics_resource_type_description'),
    }),
    id: IdSchema.openapi({
      description: openApiText('openapi_statistics_id_description'),
    }),
    attributes: z
      .object({
        datasetCode: z.string().openapi({
          description: openApiText('openapi_statistics_dataset_code_description'),
        }),
        referencePeriod: z
          .object({
            code: z.string().openapi({
              description: openApiText(
                'openapi_statistics_reference_period_code_description',
              ),
            }),
            start: z
              .string()
              .nullable()
              .openapi({
                description: openApiText(
                  'openapi_statistics_reference_period_start_description',
                ),
              }),
            end: z
              .string()
              .nullable()
              .openapi({
                description: openApiText(
                  'openapi_statistics_reference_period_end_description',
                ),
              }),
            endYear: z.string().openapi({
              description: openApiText(
                'openapi_statistics_reference_period_end_year_description',
              ),
            }),
            granularity: z.string().openapi({
              description: openApiText(
                'openapi_statistics_reference_period_granularity_description',
              ),
            }),
          })
          .openapi({
            description: openApiText('openapi_statistics_reference_period_description'),
          }),
        geography: z
          .object({
            kind: z.string().openapi({
              description: openApiText('openapi_statistics_geography_kind_description'),
            }),
            code: z.string().openapi({
              description: openApiText('openapi_statistics_geography_code_description'),
            }),
            class: z
              .string()
              .optional()
              .openapi({
                description: openApiText(
                  'openapi_statistics_geography_class_description',
                ),
              }),
            areaCompanion: z
              .object({
                cohortKey: z.string().openapi({
                  description: openApiText(
                    'openapi_statistics_area_companion_cohort_description',
                  ),
                }),
                domainCode: z.string().openapi({
                  description: openApiText(
                    'openapi_statistics_area_companion_domain_description',
                  ),
                }),
                variant: z.string().openapi({
                  description: openApiText(
                    'openapi_statistics_area_companion_variant_description',
                  ),
                }),
              })
              .optional()
              .openapi({
                description: openApiText(
                  'openapi_statistics_area_companion_description',
                ),
              }),
          })
          .openapi({
            description: openApiText('openapi_statistics_geography_description'),
          }),
        dimensions: z.record(z.string(), z.string()).openapi({
          description: openApiText('openapi_statistics_dimensions_description'),
        }),
        values: z.record(z.string(), z.string()).openapi({
          description: openApiText('openapi_statistics_values_description'),
        }),
        comparability: z
          .record(
            z.string(),
            z.object({
              affectedReferencePeriods: z
                .array(z.string().regex(/^\d{4}$/))
                .min(1)
                .openapi({
                  description: openApiText(
                    'openapi_statistics_comparability_affected_periods_description',
                  ),
                }),
              reason: z.enum(statsFieldComparabilityReasons).openapi({
                description: openApiText(
                  'openapi_statistics_comparability_reason_description',
                ),
              }),
              status: z.enum(statsFieldComparabilityStatuses).openapi({
                description: openApiText(
                  'openapi_statistics_comparability_status_description',
                ),
              }),
            }),
          )
          .optional()
          .openapi({
            description: openApiText('openapi_statistics_comparability_description'),
          }),
        sourceReleaseId: z
          .string()
          .optional()
          .openapi({
            description: openApiText(
              'openapi_statistics_source_release_id_description',
            ),
          }),
        sourceFeatureRef: z
          .string()
          .optional()
          .openapi({
            description: openApiText(
              'openapi_statistics_source_feature_ref_description',
            ),
          }),
        createdAt: z
          .string()
          .optional()
          .openapi({
            description: openApiText('openapi_statistics_created_at_description'),
          }),
        updatedAt: z
          .string()
          .optional()
          .openapi({
            description: openApiText('openapi_statistics_updated_at_description'),
          }),
      })
      .openapi({
        description: openApiText('openapi_statistics_attributes_description'),
      }),
    relationships: z
      .object({
        division: z.object({
          data: z
            .object({ type: z.literal('divisions'), id: IdSchema })
            .nullable()
            .openapi({
              description: openApiText(
                'openapi_statistics_division_relationship_description',
              ),
            }),
        }),
      })
      .openapi({
        description: openApiText('openapi_statistics_relationships_description'),
      }),
    links: JsonApiLinkMapSchema.optional().openapi({
      description: openApiText('openapi_statistics_links_description'),
    }),
  })
  .openapi('Statistic', {
    description: openApiText('openapi_statistics_record_description'),
  })

const RequestedLocalesQuerySchema = z
  .string()
  .superRefine((value: string, ctx: z.RefinementCtx<string>) => {
    const error = getRequestedApiLocalesValidationError(value)
    if (error) ctx.addIssue({ code: 'custom', message: error })
  })
  .openapi({
    description: openApiText('openapi_statistics_locales_description'),
    examples: ['en,zh-hant', '*', 'null'],
  })

const IncludeSchema = z
  .string()
  .regex(
    /^(none|(fields|divisions|areas(?::(overture|hkgov-had(:simplified)?|hkgov-censtatd(-landclipped)?(:simplified)?|hkgov-censtatd-hma(:simplified)?|hkgov-pland-pu(:simplified)?|hkgov-pland-new-town(:simplified)?))?)(,(fields|divisions|areas(?::(overture|hkgov-had(:simplified)?|hkgov-censtatd(-landclipped)?(:simplified)?|hkgov-censtatd-hma(:simplified)?|hkgov-pland-pu(:simplified)?|hkgov-pland-new-town(:simplified)?))?))*)$/,
  )
  .optional()
  .openapi({
    description: openApiText('openapi_statistics_include_description'),
  })

const CommonQueryShape = {
  catalogRevision: z
    .string()
    .min(1)
    .optional()
    .openapi({
      description: openApiText('openapi_statistics_catalog_revision_description'),
    }),
  cohort: z
    .string()
    .min(1)
    .optional()
    .openapi({
      description: openApiText('openapi_statistics_cohort_description'),
    }),
  domain: z
    .literal('official')
    .optional()
    .openapi({
      description: openApiText('openapi_statistics_domain_description'),
    }),
  effectiveAt: z.iso
    .datetime()
    .optional()
    .openapi({
      description: openApiText('openapi_statistics_effective_at_description'),
    }),
  knownAt: z.iso
    .datetime()
    .optional()
    .openapi({
      description: openApiText('openapi_statistics_known_at_description'),
    }),
  releaseSet: z
    .string()
    .min(1)
    .optional()
    .openapi({
      description: openApiText('openapi_statistics_release_set_description'),
    }),
  profile: ProfileName.optional().openapi({
    description: openApiText('openapi_statistics_profile_description'),
  }),
  locales: RequestedLocalesQuerySchema.optional(),
  include: IncludeSchema,
}

export const StatisticsListQuerySchema = z
  .object({
    ...CommonQueryShape,
    'page[limit]': z.coerce
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .openapi({
        description: openApiText('openapi_statistics_page_limit_description'),
      }),
    'page[offset]': z.coerce
      .number()
      .int()
      .min(0)
      .optional()
      .openapi({
        description: openApiText('openapi_statistics_page_offset_description'),
      }),
    'filter[dataset]': z
      .string()
      .min(1)
      .optional()
      .openapi({
        description: openApiText('openapi_statistics_dataset_filter_description'),
      }),
    'filter[division]': IdSchema.optional().openapi({
      description: openApiText('openapi_statistics_division_filter_description'),
    }),
    'filter[referencePeriod]': z
      .string()
      .min(1)
      .optional()
      .openapi({
        description: openApiText(
          'openapi_statistics_reference_period_filter_description',
        ),
      }),
    'filter[field]': z
      .string()
      .min(1)
      .optional()
      .openapi({
        description: openApiText('openapi_statistics_field_filter_description'),
      }),
  })
  .openapi('StatisticsListQuery')

export const StatisticDetailParamsSchema = z
  .object({ id: IdSchema })
  .openapi('StatisticDetailParams')

export const StatisticDetailQuerySchema = z
  .object(CommonQueryShape)
  .openapi('StatisticDetailQuery')

const StatisticsDocumentMetaSchema = z
  .object({
    apiCatalogRevision: z.string().openapi({
      description: openApiText('openapi_statistics_meta_catalog_revision_description'),
    }),
    catalogPublishedAt: z.string().openapi({
      description: openApiText(
        'openapi_statistics_meta_catalog_published_at_description',
      ),
    }),
    cohort: z.string().openapi({
      description: openApiText('openapi_statistics_meta_cohort_description'),
    }),
    domain: z.literal('official').openapi({
      description: openApiText('openapi_statistics_meta_domain_description'),
    }),
    profile: ProfileName.openapi({
      description: openApiText('openapi_statistics_meta_profile_description'),
    }),
    locales: RequestedLocalesMetadataSchema.openapi({
      description: openApiText('openapi_statistics_meta_locales_description'),
    }),
    filters: z
      .object({
        dataset: z
          .string()
          .optional()
          .openapi({
            description: openApiText(
              'openapi_statistics_meta_filter_dataset_description',
            ),
          }),
        division: z
          .string()
          .optional()
          .openapi({
            description: openApiText(
              'openapi_statistics_meta_filter_division_description',
            ),
          }),
        referencePeriod: z
          .string()
          .optional()
          .openapi({
            description: openApiText(
              'openapi_statistics_meta_filter_reference_period_description',
            ),
          }),
        field: z
          .string()
          .optional()
          .openapi({
            description: openApiText(
              'openapi_statistics_meta_filter_field_description',
            ),
          }),
      })
      .optional(),
    page: z
      .object({
        limit: z
          .number()
          .int()
          .openapi({
            description: openApiText('openapi_statistics_meta_page_limit_description'),
          }),
        offset: z
          .number()
          .int()
          .openapi({
            description: openApiText('openapi_statistics_meta_page_offset_description'),
          }),
        total: z
          .number()
          .int()
          .openapi({
            description: openApiText('openapi_statistics_meta_page_total_description'),
          }),
      })
      .optional(),
  })
  .extend(ApiVersionMetadataSchema.shape)
  .openapi('StatisticsDocumentMeta')

const IncludedStatisticResourceSchema = z.union([
  DivisionResourceSchema,
  DivisionGeometryResourceSchema,
  z
    .object({
      type: z.literal('statistic-fields').openapi({
        description: openApiText('openapi_statistics_field_resource_type_description'),
      }),
      id: IdSchema.openapi({
        description: openApiText('openapi_statistics_field_id_description'),
      }),
      attributes: z
        .object({
          datasetCode: z.string().openapi({
            description: openApiText(
              'openapi_statistics_field_dataset_code_description',
            ),
          }),
          fieldName: z.string().openapi({
            description: openApiText('openapi_statistics_field_name_description'),
          }),
          measureCode: z.string().openapi({
            description: openApiText(
              'openapi_statistics_field_measure_code_description',
            ),
          }),
          sourceField: z.string().openapi({
            description: openApiText(
              'openapi_statistics_field_source_field_description',
            ),
          }),
          dimensions: z.record(z.string(), z.string()).openapi({
            description: openApiText('openapi_statistics_field_dimensions_description'),
          }),
          sourceNullOption: z
            .string()
            .nullable()
            .openapi({
              description: openApiText(
                'openapi_statistics_field_source_null_option_description',
              ),
            }),
          statisticKind: z.string().openapi({
            description: openApiText(
              'openapi_statistics_field_statistic_kind_description',
            ),
          }),
          aggregation: z.string().openapi({
            description: openApiText(
              'openapi_statistics_field_aggregation_description',
            ),
          }),
          aggregationPercentile: z
            .number()
            .nullable()
            .openapi({
              description: openApiText(
                'openapi_statistics_field_aggregation_percentile_description',
              ),
            }),
          periodicity: z
            .enum(statsPeriodicities)
            .nullable()
            .openapi({
              description: openApiText(
                'openapi_statistics_field_periodicity_description',
              ),
            }),
          comparability: z
            .object({
              affectedReferencePeriods: z.array(z.string()).openapi({
                description: openApiText(
                  'openapi_statistics_comparability_affected_periods_description',
                ),
              }),
              reason: z.enum(statsFieldComparabilityReasons).openapi({
                description: openApiText(
                  'openapi_statistics_comparability_reason_description',
                ),
              }),
              status: z.enum(statsFieldComparabilityStatuses).openapi({
                description: openApiText(
                  'openapi_statistics_comparability_status_description',
                ),
              }),
            })
            .nullable()
            .openapi({
              description: openApiText(
                'openapi_statistics_field_comparability_description',
              ),
            }),
          denominatorFieldName: z
            .string()
            .nullable()
            .openapi({
              description: openApiText(
                'openapi_statistics_field_denominator_description',
              ),
            }),
          valueKind: z.string().openapi({
            description: openApiText('openapi_statistics_field_value_kind_description'),
          }),
          unitCode: z.string().openapi({
            description: openApiText('openapi_statistics_field_unit_code_description'),
          }),
          i18n: z
            .record(
              z.string(),
              z.object({
                name: z.string().openapi({
                  description: openApiText(
                    'openapi_statistics_field_i18n_name_description',
                  ),
                }),
                description: z
                  .string()
                  .nullable()
                  .openapi({
                    description: openApiText(
                      'openapi_statistics_field_i18n_description_description',
                    ),
                  }),
                isTranslationVerified: z.boolean().openapi({
                  description: openApiText(
                    'openapi_statistics_field_i18n_verified_description',
                  ),
                }),
              }),
            )
            .openapi({
              description: openApiText('openapi_statistics_field_i18n_description'),
            }),
        })
        .openapi({
          description: openApiText('openapi_statistics_field_attributes_description'),
        }),
    })
    .openapi('StatisticField', {
      description: openApiText('openapi_statistics_field_record_description'),
    }),
])

export const StatisticsListResponseSchema = z
  .object({
    jsonapi: JsonApiVersionSchema,
    links: JsonApiLinkMapSchema,
    data: z.array(StatisticResourceSchema),
    included: z.array(IncludedStatisticResourceSchema).optional(),
    meta: StatisticsDocumentMetaSchema,
  })
  .openapi('StatisticsListResponse', {
    description: openApiText('openapi_statistics_list_response_description'),
  })

export const StatisticDetailResponseSchema = z
  .object({
    jsonapi: JsonApiVersionSchema,
    links: JsonApiLinkMapSchema,
    data: StatisticResourceSchema,
    included: z.array(IncludedStatisticResourceSchema).optional(),
    meta: StatisticsDocumentMetaSchema,
  })
  .openapi('StatisticDetailResponse', {
    description: openApiText('openapi_statistics_get_response_description'),
  })

export const StatisticSnapshotNotReadyErrorResponseSchema = z
  .object({
    httpStatus: z.literal(503),
    error: z.literal('snapshot_not_ready'),
    message: z.literal('No active statistic snapshot is published.'),
  })
  .openapi('StatisticSnapshotNotReadyErrorResponse')

const GeographyAggregateQueryShape = {
  ...CommonQueryShape,
  'filter[dataset]': z
    .string()
    .min(1)
    .optional()
    .openapi({
      description: openApiText('openapi_statistics_dataset_filter_description'),
    }),
  'filter[field]': z
    .string()
    .min(1)
    .openapi({
      description: openApiText('openapi_statistics_field_filter_description'),
    }),
  'filter[geographyKind]': z
    .enum(['division', 'buildingGroup', 'majorHousingEstate'])
    .optional()
    .openapi({
      description: openApiText('openapi_statistics_geography_kind_filter_description'),
    }),
  'filter[geographyLevel]': z.coerce
    .number()
    .int()
    .min(0)
    .optional()
    .openapi({
      description: openApiText('openapi_statistics_geography_level_filter_description'),
    }),
  'filter[geographyDomain]': z
    .string()
    .min(1)
    .optional()
    .openapi({
      description: openApiText(
        'openapi_statistics_geography_domain_filter_description',
      ),
    }),
}

export const StatisticsGeographiesQuerySchema = z
  .object({
    ...GeographyAggregateQueryShape,
    'filter[referencePeriod]': z
      .string()
      .min(1)
      .openapi({
        description: openApiText(
          'openapi_statistics_reference_period_filter_description',
        ),
      }),
  })
  .openapi('StatisticsGeographiesQuery')

export const StatisticsSeriesQuerySchema = z
  .object(GeographyAggregateQueryShape)
  .openapi('StatisticsSeriesQuery')

const GeographyDimensionSchema = z.object({
  kind: z.enum(['division', 'buildingGroup', 'majorHousingEstate']).openapi({
    description: openApiText('openapi_statistics_geography_kind_description'),
  }),
  codeAttribute: z.enum(['divisionCode', 'geographyCode']).openapi({
    description: openApiText('openapi_statistics_geography_code_attribute_description'),
  }),
  domainCode: z
    .string()
    .optional()
    .openapi({
      description: openApiText('openapi_statistics_geography_domain_description'),
    }),
  level: z
    .number()
    .int()
    .optional()
    .openapi({
      description: openApiText('openapi_statistics_geography_level_description'),
    }),
})

const StatisticMeasureCandidateSchema = z.object({
  datasetCode: z.string().openapi({
    description: openApiText('openapi_statistics_dataset_code_description'),
  }),
  geography: GeographyDimensionSchema.openapi({
    description: openApiText('openapi_statistics_geography_description'),
  }),
})

export const StatisticAmbiguousMeasureErrorResponseSchema = z
  .object({
    httpStatus: z.literal(409),
    error: z.literal('ambiguous_measure'),
    message: z.string(),
    candidates: z.array(StatisticMeasureCandidateSchema).min(2),
  })
  .openapi('StatisticAmbiguousMeasureErrorResponse')

export const StatisticAggregateConflictErrorResponseSchema = z
  .union([ErrorResponseSchema, StatisticAmbiguousMeasureErrorResponseSchema])
  .openapi('StatisticAggregateConflictErrorResponse')

const GeographyAggregateMetaSchema = z
  .object({
    measure: z
      .object({
        datasetCode: z.string().openapi({
          description: openApiText('openapi_statistics_dataset_code_description'),
        }),
        fieldName: z.string().openapi({
          description: openApiText('openapi_statistics_field_name_description'),
        }),
        unitCode: z.string().openapi({
          description: openApiText('openapi_statistics_field_unit_code_description'),
        }),
      })
      .openapi({
        description: openApiText('openapi_statistics_measure_description'),
      }),
    geography: GeographyDimensionSchema.openapi({
      description: openApiText('openapi_statistics_geography_description'),
    }),
    dimensions: z.record(z.string(), z.string()).openapi({
      description: openApiText('openapi_statistics_dimensions_description'),
    }),
  })
  .extend(ApiVersionMetadataSchema.shape)
  .openapi({
    description: openApiText('openapi_statistics_aggregate_meta_description'),
  })

export const StatisticsGeographiesResponseSchema = z
  .object({
    meta: GeographyAggregateMetaSchema.extend({
      referencePeriod: z.string().openapi({
        description: openApiText(
          'openapi_statistics_reference_period_code_description',
        ),
      }),
    }).openapi({
      description: openApiText('openapi_statistics_aggregate_meta_description'),
    }),
    values: z.record(z.string(), z.string()).openapi({
      description: openApiText('openapi_statistics_aggregate_values_description'),
    }),
  })
  .openapi('StatisticsGeographiesResponse')

export const StatisticsSeriesResponseSchema = z
  .object({
    meta: GeographyAggregateMetaSchema.openapi({
      description: openApiText('openapi_statistics_aggregate_meta_description'),
    }),
    valuesByReferencePeriod: z
      .record(z.string(), z.record(z.string(), z.string()))
      .openapi({
        description: openApiText('openapi_statistics_series_values_description'),
      }),
  })
  .openapi('StatisticsSeriesResponse')
