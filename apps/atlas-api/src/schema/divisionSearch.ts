import { z } from '@hono/zod-openapi'
import { divisionSearchDomains } from '@repo/core/pipeline/services/search/divisions'
import { divisionSearchTerms } from '@repo/core/pipeline/services/search/divisionQuery'
import { ApiLocale } from './common'
import { RegionFilterSchema } from './region'

export const DivisionSearchQuerySchema = z
  .object({
    access_token: z
      .string()
      .optional()
      .openapi({ description: 'Public API key, when supplied as a query parameter.' }),
    region: RegionFilterSchema,
    domain: z.enum(divisionSearchDomains).optional(),
    q: z
      .string()
      .trim()
      .min(1)
      .max(120)
      .refine(q => {
        const terms = divisionSearchTerms(q)
        return terms.length > 0 && terms.length <= 8
      }, 'Use between one and eight search terms.'),
    locale: ApiLocale.optional(),
    ancestors: z
      .enum(['true', 'false'])
      .default('false')
      .transform(value => value === 'true'),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict()
  .openapi('DivisionSearchQuery')

export const DivisionSearchResponseSchema = z
  .object({
    results: z.array(
      z.object({
        divisionId: z.string(),
        domain: z.enum(divisionSearchDomains),
        snapshotId: z.string(),
        locale: z.string(),
        name: z.string(),
        divisionCode: z.string().nullable(),
        class: z.string(),
        category: z.string().nullable(),
        level: z.number().nullable(),
        match: z.enum(['self', 'ancestor']),
      }),
    ),
  })
  .openapi('DivisionSearchResponse')

export const DivisionSearchNotReadySchema = z
  .object({
    httpStatus: z.literal(503),
    error: z.literal('fts_not_ready'),
    message: z.literal(
      'Division search is not ready for the latest published releases.',
    ),
  })
  .openapi('DivisionSearchNotReady')

export type DivisionSearchQuery = z.infer<typeof DivisionSearchQuerySchema>
export type DivisionSearchResult = z.infer<
  typeof DivisionSearchResponseSchema
>['results'][number]
