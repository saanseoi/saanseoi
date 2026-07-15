import type { AsyncBuffer } from 'hyparquet'

import type { DatasetProcessingMessage } from '../../types'
import { readParquetObjectsInBatches } from '../parquetR2'
import prcCountryAnchor from '../../../../../fixtures/divisions/overture/hk-prc-country-anchor.json'

type DivisionFixtureRow = Record<string, unknown>

type DivisionRowBatch = {
  isSupplemental: boolean
  rows: DivisionFixtureRow[]
}

/**
 * Returns reviewed rows that supplement a scoped division extract. These rows are
 * part of the division snapshot, rather than an identifier bridge: geometry rows
 * and address rows must be able to resolve their canonical IDs in that snapshot.
 */
export function getSupplementalDivisionFixtureRows(
  message: Pick<DatasetProcessingMessage, 'regionCode' | 'source' | 'type'>,
): DivisionFixtureRow[] {
  if (
    message.source !== 'overture' ||
    message.type !== 'division' ||
    message.regionCode !== 'hk'
  ) {
    return []
  }

  return [structuredClone(prcCountryAnchor) as DivisionFixtureRow]
}

export async function* readDivisionRowsWithFixtures(
  file: AsyncBuffer,
  message: Pick<DatasetProcessingMessage, 'regionCode' | 'source' | 'type'>,
  batchSize: number,
): AsyncGenerator<DivisionRowBatch> {
  for await (const rows of readParquetObjectsInBatches(file, batchSize)) {
    yield { isSupplemental: false, rows }
  }

  const rows = getSupplementalDivisionFixtureRows(message)

  if (rows.length > 0) {
    yield { isSupplemental: true, rows }
  }
}
