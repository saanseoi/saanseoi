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

export const HealthResponseSchema = z
  .object({
    ok: z.boolean(),
    datasetCount: z.number(),
  })
  .openapi('HarbourHealthResponse')

export const UploadResponseSchema = z
  .object({
    datasetId: z.string().openapi({
      description:
        'Unique identifier for the dataset, consisting of the source, region code, sourceVersion, and (theme) type',
      examples: ['overture-hk-2025-09-24.0-division','hkgov-hk-2026-01-20.0-address'],
    }),
    rawObjectKey: z.string().nullable().openapi({
      description: 'R2 object key for the uploaded file, constructed as `{region}/{source}/{sourceVersion}/{themeType}.{dataType}`',
      examples: ['hk/overture/2025-09-24.0/division.parquet', 'hk/hkgov/2026-01-20.0/address.json'],
    }),
    rowCount: z.number().openapi({
      description: 'Number of rows processed in the upload',
      examples: [1000, 25000],
    }),
    snapshotMonth: z.string().nullable().openapi({
      description: 'Snapshot month in YYYY-MM format',
      examples: ['2025-09', '2026-01'],
    }),
    status: z.string().openapi({
      description: 'Status of the upload operation',
      examples: ['completed', 'processing', 'failed'],
    }),
    supersedesDatasetId: z.string().nullable().openapi({
      description: 'Dataset ID that this dataset supersedes (if any)',
      examples: ['overture-hk-2025-09-24.0-division', null]
    }),
    type: z.string().openapi({
      description: 'Theme type of the dataset (e.g., division, address)',
      examples: ['division', 'address', 'place'],
    }),
  })
  .openapi('HarbourUploadResponse')

export const SignUploadRequestSchema = z
  .object({})
  .loose()
  .openapi('HarbourSignUploadRequest')

export const SignUploadResponseSchema = z
  .object({
    datasetId: z.string().openapi({
      description:
        'Unique identifier for the dataset, consisting of the source, region code, sourceVersion, and (theme) type',
      examples: ['overture-hk-2025-09-24.0-division','hkgov-hk-2026-01-20.0-address'],
    }),
    expiresAt: z.string().openapi({
      description: 'Expiration timestamp for the signed upload URL',
      examples: ['2025-09-30T23:59:59Z', '2026-01-21T00:00:00Z'],
    }),
    rawObjectKey: z.string().nullable().openapi({
      description: 'R2 object key for the uploaded file, constructed as `{region}/{source}/{sourceVersion}/{themeType}.{dataType}`',
      examples: ['hk/overture/2025-09-24.0/division.parquet', 'hk/hkgov/2026-01-20.0/address.json'],
    }),
    status: z.string().openapi({
      description: 'Status of the upload operation',
      examples: ['completed', 'processing', 'failed'],
    }),
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
      examples: ['https://r2.example.com/hk/overture/2025-09-24.0/division.parquet?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=AKIAIOSFODNN7EXAMPLE%2F20250930%2Fus-east-1%2Fr2%2Faws4_request&X-Amz-Date=20250930T123600Z&X-Amz-Expires=86400&X-Amz-SignedHeaders=host&X-Amz-Signature=...'],
    }),
  })
  .openapi('HarbourSignUploadResponse')

export const FinalizeUploadRequestSchema = z
  .object({})
  .loose()
  .openapi('HarbourFinalizeUploadRequest')
