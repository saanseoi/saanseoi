import { Hono } from 'hono'
import { poweredBy } from 'hono/powered-by'
import { prettyJSON } from 'hono/pretty-json'

import { createDb } from '@repo/db'
import { handleUploadRequest } from './lib/services/ingest'
import {
  handleFinalizeUploadRequest,
  handleSignUploadRequest,
} from './lib/services/upload-session'

type AppEnv = {
  Bindings: {
    DB: D1Database
    R2_ACCOUNT_ID: string
    R2_RAW: R2Bucket
    R2_RAW_ACCESS_KEY_ID: string
    R2_RAW_BUCKET_NAME: string
    R2_RAW_SECRET_ACCESS_KEY: string
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
    routes: ['/v1/meta/health', '/v1/upload', '/v1/signUpload', '/v1/finalizeUpload'],
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

app.post('/v1/upload', async c => {
  try {
    const db = createDb(c.env.DB)
    const formData = await c.req.formData()
    const result = await handleUploadRequest(db, c.env.R2_RAW, formData)

    return c.json({
      datasetId: result.plan.datasetId,
      rawObjectKey: result.rawObjectKey,
      rowCount: result.plan.rowCount,
      snapshotMonth: result.plan.snapshotMonth,
      status: 'staged',
      supersedesDatasetId: result.plan.supersedesDatasetId,
      type: result.plan.type,
    })
  } catch (error) {
    return c.json(
      {
        error: 'upload_failed',
        message: error instanceof Error ? error.message : String(error),
      },
      400,
    )
  }
})

app.post('/v1/signUpload', async c => {
  try {
    const db = createDb(c.env.DB)
    const request = await c.req.json()
    const result = await handleSignUploadRequest(db, c.env.R2_RAW, c.env, request)

    return c.json({
      datasetId: result.datasetId,
      expiresAt: result.expiresAt,
      rawObjectKey: result.rawObjectKey,
      status: result.status,
      uploadHeaders: result.uploadHeaders,
      uploadMethod: result.uploadMethod,
      uploadUrl: result.uploadUrl,
    })
  } catch (error) {
    return c.json(
      {
        error: 'upload_failed',
        message: error instanceof Error ? error.message : String(error),
      },
      400,
    )
  }
})

app.post('/v1/finalizeUpload', async c => {
  try {
    const db = createDb(c.env.DB)
    const request = await c.req.json()
    const result = await handleFinalizeUploadRequest(db, c.env.R2_RAW, request)

    return c.json({
      datasetId: result.plan.datasetId,
      rawObjectKey: result.rawObjectKey,
      rowCount: result.plan.rowCount,
      snapshotMonth: result.plan.snapshotMonth,
      status: 'staged',
      supersedesDatasetId: result.plan.supersedesDatasetId,
      type: result.plan.type,
    })
  } catch (error) {
    return c.json(
      {
        error: 'upload_failed',
        message: error instanceof Error ? error.message : String(error),
      },
      400,
    )
  }
})

export default app
