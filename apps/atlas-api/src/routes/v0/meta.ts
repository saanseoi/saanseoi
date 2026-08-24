import { createRoute, defineOpenAPIRoute } from '@hono/zod-openapi'
import type { Context } from 'hono'

import {
  getNewsletterSubscription,
  markNewsletterFailed,
  markNewsletterPending,
  markNewsletterSubscribed,
} from '../../db/newsletter'
import { subscribeToSubstack } from '../../lib/substack'
import { sendTelegramAdminMessage } from '../../lib/telegram'
import {
  ErrorResponseSchema,
  HealthResponseSchema,
  SubstackSubscribeRequestSchema,
  SubstackSubscribeResponseSchema,
  ValidationErrorOpenAPIResponse,
} from '../../schema'
import type { AppEnv } from '../../types'
import { openApiText } from '../../lib/openapi-i18n'

async function persistNewsletterState(operation: Promise<void>, errorPrefix: string) {
  try {
    await operation
  } catch (error) {
    console.error(`${errorPrefix}:`, error)
  }
}

const healthRouteConfig = createRoute({
  method: 'get',
  path: '/v0.1/meta/health',
  tags: ['Meta'],
  responses: {
    200: {
      content: {
        'application/json': {
          schema: HealthResponseSchema,
        },
      },
      description: openApiText('openapi_health_response_description'),
    },
  },
})

const substackRouteConfig = createRoute({
  method: 'post',
  path: '/v0.1/meta/substack',
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
      description: openApiText('openapi_substack_subscribe_response_description'),
    },
    422: ValidationErrorOpenAPIResponse,
    429: {
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
      description: openApiText('openapi_substack_rate_limit_description'),
    },
    500: {
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
      description: openApiText('openapi_substack_misconfigured_description'),
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

export const substackRoute = defineOpenAPIRoute<typeof substackRouteConfig, AppEnv>({
  route: substackRouteConfig,
  handler: async c => {
    const email = c.req.valid('json').email.trim().toLowerCase()
    const db = c.var.metaDb

    if (!(await newsletterRateLimitAllows(c, email))) {
      c.header('retry-after', '60')
      return c.json(
        {
          httpStatus: 429,
          error: 'rate_limit_exceeded',
          message: 'Too many newsletter signup requests. Please try again later.',
        },
        429,
      )
    }

    const existing = await getNewsletterSubscription(db, email)
    if (existing?.status === 'subscribed') {
      return c.json(
        {
          ok: true as const,
          message: 'This email address is already subscribed.',
          subscriptionState: 'subscribed' as const,
        },
        200,
      )
    }
    if (
      existing?.status === 'pending' &&
      Date.parse(existing.updatedAt) > Date.now() - 10 * 60 * 1000
    ) {
      return c.json(
        {
          ok: true as const,
          message: 'This subscription request is already pending.',
          subscriptionState: 'pending' as const,
        },
        200,
      )
    }

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
          `API: ${c.env.ATLAS_BASE_URL}/v0/meta/substack`,
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
            `API: ${c.env.ATLAS_BASE_URL}/v0/meta/substack`,
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

async function newsletterRateLimitAllows(c: Context<AppEnv>, email: string) {
  const clientIp = c.req.header('cf-connecting-ip')?.trim() || '(unknown)'
  const keys = await Promise.all([
    digestRateLimitKey(`ip:${clientIp}`),
    digestRateLimitKey(`email:${email}`),
  ])
  const results = await Promise.all(
    keys.map(key => c.env.NEWSLETTER_RATE_LIMIT.limit({ key })),
  )
  return results.every(result => result.success)
}

async function digestRateLimitKey(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest), byte =>
    byte.toString(16).padStart(2, '0'),
  ).join('')
}

export const metaRoutes = [healthRoute, substackRoute] as const
