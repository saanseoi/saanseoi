import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

import { inspectParquetFile } from '../parquet-inspector-node'
import {
  createSchemaFingerprint,
  planUpload as planWorkerUpload,
  prepareUpload as prepareWorkerUpload,
  registerUpload as registerWorkerUpload,
} from './upload'

import type { HarbourReadableDb, HarbourWritableDb } from '../db/repository'
import type {
  ParquetInspection,
  RegisterUploadOptions,
  RegisterUploadResult,
} from '../../types'

const DEFAULT_RAW_ROOT = resolve(
  dirname(import.meta.dir),
  '../../../../../.local/harbour/raw',
)

export * from './upload'

export async function prepareUpload(options: RegisterUploadOptions) {
  const inspection = options.inspection ?? (await inspectRequiredParquetFile(options.filePath))

  return prepareWorkerUpload(
    {
      ...options,
      inspection,
    },
    inspection,
  )
}

export async function planUpload(
  db: HarbourReadableDb,
  options: RegisterUploadOptions,
) {
  const inspection = options.inspection ?? (await inspectRequiredParquetFile(options.filePath))

  return planWorkerUpload(
    db,
    {
      ...options,
      inspection,
      resolveSchemaFingerprint:
        options.resolveSchemaFingerprint ?? createLocalSchemaFingerprintResolver(),
    },
    inspection,
  )
}

export async function registerUpload(
  db: HarbourReadableDb & HarbourWritableDb,
  options: RegisterUploadOptions,
): Promise<RegisterUploadResult> {
  if (!options.rawObjectKey && !existsSync(options.filePath)) {
    throw new Error(`File not found: ${options.filePath}`)
  }

  const inspection = options.inspection ?? (await inspectRequiredParquetFile(options.filePath))
  const planned = await planUpload(db, {
    ...options,
    inspection,
  })
  const { plan } = planned

  if (options.dryRun) {
    return {
      plan,
      inspection,
      rawObjectKey: null,
      stagedFilePath: null,
      metadataPath: null,
    }
  }

  if (options.rawObjectKey) {
    return registerWorkerUpload(db, {
      ...options,
      inspection,
    })
  }

  const rawRoot = options.localRawRoot ?? DEFAULT_RAW_ROOT
  const staged = stageRawFile(rawRoot, plan, inspection)
  const registered = await registerWorkerUpload(db, {
    ...options,
    inspection,
    rawObjectKey: staged.stagedFilePath,
    metadataPath: staged.metadataPath,
  })

  return {
    ...registered,
    stagedFilePath: staged.stagedFilePath,
    metadataPath: staged.metadataPath,
  }
}

function createLocalSchemaFingerprintResolver() {
  return async (rawObjectKey: string) => {
    if (!rawObjectKey || !existsSync(rawObjectKey)) {
      return null
    }

    const inspection = await inspectParquetFile(rawObjectKey)

    return createSchemaFingerprint(inspection)
  }
}

function inspectRequiredParquetFile(filePath: string) {
  return inspectParquetFile(filePath)
}

function stageRawFile(
  rawRoot: string,
  plan: Awaited<ReturnType<typeof planWorkerUpload>>['plan'],
  inspection: ParquetInspection,
) {
  const targetDir = join(
    rawRoot,
    plan.regionCode,
    plan.theme,
    plan.type,
    plan.snapshotMonth,
  )
  const stagedFilePath = join(targetDir, plan.fileName)
  const metadataPath = join(targetDir, 'upload.json')

  mkdirSync(targetDir, { recursive: true })
  copyFileSync(plan.filePath, stagedFilePath)
  writeFileSync(
    metadataPath,
    JSON.stringify(
      {
        datasetId: plan.datasetId,
        regionCode: plan.regionCode,
        snapshotMonth: plan.snapshotMonth,
        theme: plan.theme,
        type: plan.type,
        source: plan.source,
        sourceVersion: plan.sourceVersion,
        rowCount: inspection.rowCount,
        schema: inspection.schema,
      },
      null,
      2,
    ),
  )

  return { stagedFilePath, metadataPath }
}
