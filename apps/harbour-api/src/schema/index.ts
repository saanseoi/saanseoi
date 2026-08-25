import { z } from '@hono/zod-openapi'
import { resourceTypes } from '@repo/core'
import { apiFamilyTypes } from '@repo/db'

export const ErrorResponseSchema = z
  .object({
    httpStatus: z.number().openapi({
      examples: [404, 500],
    }),
    error: z.string().openapi({
      examples: ['not_found', 'internal_error'],
    }),
    message: z.string().openapi({
      examples: ['Route not found.', 'The atlas API request failed.'],
    }),
  })
  .openapi('HarbourErrorResponse')

const ValidationErrorDetailSchema = z
  .object({
    code: z.string().openapi({
      examples: ['invalid_type', 'too_small'],
    }),
    message: z.string().openapi({
      examples: ['Required', 'Expected string, received number'],
    }),
    path: z.string().openapi({
      examples: ['source', 'body.sourceVersion'],
    }),
  })
  .openapi('HarbourValidationErrorDetail')

export const ValidationErrorResponseSchema = z
  .object({
    httpStatus: z.literal(422).openapi({
      examples: [422],
    }),
    error: z.literal('validation_error').openapi({
      examples: ['validation_error'],
    }),
    message: z.literal('Request validation failed.').openapi({
      examples: ['Request validation failed.'],
    }),
    details: z.array(ValidationErrorDetailSchema),
    target: z.enum(['json', 'form', 'query', 'param', 'header', 'cookie']).openapi({
      examples: ['json', 'query'],
    }),
  })
  .openapi('HarbourValidationErrorResponse')

export const ValidationErrorOpenAPIResponse = {
  content: {
    'application/json': {
      schema: ValidationErrorResponseSchema,
    },
  },
  description: 'Request validation failed.',
} as const

export const HealthResponseSchema = z
  .object({
    ok: z.boolean(),
    datasetCount: z.number(),
  })
  .openapi('HarbourHealthResponse')

const D1BindingNameSchema = z
  .enum([
    'DB_META',
    'DB_CURRENT',
    'DB_HISTORY_HK_BEFORE',
    'DB_HISTORY_HK_2025',
    'DB_HISTORY_HK_2026',
    'DB_SOURCE_HK_BEFORE',
    'DB_SOURCE_HK_2025',
    'DB_SOURCE_HK_2026',
  ])
  .openapi('HarbourD1BindingName')

const D1PlacementProbeStatsSchema = z
  .object({
    avgMs: z.number(),
    maxMs: z.number(),
    minMs: z.number(),
    p50Ms: z.number(),
    p95Ms: z.number(),
  })
  .openapi('HarbourD1PlacementProbeStats')

const D1PlacementProbeBindingSchema = z
  .object({
    binding: D1BindingNameSchema,
    stats: D1PlacementProbeStatsSchema,
    timingsMs: z.array(z.number()),
  })
  .openapi('HarbourD1PlacementProbeBinding')

export const D1PlacementProbeResponseSchema = z
  .object({
    ok: z.literal(true),
    worker: z.string().openapi({
      examples: ['harbour-api'],
    }),
    configuredPlacementRegion: z.string().openapi({
      examples: ['azure:eastasia'],
    }),
    request: z.object({
      city: z.string().nullable(),
      colo: z.string().nullable(),
      country: z.string().nullable(),
      host: z.string(),
      path: z.string(),
      region: z.string().nullable(),
      timezone: z.string().nullable(),
    }),
    startedAt: z.string(),
    completedAt: z.string(),
    iterations: z.number(),
    totalQueries: z.number(),
    query: z.string(),
    overall: D1PlacementProbeStatsSchema,
    bindings: z.array(D1PlacementProbeBindingSchema),
  })
  .openapi('HarbourD1PlacementProbeResponse')

const DatasetIdSchema = z
  .string()
  .uuid()
  .openapi({
    description: 'Stable dataset UUID from meta.datasets.',
    examples: ['960b3f6f-437f-49e3-bd72-44e87d1cd5b9'],
  })

const DatasetCodeSchema = z.string().openapi({
  description: 'Stable dataset code within a publisher.',
  examples: ['ds-hk-overture-division', 'ds-hk-hkgov-dpo-address'],
})

const ReleaseIdSchema = z
  .string()
  .uuid()
  .openapi({
    description: 'Release UUID from meta.releases.',
    examples: ['1ab6a8d2-5ec6-4faa-bd89-c0b3021bba70'],
  })

