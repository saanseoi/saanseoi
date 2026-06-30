import { createRoute, defineOpenAPIRoute } from '@hono/zod-openapi'

import {
  ControlRequestError,
  handlePublishDataset,
  handleScheduleSnapshotCleanup,
  handleStageCompleted,
  handleStageFailed,
  handleStageRunning,
  isTransientControlError,
} from '../../lib/services/control'
import { createPrimaryMetaRepoDb } from '../../lib/d1'
import {
  ControlResponseSchema,
  CleanupSnapshotsRequestSchema,
  CleanupSnapshotsResponseSchema,
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
  503: {
    content: {
      'application/json': {
        schema: ErrorResponseSchema,
      },
    },
    description: 'Control operation temporarily unavailable.',
  },
  500: {
    content: {
      'application/json': {
        schema: ErrorResponseSchema,
      },
    },
    description: 'Control operation failed unexpectedly.',
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

const cleanupSnapshotsRouteConfig = createRoute({
  method: 'post',
  path: '/v1/control/cleanupSnapshots',
  tags: ['Control'],
  request: {
    body: {
      content: {
        'application/json': {
          schema: CleanupSnapshotsRequestSchema,
        },
      },
      required: true,
    },
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: CleanupSnapshotsResponseSchema,
        },
      },
      description: 'Snapshot cleanup job scheduled.',
    },
    400: {
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
      description: 'Snapshot cleanup scheduling failed.',
    },
    503: {
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
      description: 'Snapshot cleanup scheduling is temporarily unavailable.',
    },
    500: {
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
      description: 'Snapshot cleanup scheduling failed unexpectedly.',
    },
    422: ValidationErrorOpenAPIResponse,
  },
})

function createControlError(error: unknown) {
  const httpStatus = isTransientControlError(error)
    ? 503
    : error instanceof ControlRequestError
      ? 400
      : 500
  return {
    httpStatus,
    error:
      httpStatus === 503
        ? 'control_unavailable'
        : httpStatus === 400
          ? 'control_failed'
          : 'internal_error',
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
      const response = createControlError(error)
      return c.json(response, response.httpStatus)
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
      const response = createControlError(error)
      return c.json(response, response.httpStatus)
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
      const response = createControlError(error)
      return c.json(response, response.httpStatus)
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
      return c.json(await handlePublishDataset(db, request, c.env.DATASET_QUEUE), 200)
    } catch (error) {
      const response = createControlError(error)
      return c.json(response, response.httpStatus)
    }
  },
})

export const cleanupSnapshotsRoute = defineOpenAPIRoute<
  typeof cleanupSnapshotsRouteConfig,
  AppEnv
>({
  route: cleanupSnapshotsRouteConfig,
  handler: async c => {
    try {
      const db = createPrimaryMetaRepoDb(c.env.DB_META)
      const request = c.req.valid('json')
      return c.json(
        await handleScheduleSnapshotCleanup(db, c.env.DATASET_QUEUE, request),
        200,
      )
    } catch (error) {
      const response = createControlError(error)
      return c.json(response, response.httpStatus)
    }
  },
})

export const controlRoutes = [
  stageRunningRoute,
  stageCompletedRoute,
  stageFailedRoute,
  publishDatasetRoute,
  cleanupSnapshotsRoute,
] as const
