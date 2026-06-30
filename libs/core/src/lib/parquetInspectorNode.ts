import { asyncBufferFromFile } from 'hyparquet/src/node.js'

import { inspectParquetFromBuffer } from './parquetInspectorShared'

/**
 * Reads a parquet file from the local filesystem for CLI and test workflows.
 */
export async function inspectParquetFile(filePath: string) {
  const file = await asyncBufferFromFile(filePath)

  return inspectParquetFromBuffer(file)
}