const ReleaseCodeSchema = z.string().openapi({
  description: 'Public release identifier.',
  examples: [
    'dr-hk-overture-division-2025-09-24.0',
    'dr-hk-hkgov-dpo-address-2026-01-20.0',
  ],
})

const RawObjectKeySchema = z
  .string()
  .nullable()
  .openapi({
    description:
      'Legacy object key for an older retained input. Locally processed releases do not retain an intermediate object.',
    examples: [
      'hk/overture/2025-09-24.0/division.parquet',
      'hk/hkgov-dpo/2026-01-20.0/address.json',
    ],
  })

const StatusSchema = z.string().openapi({
  description: 'Status of the upload operation',
  examples: ['completed', 'processing', 'failed'],
})

const SourceSchema = z.string().openapi({
  description: 'Upstream data source used in the dataset identity',
  examples: ['overture', 'hkgov'],
})

const DatasetTypeQuerySchema = z
  .enum(['address', 'division', 'divisionArea', 'divisionBoundary', 'place', 'street'])
  .openapi('HarbourDatasetTypeQuery')

const ResourceTypeSchema = z.enum(resourceTypes).openapi('HarbourResourceType')

export const UploadResponseSchema = z
  .object({
    datasetId: DatasetIdSchema,
    datasetCode: DatasetCodeSchema,
    rawObjectKey: RawObjectKeySchema,
    releaseCode: ReleaseCodeSchema,
    releaseId: ReleaseIdSchema,
    rowCount: z.number().openapi({
      description: 'Number of rows processed in the upload',
      examples: [1000, 25000],
    }),
    source: SourceSchema,
    sourceVersion: z
      .string()
      .nullable()
      .openapi({
        description: 'Upstream source release version used in the dataset identity',
        examples: ['2025-09-24.0', '2026-01-20.0'],
      }),
    status: StatusSchema,
    type: z.string().openapi({
      description: 'Theme type of the dataset (e.g., division, address)',
      examples: ['division', 'address', 'place'],
    }),
  })
  .openapi('HarbourUploadResponse')

const UploadInspectionSchema = z.object({
  distinctCountryValues: z.array(z.string()),
  distinctRegionValues: z.array(z.string()),
  distinctThemeValues: z.array(z.string()),
  distinctTypeValues: z.array(z.string()),
  rowCount: z.number().int().nonnegative(),
  schema: z.array(
    z.object({
      name: z.string(),
      nullable: z.boolean(),
      type: z.string(),
    }),
  ),
})

export const RegisterUploadRequestSchema = z
  .object({
    fileName: z.string().min(1),
    force: z
      .boolean()
      .optional()
      .openapi({
        description: 'Allow replacing a release that is still staged.',
        examples: [true],
      }),
    resumeStagedRelease: z
      .boolean()
      .optional()
      .openapi({
        description:
          'Allow retrying an already staged release without permitting a published release repair.',
        examples: [true],
      }),
    inspection: UploadInspectionSchema,
    plan: z.object({
      cohortKey: z.string().optional(),
      datasetCode: z.string().optional(),
      regionCode: z.string().optional(),
      releaseNotesUrl: z.string().url().optional(),
      shardYear: z.string().optional(),
      source: z.string().optional(),
      sourceVersion: z.string().optional(),
      theme: z.string().optional(),
      type: z.string().optional(),
    }),
  })
  .openapi('HarbourRegisterUploadRequest')

export const LocalUploadRegistrationResponseSchema = z
  .object({
    datasetId: DatasetIdSchema,
    datasetCode: DatasetCodeSchema,
    rawObjectKey: RawObjectKeySchema.openapi({
      description:
        'Key of the prepared raw source object, used by the CLI during processing and retained in release metadata.',
    }),
    releaseCode: ReleaseCodeSchema,
    releaseId: ReleaseIdSchema,
    source: SourceSchema,
    status: StatusSchema,
    sourceVersion: z.string(),
    type: z.string(),
    rowCount: z.number(),
  })
  .openapi('HarbourLocalUploadRegistrationResponse')

export const ManagedSourceAssetResponseSchema = z
  .object({
    assetId: z.string().uuid(),
    assetUrl: z.string().url(),
    status: z.enum(['existing', 'uploaded']),
  })
  .openapi('HarbourManagedSourceAssetResponse')

export const LinkManagedSourceAssetRequestSchema = z
  .object({
    assetKey: z.string().min(1),
    releaseId: ReleaseIdSchema,
  })
  .openapi('HarbourLinkManagedSourceAssetRequest')

