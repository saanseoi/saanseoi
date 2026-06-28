import { createRoute, defineOpenAPIRoute } from '@hono/zod-openapi'

import {
  handlePublishDataset,
  handleStageCompleted,
  handleStageFailed,
  handleStageRunning,
} from '../../lib/services/control'
import { createPrimaryMetaRepoDb } from '../../lib/d1'
import {
  ControlResponseSchema,
  ControlStageRequestSchema,
  ErrorResponseSchema,
  PublishDatasetRequestSchema,
  ValidationErrorOpenAPIResponse,
} from '../../schema'
import type { AppEnv } from '../../types'

const baseResponses = {
  200: {
    content: {
      'application/json': {
        schema: ControlResponseSchema,
      },
    },
    description: 'Control operation accepted.',
  },
  400: {
    content: {
      'application/json': {
        schema: ErrorResponseSchema,
      },
    },
    description: 'Control operation failed.',
  },
  422: ValidationErrorOpenAPIResponse,
} as const

const stageRunningRouteConfig = createRoute({
  method: 'post',
  path: '/v1/control/stageRunning',
  tags: ['Control'],
  request: {
    body: {
      content: {
        'application/json': {
          schema: ControlStageRequestSchema,
        },
      },
      required: true,
    },
  },
  responses: baseResponses,
})

const stageCompletedRouteConfig = createRoute({
  method: 'post',
  path: '/v1/control/stageCompleted',
  tags: ['Control'],
  request: {
    body: {
      content: {
        'application/json': {
          schema: ControlStageRequestSchema,
        },
      },
      required: true,
    },
  },
  responses: baseResponses,
})

const stageFailedRouteConfig = createRoute({
  method: 'post',
  path: '/v1/control/stageFailed',
  tags: ['Control'],
  request: {
    body: {
      content: {
        'application/json': {
          schema: ControlStageRequestSchema,
        },
      },
      required: true,
    },
  },
  responses: baseResponses,
})

const publishDatasetRouteConfig = createRoute({
  method: 'post',
  path: '/v1/control/publishDataset',
  tags: ['Control'],
  request: {
    body: {
      content: {
        'application/json': {
          schema: PublishDatasetRequestSchema,
        },
      },
      required: true,
    },
  },
  responses: baseResponses,
})

function createControlError(error: unknown) {
  return {
    httpStatus: 400,
    error: 'control_failed',
    message: error instanceof Error ? error.message : String(error),
  } as const
}

export const stageRunningRoute = defineOpenAPIRoute<
  typeof stageRunningRouteConfig,
  AppEnv
>({
  route: stageRunningRouteConfig,
  handler: async c => {
    try {
      const db = createPrimaryMetaRepoDb(c.env.DB_META)
      const request = c.req.valid('json')
      return c.json(await handleStageRunning(db, request), 200)
    } catch (error) {
      return c.json(createControlError(error), 400)
    }
  },
})

export const stageCompletedRoute = defineOpenAPIRoute<
  typeof stageCompletedRouteConfig,
  AppEnv
>({
  route: stageCompletedRouteConfig,
  handler: async c => {
    try {
      const db = createPrimaryMetaRepoDb(c.env.DB_META)
      const request = c.req.valid('json')
      return c.json(await handleStageCompleted(db, request), 200)
    } catch (error) {
      return c.json(createControlError(error), 400)
    }
  },
})

export const stageFailedRoute = defineOpenAPIRoute<
  typeof stageFailedRouteConfig,
  AppEnv
>({
  route: stageFailedRouteConfig,
  handler: async c => {
    try {
      const db = createPrimaryMetaRepoDb(c.env.DB_META)
      const request = c.req.valid('json')
      return c.json(await handleStageFailed(db, request), 200)
    } catch (error) {
      return c.json(createControlError(error), 400)
    }
  },
})

export const publishDatasetRoute = defineOpenAPIRoute<
  typeof publishDatasetRouteConfig,
  AppEnv
>({
  route: publishDatasetRouteConfig,
  handler: async c => {
    try {
      const db = createPrimaryMetaRepoDb(c.env.DB_META)
      const request = c.req.valid('json')
      return c.json(await handlePublishDataset(db, request), 200)
    } catch (error) {
      return c.json(createControlError(error), 400)
    }
  },
})

export const controlRoutes = [
  stageRunningRoute,
  stageCompletedRoute,
  stageFailedRoute,
  publishDatasetRoute,
] as const
