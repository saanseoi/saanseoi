import { createRawObjectKey, planUpload, registerUpload } from '@repo/core/upload'
import { inspectParquet } from '@repo/core/parquet-inspector'

import type { HarbourReadableDb, HarbourWritableDb } from '@repo/core/db/types'
import type {
  DatasetProcessingMessage,
  RegisterUploadResult,
  SchemaFingerprintResolver,
} from '@repo/core'

type UploadFormFields = {
  filePath: string
  regionCode?: string
  shardYear?: string
  snapshotMonth?: string
  theme?: string
  type?: string
  source?: string
  sourceVersion?: string
}

type HarbourObjectMetadata = {
  customMetadata?: Record<string, string>
}

type HarbourPutOptions = {
  httpMetadata?: {
    contentType?: string
  }
  customMetadata?: Record<string, string>
}

export type HarbourObjectBucket = {
  head(key: string): Promise<HarbourObjectMetadata | null>
  put(key: string, value: Blob | null, options?: HarbourPutOptions): Promise<unknown>
  delete(key: string): Promise<void>
}

export type DatasetProcessingQueue = {
  send(message: DatasetProcessingMessage): Promise<unknown>
}

function getOptionalText(
  formData: FormData,
  primaryKey: string,
  fallbackKeys: string[] = [],
) {
  const keys = [primaryKey, ...fallbackKeys]

  for (const key of keys) {
    const value = formData.get(key)

    if (typeof value === 'string') {
      const trimmed = value.trim()

      if (trimmed.length > 0) {
        return trimmed
      }
    }
  }

  return undefined
}

function buildUploadFields(fileName: string, formData: FormData): UploadFormFields {
  return {
    filePath: fileName,
    regionCode: getOptionalText(formData, 'regionCode', ['region']),
    shardYear: getOptionalText(formData, 'shardYear', ['year']),
    snapshotMonth: getOptionalText(formData, 'snapshotMonth', ['month']),
    theme: getOptionalText(formData, 'theme'),
    type: getOptionalText(formData, 'type'),
    source: getOptionalText(formData, 'source'),
    sourceVersion: getOptionalText(formData, 'sourceVersion', ['source-version']),
  }
}

function resolveShardYear(
  uploadFields: UploadFormFields,
  plannedSnapshotMonth: string,
) {
  const shardYear = uploadFields.shardYear?.trim()

  if (shardYear) {
    if (!/^\d{4}$/.test(shardYear)) {
      throw new Error(`Invalid shardYear: "${shardYear}". Expected YYYY.`)
    }
    return shardYear
  }

  const derivedYear = plannedSnapshotMonth.slice(0, 4)
  if (!/^\d{4}$/.test(derivedYear)) {
    throw new Error(
      `Could not derive shardYear from snapshotMonth="${plannedSnapshotMonth}".`,
    )
  }
  return derivedYear
}

function createR2SchemaFingerprintResolver(
  bucket: HarbourObjectBucket,
): SchemaFingerprintResolver {
  return async rawObjectKey => {
    const existingObject = await bucket.head(rawObjectKey)
    return existingObject?.customMetadata?.schemaFingerprint ?? null
  }
}

export async function handleUploadRequest(
  db: HarbourReadableDb & HarbourWritableDb,
  bucket: HarbourObjectBucket,
  queue: DatasetProcessingQueue,
  formData: FormData,
): Promise<RegisterUploadResult> {
  const file = formData.get('file')

  if (!(file instanceof File)) {
    throw new Error('Missing file upload. Provide multipart form-data field `file`.')
  }

  const fileName = file.name.trim() || 'upload.parquet'
  const fileBuffer = await file.arrayBuffer()
  const inspection = await inspectParquet(fileBuffer)
  const resolveSchemaFingerprint = createR2SchemaFingerprintResolver(bucket)
  const uploadFields = buildUploadFields(fileName, formData)
  const planned = await planUpload(
    db,
    {
      ...uploadFields,
      inspection,
      resolveSchemaFingerprint,
    },
    inspection,
  )
  const rawObjectKey = createRawObjectKey(planned.plan)

  await bucket.put(rawObjectKey, file, {
    httpMetadata: {
      contentType: file.type || 'application/octet-stream',
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

  try {
    const registered = await registerUpload(db, {
      ...uploadFields,
      inspection,
      rawObjectKey,
      resolveSchemaFingerprint,
    })

    if (!registered.rawObjectKey) {
      throw new Error('registerUpload returned no rawObjectKey for a staged upload.')
    }
    if (!registered.datasetId || !registered.releaseId) {
      throw new Error('registerUpload returned incomplete release identifiers.')
    }

    const processingMessage: DatasetProcessingMessage = {
      datasetId: registered.datasetId,
      datasetCode: registered.plan.datasetCode,
      releaseId: registered.releaseId,
      releaseCode: registered.plan.releaseCode,
      rawObjectKey: registered.rawObjectKey,
      regionCode: registered.plan.regionCode,
      shardYear: resolveShardYear(uploadFields, registered.plan.snapshotMonth),
      snapshotMonth: registered.plan.snapshotMonth,
      source: registered.plan.source,
      sourceVersion: registered.plan.sourceVersion,
      theme: registered.plan.theme,
      type: registered.plan.type,
    }

    await queue.send(processingMessage)

    return registered
  } catch (error) {
    await bucket.delete(rawObjectKey)
    throw error
  }
}
