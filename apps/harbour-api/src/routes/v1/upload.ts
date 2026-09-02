import { createRoute, defineOpenAPIRoute } from '@hono/zod-openapi'

import { createPrimaryMetaRepoDb } from '../../lib/d1'
import {
  type RegisterUploadRequest,
  handleRegisterUploadRequest,
} from '../../lib/services/uploadSession'
import {
  parseSourceAssetMetadata,
  linkManagedSourceAssetToRelease,
  deleteManagedSourceAsset,
  preflightManagedSourceAsset,
  registerManagedSourceAsset,
} from '../../lib/services/sourceAssets'
import {
  ErrorResponseSchema,
  DeletedManagedSourceAssetResponseSchema,
  LinkManagedSourceAssetRequestSchema,
  LinkManagedSourceAssetResponseSchema,
  LocalUploadRegistrationResponseSchema,
  ManagedSourceAssetResponseSchema,
  ManagedSourceAssetPreflightRequestSchema,
  ManagedSourceAssetPreflightResponseSchema,
  RegisterUploadRequestSchema,
  ValidationErrorOpenAPIResponse,
} from '../../schema'
import type { AppEnv } from '../../types'

const registerUploadRouteConfig = createRoute({
  method: 'post',
  path: '/v1/registerUpload',
  tags: ['Upload'],
  request: {
    body: {
      content: {
        'application/json': { schema: RegisterUploadRequestSchema },
      },
      required: true,
      description:
        'Register a locally processed Parquet release. The Parquet file is never uploaded to R2.',
    },
  },
  responses: {
    200: {
      content: {
        'application/json': { schema: LocalUploadRegistrationResponseSchema },
      },
      description: 'Registered a staged release for the local pipeline.',
    },
    400: {
      content: { 'application/json': { schema: ErrorResponseSchema } },
      description: 'Upload registration failed.',
    },
    422: ValidationErrorOpenAPIResponse,
  },
})

const managedSourceAssetRouteConfig = createRoute({
  method: 'post',
  path: '/v1/assets',
  tags: ['Source assets'],
  responses: {
    200: {
      content: {
        'application/json': { schema: ManagedSourceAssetResponseSchema },
      },
      description: 'Register an immutable publisher source asset in R2.',
    },
    400: {
      content: { 'application/json': { schema: ErrorResponseSchema } },
      description: 'Source asset upload failed.',
    },
  },
})

const managedSourceAssetPreflightRouteConfig = createRoute({
  method: 'post',
  path: '/v1/assets/preflight',
  tags: ['Source assets'],
  request: {
    body: {
      content: {
        'application/json': { schema: ManagedSourceAssetPreflightRequestSchema },
      },
      required: true,
    },
  },
  responses: {
    200: {
      content: {
        'application/json': { schema: ManagedSourceAssetPreflightResponseSchema },
      },
      description: 'Check or recreate immutable source-asset metadata.',
    },
    400: {
      content: { 'application/json': { schema: ErrorResponseSchema } },
      description: 'Source asset preflight failed.',
    },
    422: ValidationErrorOpenAPIResponse,
  },
})

const linkManagedSourceAssetRouteConfig = createRoute({
  method: 'post',
  path: '/v1/assets/link-release',
  tags: ['Source assets'],
  request: {
    body: {
      content: {
        'application/json': { schema: LinkManagedSourceAssetRequestSchema },
      },
      required: true,
    },
  },
  responses: {
    200: {
      content: {
        'application/json': { schema: LinkManagedSourceAssetResponseSchema },
      },
      description: 'Link an immutable source asset to a processed release.',
    },
    400: {
      content: { 'application/json': { schema: ErrorResponseSchema } },
      description: 'Source asset linkage failed.',
    },
  },
})

const deleteManagedSourceAssetRouteConfig = createRoute({
  method: 'delete',
  path: '/v1/assets/{assetId}',
  tags: ['Source assets'],
  responses: {
    200: {
      content: {
        'application/json': { schema: DeletedManagedSourceAssetResponseSchema },
      },
      description: 'Remove an owned immutable source asset.',
    },
    400: {
      content: { 'application/json': { schema: ErrorResponseSchema } },
      description: 'Source asset deletion failed.',
    },
  },
})

export const registerUploadRoute = defineOpenAPIRoute<
  typeof registerUploadRouteConfig,
  AppEnv
