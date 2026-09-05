import { z } from '@hono/zod-openapi'
import { getRequestedApiLocalesValidationError } from '@repo/core'
import {
  statsAggregations,
  statsFieldComparabilityReasons,
  statsFieldComparabilityStatuses,
  statsPeriodicities,
  statsStatisticKinds,
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

const statisticGeographyKinds = [
  'area',
  'district',
  'building-group',
  'housing-market-area',
  'housing-estate',
  'new-town',
] as const
const statisticGeographyClasses = ['B', 'O'] as const
const statisticAreaCompanionDomains = [
  'geographic',
  'hkgov-censtatd-hma',
  'hkgov-pland-new-town',
] as const
const statisticAreaCompanionVariants = [
  'hkgov-censtatd',
  'hkgov-censtatd-hma',
  'hkgov-pland-new-town',
] as const
const statisticReferencePeriodGranularities = ['year', 'quarter'] as const

const StatisticResourceSchema = z
  .object({
    type: z.literal('statistics').openapi({
      description: openApiText('openapi_statistics_resource_type_description'),
    }),
    id: IdSchema.openapi({
      description: openApiText('openapi_statistics_id_description'),
      examples: [
        'stats:2650b1e3a7fe8a269919d9b2e97e54304d0e3db607748f2c51e03ce1b2f0f5dd',
        'stats:2e16ff6629a00669a571b4e514b3d6a9a6063b56964d6bec3981780dd4e219e4',
      ],
    }),
    attributes: z
      .object({
        datasetCode: z.string().openapi({
          description: openApiText('openapi_statistics_dataset_code_description'),
          examples: [
            'ds-hk-hkgov-censtatd-division-statistic-permanent-living-quarters',
            'ds-hk-hkgov-censtatd-division-statistic-major-housing-estates',
          ],
        }),
        referencePeriod: z
          .object({
            code: z.string().openapi({
              description: openApiText(
                'openapi_statistics_reference_period_code_description',
              ),
              examples: ['2023', '2021'],
            }),
            start: z
              .string()
              .nullable()
              .openapi({
                description: openApiText(
                  'openapi_statistics_reference_period_start_description',
                ),
                examples: ['2023-01-01', '2021-01-01', null],
              }),
            end: z
              .string()
              .nullable()
              .openapi({
                description: openApiText(
                  'openapi_statistics_reference_period_end_description',
                ),
                examples: ['2023-12-31', '2021-12-31', null],
              }),
            endYear: z.string().openapi({
              description: openApiText(
                'openapi_statistics_reference_period_end_year_description',
              ),
              examples: ['2023', '2021'],
            }),
            granularity: z.string().openapi({
              description: openApiText(
                'openapi_statistics_reference_period_granularity_description',
              ),
              examples: ['year', 'quarter'],
              enum: [...statisticReferencePeriodGranularities],
            }),
          })
          .openapi({
            description: openApiText('openapi_statistics_reference_period_description'),
          }),
        geography: z
          .object({
            kind: z.string().openapi({
              description: openApiText('openapi_statistics_geography_kind_description'),
              examples: ['area', 'district', 'building-group', 'housing-estate'],
              enum: [...statisticGeographyKinds],
            }),
            code: z.string().openapi({
              description: openApiText('openapi_statistics_geography_code_description'),
              examples: ['Hong Kong Island', 'CW', 'CW0001', '60047'],
            }),
            class: z
              .string()
              .optional()
              .openapi({
                description: openApiText(
                  'openapi_statistics_geography_class_description',
                ),
                examples: ['B', 'O'],
                enum: [...statisticGeographyClasses],
              }),
            areaCompanion: z
              .object({
                cohortKey: z.string().openapi({
                  description: openApiText(
                    'openapi_statistics_area_companion_cohort_description',
                  ),
                  examples: ['2023', '2021'],
                }),
                domainCode: z.string().openapi({
                  description: openApiText(
                    'openapi_statistics_area_companion_domain_description',
                  ),
                  examples: ['geographic', 'hkgov-censtatd-hma'],
                  enum: [...statisticAreaCompanionDomains],
                }),
                variant: z.string().openapi({
                  description: openApiText(
                    'openapi_statistics_area_companion_variant_description',
                  ),
                  examples: ['hkgov-censtatd', 'hkgov-censtatd-hma'],
                  enum: [...statisticAreaCompanionVariants],
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
          examples: [{ 'housing-sector': 'public-rental' }, { sex: 'all' }, {}],
        }),
        values: z.record(z.string(), z.string()).openapi({
          description: openApiText('openapi_statistics_values_description'),
          examples: [
            { publicRentalHousing: '71.5' },
            { totalPopulation: '1331', medianAge: '46.7' },
            { landArea: '12.55', populationMidYear: '223600' },
          ],
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
                  examples: [['2011', '2016']],
                }),
              reason: z.enum(statsFieldComparabilityReasons).openapi({
                description: openApiText(
                  'openapi_statistics_comparability_reason_description',
                ),
                examples: ['economic-activity-status-classification-changed'],
              }),
              status: z.enum(statsFieldComparabilityStatuses).openapi({
                description: openApiText(
                  'openapi_statistics_comparability_status_description',
                ),
                examples: ['caution'],
              }),
            }),
          )
          .optional()
          .openapi({
            description: openApiText('openapi_statistics_comparability_description'),
            examples: [
              {
                nonWorkingPopulation: {
                  affectedReferencePeriods: ['2011', '2016'],
                  reason: 'economic-activity-status-classification-changed',
                  status: 'caution',
                },
              },
            ],
          }),
        sourceReleaseId: z
          .string()
          .optional()
          .openapi({
            description: openApiText(
              'openapi_statistics_source_release_id_description',
            ),
            examples: ['746adfc8-d598-576e-9359-da45869bbc2d'],
          }),
        sourceFeatureRef: z
          .string()
          .optional()
          .openapi({
            description: openApiText(
              'openapi_statistics_source_feature_ref_description',
            ),
            examples: [
              'hkgov-censtatd/ds-hk-hkgov-censtatd-division-statistic-permanent-living-quarters/2023-H2/AREA_LQ_2023:HK',
            ],
          }),
        createdAt: z
          .string()
          .optional()
          .openapi({
            description: openApiText('openapi_statistics_created_at_description'),
            examples: ['2026-09-05T10:35:34.430Z'],
          }),
        updatedAt: z
          .string()
          .optional()
          .openapi({
            description: openApiText('openapi_statistics_updated_at_description'),
            examples: ['2026-09-05T11:26:14.710Z'],
          }),
      })
      .openapi({
        description: openApiText('openapi_statistics_attributes_description'),
      }),
    relationships: z
      .object({
        division: z.object({
          data: z
            .object({
              type: z.literal('divisions').openapi({ examples: ['divisions'] }),
              id: IdSchema.openapi({
                examples: ['25cec859-44f3-5e1d-a72b-952f804e56ab'],
              }),
            })
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
    examples: ['fields,divisions', 'areas:hkgov-censtatd', 'none'],
  })

const CommonQueryShape = {
  catalogRevision: z
    .string()
    .min(1)
    .optional()
    .openapi({
      description: openApiText('openapi_statistics_catalog_revision_description'),
      examples: ['catalog-hk-stats-v0.1-2026-08-24.11'],
    }),
  cohort: z
    .string()
    .min(1)
    .optional()
    .openapi({
      description: openApiText('openapi_statistics_cohort_description'),
      examples: ['2023', '2021'],
    }),
  domain: z
    .literal('official')
    .optional()
    .openapi({
      description: openApiText('openapi_statistics_domain_description'),
      examples: ['official'],
    }),
  effectiveAt: z.iso
    .datetime()
    .optional()
    .openapi({
      description: openApiText('openapi_statistics_effective_at_description'),
      examples: ['2026-08-26T15:01:20.690Z'],
    }),
  knownAt: z.iso
    .datetime()
    .optional()
    .openapi({
      description: openApiText('openapi_statistics_known_at_description'),
      examples: ['2026-08-26T15:01:20.690Z'],
    }),
  releaseSet: z
    .string()
    .min(1)
    .optional()
    .openapi({
      description: openApiText('openapi_statistics_release_set_description'),
      examples: ['data-hk-stats-2025-r0', 'data-hk-stats-2023-r0'],
    }),
  profile: ProfileName.optional().openapi({
    description: openApiText('openapi_statistics_profile_description'),
    examples: ['default', 'full', 'map'],
  }),
  locales: RequestedLocalesQuerySchema.optional().openapi({
    examples: ['en,zh-hant', '*'],
  }),
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
        examples: [10, 25, 100],
      }),
    'page[offset]': z.coerce
      .number()
      .int()
      .min(0)
      .optional()
      .openapi({
        description: openApiText('openapi_statistics_page_offset_description'),
        examples: [0, 25, 100],
      }),
    'filter[dataset]': z
      .string()
      .min(1)
      .optional()
      .openapi({
        description: openApiText('openapi_statistics_dataset_filter_description'),
        examples: ['ds-hk-hkgov-censtatd-division-statistic-permanent-living-quarters'],
      }),
    'filter[division]': IdSchema.optional().openapi({
      description: openApiText('openapi_statistics_division_filter_description'),
      examples: ['25cec859-44f3-5e1d-a72b-952f804e56ab'],
    }),
    'filter[referencePeriod]': z
      .string()
      .min(1)
      .optional()
      .openapi({
        description: openApiText(
          'openapi_statistics_reference_period_filter_description',
        ),
        examples: ['2023', '2021'],
      }),
    'filter[field]': z
      .string()
      .min(1)
      .optional()
      .openapi({
        description: openApiText('openapi_statistics_field_filter_description'),
        examples: ['publicRentalHousing', 'medianAge'],
      }),
  })
  .openapi('StatisticsListQuery')

export const StatisticDetailParamsSchema = z
  .object({
    id: IdSchema.openapi({
      examples: [
        'stats:2650b1e3a7fe8a269919d9b2e97e54304d0e3db607748f2c51e03ce1b2f0f5dd',
      ],
    }),
  })
  .openapi('StatisticDetailParams')

export const StatisticDetailQuerySchema = z
  .object(CommonQueryShape)
  .openapi('StatisticDetailQuery')

const StatisticsDocumentMetaSchema = z
  .object({
    apiCatalogRevision: z.string().openapi({
      description: openApiText('openapi_statistics_meta_catalog_revision_description'),
      examples: ['catalog-hk-stats-v0.1-2026-08-24.11'],
    }),
    catalogPublishedAt: z.string().openapi({
      description: openApiText(
        'openapi_statistics_meta_catalog_published_at_description',
      ),
      examples: ['2026-08-26T15:01:20.690Z'],
    }),
    cohort: z.string().openapi({
      description: openApiText('openapi_statistics_meta_cohort_description'),
      examples: ['2023', '2021'],
    }),
    domain: z.literal('official').openapi({
      description: openApiText('openapi_statistics_meta_domain_description'),
      examples: ['official'],
    }),
    profile: ProfileName.openapi({
      description: openApiText('openapi_statistics_meta_profile_description'),
      examples: ['default', 'full', 'map'],
    }),
    locales: RequestedLocalesMetadataSchema.openapi({
      description: openApiText('openapi_statistics_meta_locales_description'),
      examples: [['en', 'zh-hant'], ['*']],
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
            examples: [
              'ds-hk-hkgov-censtatd-division-statistic-permanent-living-quarters',
            ],
          }),
        division: z
          .string()
          .optional()
          .openapi({
            description: openApiText(
              'openapi_statistics_meta_filter_division_description',
            ),
            examples: ['25cec859-44f3-5e1d-a72b-952f804e56ab'],
          }),
        referencePeriod: z
          .string()
          .optional()
          .openapi({
            description: openApiText(
              'openapi_statistics_meta_filter_reference_period_description',
            ),
            examples: ['2023', '2021'],
          }),
        field: z
          .string()
          .optional()
          .openapi({
            description: openApiText(
              'openapi_statistics_meta_filter_field_description',
            ),
            examples: ['publicRentalHousing', 'medianAge'],
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
            examples: [10, 25],
          }),
        offset: z
          .number()
          .int()
          .openapi({
            description: openApiText('openapi_statistics_meta_page_offset_description'),
            examples: [0, 25],
          }),
        total: z
          .number()
          .int()
          .openapi({
            description: openApiText('openapi_statistics_meta_page_total_description'),
            examples: [98, 341672],
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
        examples: ['statistic-fields'],
      }),
      id: IdSchema.openapi({
        description: openApiText('openapi_statistics_field_id_description'),
        examples: ['publicRentalHousing', 'medianAge', 'populationDensity'],
      }),
      attributes: z
        .object({
          datasetCode: z.string().openapi({
            description: openApiText(
              'openapi_statistics_field_dataset_code_description',
            ),
            examples: [
              'ds-hk-hkgov-censtatd-division-statistic-permanent-living-quarters',
              'ds-hk-hkgov-censtatd-division-statistic-major-housing-estates',
            ],
          }),
          fieldName: z.string().openapi({
            description: openApiText('openapi_statistics_field_name_description'),
            examples: ['publicRentalHousing', 'medianAge', 'populationDensity'],
          }),
          measureCode: z.string().openapi({
            description: openApiText(
              'openapi_statistics_field_measure_code_description',
            ),
            examples: ['occupiedQuarters', 'age', 'populationDensity'],
          }),
          sourceField: z.string().openapi({
            description: openApiText(
              'openapi_statistics_field_source_field_description',
            ),
            examples: ['QTR_PRH', 't_ma', 'POPN_D'],
          }),
          dimensions: z.record(z.string(), z.string()).openapi({
            description: openApiText('openapi_statistics_field_dimensions_description'),
            examples: [{ 'housing-sector': 'public-rental' }, { sex: 'all' }, {}],
          }),
          sourceNullOption: z
            .string()
            .nullable()
            .openapi({
              description: openApiText(
                'openapi_statistics_field_source_null_option_description',
              ),
              examples: ['Null', null],
            }),
          statisticKind: z.enum(statsStatisticKinds).openapi({
            description: openApiText(
              'openapi_statistics_field_statistic_kind_description',
            ),
            examples: ['quantity', 'count', 'density', 'proportion'],
          }),
          aggregation: z.enum(statsAggregations).openapi({
            description: openApiText(
              'openapi_statistics_field_aggregation_description',
            ),
            examples: ['total', 'none', 'median', 'percentile', 'mean'],
          }),
          aggregationPercentile: z
            .number()
            .nullable()
            .openapi({
              description: openApiText(
                'openapi_statistics_field_aggregation_percentile_description',
              ),
              examples: [50, null],
            }),
          periodicity: z
            .enum(statsPeriodicities)
            .nullable()
            .openapi({
              description: openApiText(
                'openapi_statistics_field_periodicity_description',
              ),
              examples: ['month', 'week', 'year', null],
            }),
          comparability: z
            .object({
              affectedReferencePeriods: z.array(z.string()).openapi({
                description: openApiText(
                  'openapi_statistics_comparability_affected_periods_description',
                ),
                examples: [['2011', '2016']],
              }),
              reason: z.enum(statsFieldComparabilityReasons).openapi({
                description: openApiText(
                  'openapi_statistics_comparability_reason_description',
                ),
                examples: ['economic-activity-status-classification-changed'],
              }),
              status: z.enum(statsFieldComparabilityStatuses).openapi({
                description: openApiText(
                  'openapi_statistics_comparability_status_description',
                ),
                examples: ['caution'],
              }),
            })
            .nullable()
            .openapi({
              description: openApiText(
                'openapi_statistics_field_comparability_description',
              ),
              examples: [
                {
                  affectedReferencePeriods: ['2011', '2016'],
                  reason: 'economic-activity-status-classification-changed',
                  status: 'caution',
                },
                null,
              ],
            }),
          denominatorFieldName: z
            .string()
            .nullable()
            .openapi({
              description: openApiText(
                'openapi_statistics_field_denominator_description',
              ),
              examples: ['totalPopulation', 'landArea', null],
            }),
          valueKind: z.string().openapi({
            description: openApiText('openapi_statistics_field_value_kind_description'),
            examples: ['numeric', 'categorical'],
          }),
          unitCode: z.string().openapi({
            description: openApiText('openapi_statistics_field_unit_code_description'),
            examples: ['person', 'percent', 'person-per-square-kilometre'],
          }),
          i18n: z
            .record(
              z.string(),
              z.object({
                name: z.string().openapi({
                  description: openApiText(
                    'openapi_statistics_field_i18n_name_description',
                  ),
                  examples: ['Public rental housing', 'Median age'],
                }),
                description: z
                  .string()
                  .nullable()
                  .openapi({
                    description: openApiText(
                      'openapi_statistics_field_i18n_description_description',
                    ),
                    examples: [
                      'Public rental housing - Housing Authority rental flats',
                      null,
                    ],
                  }),
                isTranslationVerified: z.boolean().openapi({
                  description: openApiText(
                    'openapi_statistics_field_i18n_verified_description',
                  ),
                  examples: [true, false],
                }),
              }),
            )
            .openapi({
              description: openApiText('openapi_statistics_field_i18n_description'),
              examples: [
                {
                  en: {
                    name: 'Public rental housing',
                    description: 'Public rental housing',
                    isTranslationVerified: false,
                  },
                  'zh-Hant': {
                    name: '公共租住房屋',
                    description: '公共租住房屋',
                    isTranslationVerified: false,
                  },
                },
              ],
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
    httpStatus: z.literal(503).openapi({ examples: [503] }),
    error: z.literal('snapshot_not_ready').openapi({
      examples: ['snapshot_not_ready'],
    }),
    message: z.literal('No active statistic snapshot is published.').openapi({
      examples: ['No active statistic snapshot is published.'],
    }),
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
      examples: [
        'ds-hk-hkgov-censtatd-division-statistic-land-area-population-density-district',
      ],
    }),
  'filter[field]': z
    .string()
    .min(1)
    .openapi({
      description: openApiText('openapi_statistics_field_filter_description'),
      examples: ['populationDensity', 'totalPopulation'],
    }),
  'filter[geographyKind]': z
    .enum(['division', 'buildingGroup', 'majorHousingEstate'])
    .optional()
    .openapi({
      description: openApiText('openapi_statistics_geography_kind_filter_description'),
      examples: ['division', 'buildingGroup', 'majorHousingEstate'],
    }),
  'filter[geographyLevel]': z.coerce
    .number()
    .int()
    .min(0)
    .optional()
    .openapi({
      description: openApiText('openapi_statistics_geography_level_filter_description'),
      examples: [2, 4, 6],
    }),
  'filter[geographyDomain]': z
    .string()
    .min(1)
    .optional()
    .openapi({
      description: openApiText(
        'openapi_statistics_geography_domain_filter_description',
      ),
      examples: ['geographic', 'hkgov-censtatd-hma'],
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
        examples: ['2022', '2021'],
      }),
  })
  .openapi('StatisticsGeographiesQuery')

export const StatisticsSeriesQuerySchema = z
  .object(GeographyAggregateQueryShape)
  .openapi('StatisticsSeriesQuery')

const GeographyDimensionSchema = z.object({
  kind: z.enum(['division', 'buildingGroup', 'majorHousingEstate']).openapi({
    description: openApiText('openapi_statistics_geography_kind_description'),
    examples: ['division', 'buildingGroup', 'majorHousingEstate'],
  }),
  codeAttribute: z.enum(['divisionCode', 'geographyCode']).openapi({
    description: openApiText('openapi_statistics_geography_code_attribute_description'),
    examples: ['divisionCode', 'geographyCode'],
  }),
  domainCode: z
    .string()
    .optional()
    .openapi({
      description: openApiText('openapi_statistics_geography_domain_description'),
      examples: ['geographic', 'hkgov-censtatd-hma'],
    }),
  level: z
    .number()
    .int()
    .optional()
    .openapi({
      description: openApiText('openapi_statistics_geography_level_description'),
      examples: [2, 4],
    }),
})

const StatisticMeasureCandidateSchema = z.object({
  datasetCode: z.string().openapi({
    description: openApiText('openapi_statistics_dataset_code_description'),
    examples: ['ds-hk-hkgov-censtatd-division-statistic-major-housing-estates'],
  }),
  geography: GeographyDimensionSchema.openapi({
    description: openApiText('openapi_statistics_geography_description'),
  }),
})

export const StatisticAmbiguousMeasureErrorResponseSchema = z
  .object({
    httpStatus: z.literal(409).openapi({ examples: [409] }),
    error: z.literal('ambiguous_measure').openapi({
      examples: ['ambiguous_measure'],
    }),
    message: z.string().openapi({
      examples: ['Multiple statistic measures match the requested geography.'],
    }),
    candidates: z
      .array(StatisticMeasureCandidateSchema)
      .min(2)
      .openapi({
        examples: [
          [
            {
              datasetCode:
                'ds-hk-hkgov-censtatd-division-statistic-major-housing-estates',
              geography: {
                kind: 'majorHousingEstate',
                codeAttribute: 'geographyCode',
                domainCode: 'geographic',
                level: 4,
              },
            },
            {
              datasetCode:
                'ds-hk-hkgov-censtatd-division-statistic-housing-market-areas-building-groups',
              geography: {
                kind: 'buildingGroup',
                codeAttribute: 'geographyCode',
                domainCode: 'hkgov-censtatd-hma',
                level: 6,
              },
            },
          ],
        ],
      }),
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
          examples: [
            'ds-hk-hkgov-censtatd-division-statistic-land-area-population-density-district',
          ],
        }),
        fieldName: z.string().openapi({
          description: openApiText('openapi_statistics_field_name_description'),
          examples: ['populationDensity', 'totalPopulation'],
        }),
        unitCode: z.string().openapi({
          description: openApiText('openapi_statistics_field_unit_code_description'),
          examples: ['person-per-square-kilometre', 'person'],
        }),
      })
      .openapi({
        description: openApiText('openapi_statistics_measure_description'),
        examples: [
          {
            datasetCode:
              'ds-hk-hkgov-censtatd-division-statistic-land-area-population-density-district',
            fieldName: 'populationDensity',
            unitCode: 'person-per-square-kilometre',
          },
        ],
      }),
    geography: GeographyDimensionSchema.openapi({
      description: openApiText('openapi_statistics_geography_description'),
    }),
    dimensions: z.record(z.string(), z.string()).openapi({
      description: openApiText('openapi_statistics_dimensions_description'),
      examples: [{}, { sex: 'all' }, { 'housing-sector': 'public-rental' }],
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
        examples: ['2022', '2021'],
      }),
    }).openapi({
      description: openApiText('openapi_statistics_aggregate_meta_description'),
    }),
    values: z.record(z.string(), z.string()).openapi({
      description: openApiText('openapi_statistics_aggregate_values_description'),
      examples: [{ CW: '235953', WC: '158100', EST: '518200' }, { '60047': '8353' }],
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
        examples: [
          {
            '2021': { '60047': '8353' },
            '2022': { '60047': '8612' },
          },
        ],
      }),
  })
  .openapi('StatisticsSeriesResponse')
