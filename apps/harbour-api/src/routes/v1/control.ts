import { createRoute, defineOpenAPIRoute } from '@hono/zod-openapi'
import { finalisePublishedSearch } from '@repo/core/pipeline/services/search/finalise'
import { finalisePublishedResources } from '@repo/core/pipeline/services/publicationState'
import { finalisePublishedStatistics } from '../../lib/services/statisticsPublication'
import { scheduleReconciledSnapshotCleanup } from '../../lib/services/controlCleanup'

import {
  handleBootstrapStatsReleaseSets,
  ControlRequestError,
  handlePublishDataset,
  handleReconcileDraftReleaseSets,
  handleScheduleSnapshotCleanup,
  handleStageCompleted,
  handleStageFailed,
  handleStageRunning,
  isTransientControlError,
} from '../../lib/services/control'
import { createPrimaryMetaRepoDb } from '../../lib/d1'
import {
  BootstrapStatsReleaseSetsRequestSchema,
  BootstrapStatsReleaseSetsResponseSchema,
  ControlResponseSchema,
  CleanupSnapshotsRequestSchema,
  CleanupSnapshotsResponseSchema,
  ControlStageRequestSchema,
  ErrorResponseSchema,
  PublishDatasetRequestSchema,
  ReconcileDraftReleaseSetsRequestSchema,
  ReconcileDraftReleaseSetsResponseSchema,
  ValidationErrorOpenAPIResponse,
} from '../../schema'
import type { AppEnv } from '../../types'
import {
  publishDiscordReleaseEmbed,
  type ReleaseSetPublication,
} from '../../lib/services/releaseDiscord'

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

const reconcileDraftReleaseSetsRouteConfig = createRoute({
  method: 'post',
  path: '/v1/control/reconcileDraftReleaseSets',
  tags: ['Control'],
  request: {
    body: {
      content: {
        'application/json': {
          schema: ReconcileDraftReleaseSetsRequestSchema,
        },
      },
      required: true,
    },
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: ReconcileDraftReleaseSetsResponseSchema,
        },
      },
      description: 'Draft release sets re-evaluated.',
    },
    400: baseResponses[400],
    503: baseResponses[503],
    500: baseResponses[500],
    422: ValidationErrorOpenAPIResponse,
  },
})

const bootstrapStatsReleaseSetsRouteConfig = createRoute({
  method: 'post',
  path: '/v1/control/bootstrapStatsReleaseSets',
  tags: ['Control'],
  request: {
    body: {
      content: {
        'application/json': {
          schema: BootstrapStatsReleaseSetsRequestSchema,
        },
      },
      required: true,
    },
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: BootstrapStatsReleaseSetsResponseSchema,
        },
      },
      description: 'Initial Statistics cohort release sets assembled.',
    },
    400: baseResponses[400],
    503: baseResponses[503],
    500: baseResponses[500],
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
      const result = await handlePublishDataset(db, request, c.env.DATASET_QUEUE)
      await finalisePublishedResources(db, c.env.DB_CURRENT, {
        deferred: request.deferApiReleaseSet || request.deferSourcePublish,
        publishedFamilies: (result.apiReleaseSetPublications ?? []).map(
          publication => publication.apiFamily,
        ),
        snapshotIds: result.snapshotId ? [result.snapshotId] : [],
      })
      await finalisePublishedStatistics(db, c.env, {
        publishedFamilies: (result.apiReleaseSetPublications ?? []).map(
          publication => publication.apiFamily,
        ),
      })
      await finalisePublishedSearch(db, c.env.DB_CURRENT, {
        deferred: request.deferApiReleaseSet || request.deferSourcePublish,
        publishedFamilies: (result.apiReleaseSetPublications ?? []).map(
          publication => publication.apiFamily,
        ),
      })
      await announcePublishedReleaseSets(c.env, result.apiReleaseSetAnnouncements)
      const { apiReleaseSetAnnouncements: _announcements, ...response } = result
      return c.json(response, 200)
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

export const reconcileDraftReleaseSetsRoute = defineOpenAPIRoute<
  typeof reconcileDraftReleaseSetsRouteConfig,
  AppEnv
>({
  route: reconcileDraftReleaseSetsRouteConfig,
  handler: async c => {
    try {
      const db = createPrimaryMetaRepoDb(c.env.DB_META)
      const request = c.req.valid('json')
      const result = await handleReconcileDraftReleaseSets(db, request)
      const options = {
        publishedFamilies: request.apiFamily ? [request.apiFamily] : undefined,
      }
      await finalisePublishedResources(db, c.env.DB_CURRENT, options)
      // Also repairs a publication whose current promotion failed after the
      // metadata transaction committed, including when no drafts remain.
      await finalisePublishedStatistics(db, c.env, options)
      await finalisePublishedSearch(db, c.env.DB_CURRENT, {
        ...options,
        pendingReleaseSetCodes: result.pendingReleaseSetCodes,
      })
      await scheduleReconciledSnapshotCleanup(db, c.env.DATASET_QUEUE, request)
      await announcePublishedReleaseSets(c.env, result.publishedReleaseSetAnnouncements)
      const { publishedReleaseSetAnnouncements: _announcements, ...response } = result
      return c.json(response, 200)
    } catch (error) {
      const response = createControlError(error)
      return c.json(response, response.httpStatus)
    }
  },
})

export const bootstrapStatsReleaseSetsRoute = defineOpenAPIRoute<
  typeof bootstrapStatsReleaseSetsRouteConfig,
  AppEnv
>({
  route: bootstrapStatsReleaseSetsRouteConfig,
  handler: async c => {
    try {
      const db = createPrimaryMetaRepoDb(c.env.DB_META)
      const result = await handleBootstrapStatsReleaseSets(db, c.req.valid('json'))
      const options = { publishedFamilies: ['stats'] }
      await finalisePublishedResources(db, c.env.DB_CURRENT, options)
      await finalisePublishedStatistics(db, c.env, options)
      return c.json(result, 200)
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
  reconcileDraftReleaseSetsRoute,
  bootstrapStatsReleaseSetsRoute,
] as const

async function announcePublishedReleaseSets(
  env: AppEnv['Bindings'],
  publications: ReleaseSetPublication[] | undefined,
) {
  if (
    env.DATA_SHARD_ENV !== 'production' ||
    !env.DISCORD_BOT_TOKEN ||
    !env.DISCORD_RELEASES_CHANNEL_ID
  ) {
    return
  }

  for (const publication of publications ?? []) {
    try {
      await publishDiscordReleaseEmbed(publication, {
        atlasBaseUrl: 'https://saanseoi.hk',
        botToken: env.DISCORD_BOT_TOKEN,
        channelId: env.DISCORD_RELEASES_CHANNEL_ID,
      })
    } catch (error) {
      console.error('Failed to announce published API release set on Discord', {
        error: error instanceof Error ? error.message : String(error),
        releaseSetCode: publication.apiReleaseSetCode,
      })
    }
  }
}
