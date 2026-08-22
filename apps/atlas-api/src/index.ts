import { OpenAPIHono } from '@hono/zod-openapi'
import type { Context } from 'hono'
import { Scalar } from '@scalar/hono-api-reference'
import { createMarkdownFromOpenApi } from '@scalar/openapi-to-markdown'
import { cors } from 'hono/cors'
import { poweredBy } from 'hono/powered-by'
import { prettyJSON } from 'hono/pretty-json'

import { createCurrentDb, createHistoryDb, createMetaDb } from '@repo/db'
import { isTransientD1ReadError } from './lib/d1'
import { defaultOpenAPIHook } from './lib/openapi'
import { resolvePublicKeyLease } from './lib/public-key-lease'
import {
  PublicKeyLeaseUnavailableError,
  isPublicKeyOriginAllowed,
  readPublicApiKey,
  type PublicKeyLease,
} from '@repo/core/publicApiKey'
export { PublicKeyLeaseCoordinator } from './publicKeyLeaseCoordinator'
import { metaRoutes } from './routes/v0/meta'
import { probeRoutes } from './routes/v0/probe'
import { divisionRoutes } from './routes/v0/divisions'
import { addressRoutes } from './routes/v0/addresses'
import { placeRoutes } from './routes/v0/places'
import { registryRoutes } from './routes/v0/registry'
import { managedAssetRoutes } from './routes/v0/assets'
import { styleRoutes } from './routes/v0/styles'
import { streetRoutes } from './routes/v0/streets'
import { statisticRoutes } from './routes/v0/statistics'
import { sourceRoutes, streamSourceRecordsMiddleware } from './routes/v0/sources'
import { rollUpApiKeyUsage } from './services/apiKeyUsageRollup'
import {
  completeAccessAnalyticsDownload,
  recordAccessAnalyticsEvent,
} from './services/accessAnalytics'
import { rollUpAccessAnalyticsDaily } from './services/accessAnalyticsRollup'
import { asRollupJobError, type RollupPhase } from './services/rollupRetry'
import {
  isFirstPartyWebOrigin,
  productApiOutcome,
  writeProductUsage,
} from './lib/productUsage'
import type { AppBindings, AppEnv } from './types'

const app = new OpenAPIHono<AppEnv>({
  defaultHook: defaultOpenAPIHook,
})
const openApiConfig = {
  openapi: '3.1.0',
  info: {
    title: 'Atlas API',
    version: '0',
  },
} as const

app.use('*', poweredBy())
for (const path of ['/v0/*', '/v0.1/*'] as const) {
  app.use(path, prettyJSON())
}
for (const path of ['/v0/*', '/v0.1/*'] as const) {
  app.use(
    path,
    cors({
      origin: '*',
      allowMethods: ['GET', 'POST', 'OPTIONS'],
      allowHeaders: ['Authorization', 'Content-Type', 'X-API-Key'],
    }),
  )
}
app.use(
  '/v0/meta/substack',
  cors({
    origin: '*',
    allowMethods: ['POST', 'OPTIONS'],
    allowHeaders: ['Content-Type'],
  }),
)
for (const path of ['/v0/*', '/v0.1/*'] as const) {
  app.use(path, async (c, next) => {
    c.set('metaDb', createMetaDb(c.env.DB_META))
    c.set('currentDb', createCurrentDb(c.env.DB_CURRENT))
    c.set('historyDbs', [
      createHistoryDb(c.env.DB_HISTORY_HK_BEFORE),
      createHistoryDb(c.env.DB_HISTORY_HK_2025),
      createHistoryDb(c.env.DB_HISTORY_HK_2026),
    ])
    await next()
  })
}

