import { createRoute, defineOpenAPIRoute } from '@hono/zod-openapi'
import { getDatasetRecordByReleaseId } from '@repo/core/db/metaRepository'

import { handleUploadRequest } from '../../lib/services/ingest'
import {
  type FinalizeUploadRequest,
  handleFinalizeUploadRequest,
  handleRequeueUploadRequest,
  type RequeueUploadRequest,
  type SignUploadRequest,
  handleSignUploadRequest,
} from '../../lib/services/uploadSession'
import {
  ErrorResponseSchema,
  FinalizeUploadRequestSchema,
  RequeueUploadRequestSchema,
  SignUploadRequestSchema,
  SignUploadResponseSchema,
  UploadResponseSchema,
  ValidationErrorOpenAPIResponse,
} from '../../schema'
import type { AppEnv } from '../../types'
import { createPrimaryMetaRepoDb } from '../../lib/d1'

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

const requeueUploadRouteConfig = createRoute({
  method: 'post',
  path: '/v1/requeueUpload',
  tags: ['Upload'],
  request: {
    body: {
      content: {
        'application/json': {
          schema: RequeueUploadRequestSchema,
        },
      },
      required: true,
      description: 'Requeue upload processing request payload.',
    },
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: UploadResponseSchema,
        },
      },
      description: 'Requeue an existing staged upload dataset for processing.',
    },
    400: {
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
      description: 'Upload requeue failed.',
    },
    422: ValidationErrorOpenAPIResponse,
  },
})

export const uploadRoute = defineOpenAPIRoute<typeof uploadRouteConfig, AppEnv>({
  route: uploadRouteConfig,
  handler: async c => {
    try {
      const db = createPrimaryMetaRepoDb(c.env.DB_META)
      const formData = await c.req.formData()
      const result = await handleUploadRequest(
        db,
        c.env.R2_RAW,
        c.env.DATASET_QUEUE,
        formData,
        createProcessingPlanOptions(c.env.HARBOUR_BASE_URL),
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
        const db = createPrimaryMetaRepoDb(c.env.DB_META)
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
      const db = createPrimaryMetaRepoDb(c.env.DB_META)
      const request = c.req.valid('json') as FinalizeUploadRequest
      const result = await handleFinalizeUploadRequest(
        db,
        c.env.R2_RAW,
        c.env.DATASET_QUEUE,
        request,
        {
          processingPlanOptions: createProcessingPlanOptions(c.env.HARBOUR_BASE_URL),
        },
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

export const requeueUploadRoute = defineOpenAPIRoute<
  typeof requeueUploadRouteConfig,
  AppEnv
>({
  route: requeueUploadRouteConfig,
  handler: async c => {
    try {
      const db = createPrimaryMetaRepoDb(c.env.DB_META)
      const request = c.req.valid('json') as RequeueUploadRequest
      const requeued = await handleRequeueUploadRequest(
        db,
        c.env.DATASET_QUEUE,
        request,
        createProcessingPlanOptions(c.env.HARBOUR_BASE_URL),
      )

      return c.json(
        {
          datasetId: requeued.datasetId,
          datasetCode: requeued.datasetCode,
          rawObjectKey: requeued.rawObjectKey,
          releaseCode: requeued.releaseCode,
          releaseId: requeued.releaseId,
          rowCount: requeued.rowCount,
          source: requeued.source,
          sourceVersion: requeued.sourceVersion,
          status: requeued.status,
          type: requeued.type,
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

function createProcessingPlanOptions(baseUrl: string) {
  const isLocal = isLocalBaseUrl(baseUrl)

  return {
    forceSerialAddressEnqueue: isLocal,
    useAddressContinuation: isLocal,
  }
}

function isLocalBaseUrl(baseUrl: string) {
  try {
    const url = new URL(baseUrl)
    return url.hostname === 'localhost' || url.hostname === '127.0.0.1'
  } catch {
    return false
  }
}

export const uploadRoutes = [
  uploadRoute,
  signUploadRoute,
  finalizeUploadRoute,
  requeueUploadRoute,
] as const
