import { Hono } from 'hono'
import { poweredBy } from 'hono/powered-by'
import { prettyJSON } from 'hono/pretty-json'

type AppEnv = {
  Bindings: {
    DB: D1Database
  }
}

const app = new Hono<AppEnv>()

app.use('*', poweredBy())
app.use('/v1/*', prettyJSON())

app.onError((error, c) => {
  console.error(error)
  return c.json(
    {
      error: 'internal_error',
      message: 'The harbour request failed.',
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

app.get('/', c =>
  c.json({
    service: 'harbour',
    version: 1,
    routes: ['/v1/meta/health'],
  }),
)

app.get('/v1/meta/health', async c => {
  const ping = await c.env.DB.prepare('SELECT 1 AS ok').first<{ ok: number }>()
  const datasetCount = await c.env.DB.prepare(
    'SELECT COUNT(*) AS "count" FROM "datasets"',
  ).first<{ count: number }>()

  return c.json({
    ok: ping?.ok === 1,
    datasetCount: Number(datasetCount?.count ?? 0),
  })
})

export default app
