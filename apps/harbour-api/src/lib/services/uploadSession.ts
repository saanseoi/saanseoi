import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { and, eq, metaSchema } from '@repo/db'
import {
  createRawObjectKey,
  finalizeUpload,
  planUpload,
  requestUpload,
} from '@repo/core/upload'
import { inspectParquet } from '@repo/core/parquetInspector'

import {
  getDatasetById,
  getDatasetRecordByReleaseId,
  upsertIngestRunStatus,
} from '@repo/core/db/metaRepository'
import type { HarbourReadableDb, HarbourWritableDb } from '@repo/core/db/types'
import { resourceThemes, resourceTypes } from '@repo/core'
import type {
  DatasetRecord,
  DatasetProcessingMessage,
  HarbourJobMessage,
  ParquetInspection,
  RegionCode,
  RegisterUploadResult,
  SchemaFingerprintResolver,
  ResourceTheme,
  ResourceType,
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
  force?: boolean
  skipSnapshotCleanup?: boolean
  inspection: ParquetInspection
  plan: {
    regionCode?: string
    shardYear?: string
    cohortKey?: string
    source?: string
    sourceVersion?: string
    theme?: string
    type?: string
  }
  schemaVersionId?: string
}

export type FinalizeUploadRequest = {
  releaseId: string
  skipSnapshotCleanup?: boolean
}

export type RequeueUploadRequest = {
  force?: boolean
  releaseId: string
  skipSnapshotCleanup?: boolean
}

export type RequeueUploadResult = Omit<DatasetRecord, 'status'> & {
  rowCount: number
  status: 'queued'
}

function resolveShardYear(plan: {
  shardYear?: string
  cohortKey?: string
  sourceVersion?: string
}) {
  const shardYear = plan.shardYear?.trim()

  if (shardYear) {
    return shardYear
  }

  return (plan.cohortKey ?? plan.sourceVersion ?? '').slice(0, 4)
}

export type UploadSigningEnv = {
  R2_ACCOUNT_ID: string
  R2_RAW_ACCESS_KEY_ID: string
  R2_RAW_BUCKET_NAME: string
  R2_RAW_SECRET_ACCESS_KEY: string
}

export type DatasetProcessingQueue = {
  send(message: HarbourJobMessage, options?: QueueSendOptions): Promise<unknown>
}

type UploadSessionDependencies = {
  inspectParquet?: typeof inspectParquet
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
    shardYear: request.plan.shardYear,
    cohortKey: request.plan.cohortKey,
    source: request.plan.source,
    sourceVersion: request.plan.sourceVersion,
    theme: request.plan.theme,
    type: request.plan.type,
    inspection: request.inspection,
    resolveSchemaFingerprint,
    allowExistingDatasetStatuses: request.force ? ['uploading'] : undefined,
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
  dependencies: UploadSessionDependencies = {},
): Promise<RegisterUploadResult> {
  const inspectParquetFn = dependencies.inspectParquet ?? inspectParquet
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
  const inspection = await inspectParquetFn(objectBuffer)
  const fileName = fileNameFromRawObjectKey(dataset.rawObjectKey)
  const resolveSchemaFingerprint = createR2SchemaFingerprintResolver(bucket)
  const shardYear = await getRequestUploadShardYear(db, dataset.releaseId)
  const planned = await planUpload(
    db,
    {
      filePath: fileName,
      originalFileName: dataset.originalFileName,
      regionCode: dataset.regionCode,
      shardYear,
      cohortKey: dataset.cohortKey,
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
    shardYear,
    cohortKey: dataset.cohortKey,
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
    shardYear: finalized.plan.shardYear,
    cohortKey: finalized.plan.cohortKey,
    source: finalized.plan.source,
    sourceVersion: finalized.plan.sourceVersion,
    theme: finalized.plan.theme,
    type: finalized.plan.type,
    ...(request.skipSnapshotCleanup ? { skipSnapshotCleanup: true } : {}),
  })

  await queue.send(processingMessage)

  return finalized
}

