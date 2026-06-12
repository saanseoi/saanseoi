import { OpenAPIHono } from '@hono/zod-openapi'
import { Scalar } from '@scalar/hono-api-reference'
import { createMarkdownFromOpenApi } from '@scalar/openapi-to-markdown'
import { cors } from 'hono/cors'
import { poweredBy } from 'hono/powered-by'
import { prettyJSON } from 'hono/pretty-json'

import { createCurrentDb, createMetaDb } from '@repo/db'
import { defaultOpenAPIHook } from './lib/openapi'
import { metaRoutes } from './routes/v0/meta'
import { regionRoutes } from './routes/v0/region'
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
app.use('/v0/*', prettyJSON())
app.use(
  '/v0/meta/substack',
  cors({
    origin: '*',
    allowMethods: ['POST', 'OPTIONS'],
    allowHeaders: ['Content-Type'],
  }),
)
app.use('/v0/*', async (c, next) => {
  c.set('metaDb', createMetaDb(c.env.DB_META))
  c.set('currentDb', createCurrentDb(c.env.DB_CURRENT))
  await next()
})

app.onError((error, c) => {
  console.error(error)
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

app.openapiRoutes([...metaRoutes, ...regionRoutes] as const)

app.doc31('/openapi', openApiConfig)
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
