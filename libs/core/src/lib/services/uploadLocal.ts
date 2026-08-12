import { inspectParquetFile } from '../parquetInspectorNode'
import {
  planUpload as planUploadWithInspection,
  prepareUpload as prepareUploadWithInspection,
  registerUpload as registerUploadWithInspection,
} from './upload'

import type { HarbourReadableDb, HarbourWritableDb } from '../db/types'
import type { RegisterUploadOptions, RegisterUploadResult } from '../../types'

export * from './upload'

export async function prepareUpload(options: RegisterUploadOptions) {
  const inspection =
    options.inspection ?? (await inspectRequiredParquetFile(options.filePath))

  return prepareUploadWithInspection(
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

  return planUploadWithInspection(
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
  const inspection =
    options.inspection ?? (await inspectRequiredParquetFile(options.filePath))

  return registerUploadWithInspection(db, {
    ...options,
    inspection,
  })
}

function inspectRequiredParquetFile(filePath: string) {
  return inspectParquetFile(filePath)
}
