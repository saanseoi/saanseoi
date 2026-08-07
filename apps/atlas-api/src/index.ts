import { OpenAPIHono } from '@hono/zod-openapi'
import { Scalar } from '@scalar/hono-api-reference'
import { createMarkdownFromOpenApi } from '@scalar/openapi-to-markdown'
import { cors } from 'hono/cors'
import { poweredBy } from 'hono/powered-by'
import { prettyJSON } from 'hono/pretty-json'

import { createCurrentDb, createHistoryDb, createMetaDb } from '@repo/db'
import { authenticateAccessToken, issueAccessToken } from './lib/access-token'
import { authenticateApiKey } from './lib/api-key-auth'
import { isTransientD1ReadError } from './lib/d1'
import { defaultOpenAPIHook } from './lib/openapi'
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
      isTokenPath(c.req.path) ||
      isAuthDisabled(c.env)
    ) {
      return next()
    }
    const claims = await authenticateAccessToken(
      c.req.header('authorization'),
      c.env,
      'atlas-api',
    )
    if (!claims) {
      return c.json(
        {
          error: 'invalid_access_token',
          message: 'A valid Atlas API access token is required.',
        },
        401,
      )
    }
    const rateLimit = await c.env.API_RATE_LIMIT.limit({ key: claims.sub })
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
      indexes: [claims.sub],
      blobs: [c.req.path],
      doubles: [1],
    })
    c.set('apiKey', { id: claims.sub, userId: claims.sub })
    return next()
  })
}

app.post('/v0/auth/tokens', async c => {
  if (isAuthDisabled(c.env)) {
    return c.json(
      { error: 'auth_disabled', message: 'Token issuance is disabled locally.' },
      404,
    )
  }
  const body = await c.req.json<{ audience?: unknown }>().catch(() => null)
  if (body?.audience !== 'atlas-api' && body?.audience !== 'basemap-tiles') {
    return c.json(
      { error: 'invalid_audience', message: 'A valid token audience is required.' },
      422,
    )
  }
  const authentication = await authenticateApiKey({
    d1: c.env.DB_META,
    rawKey: c.req.header('x-api-key') ?? null,
  })
  if (!authentication.ok) {
    return c.json(
      { error: authentication.error, message: authentication.message },
      authentication.status,
    )
  }
  const accessToken = await issueAccessToken(
    c.env,
    body.audience,
    authentication.apiKey.id,
  )
  return c.json({ accessToken, expiresIn: 900, tokenType: 'Bearer' }, 201)
})

app.use('/v0.1/divisions/sources', streamSourceRecordsMiddleware)

function isPublicMetadataPath(path: string) {
  return (
    path.startsWith('/v0/meta/') ||
    path.startsWith('/v0/api/') ||
    path.startsWith('/v0/assets/') ||
    path.startsWith('/v0/styles/')
  )
}

function isTokenPath(path: string) {
  return path === '/v0/auth/tokens'
}

function isAuthDisabled(env: AppBindings) {
  return env.AUTH_MODE === 'disabled'
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

export default app
