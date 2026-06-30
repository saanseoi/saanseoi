import { inspectParquetFile } from '../parquetInspectorNode'
import {
  planUpload as planWorkerUpload,
  prepareUpload as prepareWorkerUpload,
  registerUpload as registerWorkerUpload,
} from './upload'

import type { HarbourReadableDb, HarbourWritableDb } from '../db/types'
import type { RegisterUploadOptions, RegisterUploadResult } from '../../types'

export * from './upload'

export async function prepareUpload(options: RegisterUploadOptions) {
  const inspection =
    options.inspection ?? (await inspectRequiredParquetFile(options.filePath))

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
  const inspection =
    options.inspection ?? (await inspectRequiredParquetFile(options.filePath))

  return planWorkerUpload(
    db,
    {
      ...options,
      inspection,
    },
    inspection,
  )
}

export async function registerUpload(
  db: HarbourReadableDb & HarbourWritableDb,
  options: RegisterUploadOptions,
): Promise<RegisterUploadResult> {
  if (!options.rawObjectKey) {
    throw new Error(
      'A rawObjectKey is required for shared upload registration. Local staging belongs in the CLI runtime.',
    )
  }

  const inspection =
    options.inspection ?? (await inspectRequiredParquetFile(options.filePath))

  return registerWorkerUpload(db, {
    ...options,
    inspection,
  })
}

function inspectRequiredParquetFile(filePath: string) {
  return inspectParquetFile(filePath)
}
