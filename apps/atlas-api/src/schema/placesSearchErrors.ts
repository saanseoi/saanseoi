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
      .literal('FTS index is not initialised. Rebuild placesFts before using search.')
      .openapi({
        examples: [
          'FTS index is not initialised. Rebuild placesFts before using search.',
        ],
      }),
  })
  .openapi('SearchFtsNotReadyErrorResponse')

export const SearchUnavailableErrorResponseSchema = z
  .union([
    SearchSnapshotNotReadyErrorResponseSchema,
    SearchFtsNotReadyErrorResponseSchema,
  ])
  .openapi('SearchUnavailableErrorResponse')
