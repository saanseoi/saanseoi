import type { CurrentFieldRule } from './fieldLineageCurrentRules'

/** Provider branches in geometrySourceReferences. */
export function geometryReferenceRule(
  field: string,
  datasetCode: string,
): CurrentFieldRule | null {
  if (field !== 'sources') return null
  const saanseoi = datasetCode === 'ds-hk-saanseoi-division'
  const town = datasetCode === 'ds-hk-hkgov-pland-division-new-town'
  const planning = datasetCode === 'ds-hk-hkgov-pland-division-pu'
  const census = datasetCode.startsWith('ds-hk-hkgov-censtatd-')
  const implementation = {
    path: 'libs/core/src/pipeline/services/divisions/divisionGeometry.ts',
    symbol: 'geometrySourceReferences',
  }
  const result = (expression: string, inputs: string[], guards?: string[]) => ({
    expression,
    inputs,
    implementation,
    ...(guards ? { guards } : {}),
  })
  if (saanseoi)
    return result('curatedRecordSources(row.sources, String(row.id))', [
      'sources',
      'id',
    ])
  if (town)
    return result(
      '[{ publisher: "hkgov-pland", dataset: "ds-hk-hkgov-pland-division-new-town", recordId: asNonEmptyString(row.newtown_id) }]',
      ['newtown_id'],
      ['Require a non-empty native town ID.'],
    )
  if (planning)
    return result(
      '(typeof row.source_cell_ids === "string" ? JSON.parse(row.source_cell_ids) : row.source_cell_ids).map(recordId => ({ publisher: "hkgov-pland", dataset: "ds-hk-hkgov-pland-division-pu", recordId }))',
      ['source_cell_ids'],
      ['Require a non-empty array of non-empty string cell IDs.'],
    )
  if (census)
    return result(
      'Select sourceRecordId values from row.sources or censtatdPublisherId(row); map to hkgov-censtatd publisher attribution with datasetCode.',
      ['sources', 'id', 'source'],
    )
  return result('geometrySourceReferences(row, source, datasetCode)', [
    'id',
    'source',
    'sources',
  ])
}
