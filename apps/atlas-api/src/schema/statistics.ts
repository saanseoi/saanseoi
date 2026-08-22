import { z } from '@hono/zod-openapi'
import { getRequestedApiLocalesValidationError } from '@repo/core'
import {
  statsFieldComparabilityReasons,
  statsFieldComparabilityStatuses,
} from '@repo/db'

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
    type: z.literal('statistics'),
    id: IdSchema,
    attributes: z.object({
      datasetCode: z.string(),
      referencePeriod: z.object({
        code: z.string(),
        start: z.string().nullable(),
        end: z.string().nullable(),
        endYear: z.string(),
        granularity: z.string(),
      }),
      geography: z.object({
        kind: z.string(),
        code: z.string(),
        class: z.string().optional(),
      }),
      dimensions: z.record(z.string(), z.string()),
      values: z.record(z.string(), z.string()),
      comparability: z
        .record(
          z.string(),
          z.object({
            affectedReferencePeriods: z.array(z.string().regex(/^\d{4}$/)).min(1),
            reason: z.enum(statsFieldComparabilityReasons),
            status: z.enum(statsFieldComparabilityStatuses),
          }),
        )
        .optional(),
      sourceReleaseId: z.string().optional(),
      sourceFeatureRef: z.string().optional(),
      createdAt: z.string().optional(),
      updatedAt: z.string().optional(),
    }),
    relationships: z.object({
      division: z.object({
        data: z.object({ type: z.literal('divisions'), id: IdSchema }).nullable(),
      }),
    }),
    links: JsonApiLinkMapSchema.optional(),
  })
  .openapi('Statistic')

const RequestedLocalesQuerySchema = z
  .string()
  .superRefine((value: string, ctx: z.RefinementCtx<string>) => {
    const error = getRequestedApiLocalesValidationError(value)
    if (error) ctx.addIssue({ code: 'custom', message: error })
  })

const IncludeSchema = z
  .string()
  .regex(
    /^(none|(fields|divisions|areas(?::(overture|hkgov-had|hkgov-censtatd:(2016|2021)(:simplified)?|hkgov-censtatd-area|hkgov-censtatd-hma))?)(,(fields|divisions|areas(?::(overture|hkgov-had|hkgov-censtatd:(2016|2021)(:simplified)?|hkgov-censtatd-area|hkgov-censtatd-hma))?))*)$/,
  )
  .optional()
  .openapi({
    description:
      'Include field definitions, related divisions and/or division-area geometry. Field definitions include the requested locale labels. Unqualified areas resolve per statistic geography; qualified areas request one exact provider variant.',
  })

const CommonQueryShape = {
  catalogRevision: z.string().min(1).optional(),
  cohort: z.string().min(1).optional(),
  domain: z.literal('official').optional(),
  effectiveAt: z.iso.datetime().optional(),
  knownAt: z.iso.datetime().optional(),
  releaseSet: z.string().min(1).optional(),
  profile: ProfileName.optional(),
  locales: RequestedLocalesQuerySchema.optional(),
  include: IncludeSchema,
}

export const StatisticsListQuerySchema = z
  .object({
    ...CommonQueryShape,
    'page[limit]': z.coerce.number().int().min(1).max(100).optional(),
    'page[offset]': z.coerce.number().int().min(0).optional(),
    'filter[dataset]': z.string().min(1).optional(),
    'filter[division]': IdSchema.optional(),
    'filter[referencePeriod]': z.string().min(1).optional(),
    'filter[field]': z.string().min(1).optional(),
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
    apiCatalogRevision: z.string(),
    catalogPublishedAt: z.string(),
    cohort: z.string(),
    domain: z.literal('official'),
    profile: ProfileName,
    locales: RequestedLocalesMetadataSchema,
    filters: z
      .object({
        dataset: z.string().optional(),
        division: z.string().optional(),
        referencePeriod: z.string().optional(),
        field: z.string().optional(),
      })
      .optional(),
    page: z
      .object({
        limit: z.number().int(),
        offset: z.number().int(),
        total: z.number().int(),
      })
      .optional(),
  })
  .extend(ApiVersionMetadataSchema.shape)
  .openapi('StatisticsDocumentMeta')

