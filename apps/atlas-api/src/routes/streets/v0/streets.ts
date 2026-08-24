import { createRoute, defineOpenAPIRoute } from '@hono/zod-openapi'

import {
  ErrorResponseSchema,
  StreetDetailParamsSchema,
  StreetDetailResponseSchema,
  StreetChangelogReplayResponseSchema,
  StreetSnapshotNotReadyErrorResponseSchema,
  StreetVersionParamsSchema,
  StreetVersionsResponseSchema,
  ValidationErrorOpenAPIResponse,
} from '../../../schema'
import {
  getHongKongStreetDetail,
  getHongKongStreetVersion,
  listHongKongStreetVersions,
  replayHongKongStreetChangelog,
} from '../../../services/streets'
import type { AppEnv } from '../../../types'
import { sanitiseResponseUrl } from '../../../lib/api'
import { openApiText } from '../../../lib/openapi-i18n'

const streetDetailRoute = createRoute({
  method: 'get',
  path: '/streets/v0.1/{id}',
  operationId: 'getHongKongStreetByIdV0',
  tags: ['Streets'],
  request: { params: StreetDetailParamsSchema },
  responses: {
    200: {
      content: { 'application/json': { schema: StreetDetailResponseSchema } },
      description: openApiText('openapi_streets_get_latest_response_description'),
    },
    404: {
      content: { 'application/json': { schema: ErrorResponseSchema } },
      description: openApiText('openapi_streets_not_found_description'),
    },
    503: {
      content: {
        'application/json': { schema: StreetSnapshotNotReadyErrorResponseSchema },
      },
      description: openApiText('openapi_streets_snapshot_not_ready_description'),
    },
    422: ValidationErrorOpenAPIResponse,
  },
})

const streetChangelogRoute = createRoute({
  method: 'get',
  path: '/streets/v0.1/changelog',
  operationId: 'replayHongKongStreetChangelogV0',
  tags: ['Streets'],
  responses: {
    200: {
      content: { 'application/json': { schema: StreetChangelogReplayResponseSchema } },
      description: openApiText('openapi_streets_changelog_response_description'),
    },
    503: {
      content: {
        'application/json': { schema: StreetSnapshotNotReadyErrorResponseSchema },
      },
      description: openApiText('openapi_streets_snapshot_not_ready_description'),
    },
  },
})

const streetVersionsRoute = createRoute({
  method: 'get',
  path: '/streets/v0.1/{id}/versions',
  operationId: 'listHongKongStreetVersionsV0',
  tags: ['Streets'],
  request: { params: StreetDetailParamsSchema },
  responses: {
    200: {
      content: { 'application/json': { schema: StreetVersionsResponseSchema } },
      description: openApiText('openapi_streets_versions_list_response_description'),
    },
    404: {
      content: { 'application/json': { schema: ErrorResponseSchema } },
      description: openApiText('openapi_streets_not_found_description'),
    },
    503: {
      content: {
        'application/json': { schema: StreetSnapshotNotReadyErrorResponseSchema },
      },
      description: openApiText('openapi_streets_snapshot_not_ready_description'),
    },
    422: ValidationErrorOpenAPIResponse,
  },
})

const streetVersionRoute = createRoute({
  method: 'get',
  path: '/streets/v0.1/{id}/versions/{version}',
  operationId: 'getHongKongStreetVersionV0',
  tags: ['Streets'],
  request: { params: StreetVersionParamsSchema },
  responses: {
    200: {
      content: { 'application/json': { schema: StreetDetailResponseSchema } },
      description: openApiText('openapi_streets_version_get_response_description'),
    },
    404: {
      content: { 'application/json': { schema: ErrorResponseSchema } },
      description: openApiText('openapi_streets_not_found_description'),
    },
    503: {
      content: {
        'application/json': { schema: StreetSnapshotNotReadyErrorResponseSchema },
      },
      description: openApiText('openapi_streets_snapshot_not_ready_description'),
    },
    422: ValidationErrorOpenAPIResponse,
  },
})

export const streetRoutes = [
  defineOpenAPIRoute<typeof streetChangelogRoute, AppEnv>({
    route: streetChangelogRoute,
    handler: async c => {
      const result = await replayHongKongStreetChangelog({
        historyDbs: c.var.historyDbs,
        metaDb: c.var.metaDb,
        requestUrl: sanitiseResponseUrl(c.req.url).toString(),
      })
      if (result.status === 503) return c.json(result.body, 503)
      return c.json(result.body, 200)
    },
  }),
  defineOpenAPIRoute<typeof streetDetailRoute, AppEnv>({
    route: streetDetailRoute,
    handler: async c => {
      const { id } = c.req.valid('param')
      const result = await getHongKongStreetDetail({
        currentDb: c.var.currentDb,
        id,
        metaDb: c.var.metaDb,
        requestUrl: sanitiseResponseUrl(c.req.url).toString(),
      })
      if (result.status === 503) return c.json(result.body, 503)
      if (result.status === 404) return c.json(result.body, 404)
      return c.json(result.body, 200)
    },
  }),
  defineOpenAPIRoute<typeof streetVersionsRoute, AppEnv>({
    route: streetVersionsRoute,
    handler: async c => {
      const { id } = c.req.valid('param')
      const result = await listHongKongStreetVersions({
        historyDbs: c.var.historyDbs,
        id,
        metaDb: c.var.metaDb,
        requestUrl: sanitiseResponseUrl(c.req.url).toString(),
      })
      if (result.status === 503) return c.json(result.body, 503)
      if (result.status === 404) return c.json(result.body, 404)
      return c.json(result.body, 200)
    },
  }),
  defineOpenAPIRoute<typeof streetVersionRoute, AppEnv>({
    route: streetVersionRoute,
    handler: async c => {
      const { id, version } = c.req.valid('param')
      const result = await getHongKongStreetVersion({
        historyDbs: c.var.historyDbs,
        id,
        metaDb: c.var.metaDb,
        requestUrl: sanitiseResponseUrl(c.req.url).toString(),
        version,
      })
      if (result.status === 503) return c.json(result.body, 503)
      if (result.status === 404) return c.json(result.body, 404)
      return c.json(result.body, 200)
    },
  }),
] as const
