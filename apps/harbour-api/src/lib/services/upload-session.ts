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
  getDatasetById,
  getDatasetRecordByReleaseId,
  upsertIngestRunStatus,
} from '@repo/core/db/meta-repository'
import type { HarbourReadableDb, HarbourWritableDb } from '@repo/core/db/types'
import { SUPPORTED_THEMES, SUPPORTED_TYPES } from '@repo/core'
import type {
  DatasetRecord,
  DatasetProcessingMessage,
  ParquetInspection,
  RegionCode,
  RegisterUploadResult,
  SchemaFingerprintResolver,
  SupportedTheme,
  SupportedType,
} from '@repo/core'

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
  put(
    key: string,
    value: Blob | ArrayBuffer | null,
    options?: HarbourPutOptions,
  ): Promise<unknown>
}

export type SignUploadRequest = {
  contentType?: string
  fileName: string
  fileSize: number
  inspection: ParquetInspection
  plan: {
    regionCode?: string
    shardYear?: string
    snapshotMonth?: string
    source?: string
    sourceVersion?: string
    theme?: string
    type?: string
  }
  schemaVersionId?: string
}

export type FinalizeUploadRequest = {
  releaseId: string
}

export type RequeueUploadRequest = {
  releaseId: string
}

function resolveShardYear(plan: {
  shardYear?: string
  snapshotMonth?: string
  sourceVersion?: string
}) {
  const shardYear = plan.shardYear?.trim()

  if (shardYear) {
    return shardYear
  }

  return (plan.snapshotMonth ?? plan.sourceVersion ?? '').slice(0, 4)
}

export type UploadSigningEnv = {
  R2_ACCOUNT_ID: string
  R2_RAW_ACCESS_KEY_ID: string
  R2_RAW_BUCKET_NAME: string
  R2_RAW_SECRET_ACCESS_KEY: string
}

