import { createDb } from '@repo/db'
import { createRoute, defineOpenAPIRoute } from '@hono/zod-openapi'
import type { HarbourReadableDb, HarbourWritableDb } from '@repo/core/db/repository'

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
      const db = createDb(c.env.DB) as HarbourReadableDb & HarbourWritableDb
      const formData = await c.req.formData()
      const result = await handleUploadRequest(db, c.env.R2_RAW, c.env.DATASET_QUEUE, formData)

      return c.json(
        {
          datasetId: result.plan.datasetId,
          rawObjectKey: result.rawObjectKey,
          rowCount: result.plan.rowCount,
          source: result.plan.source,
          sourceVersion: result.plan.sourceVersion,
          status: 'staged',
          supersedesDatasetId: result.plan.supersedesDatasetId,
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

export const signUploadRoute = defineOpenAPIRoute<typeof signUploadRouteConfig, AppEnv>({
  route: signUploadRouteConfig,
  handler: async c => {
    try {
      const db = createDb(c.env.DB) as HarbourReadableDb & HarbourWritableDb
      const request = c.req.valid('json') as SignUploadRequest
      const result = await handleSignUploadRequest(db, c.env.R2_RAW, c.env, request)

      return c.json(
        {
          datasetId: result.datasetId,
          expiresAt: result.expiresAt,
          rawObjectKey: result.rawObjectKey,
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
})

export const finalizeUploadRoute = defineOpenAPIRoute<
  typeof finalizeUploadRouteConfig,
  AppEnv
>({
  route: finalizeUploadRouteConfig,
  handler: async c => {
    try {
      const db = createDb(c.env.DB) as HarbourReadableDb & HarbourWritableDb
      const request = c.req.valid('json') as FinalizeUploadRequest
      const result = await handleFinalizeUploadRequest(db, c.env.R2_RAW, c.env.DATASET_QUEUE, request)

      return c.json(
        {
          datasetId: result.plan.datasetId,
          rawObjectKey: result.rawObjectKey,
          rowCount: result.plan.rowCount,
          source: result.plan.source,
          sourceVersion: result.plan.sourceVersion,
          status: 'staged',
          supersedesDatasetId: result.plan.supersedesDatasetId,
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
