import { OpenAPIHono } from '@hono/zod-openapi'
import { Scalar } from '@scalar/hono-api-reference'
import { createMarkdownFromOpenApi } from '@scalar/openapi-to-markdown'
import { cors } from 'hono/cors'
import { poweredBy } from 'hono/powered-by'
import { prettyJSON } from 'hono/pretty-json'

import { createCurrentDb, createMetaDb } from '@repo/db'
import { authenticateApiKey } from './lib/api-key-auth'
import { isTransientD1ReadError } from './lib/d1'
import { defaultOpenAPIHook } from './lib/openapi'
import { metaRoutes } from './routes/v0/meta'
import { probeRoutes } from './routes/v0/probe'
import { divisionRoutes } from './routes/v0/divisions'
import { addressRoutes } from './routes/v0/addresses'
import { placeRoutes } from './routes/v0/places'
import { registryRoutes } from './routes/v0/registry'
import type { AppEnv } from './types'

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
    await next()
  })
}
for (const path of ['/v0/*', '/v0.1/*'] as const) {
  app.use(path, async (c, next) => {
    if (isPublicMetadataPath(c.req.path)) return next()

    const authentication = await authenticateApiKey({
      d1: c.env.DB_META,
      rawKey: c.req.header('x-api-key') ?? null,
      telegram: {
        botToken: c.env.TELEGRAM_BOT_TOKEN,
        chatId: c.env.TELEGRAM_ADMIN_ID,
      },
      notify: promise => {
        const backgroundTask = promise.catch(console.error)
        try {
          c.executionCtx.waitUntil(backgroundTask)
        } catch {
          // Hono's in-process request helper has no execution context. Workers always do.
          void backgroundTask
        }
      },
    })

    if (!authentication.ok) {
      if (authentication.retryAfterSeconds) {
        c.header('Retry-After', String(authentication.retryAfterSeconds))
      }
      return c.json(
        {
          error: authentication.error,
          message: authentication.message,
        },
        authentication.status,
      )
    }

    c.set('apiKey', authentication.apiKey)
    return next()
  })
}

function isPublicMetadataPath(path: string) {
  return path.startsWith('/v0/meta/') || path.startsWith('/v0/api/')
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
  ...divisionRoutes,
  ...addressRoutes,
  ...placeRoutes,
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
