import { z } from '@hono/zod-openapi'

const SourceReleaseCodeSchema = z
  .string()
  .min(1)
  .openapi({
    description: 'Globally unique source release code.',
    examples: ['dr-hk-overture-division-2026-07-22.0'],
  })

const SourceRecordCursorSchema = z.string().min(1).openapi({
  description: 'Opaque cursor returned by a prior source-record response.',
})

const SourceRecordSchema = z
  .object({
    sourceRecordId: z.string(),
    resourceType: z.string(),
    variant: z.string(),
    rawProperties: z.object({}).loose().nullable(),
    geometry: z.unknown().optional(),
  })
  .openapi('SourceRecord')

const SourceRecordPinSchema = z
  .object({
    apiReleaseSetCode: z.string().nullable().openapi({
      description:
        'Null for a canonical sourceRelease pin, which is intentionally independent of an API release set.',
    }),
    datasetCode: z.string(),
    snapshotCode: z.string().nullable().openapi({
      description:
        'Null for a canonical sourceRelease pin, which is intentionally independent of a snapshot.',
    }),
    sourceReleaseCode: SourceReleaseCodeSchema,
  })
  .openapi('SourceRecordPin')

export const SourceRecordsQuerySchema = z
  .object({
    sourceRelease: SourceReleaseCodeSchema,
    cursor: SourceRecordCursorSchema.optional(),
    limit: z.coerce.number().int().min(1).max(500).optional(),
    include: z.literal('geometry').optional(),
    format: z.enum(['json', 'ndjson']).optional(),
    download: z.literal('1').optional(),
  })
  .openapi('SourceRecordsQuery')

export const SourceRecordsResponseSchema = z
  .object({
    pin: SourceRecordPinSchema,
    records: z.array(SourceRecordSchema),
    nextCursor: z.string().nullable(),
  })
  .openapi('SourceRecordsResponse')

export const SourceReleasesQuerySchema = z
  .object({
    releaseSet: z.string().min(1).optional(),
    snapshot: z.string().min(1).optional(),
    cohort: z.string().min(1).optional(),
    dataset: z.string().min(1).optional(),
  })
  .refine(
    (value: {
      releaseSet?: string
      snapshot?: string
      cohort?: string
      dataset?: string
    }) => [value.releaseSet, value.snapshot, value.cohort].filter(Boolean).length <= 1,
    {
      message: 'Use at most one of releaseSet, snapshot, and cohort.',
      path: ['releaseSet'],
    },
  )
  .openapi('SourceReleasesQuery')

export const SourceReleasesResponseSchema = z
  .object({
    sourceReleases: z.array(
      z.object({
        datasetCode: z.string(),
        sourceReleaseCode: SourceReleaseCodeSchema,
        resourceType: z.string(),
        sourceVariant: z.string(),
        snapshotCode: z.string(),
        apiReleaseSetCode: z.string().nullable(),
        role: z.string(),
        recordsAvailable: z.boolean(),
        recordsHref: z.string().nullable(),
      }),
    ),
  })
  .openapi('SourceReleasesResponse')
