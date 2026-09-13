import { createRoute, defineOpenAPIRoute } from '@hono/zod-openapi'
import {
  DivisionChangesQuerySchema,
  DivisionChangesResponseSchema,
  DivisionChangesErrorSchema,
  DivisionChangeDefinitionSchema,
  DivisionChangeDefinitionParamsSchema,
  DivisionChangeDefinitionQuerySchema,
} from '../../schema/divisionChanges'
import { ValidationErrorOpenAPIResponse } from '../../schema'
import {
  getDivisionChangeDefinition,
  listDivisionChanges,
} from '../../services/divisionChanges'
import type { AppEnv } from '../../types'
import { divisionChangesExamplesDescription } from '../../schema/divisionChanges.examples'

const error = (description: string) => ({
  description,
  content: { 'application/json': { schema: DivisionChangesErrorSchema } },
})
const route = createRoute({
  method: 'get',
  path: '/divisions/v1/changes',
  operationId: 'listDivisionChangesV1',
  summary: 'List Division Changes',
  tags: ['Divisions'],
  description:
    'Compare effective geographic division definitions by stable ID. The target defaults to the latest published release and is pinned by the returned cursor. Before/after references include labels, hierarchy, classification and immutable definition links. Use include=geometry to embed authoritative membership polygons when available. Membership-impacting ancestor changes expose transitive descendant dependencies in both releases. Storage timestamps and release changes alone are not revisions.\n\n' +
    divisionChangesExamplesDescription,
  request: { query: DivisionChangesQuerySchema },
  responses: {
    200: {
      description: 'Stable, content-addressed changes and resolved release identities.',
      content: { 'application/json': { schema: DivisionChangesResponseSchema } },
    },
    409: error('Incompatible release sets.'),
    422: {
      ...ValidationErrorOpenAPIResponse,
      description: 'Invalid query or cursor.',
      content: {
        'application/json': {
          schema: DivisionChangesErrorSchema.or(
            ValidationErrorOpenAPIResponse.content['application/json'].schema,
          ),
        },
      },
    },
    503: error('Publication, retained history or pinned comparison unavailable.'),
  },
})
export const divisionChangesRoute = defineOpenAPIRoute<typeof route, AppEnv>({
  route,
  handler: async c => {
    const result = await listDivisionChanges({
      currentDb: c.var.currentDb,
      metaDb: c.var.metaDb,
      historyDbsByBinding: c.var.historyDbsByBinding,
      requestUrl: c.req.url,
      query: c.req.valid('query'),
    })
    if (result.status === 200) return c.json(result.body, 200)
    if (result.status === 409) return c.json(result.body, 409)
    if (result.status === 422) return c.json(result.body, 422)
    return c.json(result.body, 503)
  },
})

const definitionRoute = createRoute({
  method: 'get',
  path: '/divisions/v1/changes/definitions/{id}',
  operationId: 'getDivisionChangeDefinitionV1',
  summary: 'Get Division Change Definition',
  tags: ['Divisions'],
  description:
    'Retrieve a before/after definition using the release ID and content hash returned by the changes feed. Returns the exact attributes and authoritative polygons, or an explicit unavailable response; never substitutes a newer definition.',
  request: {
    params: DivisionChangeDefinitionParamsSchema,
    query: DivisionChangeDefinitionQuerySchema,
  },
  responses: {
    200: {
      description: 'Exact immutable division definition.',
      content: { 'application/json': { schema: DivisionChangeDefinitionSchema } },
    },
    409: error('Incompatible release set.'),
    422: route.responses[422],
    503: error('The exact retained definition is unavailable.'),
  },
})
export const divisionChangeDefinitionRoute = defineOpenAPIRoute<
  typeof definitionRoute,
  AppEnv
>({
  route: definitionRoute,
  handler: async c => {
    const result = await getDivisionChangeDefinition({
      currentDb: c.var.currentDb,
      metaDb: c.var.metaDb,
      historyDbsByBinding: c.var.historyDbsByBinding,
      requestUrl: c.req.url,
      id: c.req.valid('param').id,
      ...c.req.valid('query'),
    })
    if (result.status === 200) return c.json(result.body, 200)
    if (result.status === 409) return c.json(result.body, 409)
    if (result.status === 422) return c.json(result.body, 422)
    return c.json(result.body, 503)
  },
})
