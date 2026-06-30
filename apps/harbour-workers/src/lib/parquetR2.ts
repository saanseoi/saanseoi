import { parquetMetadataAsync, parquetReadObjects, type AsyncBuffer } from 'hyparquet'
import { compressors } from 'hyparquet-compressors'

const DEFAULT_PARQUET_READ_ROW_WINDOW_SIZE = 8192

export type ParquetBatchReadMetadata = {
  batchSize: number
  fileBytes: number
  readRowWindowSize: number
  rowCount: number
  rowGroupCount: number
  rowGroupRows: number[]
  useOffsetIndex: boolean
}

export type ParquetReadWindowDiagnostic = {
  rowEnd: number
  rowStart: number
  rowsRead: number
}

export type R2RangeReadableBucket = {
  head(key: string): Promise<{ size: number } | null>
  get(
    key: string,
    options?: {
      range?: {
        offset: number
        length: number
      }
    },
  ): Promise<{
    arrayBuffer(): Promise<ArrayBuffer>
  } | null>
}

export async function createAsyncBufferFromR2(
  bucket: R2RangeReadableBucket,
  key: string,
): Promise<AsyncBuffer> {
  const object = await bucket.head(key)

  if (!object) {
    throw new Error(`R2 object not found: ${key}`)
  }

  return {
    byteLength: object.size,
    async slice(start: number, end?: number) {
      const normalizedStart = Math.max(0, start)
      const normalizedEnd = Math.max(normalizedStart, end ?? object.size)
      const length = normalizedEnd - normalizedStart

      if (length === 0) {
        return new ArrayBuffer(0)
      }

      const chunk = await bucket.get(key, {
        range: {
          offset: normalizedStart,
          length,
        },
      })

      if (!chunk) {
        throw new Error(
          `Could not read R2 range for ${key} (${normalizedStart}-${normalizedEnd}).`,
        )
      }

      return chunk.arrayBuffer()
    },
  }
}

export async function* readParquetObjectsInBatches(
  file: AsyncBuffer,
  batchSize: number,
  options: {
    columns?: string[]
    onMetadata?: (metadata: ParquetBatchReadMetadata) => void
    onReadWindow?: (diagnostic: ParquetReadWindowDiagnostic) => void
    rowEnd?: number
    rowStart?: number
    readRowWindowSize?: number
    useOffsetIndex?: boolean
  } = {},
): AsyncGenerator<Record<string, unknown>[]> {
  const metadata = await parquetMetadataAsync(file)
  const rowCount = Number(metadata.num_rows)
  const startRow = Math.max(0, Math.floor(options.rowStart ?? 0))
  const endRow = Math.min(
    rowCount,
    Math.max(startRow, Math.floor(options.rowEnd ?? rowCount)),
  )
  const readRowWindowSize = Math.max(
    batchSize,
    options.readRowWindowSize ?? DEFAULT_PARQUET_READ_ROW_WINDOW_SIZE,
  )
  const useOffsetIndex = options.useOffsetIndex ?? true

  options.onMetadata?.({
    batchSize,
    fileBytes: file.byteLength,
    readRowWindowSize,
    rowCount,
    rowGroupCount: metadata.row_groups?.length ?? 0,
    rowGroupRows: metadata.row_groups?.map(rowGroup => Number(rowGroup.num_rows)) ?? [],
    useOffsetIndex,
  })

  for (let rowStart = startRow; rowStart < endRow; rowStart += readRowWindowSize) {
    const rowEnd = Math.min(rowStart + readRowWindowSize, endRow)
    const rows = await parquetReadObjects({
      file,
      metadata,
      columns: options.columns,
      rowStart,
      rowEnd,
      compressors,
      useOffsetIndex,
    })

    options.onReadWindow?.({
      rowStart,
      rowEnd,
      rowsRead: rows.length,
    })

    for (let batchStart = 0; batchStart < rows.length; batchStart += batchSize) {
      yield rows.slice(batchStart, batchStart + batchSize)
    }
  }
}
