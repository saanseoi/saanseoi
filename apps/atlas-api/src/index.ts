import { OpenAPIHono } from '@hono/zod-openapi'
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
import { sourceRoutes, streamSourceRecordsMiddleware } from './routes/v0/sources'
import { rollUpApiKeyUsage } from './services/apiKeyUsageRollup'
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
    c.set('apiKey', { id: lease.keyId, userId: lease.keyId })
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
    if (controller.cron !== '*/5 * * * *') return
    ctx.waitUntil(rollUpApiKeyUsage(env, controller.scheduledTime))
  },
})

export default worker
