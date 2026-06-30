import { randomUUID } from 'node:crypto'
import { mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { parquetMetadataAsync, parquetReadObjects, parquetSchema } from 'hyparquet'
import { asyncBufferFromFile } from 'hyparquet/src/node.js'
import { compressors } from 'hyparquet-compressors'
import { fileWriter, parquetWriteRows } from 'hyparquet-writer'

import type { prepareUpload } from '@repo/core/uploadLocal'

const OVERTURE_ADDRESS_ROW_GROUP_SIZE = 2048
const OVERTURE_ADDRESS_READ_WINDOW_SIZE = 8192

type UploadPreviewResult = Awaited<ReturnType<typeof prepareUpload>>

export type PreparedUploadFile = {
  cleanup(): Promise<void>
  filePath: string
  transformed: boolean
}

export async function prepareUploadFileForDispatch(
  filePath: string,
  previewResult: UploadPreviewResult,
): Promise<PreparedUploadFile> {
  if (
    previewResult.plan.source !== 'overture' ||
    previewResult.plan.type !== 'address'
  ) {
    return {
      cleanup: async () => undefined,
      filePath,
      transformed: false,
    }
  }

  return repackOvertureAddressParquet(filePath)
}

async function repackOvertureAddressParquet(
  filePath: string,
): Promise<PreparedUploadFile> {
  const tempDir = join(tmpdir(), `saanseoi-overture-address-${randomUUID()}`)
  const outputFile = join(tempDir, 'address.parquet')

  await mkdir(dirname(outputFile), { recursive: true })

  try {
    const file = await asyncBufferFromFile(filePath)
    const metadata = await parquetMetadataAsync(file)
    const rowCount = Number(metadata.num_rows)
    const columns = parquetSchema(metadata).children.map(child => ({
      name: String(child.element.name),
    }))

    async function* rows() {
      for (
        let rowStart = 0;
        rowStart < rowCount;
        rowStart += OVERTURE_ADDRESS_READ_WINDOW_SIZE
      ) {
        const batch = await parquetReadObjects({
          file,
          metadata,
          rowStart,
          rowEnd: Math.min(rowStart + OVERTURE_ADDRESS_READ_WINDOW_SIZE, rowCount),
          compressors,
        })

        for (const row of batch) {
          yield row
        }
      }
    }

    await parquetWriteRows({
      writer: fileWriter(outputFile),
      rows: rows(),
      columns,
      schema: metadata.schema,
      rowGroupSize: OVERTURE_ADDRESS_ROW_GROUP_SIZE,
    })
  } catch (error) {
    await rm(tempDir, { recursive: true, force: true })
    throw error
  }

  return {
    cleanup: async () => {
      await rm(tempDir, { recursive: true, force: true })
    },
    filePath: outputFile,
    transformed: true,
  }
}
