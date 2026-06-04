import { OpenAPIHono } from '@hono/zod-openapi'
import { Scalar } from '@scalar/hono-api-reference'
import { createMarkdownFromOpenApi } from '@scalar/openapi-to-markdown'
import { poweredBy } from 'hono/powered-by'
import { prettyJSON } from 'hono/pretty-json'

import { defaultOpenAPIHook } from './lib/openapi'
import { metaRoutes } from './routes/v1/meta'
import { uploadRoutes } from './routes/v1/upload'
import type { AppEnv } from './types'

const app = new OpenAPIHono<AppEnv>({
  defaultHook: defaultOpenAPIHook,
})
const openApiConfig = {
  openapi: '3.1.0',
  info: {
    title: 'Harbour API',
    version: '1',
  },
} as const

app.use('*', poweredBy())
app.use('/v1/*', prettyJSON())

app.onError((error, c) => {
  console.error(error)
  return c.json(
    {
      httpStatus: 500,
      error: 'internal_error',
      message: 'A typhoon hit the harbour - Request failed.',
    },
    500,
  )
})

app.notFound(c =>
  c.json(
    {
      httpStatus: 404,
      error: 'not_found',
      message: 'Lost at sea - Route not found.',
    },
    404,
  ),
)

app.get('/', c => c.redirect('/openapi', 302))

app.openapiRoutes([...metaRoutes, ...uploadRoutes] as const)

app.doc31('/openapi', openApiConfig)
app.get(
  '/docs',
  Scalar({
    url: '/openapi',
    pageTitle: 'Harbour API Reference',
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