for (const path of ['/v0/*', '/v0.1/*'] as const) {
  app.use(path, async (c, next) => {
    const startedAt = performance.now()
    let requestStatus = 500
    try {
      await next()
      requestStatus = c.res.status
    } catch (error) {
      requestStatus = isTransientD1ReadError(error) ? 503 : 500
      throw error
    } finally {
      const requestPath = c.req.path
      const status = requestStatus
      const outcome = productApiOutcome(status)
      const origin = c.req.header('origin')
      const assetMatch = requestPath.match(/^\/v0(?:\.1)?\/assets\/([^/]+)$/)
      const styleMatch = requestPath.match(
        /^\/v0(?:\.1)?\/styles\/([a-z0-9-]+)\/(\d+\.\d+\.\d+\.json)$/,
      )

      if (assetMatch) {
        writeProductUsage(c, {
          event: 'api.asset_download',
          surface: 'asset_request',
          route: requestPath,
          entityType: 'asset',
          entityId: assetMatch[1],
          outcome,
          httpStatus: status,
          durationMs: performance.now() - startedAt,
        })
      } else if (styleMatch?.[1] && styleMatch[2]) {
        writeProductUsage(c, {
          event: 'api.style_request',
          surface: 'style_request',
          route: requestPath,
          entityType: 'style',
          entityId: `${styleMatch[1]}:${styleMatch[2].replace('.json', '')}`,
          outcome,
          httpStatus: status,
          durationMs: performance.now() - startedAt,
        })
      } else if (requestPath === '/v0/meta/substack') {
        writeProductUsage(c, {
          event: 'newsletter.subscription',
          surface: 'newsletter',
          route: requestPath,
          outcome,
          httpStatus: status,
          durationMs: performance.now() - startedAt,
        })
      } else if (
        isFirstPartyWebOrigin(origin) &&
        !requestPath.startsWith('/v0/meta/health')
      ) {
        writeProductUsage(c, {
          event: 'api.request',
          surface: 'api',
          route: requestPath,
          outcome,
          httpStatus: status,
          durationMs: performance.now() - startedAt,
        })
      }
    }
  })
}

// Attribution is attached by the route after it has selected the exact
// source release or API ReleaseSet. This middleware runs after the
// key/rate-limit gate and the product-status middleware so an analytics
// acknowledgement failure is visible as the final 503 response.
for (const path of ['/v0/*', '/v0.1/*'] as const) {
  app.use(path, async (c, next) => {
    await next()
    const attribution = c.get('accessAttribution')
    if (!attribution) return c.res

    const status = c.res.status
    const event = {
      ...attribution,
      eventType: 'api_request' as const,
      route: c.req.path,
      httpStatus: status,
    }

    recordAccessAnalyticsEvent(c.env.PRODUCT_USAGE, event)

    if (isCompletedDownloadRequest(c) && isSuccessfulStatus(status) && c.res.body) {
      const downloadEvent = { ...event, eventType: 'download' as const }
      const body = c.res.body.pipeThrough(
        new TransformStream<Uint8Array, Uint8Array>({
          transform(chunk, controller) {
            controller.enqueue(chunk)
          },
          async flush() {
            completeAccessAnalyticsDownload(c.env.PRODUCT_USAGE, downloadEvent)
          },
        }),
      )
      return new Response(body, {
        headers: c.res.headers,
        status: c.res.status,
        statusText: c.res.statusText,
      })
    }

    return c.res
  })
}
for (const path of ['/v0/*', '/v0.1/*'] as const) {
  app.use(path, async (c, next) => {
    if (
      isPublicMetadataPath(c.req.path) ||
      isAuthDisabled(c.env) ||
      isSaanSeoiSiteOrigin(c.req.header('origin'))
    ) {
      return next()
    }
    const rawKey = readPublicApiKey(c.req.raw)
    if (!rawKey) {
      return c.json(
        {
          error: 'invalid_api_key',
          message: 'A valid SaanSeoi public API key is required.',
        },
        401,
      )
    }
    let lease: PublicKeyLease | null
    try {
      lease = await resolvePublicKeyLease(rawKey, c.env)
    } catch (error) {
      if (!(error instanceof PublicKeyLeaseUnavailableError)) throw error
      return c.json(
        {
          error: 'public_key_validation_unavailable',
          message:
            'Public API key validation is temporarily unavailable. Please retry.',
        },
        503,
      )
    }
    if (!lease) {
      return c.json(
        {
          error: 'invalid_api_key',
          message: 'This public API key is invalid or revoked.',
        },
        401,
      )
    }
    if (!isPublicKeyOriginAllowed(lease, c.req.header('origin') ?? null)) {
      return c.json(
        {
          error: 'api_key_origin_not_allowed',
          message: 'This public API key is not allowed from this origin.',
        },
        403,
      )
    }
    const rateLimit = await c.env.API_RATE_LIMIT.limit({ key: lease.keyId })
    if (!rateLimit.success) {
      return c.json(
        {
          error: 'rate_limit_exceeded',
          message: 'The API rate limit has been exceeded.',
        },
        429,
      )
    }
    c.env.API_USAGE.writeDataPoint({
      indexes: [lease.keyId],
      blobs: [c.req.path, requestOrigin(c.req.header('origin'))],
      doubles: [1],
    })
    return next()
  })
}

app.use('/v0.1/divisions/sources', streamSourceRecordsMiddleware)