export const LinkManagedSourceAssetResponseSchema = z
  .object({
    assetId: z.string().uuid(),
    status: z.enum(['existing', 'linked']),
  })
  .openapi('HarbourLinkManagedSourceAssetResponse')

export const ControlStageRequestSchema = z
  .object({
    releaseCode: ReleaseCodeSchema.optional(),
    releaseId: ReleaseIdSchema.optional(),
    phase: z.string().openapi({
      examples: ['processDataset', 'extractDivisions', 'extractDivisionsI18n'],
    }),
    stats: z.record(z.string(), z.unknown()).optional(),
    error: z.string().optional(),
  })
  .refine(
    (value: { releaseCode?: string; releaseId?: string }) =>
      Boolean(value.releaseId || value.releaseCode),
    'Either releaseId or releaseCode is required.',
  )
  .openapi('HarbourControlStageRequest', {
    anyOf: [{ required: ['releaseId'] }, { required: ['releaseCode'] }],
  })

export const PublishDatasetRequestSchema = z
  .object({
    deferStatsReleaseSet: z.boolean().optional(),
    releaseCode: ReleaseCodeSchema.optional(),
    releaseId: ReleaseIdSchema.optional(),
    skipSnapshotCleanup: z.boolean().optional(),
  })
  .refine(
    (value: { releaseCode?: string; releaseId?: string }) =>
      Boolean(value.releaseId || value.releaseCode),
    'Either releaseId or releaseCode is required.',
  )
  .openapi('HarbourPublishDatasetRequest', {
    anyOf: [{ required: ['releaseId'] }, { required: ['releaseCode'] }],
  })

export const ReconcileDraftReleaseSetsRequestSchema = z
  .object({
    apiFamily: z.enum(apiFamilyTypes).optional(),
    regionCode: z.enum(['hk', 'mo']).optional(),
  })
  .openapi('HarbourReconcileDraftReleaseSetsRequest')

export const BootstrapStatsReleaseSetsRequestSchema = z
  .object({
    regionCode: z.enum(['hk', 'mo']).optional(),
  })
  .openapi('HarbourBootstrapStatsReleaseSetsRequest')

const ReleaseSetPublicationSchema = z.object({
  apiCatalogRevisionCode: z.string().optional(),
  apiFamily: z.string(),
  apiReleaseSetCode: z.string(),
  cohortKey: z.string().nullable(),
  description: z.string(),
  domainCode: z.string(),
  domainName: z.string(),
  publishedAt: z.string(),
  publisherName: z.string(),
  regionCode: z.string(),
  revision: z.number().int().nonnegative(),
})

export const ReconcileDraftReleaseSetsResponseSchema = z
  .object({
    inspected: z.number().int().nonnegative(),
    pendingReleaseSetCodes: z.array(z.string()),
    publishedReleaseSetPublications: z.array(ReleaseSetPublicationSchema),
    publishedReleaseSetCodes: z.array(z.string()),
  })
  .openapi('HarbourReconcileDraftReleaseSetsResponse')

export const BootstrapStatsReleaseSetsResponseSchema = z
  .object({
    createdReleaseSetCodes: z.array(z.string()),
    inspectedSnapshots: z.number().int().nonnegative(),
    skippedCohortKeys: z.array(z.string()),
  })
  .openapi('HarbourBootstrapStatsReleaseSetsResponse')

export const CleanupSnapshotsRequestSchema = z
  .object({
    delaySeconds: z.number().int().min(0).max(86_400).optional(),
    dryRun: z.boolean().optional(),
    resourceType: ResourceTypeSchema.optional(),
    snapshotIds: z.array(z.string().uuid()).optional(),
  })
  .openapi('HarbourCleanupSnapshotsRequest')

export const CleanupSnapshotsResponseSchema = z
  .object({
    candidateCount: z.number(),
    delaySeconds: z.number(),
    dryRun: z.boolean(),
    snapshotIds: z.array(z.string()),
    status: z.enum(['queued', 'skipped']),
  })
  .openapi('HarbourCleanupSnapshotsResponse')

export const ControlResponseSchema = z
  .object({
    apiCatalogRevisionCode: z.string().optional(),
    apiCatalogRevisionId: z.string().uuid().optional(),
    apiReleaseSetId: z.string().uuid().optional(),
    apiReleaseSetCode: z.string().optional(),
    apiReleaseSetStatus: z.enum(['current', 'draft']).optional(),
    apiReleaseSetPublications: z.array(ReleaseSetPublicationSchema).optional(),
    releaseCode: ReleaseCodeSchema,
    releaseId: ReleaseIdSchema,
    phase: z
      .string()
      .nullable()
      .openapi({
        examples: ['extractDivisions', null],
      }),
    snapshotId: z.string().uuid().optional(),
    status: StatusSchema,
  })
  .openapi('HarbourControlResponse')