export async function handleRequeueUploadRequest(
  db: HarbourReadableDb & HarbourWritableDb,
  queue: DatasetProcessingQueue,
  request: RequeueUploadRequest,
): Promise<RequeueUploadResult> {
  const dataset = await getDatasetRecordByReleaseId(db, request.releaseId)

  if (!dataset) {
    throw new Error(`Release not found: ${request.releaseId}`)
  }

  if (!['staged', 'failed'].includes(dataset.status) && !request.force) {
    throw new Error(
      `Release ${dataset.releaseCode} is not requeueable. Current status: ${dataset.status}.`,
    )
  }

  const processRun = await db
    .select({
      status: metaSchema.ingestRuns.status,
    })
    .from(metaSchema.ingestRuns)
    .where(
      and(
        eq(metaSchema.ingestRuns.releaseId, dataset.releaseId),
        eq(metaSchema.ingestRuns.phase, 'processDataset'),
      ),
    )
    .limit(1)
    .get()

  if (
    !request.force &&
    (processRun?.status === 'queued' || processRun?.status === 'running')
  ) {
    return {
      ...dataset,
      rowCount: await getStageDatasetRowCount(db, dataset.releaseId),
      status: 'queued',
    }
  }

  const processingMessage = buildDatasetProcessingMessage({
    ...dataset,
    ...(request.skipSnapshotCleanup ? { skipSnapshotCleanup: true } : {}),
  })

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

  return {
    ...dataset,
    rowCount: await getStageDatasetRowCount(db, dataset.releaseId),
    status: 'queued',
  }
}

async function getStageDatasetRowCount(
  db: HarbourReadableDb,
  releaseId: string,
): Promise<number> {
  const row = await db
    .select({
      stats: metaSchema.ingestRuns.stats,
    })
    .from(metaSchema.ingestRuns)
    .where(
      and(
        eq(metaSchema.ingestRuns.releaseId, releaseId),
        eq(metaSchema.ingestRuns.phase, 'stageDataset'),
      ),
    )
    .limit(1)
    .get()

  if (!row?.stats) {
    return 0
  }

  const parsedStats =
    typeof row.stats === 'string' ? parseIngestRunStats(row.stats) : row.stats

  if (!parsedStats || typeof parsedStats !== 'object' || Array.isArray(parsedStats)) {
    return 0
  }

  const rowCount = (parsedStats as Record<string, unknown>).rowCount

  return typeof rowCount === 'number' && Number.isFinite(rowCount) ? rowCount : 0
}

async function getRequestUploadShardYear(
  db: HarbourReadableDb,
  releaseId: string,
): Promise<string | undefined> {
  const row = await db
    .select({
      stats: metaSchema.ingestRuns.stats,
    })
    .from(metaSchema.ingestRuns)
    .where(
      and(
        eq(metaSchema.ingestRuns.releaseId, releaseId),
        eq(metaSchema.ingestRuns.phase, 'requestUpload'),
      ),
    )
    .limit(1)
    .get()

  if (!row?.stats) {
    return undefined
  }

  const parsedStats =
    typeof row.stats === 'string' ? parseIngestRunStats(row.stats) : row.stats

  if (!parsedStats || typeof parsedStats !== 'object' || Array.isArray(parsedStats)) {
    return undefined
  }

  const shardYear = (parsedStats as Record<string, unknown>).shardYear

  return typeof shardYear === 'string' && shardYear.trim() ? shardYear : undefined
}

function parseIngestRunStats(value: string) {
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
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
    | 'cohortKey'
    | 'source'
    | 'sourceVersion'
    | 'theme'
    | 'type'
  > & {
    shardYear?: string
    skipSnapshotCleanup?: boolean
  },
): DatasetProcessingMessage {
  return {
    datasetId: dataset.datasetId,
    datasetCode: dataset.datasetCode,
    releaseId: dataset.releaseId,
    releaseCode: dataset.releaseCode,
    rawObjectKey: dataset.rawObjectKey,
    regionCode: requireRegionCode(dataset.regionCode),
    shardYear: resolveShardYear({
      shardYear: dataset.shardYear,
      cohortKey: dataset.cohortKey,
      sourceVersion: dataset.sourceVersion,
    }),
    cohortKey: dataset.cohortKey,
    source: dataset.source,
    sourceVersion: dataset.sourceVersion,
    theme: requireSupportedTheme(dataset.theme),
    type: requireSupportedType(dataset.type),
    ...(dataset.skipSnapshotCleanup ? { skipSnapshotCleanup: true } : {}),
  }
}

function requireRegionCode(value: string): RegionCode {
  if (value === 'hk' || value === 'mo') {
    return value
  }

  throw new Error(`Unsupported regionCode for dataset processing: ${value}`)
}

function requireSupportedTheme(value: string): ResourceTheme {
  if ((resourceThemes as readonly string[]).includes(value)) {
    return value as ResourceTheme
  }

  throw new Error(`Unsupported dataset theme for processing: ${value}`)
}

function requireSupportedType(value: string): ResourceType {
  if ((resourceTypes as readonly string[]).includes(value)) {
    return value as ResourceType
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
      cohortKey: planned.plan.cohortKey,
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
