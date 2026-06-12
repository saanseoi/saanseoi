import { createRoute, defineOpenAPIRoute } from '@hono/zod-openapi'

import {
  listDatasets,
  markNewsletterFailed,
  markNewsletterPending,
  markNewsletterSubscribed,
} from '../../db/repositories'
import { subscribeToSubstack } from '../../lib/substack'
import { sendTelegramAdminMessage } from '../../lib/telegram'
import {
  DatasetsQuerySchema,
  DatasetsResponseSchema,
  ErrorResponseSchema,
  HealthResponseSchema,
  SubstackSubscribeRequestSchema,
  SubstackSubscribeResponseSchema,
  ValidationErrorOpenAPIResponse,
} from '../../schema'
import type { AppEnv } from '../../types'

async function persistNewsletterState(operation: Promise<void>, errorPrefix: string) {
  try {
    await operation
  } catch (error) {
    console.error(`${errorPrefix}:`, error)
  }
}

const healthRouteConfig = createRoute({
  method: 'get',
  path: '/v1/meta/health',
  tags: ['Meta'],
  responses: {
    200: {
      content: {
        'application/json': {
          schema: HealthResponseSchema,
        },
      },
      description: 'Health check status.',
    },
  },
})

const datasetsRouteConfig = createRoute({
  method: 'get',
  path: '/v1/meta/datasets',
  tags: ['Meta'],
  request: {
    query: DatasetsQuerySchema,
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: DatasetsResponseSchema,
        },
      },
      description: 'List datasets.',
    },
    422: ValidationErrorOpenAPIResponse,
  },
})

const substackRouteConfig = createRoute({
  method: 'post',
  path: '/v1/meta/substack',
  hide: true,
  tags: ['Meta'],
  request: {
    body: {
      content: {
        'application/json': {
          schema: SubstackSubscribeRequestSchema,
        },
      },
      required: true,
    },
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: SubstackSubscribeResponseSchema,
        },
      },
      description: 'Subscribe an email address to the configured Substack publication.',
    },
    422: ValidationErrorOpenAPIResponse,
    500: {
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
      description: 'Substack integration is misconfigured.',
    },
  },
})

export const healthRoute = defineOpenAPIRoute<typeof healthRouteConfig, AppEnv>({
  route: healthRouteConfig,
  handler: async c => {
    const ping = await c.var.metaDb.$client
      .prepare('SELECT 1 AS ok')
      .first<{ ok: number }>()
    const datasetCount = await c.var.metaDb.$client
      .prepare('SELECT COUNT(*) AS "count" FROM "releases"')
      .first<{ count: number }>()

    return c.json(
      {
        ok: ping?.ok === 1,
        datasetCount: Number(datasetCount?.count ?? 0),
      },
      200,
    )
  },
})

export const datasetsRoute = defineOpenAPIRoute<typeof datasetsRouteConfig, AppEnv>({
  route: datasetsRouteConfig,
  handler: async c => {
    const query = c.req.valid('query')
    const rows = await listDatasets(c.var.metaDb, {
      regionCode: query.regionCode,
      snapshotMonth: query.snapshotMonth,
      theme: query.theme as NonNullable<Parameters<typeof listDatasets>[1]>['theme'],
      status:
        query.activeOnly === 'true'
          ? 'published'
          : query.activeOnly === 'false'
            ? undefined
            : (query.status as NonNullable<
                Parameters<typeof listDatasets>[1]
              >['status']),
      limit: query.limit,
    })

    return c.json(
      {
        datasets: rows,
      },
      200,
    )
  },
})

export const substackRoute = defineOpenAPIRoute<typeof substackRouteConfig, AppEnv>({
  route: substackRouteConfig,
  handler: async c => {
    const { email } = c.req.valid('json')
    const db = c.var.metaDb

    await markNewsletterPending(db, email)

    try {
      const result = await subscribeToSubstack({
        email,
        publication: c.env.SUBSTACK_PUBLICATION,
        sessionCookie: c.env.SUBSTACK_SESSION_COOKIE,
      })

      await persistNewsletterState(
        markNewsletterSubscribed(db, email),
        'Failed to mark newsletter as subscribed',
      )
      const notification = sendTelegramAdminMessage({
        botToken: c.env.TELEGRAM_BOT_TOKEN,
        chatId: c.env.TELEGRAM_ADMIN_ID,
        text: [
          'Substack signup succeeded.',
          `Email: ${email}`,
          `Publication: ${c.env.SUBSTACK_PUBLICATION}`,
          `API: ${c.env.ATLAS_BASE_URL}/v1/meta/substack`,
          `Time: ${new Date().toISOString()}`,
        ].join('\n'),
      }).catch(notificationError => {
        console.error(notificationError)
      })

      try {
        c.executionCtx.waitUntil(notification)
      } catch {
        void notification
      }

      return c.json(
        {
          ...result,
          subscriptionState: 'subscribed' as const,
        },
        200,
      )
    } catch (error) {
      if (error instanceof Error) {
        await persistNewsletterState(
          markNewsletterFailed(db, email, error.message),
          'Failed to mark newsletter as failed',
        )
        const notification = sendTelegramAdminMessage({
          botToken: c.env.TELEGRAM_BOT_TOKEN,
          chatId: c.env.TELEGRAM_ADMIN_ID,
          text: [
            'Substack signup failed.',
            `Email: ${email}`,
            `Publication: ${c.env.SUBSTACK_PUBLICATION}`,
            `Error: ${error.message}`,
            `API: ${c.env.ATLAS_BASE_URL}/v1/meta/substack`,
            `Time: ${new Date().toISOString()}`,
          ].join('\n'),
        }).catch(notificationError => {
          console.error(notificationError)
        })

        try {
          c.executionCtx.waitUntil(notification)
        } catch {
          void notification
        }

        if (
          error.message === 'SUBSTACK_PUBLICATION is not configured.' ||
          error.message === 'SUBSTACK_SESSION_COOKIE is not configured.'
        ) {
          return c.json(
            {
              httpStatus: 500,
              error: 'substack_not_configured',
              message: error.message,
            },
            500,
          )
        }

        return c.json(
          {
            ok: true as const,
            message: 'Subscription recorded. We will retry delivery with Substack.',
            subscriptionState: 'pending' as const,
          },
          200,
        )
      }

      throw error
    }
  },
})

export const metaRoutes = [healthRoute, datasetsRoute, substackRoute] as const
