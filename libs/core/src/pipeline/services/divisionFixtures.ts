import type { AsyncBuffer } from 'hyparquet'

import type { DatasetProcessingMessage } from '../../types'
import { readParquetObjectsInBatches } from '../parquetR2'
import prcCountryAnchor from '../../../../../fixtures/divisions/overture/hk-prc-country-anchor.json'
import { missingOvertureHongKongAreaRows } from './overtureHongKongAreas'

type DivisionFixtureRow = Record<string, unknown>

/**
 * Divisions retained only so scoped records can refer to a parent outside the
 * published region. They are identities, not an invitation to ingest that
 * parent's geometry.
 */
export const REFERENT_ONLY_DIVISION_IDS = new Set([
  'fb68fc73-3ac6-41c9-a692-22fcf20cb5be', // People's Republic of China
])

export function isReferentOnlyDivisionId(id: string | null | undefined): boolean {
  return id !== null && id !== undefined && REFERENT_ONLY_DIVISION_IDS.has(id)
}

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
  const sourceRows: DivisionFixtureRow[] = []
  for await (const rows of readParquetObjectsInBatches(file, batchSize)) {
    sourceRows.push(...rows)
    yield { isSupplemental: false, rows }
  }

  const rows = [
    ...getSupplementalDivisionFixtureRows(message),
    ...missingOvertureHongKongAreaRows(message, sourceRows),
  ]

  if (rows.length > 0) {
    yield { isSupplemental: true, rows }
  }
}
