import { z } from '@hono/zod-openapi'

export const SearchSnapshotNotReadyErrorResponseSchema = z
  .object({
    httpStatus: z.number().openapi({
      examples: [503],
    }),
    error: z.literal('snapshot_not_ready').openapi({
      examples: ['snapshot_not_ready'],
    }),
    message: z.literal('No active place snapshot is published.').openapi({
      examples: ['No active place snapshot is published.'],
    }),
  })
  .openapi('SearchSnapshotNotReadyErrorResponse')

export const SearchFtsNotReadyErrorResponseSchema = z
  .object({
    httpStatus: z.number().openapi({
      examples: [503],
    }),
    error: z.literal('fts_not_ready').openapi({
      examples: ['fts_not_ready'],
    }),
    message: z
      .literal('Place search is not ready for the latest published release.')
      .openapi({
        examples: ['Place search is not ready for the latest published release.'],
      }),
  })
  .openapi('SearchFtsNotReadyErrorResponse')

export const SearchUnavailableErrorResponseSchema = z
  .union([
    SearchSnapshotNotReadyErrorResponseSchema,
    SearchFtsNotReadyErrorResponseSchema,
  ])
  .openapi('SearchUnavailableErrorResponse')
