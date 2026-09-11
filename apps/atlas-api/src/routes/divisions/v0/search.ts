import { createRoute, defineOpenAPIRoute } from '@hono/zod-openapi'
import { resolvePublishedSearchScopes } from '@repo/core/pipeline/services/search/incrementalIndex'
import { divisionSearchIndex } from '@repo/core/pipeline/services/search/divisions'
import { DivisionSearchNotReady, searchDivisions } from '../../../db/divisionSearch'
import {
  DivisionSearchQuerySchema,
  DivisionSearchResponseSchema,
  DivisionSearchNotReadySchema,
} from '../../../schema/divisionSearch'
import { ValidationErrorOpenAPIResponse } from '../../../schema'
import { resolveDataRegion } from '../../../schema/region'
import type { AppEnv } from '../../../types'
import { runWithD1ReadRetry } from '../../../lib/d1'

export const divisionSearchRoutes = ['v0', 'v0.1'].map(version => {
  const route = createRoute({
    method: 'get',
    path: `/divisions/${version}/search`,
    operationId: version === 'v0' ? 'searchDivisionsV0' : 'searchDivisionsV01',
    tags: ['Divisions'],
    summary: 'Search the latest published divisions',
    description:
      'Search all domains unless domain is specified. Matches names, aliases and division codes using case-insensitive partial text, including Chinese substrings. Set ancestors=true to include stored ancestor names. Results prefer direct matches and contain one result per division and domain. Historical selectors are not supported.',
    request: { query: DivisionSearchQuerySchema },
    responses: {
      200: {
        description: 'Matching divisions',
        content: { 'application/json': { schema: DivisionSearchResponseSchema } },
      },
      503: {
        description: 'Published search selection is not ready',
        content: { 'application/json': { schema: DivisionSearchNotReadySchema } },
      },
      422: ValidationErrorOpenAPIResponse,
    },
  })
  return defineOpenAPIRoute<typeof route, AppEnv>({
    route,
    handler: async c => {
      const query = c.req.valid('query')
      const scopes = await runWithD1ReadRetry(() =>
        resolvePublishedSearchScopes(c.var.metaDb as never, divisionSearchIndex, {
          regionCode: resolveDataRegion(query.region),
          domainCode: query.domain,
        }),
      )
      try {
        return c.json(
          {
            results: await runWithD1ReadRetry(() =>
              searchDivisions(c.var.currentDb.$client, scopes, query),
            ),
          },
          200,
        )
      } catch (error) {
        if (error instanceof DivisionSearchNotReady)
          return c.json(
            {
              httpStatus: 503 as const,
              error: 'fts_not_ready' as const,
              message:
                'Division search is not ready for the latest published releases.' as const,
            },
            503,
          )
        throw error
      }
    },
  })
})
