import { z } from '@hono/zod-openapi'
import { RegionFilterSchema } from './region'

export const SourceChangesQuerySchema = z
  .object({
    region: RegionFilterSchema,
    fromRelease: z.string().min(1).max(200),
    toRelease: z.string().min(1).max(200),
    resourceType: z.string().min(1).max(80).optional(),
    type: z.enum(['added', 'changed', 'removed']).optional(),
    view: z.enum(['records', 'summary']).default('records'),
    limit: z.coerce.number().int().min(1).max(100).default(25),
    cursor: z.string().min(1).max(4096).optional(),
  })
  .strict()

const record = z.object({
  sourceRecordId: z.string(),
  properties: z.record(z.string(), z.unknown()).nullable(),
  geometry: z.unknown().optional(),
  resourceType: z.string().optional(),
  variant: z.string().optional(),
})
export const SourceChangesResponseSchema = z.object({
  summary: z
    .object({
      count: z.number(),
      added_count: z.number(),
      changed_count: z.number(),
      removed_count: z.number(),
      unchanged_count: z.number(),
    })
    .optional(),
  pin: z.object({
    datasetCode: z.string(),
    resourceType: z.string(),
    fromRelease: z.string(),
    toRelease: z.string(),
  }),
  records: z.array(
    z.object({
      sourceRecordId: z.string(),
      type: z.enum(['added', 'changed', 'removed']),
      before: record.nullable(),
      after: record.nullable(),
      fields: z.array(
        z.object({
          path: z.array(z.string()),
          beforeExists: z.boolean(),
          afterExists: z.boolean(),
          before: z.unknown(),
          after: z.unknown(),
        }),
      ),
    }),
  ),
  nextCursor: z.string().nullable(),
})
export type SourceChangesQuery = z.infer<typeof SourceChangesQuerySchema>
export type SourceChangesResponse = z.infer<typeof SourceChangesResponseSchema>
