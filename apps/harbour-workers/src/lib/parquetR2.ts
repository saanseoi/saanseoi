import { parquetMetadataAsync, parquetReadObjects, type AsyncBuffer } from 'hyparquet'
import { compressors } from 'hyparquet-compressors'

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
  ): Promise<
    | {
        arrayBuffer(): Promise<ArrayBuffer>
      }
    | null
  >
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
        throw new Error(`Could not read R2 range for ${key} (${normalizedStart}-${normalizedEnd}).`)
      }

      return chunk.arrayBuffer()
    },
  }
}

export async function* readParquetObjectsInBatches(
  file: AsyncBuffer,
  batchSize: number,
): AsyncGenerator<Record<string, unknown>[]> {
  const metadata = await parquetMetadataAsync(file)
  const rowCount = Number(metadata.num_rows)

  for (let rowStart = 0; rowStart < rowCount; rowStart += batchSize) {
    const rowEnd = Math.min(rowStart + batchSize, rowCount)
    const rows = await parquetReadObjects({
      file,
      rowStart,
      rowEnd,
      compressors,
    })

    yield rows
  }
}
