import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import {
  createRawObjectKey,
  finalizeUpload,
  planUpload,
  requestUpload,
} from '@repo/core/upload'
import { inspectParquet } from '@repo/core/parquet-inspector'

import {
  getDatasetRecordById,
  type HarbourReadableDb,
  type HarbourWritableDb,
} from '@repo/core/db/repository'
import type { ParquetInspection, RegisterUploadResult, SchemaFingerprintResolver } from '@repo/core'

type HarbourObjectMetadata = {
  customMetadata?: Record<string, string>
}

type HarbourPutOptions = {
  httpMetadata?: {
    contentType?: string
  }
  customMetadata?: Record<string, string>
}

type HarbourObjectBody = {
  arrayBuffer(): Promise<ArrayBuffer>
}

export type HarbourObjectBucket = {
  head(key: string): Promise<HarbourObjectMetadata | null>
  get(key: string): Promise<HarbourObjectBody | null>
  put(key: string, value: Blob | ArrayBuffer | null, options?: HarbourPutOptions): Promise<unknown>
}

export type SignUploadRequest = {
  contentType?: string
  fileName: string
  fileSize: number
  inspection: ParquetInspection
  plan: {
    regionCode?: string
    snapshotMonth?: string
    source?: string
    sourceVersion?: string
    theme?: string
    type?: string
  }
  schemaVersionId?: string
}

export type FinalizeUploadRequest = {
  datasetId: string
}

export type UploadSigningEnv = {
  R2_ACCOUNT_ID: string
  R2_RAW_ACCESS_KEY_ID: string
  R2_RAW_BUCKET_NAME: string
  R2_RAW_SECRET_ACCESS_KEY: string
}

const DEFAULT_CONTENT_TYPE = 'application/octet-stream'

export async function handleSignUploadRequest(
  db: HarbourReadableDb & HarbourWritableDb,
  bucket: HarbourObjectBucket,
  signingEnv: UploadSigningEnv,
  request: SignUploadRequest,
) {
  const contentType = request.contentType?.trim() || DEFAULT_CONTENT_TYPE
  const resolveSchemaFingerprint = createR2SchemaFingerprintResolver(bucket)
  const planned = await requestUpload(db, {
    filePath: request.fileName,
    regionCode: request.plan.regionCode,
    snapshotMonth: request.plan.snapshotMonth,
    source: request.plan.source,
    sourceVersion: request.plan.sourceVersion,
    theme: request.plan.theme,
    type: request.plan.type,
    inspection: request.inspection,
    resolveSchemaFingerprint,
  })

  const expiresInSeconds = 15 * 60
  const uploadUrl = await createSignedUploadUrl(
    signingEnv,
    planned.rawObjectKey,
    contentType,
    expiresInSeconds,
  )

  return {
    datasetId: planned.plan.datasetId,
    expiresAt: new Date(Date.now() + expiresInSeconds * 1000).toISOString(),
    rawObjectKey: planned.rawObjectKey,
    status: 'uploading',
    uploadHeaders: {
      'content-type': contentType,
    },
    uploadMethod: 'PUT' as const,
    uploadUrl,
  }
}

export async function handleFinalizeUploadRequest(
  db: HarbourReadableDb & HarbourWritableDb,
  bucket: HarbourObjectBucket,
  request: FinalizeUploadRequest,
): Promise<RegisterUploadResult> {
  const dataset = await getDatasetRecordById(db, request.datasetId)

  if (!dataset) {
    throw new Error(`Dataset not found: ${request.datasetId}`)
  }

  if (dataset.status !== 'uploading') {
    throw new Error(`Dataset ${request.datasetId} is not awaiting upload finalization.`)
  }

  const object = await bucket.get(dataset.rawObjectKey)

  if (!object) {
    throw new Error(`Uploaded object not found: ${dataset.rawObjectKey}`)
  }

  const objectBuffer = await object.arrayBuffer()
  const inspection = await inspectParquet(objectBuffer)
  const fileName = fileNameFromRawObjectKey(dataset.rawObjectKey)
  const resolveSchemaFingerprint = createR2SchemaFingerprintResolver(bucket)
  const planned = await planUpload(
    db,
    {
      filePath: fileName,
      regionCode: dataset.regionCode,
      snapshotMonth: dataset.snapshotMonth,
      source: dataset.source,
      sourceVersion: dataset.sourceVersion,
      theme: dataset.theme,
      type: dataset.type,
      inspection,
      rawObjectKey: dataset.rawObjectKey,
      resolveSchemaFingerprint,
    },
    inspection,
  )

  if (planned.plan.datasetId !== dataset.datasetId) {
    throw new Error(
      `Finalize plan mismatch for ${dataset.datasetId}. Expected ${dataset.datasetId}, got ${planned.plan.datasetId}.`,
    )
  }

  if (createRawObjectKey(planned.plan) !== dataset.rawObjectKey) {
    throw new Error(
      `Finalize rawObjectKey mismatch for ${dataset.datasetId}. Expected ${dataset.rawObjectKey}.`,
    )
  }

  await writeFinalObjectMetadata(bucket, dataset.rawObjectKey, objectBuffer, planned)

  return finalizeUpload(db, {
    filePath: fileName,
    regionCode: dataset.regionCode,
    snapshotMonth: dataset.snapshotMonth,
    source: dataset.source,
    sourceVersion: dataset.sourceVersion,
    theme: dataset.theme,
    type: dataset.type,
    inspection,
    rawObjectKey: dataset.rawObjectKey,
    resolveSchemaFingerprint,
  })
}

function createR2SchemaFingerprintResolver(
  bucket: HarbourObjectBucket,
): SchemaFingerprintResolver {
  return async rawObjectKey => {
    const existingObject = await bucket.head(rawObjectKey)
    return existingObject?.customMetadata?.schemaFingerprint ?? null
  }
}

async function createSignedUploadUrl(
  env: UploadSigningEnv,
  rawObjectKey: string,
  contentType: string,
  expiresInSeconds: number,
) {
  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: env.R2_RAW_ACCESS_KEY_ID,
      secretAccessKey: env.R2_RAW_SECRET_ACCESS_KEY,
    },
  })

  return getSignedUrl(
    client,
    new PutObjectCommand({
      Bucket: env.R2_RAW_BUCKET_NAME,
      Key: rawObjectKey,
      ContentType: contentType,
    }),
    {
      expiresIn: expiresInSeconds,
    },
  )
}

async function writeFinalObjectMetadata(
  bucket: HarbourObjectBucket,
  rawObjectKey: string,
  objectBuffer: ArrayBuffer,
  planned: Awaited<ReturnType<typeof planUpload>>,
) {
  await bucket.put(rawObjectKey, objectBuffer, {
    httpMetadata: {
      contentType: DEFAULT_CONTENT_TYPE,
    },
    customMetadata: {
      datasetId: planned.plan.datasetId,
      fileName: planned.plan.fileName,
      regionCode: planned.plan.regionCode,
      rowCount: String(planned.plan.rowCount),
      schemaFingerprint: planned.plan.schemaFingerprint,
      snapshotMonth: planned.plan.snapshotMonth,
      source: planned.plan.source,
      sourceVersion: planned.plan.sourceVersion,
      theme: planned.plan.theme,
      type: planned.plan.type,
    },
  })
}

function fileNameFromRawObjectKey(rawObjectKey: string) {
  return rawObjectKey.split('/').at(-1) ?? rawObjectKey
}
