import { OpenAPIHono } from '@hono/zod-openapi'
import { Scalar } from '@scalar/hono-api-reference'
import { createMarkdownFromOpenApi } from '@scalar/openapi-to-markdown'
import { poweredBy } from 'hono/powered-by'
import { prettyJSON } from 'hono/pretty-json'

import { createDb } from '@repo/db'
import { defaultOpenAPIHook } from './lib/openapi'
import { metaRoutes } from './routes/v1/meta'
import { regionRoutes } from './routes/v1/region'
import type { AppEnv } from './types'

const app = new OpenAPIHono<AppEnv>({
  defaultHook: defaultOpenAPIHook,
})
const openApiConfig = {
  openapi: '3.1.0',
  info: {
    title: 'Atlas API',
    version: '1',
  },
} as const

app.use('*', poweredBy())
app.use('/v1/*', prettyJSON())
app.use('/v1/*', async (c, next) => {
  c.set('db', createDb(c.env.DB))
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
