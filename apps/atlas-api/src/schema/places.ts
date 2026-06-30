import { z } from '@hono/zod-openapi'

import { RegionCode } from './common'

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
      .literal('FTS index is not initialized. Rebuild placesFts before using search.')
      .openapi({
        examples: [
          'FTS index is not initialized. Rebuild placesFts before using search.',
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

export const RegionPlaceParamsSchema = z
  .object({
    region: RegionCode,
    id: z.string(),
  })
  .openapi('RegionPlaceParams')

export const PlaceQuerySchema = z
  .object({
    locale: z.string().optional(),
  })
  .openapi('PlaceQuery')

export const PlaceResponseSchema = z
  .object({
    place: z.object({}).loose(),
    i18n: z.array(z.object({}).loose()),
    divisions: z.array(z.object({}).loose()),
  })
  .openapi('PlaceResponse')

export const PlacesByCellParamsSchema = z
  .object({
    region: RegionCode,
    h3Level: z.string(),
    h3Cell: z.string(),
  })
  .openapi('PlacesByCellParams')

export const PlacesByCellQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).optional(),
  })
  .openapi('PlacesByCellQuery')

export const PlacesByCellResponseSchema = z
  .object({
    places: z.array(z.object({}).loose()),
  })
  .openapi('PlacesByCellResponse')

export const SearchParamsSchema = z
  .object({
    region: RegionCode,
  })
  .openapi('SearchParams')

export const SearchQuerySchema = z
  .object({
    q: z.string(),
    locale: z.string().optional(),
    limit: z.coerce.number().int().min(1).optional(),
  })
  .openapi('SearchQuery')

export const SearchResponseSchema = z
  .object({
    results: z.array(z.object({}).loose()),
  })
  .openapi('SearchResponse')
