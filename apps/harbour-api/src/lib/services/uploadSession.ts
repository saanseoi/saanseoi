import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { and, eq, metaSchema } from '@repo/db'
import {
  createRawObjectKey,
  finalizeUpload,
  planUpload,
  requestUpload,
} from '@repo/core/upload'

import { getDatasetById, getDatasetRecordByReleaseId } from '@repo/core/db/metaRegistry'
import type { HarbourReadableDb, HarbourWritableDb } from '@repo/core/db/types'
import type {
  ParquetInspection,
  RegisterUploadResult,
  SchemaFingerprintResolver,
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
    releaseNotesUrl?: string
    theme?: string
    type?: string
  }
  schemaVersionId?: string
}

export type FinalizeUploadRequest = {
  releaseId: string
  skipSnapshotCleanup?: boolean
}

export type UploadSigningEnv = {
  R2_ACCOUNT_ID: string
  R2_RAW_ACCESS_KEY_ID: string
  R2_RAW_BUCKET_NAME: string
  R2_RAW_SECRET_ACCESS_KEY: string
}

type UploadSessionDependencies = {
  verifyUploadedObject?: boolean
}

const DEFAULT_CONTENT_TYPE = 'application/octet-stream'

export async function handleSignUploadRequest(
  db: HarbourReadableDb & HarbourWritableDb,
  bucket: HarbourObjectBucket,
  signingEnv: UploadSigningEnv,
  request: SignUploadRequest,
) {
  const contentType = request.contentType?.trim() || DEFAULT_CONTENT_TYPE
  const resolveSchemaFingerprint = createSchemaFingerprintResolver(db, bucket)
  const planned = await requestUpload(db, {
    filePath: request.fileName,
    regionCode: request.plan.regionCode,
    shardYear: request.plan.shardYear,
    cohortKey: request.plan.cohortKey,
    source: request.plan.source,
    sourceVersion: request.plan.sourceVersion,
    releaseNotesUrl: request.plan.releaseNotesUrl,
    theme: request.plan.theme,
    type: request.plan.type,
    inspection: request.inspection,
    resolveSchemaFingerprint,
    allowExistingDatasetStatuses: request.force ? ['uploading'] : undefined,
  })

  const expiresInSeconds = 15 * 60
  const uploadMetadata = buildUploadObjectMetadata(planned.plan)
  const uploadUrl = await createSignedUploadUrl(
    signingEnv,
    planned.rawObjectKey,
    contentType,
    uploadMetadata,
    expiresInSeconds,
  )
  const release = await getDatasetById(db, planned.plan.releaseCode)

  if (!release?.releaseId) {
    throw new Error(
      `Release not found after upload request: ${planned.plan.releaseCode}`,
    )
  }

  const uploadHeaders: Record<string, string> = {
    'content-type': contentType,
    ...buildUploadMetadataHeaders(uploadMetadata),
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
    uploadHeaders,
    uploadMethod: 'PUT' as const,
    uploadUrl,
  }
}

export async function handleFinalizeUploadRequest(
  db: HarbourReadableDb & HarbourWritableDb,
  bucket: HarbourObjectBucket,
  request: FinalizeUploadRequest,
  _dependencies: UploadSessionDependencies = {},
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

  const object = await bucket.head(dataset.rawObjectKey)

  if (!object) {
    throw new Error(`Uploaded object not found: ${dataset.rawObjectKey}`)
  }

  const requestUploadStats = await getRequestUploadStats(db, dataset.releaseId)
  const inspection = requestUploadStats?.inspection

  if (!isParquetInspection(inspection)) {
    throw new Error(
      `Upload inspection not found for release finalization: ${dataset.releaseCode}`,
    )
  }

  const fileName = fileNameFromRawObjectKey(dataset.rawObjectKey)
  const resolveSchemaFingerprint = createSchemaFingerprintResolver(db, bucket)
  const shardYear =
    typeof requestUploadStats?.shardYear === 'string'
      ? requestUploadStats.shardYear
      : undefined
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

  return finalized
}

async function getRequestUploadStats(
  db: HarbourReadableDb,
  releaseId: string,
): Promise<Record<string, unknown> | null> {
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

  return parseStatsRecord(row?.stats)
}