export type DatasetProcessingQueue = {
  send(message: DatasetProcessingMessage): Promise<unknown>
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
  const release = await getDatasetById(db, planned.plan.releaseCode)

  if (!release?.releaseId) {
    throw new Error(
      `Release not found after upload request: ${planned.plan.releaseCode}`,
    )
  }

  return {
    datasetId: release.datasetId,
    datasetCode: planned.plan.datasetCode,
    expiresAt: new Date(Date.now() + expiresInSeconds * 1000).toISOString(),
    releaseCode: planned.plan.releaseCode,
    releaseId: release.releaseId,
    rawObjectKey: planned.rawObjectKey,
    source: planned.plan.source,
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
  queue: DatasetProcessingQueue,
  request: FinalizeUploadRequest,
): Promise<RegisterUploadResult> {
  const dataset = await getDatasetRecordByReleaseId(db, request.releaseId)

  if (!dataset) {
    throw new Error(`Release not found: ${request.releaseId}`)
  }

  if (dataset.status !== 'uploading') {
    throw new Error(
      `Release ${dataset.releaseCode} is not awaiting upload finalization.`,
    )
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
      originalFileName: dataset.originalFileName,
      regionCode: dataset.regionCode,
      snapshotMonth: dataset.snapshotMonth,
      source: dataset.source,
      sourceVersion: dataset.sourceVersion,
      theme: dataset.theme,
      type: dataset.type,
      inspection,
      rawObjectKey: dataset.rawObjectKey,
      resolveSchemaFingerprint,
      allowExistingDatasetStatuses: ['uploading'],
    },
    inspection,
  )

  if (planned.plan.releaseCode !== dataset.releaseCode) {
    throw new Error(
      `Finalize plan mismatch for ${dataset.releaseCode}. Expected ${dataset.releaseCode}, got ${planned.plan.releaseCode}.`,
    )
  }

  if (createRawObjectKey(planned.plan) !== dataset.rawObjectKey) {
    throw new Error(
      `Finalize rawObjectKey mismatch for ${dataset.releaseCode}. Expected ${dataset.rawObjectKey}.`,
    )
  }

  await writeFinalObjectMetadata(bucket, dataset.rawObjectKey, objectBuffer, planned)

  const finalized = await finalizeUpload(db, {
    filePath: fileName,
    originalFileName: dataset.originalFileName,
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

  const processingMessage = buildDatasetProcessingMessage({
    ...dataset,
    datasetId: finalized.datasetId ?? dataset.datasetId,
    rawObjectKey: finalized.rawObjectKey,
    releaseCode: finalized.plan.releaseCode,
    regionCode: finalized.plan.regionCode,
    snapshotMonth: finalized.plan.snapshotMonth,
    source: finalized.plan.source,
    sourceVersion: finalized.plan.sourceVersion,
    theme: finalized.plan.theme,
    type: finalized.plan.type,
  })

  await queue.send(processingMessage)

  return finalized
}

export async function handleRequeueUploadRequest(
  db: HarbourReadableDb & HarbourWritableDb,
  queue: DatasetProcessingQueue,
  request: RequeueUploadRequest,
) {
  const dataset = await getDatasetRecordByReleaseId(db, request.releaseId)

  if (!dataset) {
    throw new Error(`Release not found: ${request.releaseId}`)
  }

  if (!['staged', 'failed'].includes(dataset.status)) {
    throw new Error(
      `Release ${dataset.releaseCode} is not requeueable. Current status: ${dataset.status}.`,
    )
  }

  const processingMessage = buildDatasetProcessingMessage(dataset)

  const queuedAt = new Date().toISOString()
  await upsertIngestRunStatus(
    db,
    dataset.releaseId,
    'processDataset',
    'queued',
    queuedAt,
    null,
    null,
    null,
  )

  try {
    await queue.send(processingMessage)
  } catch (error) {
    await upsertIngestRunStatus(
      db,
      dataset.releaseId,
      'processDataset',
      'error',
      queuedAt,
      new Date().toISOString(),
      null,
      JSON.stringify({
        message: error instanceof Error ? error.message : String(error),
      }),
    )
    throw error
  }

  return dataset
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

function buildDatasetProcessingMessage(
  dataset: Pick<
    DatasetRecord,
    | 'datasetCode'
    | 'datasetId'
    | 'rawObjectKey'
    | 'regionCode'
    | 'releaseCode'
    | 'releaseId'
    | 'snapshotMonth'
    | 'source'
    | 'sourceVersion'
    | 'theme'
    | 'type'
  >,
): DatasetProcessingMessage {
  return {
    datasetId: dataset.datasetId,
    datasetCode: dataset.datasetCode,
    releaseId: dataset.releaseId,
    releaseCode: dataset.releaseCode,
    rawObjectKey: dataset.rawObjectKey,
    regionCode: requireRegionCode(dataset.regionCode),
    shardYear: resolveShardYear({
      snapshotMonth: dataset.snapshotMonth,
      sourceVersion: dataset.sourceVersion,
    }),
    snapshotMonth: dataset.snapshotMonth,
    source: dataset.source,
    sourceVersion: dataset.sourceVersion,
    theme: requireSupportedTheme(dataset.theme),
    type: requireSupportedType(dataset.type),
  }
}

function requireRegionCode(value: string): RegionCode {
  if (value === 'hk' || value === 'mo') {
    return value
  }

  throw new Error(`Unsupported regionCode for dataset processing: ${value}`)
}

function requireSupportedTheme(value: string): SupportedTheme {
  if ((SUPPORTED_THEMES as readonly string[]).includes(value)) {
    return value as SupportedTheme
  }

  throw new Error(`Unsupported dataset theme for processing: ${value}`)
}

function requireSupportedType(value: string): SupportedType {
  if ((SUPPORTED_TYPES as readonly string[]).includes(value)) {
    return value as SupportedType
  }

  throw new Error(`Unsupported dataset type for processing: ${value}`)
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
      datasetCode: planned.plan.datasetCode,
      fileName: planned.plan.fileName,
      originalFileName: planned.plan.originalFileName,
      releaseCode: planned.plan.releaseCode,
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
