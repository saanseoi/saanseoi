import { createMetaDb } from '@repo/db'
import { createRoute, defineOpenAPIRoute } from '@hono/zod-openapi'
import { getDatasetRecordByReleaseId } from '@repo/core/db/meta-repository'
import type { HarbourReadableDb, HarbourWritableDb } from '@repo/core/db/types'

import { handleUploadRequest } from '../../lib/services/ingest'
import {
  type FinalizeUploadRequest,
  handleFinalizeUploadRequest,
  type SignUploadRequest,
  handleSignUploadRequest,
} from '../../lib/services/upload-session'
import {
  ErrorResponseSchema,
  FinalizeUploadRequestSchema,
  SignUploadRequestSchema,
  SignUploadResponseSchema,
  UploadResponseSchema,
  ValidationErrorOpenAPIResponse,
} from '../../schema'
import type { AppEnv } from '../../types'

const uploadRouteConfig = createRoute({
  method: 'post',
  path: '/v1/upload',
  tags: ['Upload'],
  responses: {
    200: {
      content: {
        'application/json': {
          schema: UploadResponseSchema,
        },
      },
      description: 'Create a staged upload dataset.',
    },
    400: {
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
      description: 'Upload failed.',
    },
  },
})

const signUploadRouteConfig = createRoute({
  method: 'post',
  path: '/v1/signUpload',
  tags: ['Upload'],
  request: {
    body: {
      content: {
        'application/json': {
          schema: SignUploadRequestSchema,
        },
      },
      required: true,
      description: 'Sign upload request payload.',
    },
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: SignUploadResponseSchema,
        },
      },
      description: 'Signed upload session.',
    },
    400: {
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
      description: 'Upload signing failed.',
    },
    422: ValidationErrorOpenAPIResponse,
  },
})

const finalizeUploadRouteConfig = createRoute({
  method: 'post',
  path: '/v1/finalizeUpload',
  tags: ['Upload'],
  request: {
    body: {
      content: {
        'application/json': {
          schema: FinalizeUploadRequestSchema,
        },
      },
      required: true,
      description: 'Finalize upload request payload.',
    },
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: UploadResponseSchema,
        },
      },
      description: 'Finalize a staged upload dataset.',
    },
    400: {
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
      description: 'Upload finalization failed.',
    },
    422: ValidationErrorOpenAPIResponse,
  },
})

export const uploadRoute = defineOpenAPIRoute<typeof uploadRouteConfig, AppEnv>({
  route: uploadRouteConfig,
  handler: async c => {
    try {
      const db = createMetaDb(c.env.DB_META) as HarbourReadableDb & HarbourWritableDb
      const formData = await c.req.formData()
      const result = await handleUploadRequest(
        db,
        c.env.R2_RAW,
        c.env.DATASET_QUEUE,
        formData,
      )
      if (!result.datasetId || !result.releaseId) {
        throw new Error('Upload registration returned incomplete release identifiers.')
      }

      return c.json(
        {
          datasetId: result.datasetId,
          datasetCode: result.plan.datasetCode,
          rawObjectKey: result.rawObjectKey,
          releaseCode: result.plan.releaseCode,
          releaseId: result.releaseId,
          rowCount: result.plan.rowCount,
          source: result.plan.source,
          sourceVersion: result.plan.sourceVersion,
          status: 'staged',
          type: result.plan.type,
        },
        200,
      )
    } catch (error) {
      return c.json(
        {
          httpStatus: 400,
          error: 'upload_failed',
          message: error instanceof Error ? error.message : String(error),
        },
        400,
      )
    }
  },
})

export const signUploadRoute = defineOpenAPIRoute<typeof signUploadRouteConfig, AppEnv>(
  {
    route: signUploadRouteConfig,
    handler: async c => {
      try {
        const db = createMetaDb(c.env.DB_META) as HarbourReadableDb & HarbourWritableDb
        const request = c.req.valid('json') as SignUploadRequest
        const result = await handleSignUploadRequest(db, c.env.R2_RAW, c.env, request)

        return c.json(
          {
            datasetId: result.datasetId,
            datasetCode: result.datasetCode,
            expiresAt: result.expiresAt,
            rawObjectKey: result.rawObjectKey,
            releaseCode: result.releaseCode,
            releaseId: result.releaseId,
            source: result.source,
            status: result.status,
            uploadHeaders: result.uploadHeaders,
            uploadMethod: result.uploadMethod,
            uploadUrl: result.uploadUrl,
          },
          200,
        )
      } catch (error) {
        return c.json(
          {
            httpStatus: 400,
            error: 'upload_failed',
            message: error instanceof Error ? error.message : String(error),
          },
          400,
        )
      }
    },
  },
)

export const finalizeUploadRoute = defineOpenAPIRoute<
  typeof finalizeUploadRouteConfig,
  AppEnv
>({
  route: finalizeUploadRouteConfig,
  handler: async c => {
    try {
      const db = createMetaDb(c.env.DB_META) as HarbourReadableDb & HarbourWritableDb
      const request = c.req.valid('json') as FinalizeUploadRequest
      const result = await handleFinalizeUploadRequest(
        db,
        c.env.R2_RAW,
        c.env.DATASET_QUEUE,
        request,
      )
      const release = await getDatasetRecordByReleaseId(db, request.releaseId)

      if (!release) {
        throw new Error(`Release not found after finalization: ${request.releaseId}`)
      }

      return c.json(
        {
          datasetId: release.datasetId,
          datasetCode: result.plan.datasetCode,
          rawObjectKey: result.rawObjectKey,
          releaseCode: result.plan.releaseCode,
          releaseId: release.releaseId,
          rowCount: result.plan.rowCount,
          source: result.plan.source,
          sourceVersion: result.plan.sourceVersion,
          status: 'staged',
          type: result.plan.type,
        },
        200,
      )
    } catch (error) {
      return c.json(
        {
          httpStatus: 400,
          error: 'upload_failed',
          message: error instanceof Error ? error.message : String(error),
        },
        400,
      )
    }
  },
})

export const uploadRoutes = [uploadRoute, signUploadRoute, finalizeUploadRoute] as const