function parseIngestRunStats(value: string) {
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

function parseStatsRecord(stats: unknown): Record<string, unknown> | null {
  if (!stats) {
    return null
  }

  const parsedStats = typeof stats === 'string' ? parseIngestRunStats(stats) : stats

  if (!parsedStats || typeof parsedStats !== 'object' || Array.isArray(parsedStats)) {
    return null
  }

  return parsedStats as Record<string, unknown>
}

function readSchemaFingerprint(stats: Record<string, unknown> | null) {
  const schemaFingerprint = stats?.schemaFingerprint

  return typeof schemaFingerprint === 'string' && schemaFingerprint.trim()
    ? schemaFingerprint
    : null
}

function createSchemaFingerprintResolver(
  db: HarbourReadableDb,
  bucket: HarbourObjectBucket,
): SchemaFingerprintResolver {
  return async (rawObjectKey, releaseCode) => {
    const existingObject = await bucket.head(rawObjectKey)
    const objectFingerprint = getCustomMetadataValue(
      existingObject?.customMetadata,
      'schemaFingerprint',
    )

    if (objectFingerprint) {
      return objectFingerprint
    }

    return releaseCode
      ? readSchemaFingerprint(await getRequestUploadStatsByReleaseCode(db, releaseCode))
      : null
  }
}

async function getRequestUploadStatsByReleaseCode(
  db: HarbourReadableDb,
  releaseCode: string,
): Promise<Record<string, unknown> | null> {
  const row = await db
    .select({
      stats: metaSchema.ingestRuns.stats,
    })
    .from(metaSchema.ingestRuns)
    .innerJoin(
      metaSchema.metaReleases,
      eq(metaSchema.ingestRuns.releaseId, metaSchema.metaReleases.id),
    )
    .where(
      and(
        eq(metaSchema.metaReleases.code, releaseCode),
        eq(metaSchema.ingestRuns.phase, 'requestUpload'),
      ),
    )
    .limit(1)
    .get()

  return parseStatsRecord(row?.stats)
}

async function createSignedUploadUrl(
  env: UploadSigningEnv,
  rawObjectKey: string,
  contentType: string,
  metadata: Record<string, string>,
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
      Metadata: metadata,
    }),
    {
      expiresIn: expiresInSeconds,
    },
  )
}

function buildUploadObjectMetadata(plan: {
  cohortKey: string
  datasetCode: string
  fileName: string
  originalFileName: string
  regionCode: string
  releaseCode: string
  rowCount: number
  schemaFingerprint: string
  source: string
  sourceVersion: string
  theme: string
  type: string
}) {
  return {
    datasetCode: plan.datasetCode,
    fileName: plan.fileName,
    originalFileName: plan.originalFileName,
    releaseCode: plan.releaseCode,
    regionCode: plan.regionCode,
    rowCount: String(plan.rowCount),
    schemaFingerprint: plan.schemaFingerprint,
    cohortKey: plan.cohortKey,
    source: plan.source,
    sourceVersion: plan.sourceVersion,
    theme: plan.theme,
    type: plan.type,
  }
}

function buildUploadMetadataHeaders(metadata: Record<string, string>) {
  return Object.fromEntries(
    Object.entries(metadata).map(([key, value]) => [`x-amz-meta-${key}`, value]),
  )
}

function getCustomMetadataValue(
  metadata: Record<string, string> | undefined,
  key: string,
) {
  if (!metadata) {
    return null
  }

  return (
    metadata[key] ??
    metadata[key.toLowerCase()] ??
    Object.entries(metadata).find(
      ([metadataKey]) => metadataKey.toLowerCase() === key.toLowerCase(),
    )?.[1] ??
    null
  )
}

function fileNameFromRawObjectKey(rawObjectKey: string) {
  return rawObjectKey.split('/').at(-1) ?? rawObjectKey
}

function isParquetInspection(value: unknown): value is ParquetInspection {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    typeof (value as ParquetInspection).rowCount === 'number' &&
    Array.isArray((value as ParquetInspection).schema)
  )
}
