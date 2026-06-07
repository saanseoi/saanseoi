import type { AsyncBuffer } from 'hyparquet'

import { inspectParquetFromBuffer } from './parquet-inspector-shared'

type ParquetInput = ArrayBuffer | Uint8Array

/**
 * Reads an in-memory parquet payload for Worker upload flows.
 */
export async function inspectParquet(input: ParquetInput) {
  return inspectParquetFromBuffer(await createAsyncBuffer(input))
}

async function createAsyncBuffer(
  input: ParquetInput,
): Promise<AsyncBuffer | ArrayBuffer> {
  const buffer = toArrayBuffer(input)

  return {
    byteLength: buffer.byteLength,
    async slice(start: number, end?: number) {
      return buffer.slice(start, end)
    },
  }
}

function toArrayBuffer(input: ArrayBuffer | Uint8Array) {
  if (input instanceof Uint8Array) {
    return input.slice().buffer
  }

  return new Uint8Array(input).slice().buffer
}
