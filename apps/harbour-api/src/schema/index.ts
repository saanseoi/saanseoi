import { z } from '@hono/zod-openapi'

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
    'DB_HISTORY_HK_2025',
    'DB_HISTORY_HK_2026',
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
  examples: ['hk-division', 'hk-address'],
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
  examples: ['overture-hk-division-2025-09-24.0', 'hkgov-hk-address-2026-01-20.0'],
})

const RawObjectKeySchema = z
  .string()
  .nullable()
  .openapi({
    description:
      'R2 object key for the uploaded file, constructed as `{region}/{source}/{sourceVersion}/{type}.{extension}`',
    examples: [
      'hk/overture/2025-09-24.0/division.parquet',
      'hk/hkgov/2026-01-20.0/address.json',
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
  .enum(['address', 'division', 'place', 'street'])
  .openapi('HarbourDatasetTypeQuery')

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

export const SignUploadRequestSchema = z
  .object({
    force: z
      .boolean()
      .optional()
      .openapi({
        description:
          'Allow replacing an existing upload session only when the release is still in uploading status.',
        examples: [true],
      }),
  })
  .loose()
  .openapi('HarbourSignUploadRequest')

export const SignUploadResponseSchema = z
  .object({
    datasetId: DatasetIdSchema,
    datasetCode: DatasetCodeSchema,
    expiresAt: z.string().openapi({
      description: 'Expiration timestamp for the signed upload URL',
      examples: ['2025-09-30T23:59:59Z', '2026-01-21T00:00:00Z'],
    }),
    rawObjectKey: RawObjectKeySchema,
    releaseCode: ReleaseCodeSchema,
    releaseId: ReleaseIdSchema,
    source: SourceSchema,
    status: StatusSchema,
    uploadHeaders: z.record(z.string(), z.string()).openapi({
      description: 'HTTP headers to include in the upload request',
      examples: [{ 'Content-Type': 'application/octet-stream' }],
    }),
    uploadMethod: z.string().openapi({
      description: 'HTTP method to use for the upload',
      examples: ['PUT', 'POST'],
    }),
    uploadUrl: z.string().openapi({
      description: 'Pre-signed URL for uploading the file',
      examples: [
        'https://r2.example.com/hk/overture/2025-09-24.0/division.parquet?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=AKIAIOSFODNN7EXAMPLE%2F20250930%2Fus-east-1%2Fr2%2Faws4_request&X-Amz-Date=20250930T123600Z&X-Amz-Expires=86400&X-Amz-SignedHeaders=host&X-Amz-Signature=...',
      ],
    }),
  })
  .openapi('HarbourSignUploadResponse')

export const FinalizeUploadRequestSchema = z
  .object({
    releaseId: ReleaseIdSchema,
  })
  .openapi('HarbourFinalizeUploadRequest')

export const RequeueUploadRequestSchema = z
  .object({
    releaseId: ReleaseIdSchema,
  })
  .openapi('HarbourRequeueUploadRequest')

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
    value => Boolean(value.releaseId || value.releaseCode),
    'Either releaseId or releaseCode is required.',
  )
  .openapi('HarbourControlStageRequest')

export const PublishDatasetRequestSchema = z
  .object({
    releaseCode: ReleaseCodeSchema.optional(),
    releaseId: ReleaseIdSchema.optional(),
  })
  .refine(
    value => Boolean(value.releaseId || value.releaseCode),
    'Either releaseId or releaseCode is required.',
  )
  .openapi('HarbourPublishDatasetRequest')

export const ControlResponseSchema = z
  .object({
    releaseCode: ReleaseCodeSchema,
    releaseId: ReleaseIdSchema,
    phase: z
      .string()
      .nullable()
      .openapi({
        examples: ['extractDivisions', null],
      }),
    status: StatusSchema,
  })
  .openapi('HarbourControlResponse')

export const ReportQuerySchema = z
  .object({
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
    snapshotMonth: z.string().nullable(),
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
    snapshotMonth: z.string().nullable(),
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