const IncludedStatisticResourceSchema = z.union([
  DivisionResourceSchema,
  DivisionGeometryResourceSchema,
  z.object({
    type: z.literal('statistic-fields'),
    id: IdSchema,
    attributes: z.object({
      datasetCode: z.string(),
      fieldName: z.string(),
      sourceField: z.string(),
      dimensions: z.record(z.string(), z.string()),
      sourceNullOption: z.string().nullable(),
      statisticKind: z.string(),
      aggregation: z.string(),
      aggregationPercentile: z.number().nullable(),
      comparability: z
        .object({
          affectedReferencePeriods: z.array(z.string()),
          reason: z.enum(statsFieldComparabilityReasons),
          status: z.enum(statsFieldComparabilityStatuses),
        })
        .nullable(),
      denominatorFieldName: z.string().nullable(),
      valueKind: z.string(),
      unitCode: z.string(),
      i18n: z.record(
        z.string(),
        z.object({
          name: z.string(),
          description: z.string().nullable(),
          isTranslationVerified: z.boolean(),
        }),
      ),
    }),
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
  .openapi('StatisticsListResponse')

export const StatisticDetailResponseSchema = z
  .object({
    jsonapi: JsonApiVersionSchema,
    links: JsonApiLinkMapSchema,
    data: StatisticResourceSchema,
    included: z.array(IncludedStatisticResourceSchema).optional(),
    meta: StatisticsDocumentMetaSchema,
  })
  .openapi('StatisticDetailResponse')

export const StatisticSnapshotNotReadyErrorResponseSchema = z
  .object({
    httpStatus: z.literal(503),
    error: z.literal('snapshot_not_ready'),
    message: z.literal('No active statistic snapshot is published.'),
  })
  .openapi('StatisticSnapshotNotReadyErrorResponse')

const GeographyAggregateQueryShape = {
  ...CommonQueryShape,
  'filter[dataset]': z.string().min(1).optional().openapi({
    description:
      'Optional dataset override. Omit it to resolve one dataset from the field and geography filters.',
  }),
  'filter[field]': z.string().min(1),
  'filter[geographyKind]': z
    .enum(['division', 'buildingGroup', 'majorHousingEstate'])
    .optional(),
  'filter[geographyLevel]': z.coerce.number().int().min(0).optional(),
  'filter[geographyDomain]': z.string().min(1).optional(),
}

export const StatisticsGeographiesQuerySchema = z
  .object({
    ...GeographyAggregateQueryShape,
    'filter[referencePeriod]': z.string().min(1),
  })
  .openapi('StatisticsGeographiesQuery')

export const StatisticsSeriesQuerySchema = z
  .object(GeographyAggregateQueryShape)
  .openapi('StatisticsSeriesQuery')

const GeographyDimensionSchema = z.object({
  kind: z.enum(['division', 'buildingGroup', 'majorHousingEstate']),
  codeAttribute: z.enum(['divisionCode', 'geographyCode']),
  domainCode: z.string().optional(),
  level: z.number().int().optional(),
})

const StatisticMeasureCandidateSchema = z.object({
  datasetCode: z.string(),
  geography: GeographyDimensionSchema,
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
    measure: z.object({
      datasetCode: z.string(),
      fieldName: z.string(),
      unitCode: z.string(),
    }),
    geography: GeographyDimensionSchema,
    dimensions: z.record(z.string(), z.string()),
  })
  .extend(ApiVersionMetadataSchema.shape)

export const StatisticsGeographiesResponseSchema = z
  .object({
    meta: GeographyAggregateMetaSchema.extend({ referencePeriod: z.string() }),
    values: z.record(z.string(), z.string()),
  })
  .openapi('StatisticsGeographiesResponse')

export const StatisticsSeriesResponseSchema = z
  .object({
    meta: GeographyAggregateMetaSchema,
    valuesByReferencePeriod: z.record(z.string(), z.record(z.string(), z.string())),
  })
  .openapi('StatisticsSeriesResponse')
