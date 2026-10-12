import additions from '../../../../../../fixtures/meta/curations/saanseoi-division/division-additions.json'
const supplementalNeighbourhoods = additions.entries
  .filter(row => 'key' in row)
  .map(row => ({
    id: row.id,
    country: 'HK',
    theme: 'divisions',
    type: 'division',
    subtype: 'neighborhood',
    class: row.class,
    admin_level: null,
    geometry: row.point ? { type: 'Point', coordinates: row.point } : null,
    hierarchies: [],
    names: {
      primary: [row.names['zh-hant'], row.names.en].filter(Boolean).join(' '),
      common: Object.entries(row.names).map(([language, value]) => ({
        language: language === 'zh-hant' ? 'zh-Hant' : language,
        value,
      })),
    },
    sources: [],
    fixture: row.evidence,
  }))
import { readDivisionInputBatches, type DivisionInput } from './divisionInput'

import type { DatasetProcessingMessage } from '../../../types'
import type { ReleaseProcessingAction } from '../../../provenance/processingAction'

export { supplementalNeighbourhoods }

type DivisionFixtureRow = Record<string, unknown>

type DivisionRowBatch = {
  isSupplemental: boolean
  replacedDivisionIds: ReadonlySet<string>
  rows: DivisionFixtureRow[]
  processingActions: ReleaseProcessingAction[]
}

/**
 * Returns curated rows that supplement a scoped division extract. These rows are
 * part of the division snapshot, rather than an identifier bridge: geometry rows
 * and address rows must be able to resolve their canonical IDs in that snapshot.
 */
export function getSupplementalDivisionFixtureRows(
  message: Pick<DatasetProcessingMessage, 'regionCode' | 'source' | 'resourceType'>,
  supplementalRows: readonly DivisionFixtureRow[] = [],
): DivisionFixtureRow[] {
  if (
    message.source !== 'saanseoi' ||
    message.resourceType !== 'division' ||
    message.regionCode !== 'hk'
  )
    return []
  return [
    ...supplementalRows.map(row => structuredClone(row)),
    ...supplementalNeighbourhoods.map(row => structuredClone(row)),
  ]
}

/** Publisher ingestion never adds, replaces or excludes editorial identities. */
export async function* readDivisionRowsWithFixtures(
  file: DivisionInput,
  _message: Pick<DatasetProcessingMessage, 'regionCode' | 'source' | 'resourceType'>,
  batchSize: number,
  _supplementalRows: readonly DivisionFixtureRow[] = [],
): AsyncGenerator<DivisionRowBatch> {
  for await (const rows of readDivisionInputBatches(file, batchSize)) {
    yield {
      isSupplemental: false,
      replacedDivisionIds: new Set(),
      rows,
      processingActions: [],
    }
  }
}