>({
  route: registerUploadRouteConfig,
  handler: async c => {
    try {
      const db = createPrimaryMetaRepoDb(c.env.DB_META)
      const request = c.req.valid('json') as RegisterUploadRequest
      return c.json(await handleRegisterUploadRequest(db, request), 200)
    } catch (error) {
      return c.json(
        {
          httpStatus: 400,
          error: 'upload_registration_failed',
          message: error instanceof Error ? error.message : String(error),
        },
        400,
      )
    }
  },
})

export const managedSourceAssetRoute = defineOpenAPIRoute<
  typeof managedSourceAssetRouteConfig,
  AppEnv
>({
  route: managedSourceAssetRouteConfig,
  handler: async c => {
    try {
      const form = await c.req.formData()
      const asset = form.get('asset')
      if (!(asset instanceof File)) {
        throw new Error('Source asset upload requires an `asset` file field.')
      }
      const metadata = parseSourceAssetMetadata(form.get('metadata'))
      const db = createPrimaryMetaRepoDb(c.env.DB_META)
      const result = await registerManagedSourceAsset(
        db,
        c.env.R2_ASSETS,
        asset,
        metadata,
      )
      return c.json(
        {
          ...result,
          assetUrl: `${c.env.ATLAS_BASE_URL}/v0/assets/${result.assetId}`,
        },
        200,
      )
    } catch (error) {
      return c.json(
        {
          httpStatus: 400,
          error: 'source_asset_upload_failed',
          message: error instanceof Error ? error.message : String(error),
        },
        400,
      )
    }
  },
})

export const managedSourceAssetPreflightRoute = defineOpenAPIRoute<
  typeof managedSourceAssetPreflightRouteConfig,
  AppEnv
>({
  route: managedSourceAssetPreflightRouteConfig,
  handler: async c => {
    try {
      const request = c.req.valid('json')
      const db = createPrimaryMetaRepoDb(c.env.DB_META)
      const result = await preflightManagedSourceAsset(db, c.env.R2_ASSETS, {
        byteLength: request.byteLength,
        metadata: request.metadata as unknown as ReturnType<
          typeof parseSourceAssetMetadata
        >,
      })
      return c.json(result, 200)
    } catch (error) {
      return c.json(
        {
          httpStatus: 400,
          error: 'source_asset_preflight_failed',
          message: error instanceof Error ? error.message : String(error),
        },
        400,
      )
    }
  },
})

export const linkManagedSourceAssetRoute = defineOpenAPIRoute<
  typeof linkManagedSourceAssetRouteConfig,
  AppEnv
>({
  route: linkManagedSourceAssetRouteConfig,
  handler: async c => {
    try {
      const db = createPrimaryMetaRepoDb(c.env.DB_META)
      return c.json(await linkManagedSourceAssetToRelease(db, c.req.valid('json')), 200)
    } catch (error) {
      return c.json(
        {
          httpStatus: 400,
          error: 'source_asset_link_failed',
          message: error instanceof Error ? error.message : String(error),
        },
        400,
      )
    }
  },
})

export const deleteManagedSourceAssetRoute = defineOpenAPIRoute<
  typeof deleteManagedSourceAssetRouteConfig,
  AppEnv
>({
  route: deleteManagedSourceAssetRouteConfig,
  handler: async c => {
    try {
      const assetId = c.req.param('assetId')
      const releaseId = c.req.query('releaseId')
      if (!assetId || !releaseId) throw new Error('assetId and releaseId are required.')
      const db = createPrimaryMetaRepoDb(c.env.DB_META)
      const result = await deleteManagedSourceAsset(db, c.env.R2_ASSETS, {
        assetId,
        releaseId,
      })
      return c.json(
        { ...result, assetUrl: `${c.env.ATLAS_BASE_URL}/v0/assets/${result.assetId}` },
        200,
      )
    } catch (error) {
      return c.json(
        {
          httpStatus: 400,
          error: 'source_asset_delete_failed',
          message: error instanceof Error ? error.message : String(error),
        },
        400,
      )
    }
  },
})

export const uploadRoutes = [
  registerUploadRoute,
  managedSourceAssetPreflightRoute,
  managedSourceAssetRoute,
  linkManagedSourceAssetRoute,
  deleteManagedSourceAssetRoute,
] as const
