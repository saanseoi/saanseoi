import type { AsyncBuffer } from 'hyparquet'
import { readParquetObjectsInBatches } from '../../parquetR2'

/** Native archive readers can supply rows without a converted upload artefact. */
export type DivisionInput = AsyncBuffer | { rows: Record<string, unknown>[] }

export async function* readDivisionInputBatches(
  input: DivisionInput,
  batchSize: number,
  options?: Parameters<typeof readParquetObjectsInBatches>[2],
) {
  if ('rows' in input) {
    for (let offset = 0; offset < input.rows.length; offset += batchSize)
      yield input.rows.slice(offset, offset + batchSize)
  } else {
    yield* readParquetObjectsInBatches(input, batchSize, options)
  }
}
