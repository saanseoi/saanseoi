import supplementalNeighbourhoods from '../../../../../../fixtures/divisions/hk/supplemental-neighbourhoods.json'
import { overtureHongKongCityRestorationActions } from './overtureHongKongCityRestoration'
import { readDivisionInputBatches, type DivisionInput } from './divisionInput'

import type { DatasetProcessingMessage } from '../../../types'
import prcCountryAnchor from '../../../../../../fixtures/divisions/overture/hk-prc-country-anchor.json'
import { missingOvertureHongKongAreaRows } from './overtureHongKongAreas'
import { missingOvertureHongKongCityRows } from './overtureHongKongCities'
import { kowloonRestorationActions } from './kowloonRestoration'
import { overtureHongKongAreaRestorationActions } from './overtureHongKongAreaRestoration'
import type { ReleaseProcessingAction } from '../../db/processingActions'

export { supplementalNeighbourhoods }

type DivisionFixtureRow = Record<string, unknown>

type DivisionRowBatch = {
  isSupplemental: boolean
  replacedDivisionIds: ReadonlySet<string>
  rows: DivisionFixtureRow[]
  processingActions: ReleaseProcessingAction[]
}

/**
 * Returns reviewed rows that supplement a scoped division extract. These rows are
 * part of the division snapshot, rather than an identifier bridge: geometry rows
 * and address rows must be able to resolve their canonical IDs in that snapshot.
 */
export function getSupplementalDivisionFixtureRows(
  message: Pick<DatasetProcessingMessage, 'regionCode' | 'source' | 'resourceType'>,
  supplementalRows: readonly DivisionFixtureRow[] = [],
): DivisionFixtureRow[] {
  if (
    message.source !== 'overture' ||
    message.resourceType !== 'division' ||
    message.regionCode !== 'hk'
  ) {
    return []
  }

  return [
    ...supplementalRows.map(row => structuredClone(row)),
    structuredClone(prcCountryAnchor) as DivisionFixtureRow,
    ...supplementalNeighbourhoods.map(row => structuredClone(row)),
  ]
}

export async function* readDivisionRowsWithFixtures(
  file: DivisionInput,
  message: Pick<DatasetProcessingMessage, 'regionCode' | 'source' | 'resourceType'>,
  batchSize: number,
  supplementalRows: readonly DivisionFixtureRow[] = [],
): AsyncGenerator<DivisionRowBatch> {
  const sourceRows: DivisionFixtureRow[] = []
  for await (const rows of readDivisionInputBatches(file, batchSize)) {
    sourceRows.push(...rows)
  }

  const rows = [
    ...getSupplementalDivisionFixtureRows(message, supplementalRows),
    ...missingOvertureHongKongAreaRows(message, sourceRows),
    ...missingOvertureHongKongCityRows(message, sourceRows),
  ]
  const replacedDivisionIds = new Set(rows.map(row => String(row.id)))
  for (let offset = 0; offset < sourceRows.length; offset += batchSize) {
    yield {
      isSupplemental: false,
      replacedDivisionIds,
      rows: sourceRows.slice(offset, offset + batchSize),
      processingActions: [],
    }
  }

  if (rows.length > 0) {
    yield {
      isSupplemental: true,
      replacedDivisionIds: new Set(),
      rows,
      processingActions: [
        ...kowloonRestorationActions(sourceRows, rows),
        ...overtureHongKongCityRestorationActions(rows),
        ...overtureHongKongAreaRestorationActions(sourceRows, rows),
      ],
    }
  }
}