export const ReportQuerySchema = z
  .object({
    datasetCode: DatasetCodeSchema.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(10),
    releaseCode: ReleaseCodeSchema.optional(),
    releaseId: ReleaseIdSchema.optional(),
    source: SourceSchema.optional(),
    type: DatasetTypeQuerySchema.optional(),
  })
  .openapi('HarbourReportQuery')

export const StatsReportQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(1),
    releaseId: ReleaseIdSchema.optional(),
    source: SourceSchema.optional(),
    type: DatasetTypeQuerySchema.optional(),
  })
  .openapi('HarbourStatsReportQuery')

export const ReportRowCountSchema = z
  .object({
    kind: z.enum(['history', 'source']),
    label: z.string(),
    rowCount: z.number(),
    tableName: z.string(),
  })
  .openapi('HarbourReportRowCount')

export const IngestRunReportRowSchema = z
  .object({
    datasetCode: DatasetCodeSchema,
    error: z.unknown().nullable(),
    finishedAt: z.string().nullable(),
    phase: z.string(),
    releaseCode: ReleaseCodeSchema,
    releaseId: ReleaseIdSchema,
    runId: z.string(),
    cohortKey: z.string().nullable(),
    source: SourceSchema,
    startedAt: z.string(),
    stats: z.unknown().nullable(),
    status: z.string(),
    type: z.string(),
  })
  .openapi('HarbourIngestRunReportRow')

export const IngestRunReportResponseSchema = z
  .object({
    rows: z.array(IngestRunReportRowSchema),
  })
  .openapi('HarbourIngestRunReportResponse')

export const StatReportRowSchema = z
  .object({
    createdAt: z.string(),
    datasetCode: DatasetCodeSchema,
    dimension: z.string(),
    groupBy: z.string().nullable(),
    groupValue: z.string().nullable(),
    id: z.string(),
    metric: z.string(),
    metricUnit: z.string(),
    releaseCode: ReleaseCodeSchema,
    releaseId: ReleaseIdSchema,
    source: SourceSchema,
    type: z.string(),
    updatedAt: z.string(),
    value: z.number(),
  })
  .openapi('HarbourStatReportRow')

export const StatsReportResponseSchema = z
  .object({
    rows: z.array(StatReportRowSchema),
  })
  .openapi('HarbourStatsReportResponse')

export const ProcessingActionReportRowSchema = z
  .object({
    action: z.string(),
    affectedRecordCount: z.number().int().nonnegative(),
    createdAt: z.string(),
    datasetCode: DatasetCodeSchema,
    evidence: z.unknown(),
    id: z.string(),
    mode: z.enum(['automatic', 'manual']),
    releaseCode: ReleaseCodeSchema,
    releaseId: ReleaseIdSchema,
    source: SourceSchema,
    summary: z.string(),
    type: z.string(),
    updatedAt: z.string(),
  })
  .openapi('HarbourProcessingActionReportRow')

export const ProcessingActionReportResponseSchema = z
  .object({
    rows: z.array(ProcessingActionReportRowSchema),
  })
  .openapi('HarbourProcessingActionReportResponse')

export const ReleaseReportRowSchema = z
  .object({
    createdAt: z.string(),
    datasetCode: DatasetCodeSchema,
    datasetId: DatasetIdSchema,
    ingestedAt: z.string().nullable(),
    originalFileName: z.string().nullable(),
    publicationDate: z.string().nullable(),
    rawObjectKey: RawObjectKeySchema,
    releaseCode: ReleaseCodeSchema,
    releaseId: ReleaseIdSchema,
    revocationReason: z.string().nullable(),
    revokedAt: z.string().nullable(),
    rowCounts: z.array(ReportRowCountSchema),
    cohortKey: z.string().nullable(),
    source: SourceSchema,
    sourceVersion: z.string(),
    status: z.string(),
    supersededByReleaseId: ReleaseIdSchema.nullable(),
    type: z.string(),
    updatedAt: z.string(),
  })
  .openapi('HarbourReleaseReportRow')

export const ReleaseReportResponseSchema = z
  .object({
    rows: z.array(ReleaseReportRowSchema),
  })
  .openapi('HarbourReleaseReportResponse')