function isPublicMetadataPath(path: string) {
  return (
    path.startsWith('/v0/meta/') ||
    path.startsWith('/v0/api/') ||
    path.startsWith('/v0/assets/') ||
    path.startsWith('/v0/styles/')
  )
}

function isAuthDisabled(env: AppBindings) {
  return env.AUTH_MODE === 'disabled'
}

function isSaanSeoiSiteOrigin(origin: string | undefined) {
  if (!origin) return false
  try {
    const url = new URL(origin)
    return url.protocol === 'https:' && url.hostname === 'saanseoi.hk' && !url.port
  } catch {
    return false
  }
}

function requestOrigin(origin: string | undefined) {
  if (!origin) return '(none)'
  try {
    return new URL(origin).host
  } catch {
    return '(invalid)'
  }
}

function isSuccessfulStatus(status: number) {
  return status >= 200 && status < 300
}

function isCompletedDownloadRequest(c: Context<AppEnv>) {
  return (
    c.res.headers.get('content-disposition')?.toLowerCase().startsWith('attachment') ===
    true
  )
}

app.onError((error, c) => {
  console.error(error)
  if (isTransientD1ReadError(error)) {
    return c.json(
      {
        error: 'service_unavailable',
        message: 'The atlas API is temporarily unavailable.',
      },
      503,
    )
  }

  return c.json(
    {
      error: 'internal_error',
      message: 'The atlas API request failed.',
    },
    500,
  )
})

app.notFound(c =>
  c.json(
    {
      error: 'not_found',
      message: 'Route not found.',
    },
    404,
  ),
)

app.get('/', c => c.redirect('/openapi', 302))

app.openapiRoutes([
  ...metaRoutes,
  ...probeRoutes,
  ...registryRoutes,
  ...sourceRoutes,
  ...divisionRoutes,
  ...addressRoutes,
  ...placeRoutes,
  ...managedAssetRoutes,
  ...styleRoutes,
  ...streetRoutes,
  ...statisticRoutes,
] as const)

app.get('/openapi', c =>
  c.json(
    app.getOpenAPI31Document({
      ...openApiConfig,
      servers: [{ url: c.env.ATLAS_BASE_URL }],
    }),
  ),
)
app.get(
  '/docs',
  Scalar({
    url: '/openapi',
    pageTitle: 'Atlas API Reference',
  }),
)

const llmsMarkdown = createMarkdownFromOpenApi(
  JSON.stringify(
    app.getOpenAPI31Document(openApiConfig, {
      unionPreferredType: 'oneOf',
    }),
  ),
)

app.get('/llms.txt', async c => c.text(await llmsMarkdown))

const worker = Object.assign(app, {
  async scheduled(
    controller: ScheduledController,
    env: AppBindings,
    ctx: ExecutionContext,
  ) {
    if (controller.cron === '*/5 * * * *') {
      ctx.waitUntil(
        runScheduledRollup({
          job: 'api_key_usage_rollup',
          cron: controller.cron,
          scheduledTime: controller.scheduledTime,
          task: () => rollUpApiKeyUsage(env, controller.scheduledTime),
        }),
      )
      return
    }
    if (controller.cron === '15 0 * * *') {
      ctx.waitUntil(
        runScheduledRollup({
          job: 'access_analytics_daily_rollup',
          cron: controller.cron,
          scheduledTime: controller.scheduledTime,
          task: () => rollUpAccessAnalyticsDaily(env, controller.scheduledTime),
        }),
      )
    }
  },
})

export default worker

type ScheduledRollup = {
  job: 'api_key_usage_rollup' | 'access_analytics_daily_rollup'
  cron: string
  scheduledTime: number
  task: () => Promise<unknown>
}

async function runScheduledRollup({ job, cron, scheduledTime, task }: ScheduledRollup) {
  try {
    return await task()
  } catch (error) {
    const rollupError = asRollupJobError('d1_write', error)
    console.error(
      JSON.stringify({
        job,
        cron,
        scheduledTime: new Date(scheduledTime).toISOString(),
        phase: rollupError.phase satisfies RollupPhase,
        httpStatus: rollupError.httpStatus,
        message: sanitiseScheduledErrorMessage(rollupError.message),
      }),
    )
    throw error
  }
}

function sanitiseScheduledErrorMessage(message: string) {
  return message
    .replace(
      /((?:token|secret|authorization)\s*[:=]\s*)(?:bearer\s+)?[^\s,;]+/gi,
      '$1[REDACTED]',
    )
    .replace(/(bearer\s+)[^\s,;]+/gi, '$1[REDACTED]')
    .slice(0, 500)
}
